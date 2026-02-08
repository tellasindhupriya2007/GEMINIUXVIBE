import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { UXReport, DesignContract, DesignDirectorResponse, ProjectRequirements } from '../types';

// --- SINGLE SOURCE OF TRUTH FOR GEMINI CLIENT ---
const getClient = (apiKey: string) => {
  if (!apiKey) {
    throw new Error("API Key is missing at runtime.");
  }

  // SAFE fingerprint logging
  console.info(
    "🔑 Gemini API key in use:",
    `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`
  );

  return new GoogleGenAI({ apiKey });
};

// --- UTILS ---

// Smart retry wrapper for API calls that parses "retry in Xs" messages
const withRetry = async <T>(fn: () => Promise<T>, retries = 5, delay = 3000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const msg = error.message || error.toString();
    
    // Check for specific retry time in error message
    // Patterns: "Please retry in 56.5s", "retryDelay":"56s"
    const retryMatch = msg.match(/retry in ([0-9.]+)s/) || msg.match(/"retryDelay":"([0-9.]+)s"/);
    let specificWaitTime = 0;
    
    if (retryMatch && retryMatch[1]) {
        specificWaitTime = Math.ceil(parseFloat(retryMatch[1]) * 1000) + 2000; // Add 2s buffer for safety
    }

    // Detect Retryable Errors
    const isRateLimit = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota');
    const isServerOverload = msg.includes('503') || msg.includes('overloaded') || msg.includes('internal error');

    if (retries > 0 && (isRateLimit || isServerOverload)) {
      // Determine final wait time: Max of (Default Delay vs Specific Wait Time)
      // If it's a rate limit with no specific time, force at least 5s wait
      let waitTime = Math.max(delay, specificWaitTime);
      if (isRateLimit && waitTime < 5000) waitTime = 5000; 

      console.warn(`⚠️ API Issue (${isRateLimit ? 'Rate Limit' : 'Overload'}). Waiting ${Math.round(waitTime/1000)}s... (${retries} attempts left)`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Calculate next delay: 
      // If we just waited a huge specific time (e.g. 50s), reset backoff to avoids 100s next time.
      // Otherwise, double the delay.
      const nextDelay = waitTime > 10000 ? 5000 : delay * 1.5;

      return withRetry(fn, retries - 1, nextDelay); 
    }
    throw error;
  }
};

const handleGeminiError = (error: any): never => {
  const msg = error.message || error.toString();
  console.error("Gemini API Error:", msg);
  
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota')) {
    const match = msg.match(/retry in ([0-9.]+)s/);
    const waitMsg = match ? ` The API requested a ${Math.ceil(parseFloat(match[1]))}s cooldown.` : "";
    throw new Error(`🚨 API Quota Exceeded.${waitMsg} The system is auto-retrying, but you may need to wait or use a paid key.`);
  }
  
  if (msg.includes('API key not valid') || msg.includes('API Key is missing')) {
    throw new Error("🚨 Invalid or Missing API Key. Please check your settings.");
  }

  // Try to clean up raw JSON errors
  const cleanMsg = msg.replace(/.*"message":\s*"(.*?)".*/, '$1');
  throw new Error(`AI Service Error: ${cleanMsg.substring(0, 120)}...`);
};

// Helper to safely parse JSON that might be wrapped in markdown or slightly malformed
const safeParseJSON = (text: string) => {
  try {
    // 1. Try direct parse
    return JSON.parse(text);
  } catch (e) {
    // 2. Try to extract from markdown code blocks
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e2) {
        // Fall through
      }
    }
    
    // 3. Try to extract from plain code blocks
    const codeMatch = text.match(/```\n([\s\S]*?)\n```/);
    if (codeMatch && codeMatch[1]) {
      try {
        return JSON.parse(codeMatch[1]);
      } catch (e3) {
        // Fall through
      }
    }

    // 4. Try to extract from simple curly braces (fallback)
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        try {
            return JSON.parse(objectMatch[0]);
        } catch (e4) {
            // Fall through
        }
    }

    console.error("JSON Parse Error. Raw Text:", text);
    throw new Error("Failed to parse AI response. The output might be truncated or malformed.");
  }
};

// Helper to enforce timeouts on AI calls
const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);
  });

  return Promise.race([
    promise.then((res) => {
      clearTimeout(timeoutId);
      return res;
    }),
    timeoutPromise
  ]);
};

// --- MODEL ROUTING & FALLBACK SYSTEM ---

const PRIMARY_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-1.5-pro';

// Only use Gemini 1.5 Pro as fallback. No 1.0 or 1.5-flash.
const FALLBACK_LIST = [FALLBACK_MODEL];

const generateContentWithFallback = async (
    ai: GoogleGenAI,
    params: { model: string; contents: any; config?: any },
    fallbacks: string[] = []
): Promise<GenerateContentResponse> => {
    const candidates = [params.model, ...fallbacks];
    let lastError: any;

    for (let i = 0; i < candidates.length; i++) {
        const model = candidates[i];
        try {
            return await ai.models.generateContent({
                model,
                contents: params.contents,
                config: params.config
            });
        } catch (e: any) {
            lastError = e;
            const msg = e.message || e.toString();
            
            // Identify recoverable errors suitable for model switching
            const isQuota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota');
            const isAuth = msg.includes('403') || msg.includes('Permission denied') || msg.includes('not valid');
            const isNotFound = msg.includes('404') || msg.includes('not found');
            const isBadRequest = msg.includes('400') || msg.includes('INVALID_ARGUMENT');

            // If we have valid fallback models remaining
            if ((isQuota || isAuth || isNotFound || isBadRequest) && i < candidates.length - 1) {
                const nextModel = candidates[i + 1];
                
                // Explicit logging as requested
                if (model.includes('gemini-3') && nextModel.includes('gemini-1.5-pro')) {
                   console.warn(`[MODEL ROUTER] Gemini 3 unavailable. Falling back to Gemini 1.5 Pro.`);
                } else {
                   console.warn(`[MODEL ROUTER] ${model} unavailable. Falling back to ${nextModel}.`);
                }
                
                continue;
            }
            
            // If not recoverable or no models left, throw to let withRetry handle it
            throw e;
        }
    }
    throw lastError;
};

// --- NEW SERVICE: INTENT PARSER ---

export const analyzeProjectRequirements = async (
  apiKey: string,
  userMessage: string,
  currentContext?: { pageName: string; purpose: string; primaryTask: string }
): Promise<ProjectRequirements> => {
  return withRetry(async () => {
    const ai = getClient(apiKey);
    
    const prompt = `
      You are a Technical Project Manager Agent.
      Your goal is to extract structured project requirements from a user's natural language input.

      USER INPUT: "${userMessage}"
      
      CURRENT CONTEXT (if any):
      ${currentContext ? JSON.stringify(currentContext) : "None"}

      INSTRUCTIONS:
      1. Analyze the User Input.
      2. Determine if the user is defining a NEW page or refining an EXISTING one.
      3. Extract/Update the following fields:
         - "pageName": Short, descriptive name (e.g., "Foodie Login", "Dashboard").
         - "purpose": The goal of the page (e.g., "Allow users to authenticate").
         - "primaryTask": The one specific action a user must complete (e.g., "Enter email and click login").
      
      RULES:
      - If the user input is a REFINEMENT (e.g., "Make the button blue"), KEEP the values from CURRENT CONTEXT.
      - If the user input is a NEW REQUEST (e.g., "Build a dashboard"), OVERWRITE the values.
      - If specific details are missing, INFER reasonable defaults based on the user's intent.

      OUTPUT JSON:
      {
        "pageName": "string",
        "purpose": "string",
        "primaryTask": "string",
        "isNewContext": boolean
      }
    `;

    try {
      const call = generateContentWithFallback(
        ai,
        {
          model: PRIMARY_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                pageName: { type: Type.STRING },
                purpose: { type: Type.STRING },
                primaryTask: { type: Type.STRING },
                isNewContext: { type: Type.BOOLEAN }
              },
              required: ['pageName', 'purpose', 'primaryTask', 'isNewContext']
            }
          }
        },
        FALLBACK_LIST
      );

      // Increased timeout to 60s
      const response = await withTimeout<GenerateContentResponse>(call, 60000, "Project Manager Agent timed out");
      const text = response.text;
      if (!text) throw new Error("No response from Project Manager Agent");
      return safeParseJSON(text) as ProjectRequirements;

    } catch (e) {
      handleGeminiError(e);
      throw e; 
    }
  });
};


// --- EXISTING AGENT SERVICES ---

export const getDesignDirection = async (
  apiKey: string,
  pageName: string,
  purpose: string,
  stylePrompt: string,
  qNaContext: string = ""
): Promise<DesignDirectorResponse> => {
  return withRetry(async () => {
    const ai = getClient(apiKey);
    
    const prompt = `
      You are the Design Director Agent.
      You act as a world-class creative director, UI design lead, and product taste guardian.
      
      CORE RESPONSIBILITIES:
      1. USER INTENT EXTRACTION: Parse the user's input for visual requests, functional intent, and emotional tone.
      2. DESIGN INTENT ENFORCEMENT: If the user asks for a specific visual element, it is a REQUIRED constraint.
      3. DESIGN CONTRACT CREATION: Produce a clear "Design Contract" (Visual Motif, Mood, Layout, Typography, Color, Motion, Non-Negotiables).
      4. FOLLOW-UP QUESTION PROTOCOL: If input is TOO VAGUE (e.g. "make a website"), ask up to 3 clarifying questions.
      
      CONTEXT:
      Page Name: "${pageName}"
      Purpose: "${purpose}"
      User Input/Style Prompt: "${stylePrompt}"
      ${qNaContext ? `Additional Context from User Answers:\n${qNaContext}` : ''}

      OUTPUT FORMAT (JSON):
      Return EITHER a "design_contract" object OR "clarification_required": true with "questions" array.

      IF PROCEEDING:
      {
        "design_contract": {
          "visual_motif": "string",
          "mood": "string",
          "layout_strategy": "string",
          "typography": "string",
          "color_strategy": "string",
          "motion_depth": "string",
          "non_negotiables": ["string", "string"]
        }
      }

      IF CLARIFICATION NEEDED:
      {
        "clarification_required": true,
        "questions": ["Question 1?", "Question 2?"]
      }
    `;

    try {
      const call = generateContentWithFallback(
        ai, 
        {
          model: PRIMARY_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                design_contract: {
                  type: Type.OBJECT,
                  properties: {
                    visual_motif: { type: Type.STRING },
                    mood: { type: Type.STRING },
                    layout_strategy: { type: Type.STRING },
                    typography: { type: Type.STRING },
                    color_strategy: { type: Type.STRING },
                    motion_depth: { type: Type.STRING },
                    non_negotiables: { 
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  }
                },
                clarification_required: { type: Type.BOOLEAN },
                questions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              }
            }
          }
        },
        FALLBACK_LIST
      );

      // Increased timeout to 90s (was 45s)
      const response = await withTimeout<GenerateContentResponse>(call, 90000, "Design Director Agent timed out");

      const text = response.text;
      if (!text) throw new Error("No response from Design Director Agent");
      
      const res = safeParseJSON(text) as DesignDirectorResponse;
      
      // Defensive normalization
      if (res.design_contract && !Array.isArray(res.design_contract.non_negotiables)) {
        res.design_contract.non_negotiables = [];
      }
      if (res.clarification_required && !Array.isArray(res.questions)) {
        res.questions = [];
      }
      
      return res;

    } catch (e) {
      handleGeminiError(e);
      throw e;
    }
  });
};

export const generateUI = async (
  apiKey: string,
  pageName: string,
  purpose: string,
  stylePrompt: string,
  designContract: DesignContract | null | undefined,
  currentHtml?: string,
  feedback?: string[],
  referenceImage?: string | null
): Promise<{ html: string; reactCode: string }> => {
  return withRetry(async () => {
    const ai = getClient(apiKey);
    
    // Ensure we have an array to map over to avoid crashes
    const nonNegotiables = designContract?.non_negotiables && Array.isArray(designContract.non_negotiables) 
      ? designContract.non_negotiables 
      : [];

    const feedbackList = feedback && Array.isArray(feedback) ? feedback : [];

    let promptText = `
      You are a Senior UI Engineer (UI Generation Agent).
      Your goal is to build a web interface that STRICTLY ADHERES to the Design Contract provided by the Design Director.

      PROJECT CONTEXT:
      - Page Name: "${pageName}"
      - Purpose: "${purpose}"
      
      ${referenceImage ? `
      IMPORTANT: A reference image has been provided. 
      Analyze the visual style, color palette, and vibe of this image. 
      Incorporate elements of this reference image into the UI design where appropriate (e.g., using similar colors, shapes, or layout feel).
      ` : ''}

      ${designContract ? `
      ════════════════════════════════════
      MANDATORY DESIGN CONTRACT (FROM DIRECTOR)
      ════════════════════════════════════
      You MUST implement the following:
      • VISUAL MOTIF: ${designContract.visual_motif}
      • MOOD: ${designContract.mood}
      • LAYOUT STRATEGY: ${designContract.layout_strategy}
      • TYPOGRAPHY: ${designContract.typography}
      • COLOR STRATEGY: ${designContract.color_strategy}
      • MOTION/DEPTH: ${designContract.motion_depth}
      • NON-NEGOTIABLES:
      ${nonNegotiables.map(n => `  - ${n}`).join('\n')}
      
      FAILURE TO IMPLEMENT THE ABOVE WILL RESULT IN A SYSTEM FAILURE.
      ` : `
      VISUAL STYLE:
      User Direction: "${stylePrompt || "Clean, minimalistic, high-end SaaS aesthetic"}"
      Use neutral colors, modern spacing, and a clean professional look.
      `}
      
      ════════════════════════════════════
      STRICT COMPOSITION RULES (CRITICAL)
      ════════════════════════════════════
      1. Z-INDEX & LAYERING:
         - Background elements (floating items, blobs, patterns) MUST have \`z-index: 0\` or \`z-index: 1\`.
         - Content containers (forms, cards, text) MUST have \`z-index: 10\` or higher and \`relative\` positioning.
         - NEVER allow background decorations to overlap text.
      
      2. FLOATING ELEMENTS:
         - If the user asks for "floating items" (e.g. food, icons), use absolute positioning with LOW OPACITY (e.g. \`opacity-20\`) or place them clearly OUTSIDE the main content area.
         - Do not clutter the center of the screen where the user interacts.
      
      3. READABILITY:
         - Ensure high contrast between text and background. 
         - If using a busy background image/pattern, the content card MUST have a solid background color (e.g. \`bg-white/90\` or \`bg-black/80\` with \`backdrop-blur-md\`).

      4. MODERN AESTHETICS:
         - Use ample whitespace (padding/margin).
         - Use subtle shadows (\`shadow-xl\`, \`shadow-2xl\`) for depth.
         - Rounded corners (\`rounded-2xl\` or \`rounded-3xl\`) for modern feel.

      TECHNICAL CONSTRAINTS:
      - Output ONLY valid HTML5 body content.
      - Use Tailwind CSS for ALL styling.
      - Do NOT use arbitrary CSS classes. Use Tailwind utilities.
      - For the 'html' field: You MUST use inline <svg> elements for icons. Do NOT use library components like <User /> in the HTML string.
      - For the 'reactCode' field: You MAY use lucide-react icons.
      - Ensure accessibility (contrast, aria-labels).
      
      Output Requirements:
      Return a JSON object with two fields:
      1. "html": A complete HTML string (body content only) using Tailwind classes. Embed SVGs for icons.
      2. "reactCode": A complete React functional component (TSX) string representing the same UI.
    `;

    if (currentHtml && feedbackList.length > 0) {
      promptText += `
        \n════════════════════════════════════
        🔥 CRITICAL HOTFIX REQUEST (ITERATION)
        ════════════════════════════════════
        The previous version FAILED the UX Audit.
        You MUST apply the following fixes immediately. 
        Do NOT ignore these. They are technical directives.

        UX ISSUES TO FIX:
        ${feedbackList.map(f => `❌ ${f}`).join('\n')}

        Previous HTML for reference (Analyze where it went wrong):
        ${currentHtml}

        INSTRUCTION: Re-write the code to solve these specific problems while maintaining the original design contract.
      `;
    }

    // Construct request parts (Text + Optional Image)
    const parts: any[] = [{ text: promptText }];

    if (referenceImage) {
      try {
          const [header, data] = referenceImage.split(',');
          const mimeType = header.split(':')[1].split(';')[0];
          parts.push({ 
              inlineData: { 
                  mimeType: mimeType, 
                  data: data 
              } 
          });
      } catch (e) {
          console.warn("Failed to parse reference image for prompt", e);
      }
    }

    try {
      const call = generateContentWithFallback(
        ai,
        {
          model: PRIMARY_MODEL, 
          contents: {
              parts: parts
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                html: { type: Type.STRING },
                reactCode: { type: Type.STRING }
              },
              required: ['html', 'reactCode']
            }
          }
        },
        FALLBACK_LIST
      );

      // Increased timeout to 120s (was 90s)
      const response = await withTimeout<GenerateContentResponse>(call, 120000, "UI Generation Agent timed out");

      const text = response.text;
      if (!text) throw new Error("No response from UI Agent");
      return safeParseJSON(text);

    } catch (e) {
      handleGeminiError(e);
      throw e;
    }
  });
};

export const simulateBrowser = async (apiKey: string, html: string, task: string): Promise<string[]> => {
  return withRetry(async () => {
    const ai = getClient(apiKey);
    const prompt = `
      You are a Browser Execution Agent (Puppeteer Simulator).
      Your goal is to simulate a user attempting to perform the following task: "${task}".
      
      Analyze the provided HTML structure.
      Simulate realistic user interactions (clicks, inputs, scrolls, wait times).
      
      HTML Content:
      ${html}
      
      Output Requirement:
      Return a JSON object with a "logs" field containing an array of strings.
      Each string should describe an action, e.g., "User clicked button 'Login'", "Waited 500ms for modal".
      If the task is impossible due to missing elements, log an error.
    `;

    try {
      const call = generateContentWithFallback(
        ai,
        {
          model: PRIMARY_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                logs: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ['logs']
            }
          }
        },
        FALLBACK_LIST
      );

      // Increased timeout to 90s (was 60s)
      const response = await withTimeout<GenerateContentResponse>(call, 90000, "Browser Agent timed out");

      const text = response.text;
      if (!text) throw new Error("No response from Browser Agent");
      
      const json = safeParseJSON(text);
      // Safe return
      return Array.isArray(json.logs) ? json.logs : [];

    } catch (e) {
      handleGeminiError(e);
      throw e;
    }
  });
};

export const evaluateUX = async (apiKey: string, html: string, logs: string[], task: string, iteration: number = 0): Promise<UXReport> => {
  return withRetry(async () => {
    const ai = getClient(apiKey);
    const prompt = `
      You are a Lead UX Researcher and Accessibility Auditor (The UX Simulation Agent).
      Your job is to perform a RUTHLESS, TECHNICAL CRITIQUE of the generated UI.
      You are evaluating Iteration #${iteration + 1} of the design.

      Primary User Task: "${task}"
      
      Browser Interaction Logs:
      ${JSON.stringify(logs)}
      
      HTML Code to Audit:
      ${html}
      
      ════════════════════════════════════
      HEURISTIC EVALUATION RULES (STRICT)
      ════════════════════════════════════
      You must FAIL the design (Status: FAIL) if any of these conditions are met:
      
      1. CLUMSY OVERLAPS:
         - Are text elements positioned absolutely over images without a contrast scrim or background blur?
         - Does the layout break or look "broken" in the code structure?
         
      2. VISIBILITY & CONTRAST:
         - Is white text placed on a light background (or black on dark) without sufficient contrast?
         - Are inputs or buttons hard to distinguish from the background?
      
      3. INTERACTION BLOCKERS:
         - Did the Browser Agent fail to find the button?
         - Are clickable elements too small (e.g., text-only links without padding)?
      
      4. AESTHETIC CLUTTER:
         - Are there "floating" decorative elements that obstruct reading?
         - Is the spacing inconsistent or non-existent (elements touching edges)?

      ════════════════════════════════════
      OUTPUT INSTRUCTIONS
      ════════════════════════════════════
      - "issues": List specific, observable failures. (e.g. "Text 'Login' overlaps with the background blob", "Contrast ratio on primary button is too low").
      - "recommendations": Provide PRECISE TECHNICAL INSTRUCTIONS for the UI Engineer. 
        - WRONG: "Fix the contrast."
        - RIGHT: "Add 'bg-black/50 backdrop-blur-md' to the main card container."
        - RIGHT: "Change text color to 'text-zinc-900' or add a semi-transparent background."
        - RIGHT: "Increase 'p-4' to 'p-8' on the form container."

      Output a JSON object matching the UXReport schema.
    `;

    try {
      const call = generateContentWithFallback(
        ai,
        {
          model: PRIMARY_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING, enum: ['PASS', 'FAIL'] },
                ux_score: { type: Type.INTEGER },
                iteration: { type: Type.INTEGER },
                issues: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING } 
                },
                recommendations: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING } 
                }
              },
              required: ['status', 'ux_score', 'issues', 'recommendations']
            }
          }
        },
        FALLBACK_LIST
      );

      // Increased timeout to 90s (was 60s)
      const response = await withTimeout<GenerateContentResponse>(call, 90000, "UX Agent timed out");

      const text = response.text;
      if (!text) throw new Error("No response from UX Agent");
      
      const report = safeParseJSON(text) as UXReport;
      
      // Defensive checks
      if (!Array.isArray(report.issues)) report.issues = [];
      if (!Array.isArray(report.recommendations)) report.recommendations = [];
      
      // Ensure iteration is set (in case model hallucinates or omits)
      report.iteration = iteration + 1;
      return report;

    } catch (e) {
      handleGeminiError(e);
      throw e;
    }
  });
};

// --- CREATIVE SUITE SERVICES ---

export const generateAsset = async (apiKey: string, prompt: string, size: '1K' | '2K' | '4K' = '1K'): Promise<string> => {
  return withRetry(async () => {
    const ai = getClient(apiKey);
    
    // Using gemini-3-pro-image-preview as per guidelines for high-quality/sized generation
    // This is a specialized model and does not use the standard text fallback loop.
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
            imageSize: size,
            aspectRatio: "1:1"
        }
      }
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
           const mime = part.inlineData.mimeType || 'image/png';
           return `data:${mime};base64,${part.inlineData.data}`;
        }
      }
    }
    
    throw new Error("No image generated.");
  });
};

export const analyzeDesignImage = async (apiKey: string, base64Data: string): Promise<string> => {
  return withRetry(async () => {
    const ai = getClient(apiKey);
    
    const prompt = `
      You are a Senior UI/UX Designer.
      Analyze the provided image (UI screenshot or design asset).
      
      Provide a concise technical breakdown suitable for a frontend engineer:
      1. **Color Palette**: Dominant colors (Hex), accent colors, background styles.
      2. **Typography**: Font families (Serif/Sans/Mono), estimated weights, case styles.
      3. **Layout & Spacing**: Grid usage, whitespace density, border-radius usage.
      4. **Visual Motifs**: Shadows, flat vs skeuomorphic, glassmorphism, gradients.
      5. **Vibe**: 2-3 words describing the aesthetic (e.g., "Cyberpunk Dark", "Clean Corporate").
      
      Output plain text.
    `;

    const call = generateContentWithFallback(
        ai,
        {
          model: PRIMARY_MODEL,
          contents: {
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: base64Data
                    }
                }
            ]
        }
        },
        FALLBACK_LIST // Use vision-compatible fallback
    );

    const response = await withTimeout<GenerateContentResponse>(call, 60000, "Analysis Agent timed out");
    
    return response.text || "Analysis failed.";
  });
};