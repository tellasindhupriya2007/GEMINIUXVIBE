import React, { useState, useEffect, useRef } from 'react';
import { Layout, Play, RefreshCw, Code, Eye, RotateCcw, Send, Maximize2, Minimize2, Paperclip, X, Undo, Redo, Download, StopCircle, User, Bot, Key, Camera, History, Clock, Sidebar, PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen, Terminal, Activity } from 'lucide-react';
import AgentVisualizer from './components/AgentVisualizer';
import PreviewFrame from './components/PreviewFrame';
import TerminalLog from './components/TerminalLog';
import UXReportCard from './components/UXReportCard';
import { generateUI, simulateBrowser, evaluateUX, getDesignDirection, analyzeProjectRequirements } from './services/gemini';
import { PageVersion, AgentStatus, LogEntry, DesignContract, ChatMessage } from './types';

const INITIAL_LOGS: LogEntry[] = [
  { agent: 'SYSTEM', message: 'Vibe Engineering System initialized.', timestamp: Date.now() },
];

const INITIAL_CHAT: ChatMessage[] = [
    { id: '1', role: 'assistant', content: "Hello! I'm your autonomous UI/UX Foundry. Describe what you want to build (e.g., 'A login screen for a foodie app').", timestamp: Date.now() }
];

const STORAGE_KEY = 'vibe_project_state_v1';

const App: React.FC = () => {
  // --- CORE STATE ---
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('vibe_gemini_api_key') || 'AIzaSyBQLAGRsb0wXd040gTWPfkf9ez4zuwogSM');
  const [showKeyModal, setShowKeyModal] = useState(false);
  
  const [status, setStatus] = useState<AgentStatus>(AgentStatus.IDLE);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  
  // --- CHAT & PROJECT STATE ---
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [inputMessage, setInputMessage] = useState('');
  
  // Inferred Project Context (Managed by AI)
  const [pageName, setPageName] = useState('Untitled Page');
  const [purpose, setPurpose] = useState('Generic UI');
  const [task, setTask] = useState('Interact with page');
  
  // --- VERSIONING ---
  const [versionHistory, setVersionHistory] = useState<PageVersion[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const currentVersion = historyIndex >= 0 ? versionHistory[historyIndex] : null;

  // --- UI CONTROLS ---
  const [viewMode, setViewMode] = useState<'PREVIEW' | 'CODE'>('PREVIEW');
  const [autoHeal, setAutoHeal] = useState(true);
  const [autoHealCount, setAutoHealCount] = useState(0); 
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  
  // Layout Controls
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [rightSidebarTab, setRightSidebarTab] = useState<'INSPECTOR' | 'HISTORY'>('INSPECTOR');
  
  // --- ASSETS & CLARIFICATION ---
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<number, string>>({});
  const [designContract, setDesignContract] = useState<DesignContract | null>(null);
  const [qNaHistory, setQNaHistory] = useState<string>(""); 

  // --- SCREENSHOT TRIGGER ---
  const [screenshotTrigger, setScreenshotTrigger] = useState(0);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  // --- PERSISTENCE: LOAD ---
  useEffect(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
          try {
              const data = JSON.parse(saved);
              setLogs(data.logs || INITIAL_LOGS);
              setChatHistory(data.chatHistory || INITIAL_CHAT);
              setVersionHistory(data.versionHistory || []);
              setHistoryIndex(data.historyIndex ?? -1);
              setPageName(data.pageName || 'Untitled Page');
              setPurpose(data.purpose || 'Generic UI');
              setTask(data.task || 'Interact with page');
              setDesignContract(data.designContract || null);
              setQNaHistory(data.qNaHistory || "");
              
              if (data.status === AgentStatus.COMPLETE || data.status === AgentStatus.IDLE) {
                   setStatus(data.status);
              } else {
                   setStatus(AgentStatus.IDLE);
              }

              addLog('SYSTEM', 'Previous session restored.');
          } catch (e) {
              console.error("Failed to load save state", e);
          }
      }
  }, []);

  // --- PERSISTENCE: SAVE ---
  useEffect(() => {
      if (versionHistory.length > 0 || chatHistory.length > 1) {
          const stateToSave = {
              logs: logs.slice(-50), // Keep last 50 logs to save space
              chatHistory,
              versionHistory, 
              historyIndex,
              pageName,
              purpose,
              task,
              designContract,
              qNaHistory,
              status
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
      }
  }, [logs, chatHistory, versionHistory, historyIndex, pageName, purpose, task, designContract, qNaHistory, status]);


  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const saveApiKey = (key: string) => {
      localStorage.setItem('vibe_gemini_api_key', key);
      setApiKey(key);
      setShowKeyModal(false);
  };

  const addLog = (agent: LogEntry['agent'], message: string) => {
    setLogs(prev => [...prev, { agent, message, timestamp: Date.now() }]);
  };

  const addChatMessage = (role: 'user' | 'assistant', content: string) => {
      setChatHistory(prev => [...prev, {
          id: crypto.randomUUID(),
          role,
          content,
          timestamp: Date.now()
      }]);
  };

  // --- MAIN WORKFLOW START ---
  const handleSendMessage = async () => {
      if (!inputMessage.trim()) return;
      if (!apiKey) {
          setShowKeyModal(true);
          return;
      }

      const userMsg = inputMessage;
      setInputMessage('');
      addChatMessage('user', userMsg);

      if (status !== AgentStatus.IDLE && status !== AgentStatus.COMPLETE && status !== AgentStatus.ERROR && status !== AgentStatus.CLARIFYING) {
          return; // Busy
      }

      // 1. Analyze Intent
      setStatus(AgentStatus.ANALYZING);
      addLog('MANAGER', 'Analyzing user intent...');
      
      try {
          const reqs = await analyzeProjectRequirements(apiKey, userMsg, { pageName, purpose, primaryTask: task });
          
          setPageName(reqs.pageName);
          setPurpose(reqs.purpose);
          setTask(reqs.primaryTask);

          addLog('MANAGER', `Project Context Set: ${reqs.pageName}`);
          
          // 2. Start Cycle
          if (reqs.isNewContext) {
              setDesignContract(null); // Reset design contract for new pages
          }
          
          // Pass explicitly to avoid React state race condition
          handleStartCycle(userMsg, reqs); 

      } catch (e: any) {
          console.error(e);
          addLog('SYSTEM', `Analysis failed: ${e.message || 'Unknown error. Check API Key.'}`);
          setStatus(AgentStatus.ERROR);
      }
  };

  // The main generation loop
  const handleStartCycle = async (
      currentStylePrompt: string, 
      overrideContext?: { pageName: string, purpose: string, primaryTask: string },
      overrideQnA?: string,
      isAutoHeal = false
  ) => {
    
    // Resolve context: Use override if provided (from immediate analysis), else use state
    const ctxPageName = overrideContext?.pageName || pageName;
    const ctxPurpose = overrideContext?.purpose || purpose;
    const ctxTask = overrideContext?.primaryTask || task;
    const ctxQnA = overrideQnA !== undefined ? overrideQnA : qNaHistory;

    // Use a local variable to track the current iteration count within this cycle
    let currentIterationCount = isAutoHeal ? autoHealCount : 0;

    if (!isAutoHeal) {
        setAutoHealCount(0);
        if (status !== AgentStatus.CLARIFYING) {
            setClarificationQuestions([]);
            setClarificationAnswers({});
            setQNaHistory("");
        }
    }

    try {
      // PHASE 0: Design Director
      let contractToUse = designContract;

      if (!contractToUse || !isAutoHeal) {
          setStatus(AgentStatus.DESIGN_DIRECTING);
          addLog('DIRECTOR', 'Establishing visual direction...');
          
          try {
            const directorResponse = await getDesignDirection(apiKey, ctxPageName, ctxPurpose, currentStylePrompt, ctxQnA);

            if (directorResponse.clarification_required && directorResponse.questions) {
                setClarificationQuestions(directorResponse.questions);
                setStatus(AgentStatus.CLARIFYING);
                addLog('DIRECTOR', 'Clarification needed.');
                addChatMessage('assistant', `I need a few details to get this right: ${directorResponse.questions[0]}`);
                return; 
            }

            if (directorResponse.design_contract) {
                contractToUse = directorResponse.design_contract;
                setDesignContract(contractToUse);
                addLog('DIRECTOR', `Visual Motif: ${contractToUse.visual_motif}`);
            }
          } catch (directorErr: any) {
             console.warn("Design Director bypassed due to error:", directorErr);
             addLog('DIRECTOR', `⚠️ Agent unavailable: ${directorErr.message}. Bypassing...`);
             contractToUse = null;
          }
      }
      
      // PHASE 1: UI Generation
      setStatus(AgentStatus.UI_GENERATING);
      addLog('UI', isAutoHeal ? `Iteration ${currentIterationCount + 1}: Applying critical fixes...` : `Generating UI for "${ctxPageName}"...`);
      
      const previousFeedback = currentVersion?.uxReport?.status === 'FAIL' 
        ? currentVersion.uxReport.recommendations 
        : undefined;

      const uiResult = await generateUI(
          apiKey,
          ctxPageName, 
          ctxPurpose, 
          currentStylePrompt, 
          contractToUse,
          currentVersion?.html, 
          previousFeedback,
          referenceImage
      );
      
      // Create new version object
      const newVersion: PageVersion = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        html: uiResult.html,
        reactCode: uiResult.reactCode,
        logs: [],
        uxReport: null,
        designContract: contractToUse
      };
      
      setVersionHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        const updated = [...newHistory, newVersion];
        return updated;
      });
      setHistoryIndex(prev => prev + 1);
      
      // PHASE 2: Browser Simulation
      setStatus(AgentStatus.BROWSER_SIMULATING);
      addLog('BROWSER', `Simulating user task: "${ctxTask}"`);
      
      const interactionLogs = await simulateBrowser(apiKey, newVersion.html, ctxTask);
      interactionLogs.forEach(log => addLog('BROWSER', log));
      
      setVersionHistory(prev => prev.map(v => 
          v.id === newVersion.id ? { ...v, logs: interactionLogs } : v
      ));
      newVersion.logs = interactionLogs;

      // PHASE 3: UX Evaluation
      setStatus(AgentStatus.UX_EVALUATING);
      addLog('UX', `Auditing Iteration #${currentIterationCount + 1}...`);
      
      const report = await evaluateUX(apiKey, newVersion.html, newVersion.logs, ctxTask, currentIterationCount);
      
      addLog('UX', `Status: ${report.status} | Score: ${report.ux_score}`);
      
      setVersionHistory(prev => prev.map(v => 
          v.id === newVersion.id ? { ...v, uxReport: report } : v
      ));

      if (report.status === 'FAIL' && autoHeal) {
        if (currentIterationCount < 3) {
            addLog('SYSTEM', `Auto-healing (Attempt ${currentIterationCount + 1}/3)...`);
            setAutoHealCount(prev => prev + 1);
            setTimeout(() => {
                handleStartCycle(currentStylePrompt, { pageName: ctxPageName, purpose: ctxPurpose, primaryTask: ctxTask }, ctxQnA, true);
            }, 2000);
        } else {
             addLog('SYSTEM', 'Auto-healing limit reached.');
             addChatMessage('assistant', `I've iterated 3 times but the UX Agent is still finding issues. Check the Report Card for details.`);
             setStatus(AgentStatus.COMPLETE);
        }
      } else {
        setStatus(AgentStatus.COMPLETE);
        // Auto open report if it's new
        setRightSidebarTab('INSPECTOR');
        setIsRightSidebarOpen(true);
        
        if (isAutoHeal) {
            addChatMessage('assistant', `Fixed! Iteration #${report.iteration} passed the UX Audit. How does it look now?`);
        } else {
            addChatMessage('assistant', `I've generated the ${ctxPageName}. How does it look?`);
        }
      }

    } catch (error: any) {
      console.error(error);
      addLog('SYSTEM', `Error: ${error.message || 'Unknown system error'}`);
      addChatMessage('assistant', "I encountered an error while building. Check logs for details.");
      setStatus(AgentStatus.ERROR);
    }
  };

  // --- CONTROLS ---

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      addLog('SYSTEM', 'Restored previous version.');
    }
  };

  const handleRedo = () => {
    if (historyIndex < versionHistory.length - 1) {
      setHistoryIndex(historyIndex + 1);
      addLog('SYSTEM', 'Redoing change...');
    }
  };

  const handleDownloadHtml = () => {
    if (!currentVersion) return;
    try {
      const blob = new Blob([currentVersion.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pageName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_v${currentVersion.timestamp}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed', e);
    }
  };

  const handleTakeScreenshot = () => {
      setScreenshotTrigger(prev => prev + 1);
  };

  const handleScreenshotReceived = (dataUrl: string) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${pageName.replace(/[^a-z0-9]/gi, '_')}_screenshot_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      addLog('SYSTEM', 'Screenshot captured and downloaded.');
  };

  const submitClarification = () => {
    const newQnAEntry = clarificationQuestions.map((q, idx) => `Q: ${q}\nA: ${clarificationAnswers[idx] || "No answer"}`).join('\n');
    const updatedQnAHistory = qNaHistory + "\n" + newQnAEntry;
    
    setQNaHistory(updatedQnAHistory);
    setClarificationQuestions([]);
    
    const lastUserMessage = chatHistory.slice().reverse().find(m => m.role === 'user')?.content || "";
    handleStartCycle(lastUserMessage, undefined, updatedQnAHistory);
  };

  const resetProject = () => {
      if (confirm('Are you sure? This will delete the current project history.')) {
        setStatus(AgentStatus.IDLE);
        setLogs(INITIAL_LOGS);
        setVersionHistory([]);
        setHistoryIndex(-1);
        setDesignContract(null);
        setClarificationQuestions([]);
        setQNaHistory("");
        setReferenceImage(null);
        setAutoHealCount(0);
        setChatHistory(INITIAL_CHAT);
        setPageName('Untitled Page');
        setPurpose('Generic UI');
        setTask('Interact with page');
        localStorage.removeItem(STORAGE_KEY);
      }
  };

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans relative selection:bg-blue-500/30">
      
      {/* API Key Modal */}
      {(!apiKey || showKeyModal) && (
          <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-zinc-900 border border-zinc-700 w-full max-w-md rounded-xl shadow-2xl p-6">
                  <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                      <Key className="w-5 h-5 text-blue-500" /> API Configuration
                  </h2>
                  <p className="text-zinc-400 text-sm mb-6">
                      Vibe Engineering requires a Gemini API Key to function. Your key is stored locally in your browser and never sent to our servers.
                  </p>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-semibold text-zinc-500 uppercase">Gemini API Key</label>
                          <input 
                              ref={keyInputRef}
                              type="password"
                              defaultValue={apiKey}
                              placeholder="AIzaSy..."
                              className="w-full mt-1 bg-black/50 border border-zinc-700 rounded-lg p-3 text-sm focus:border-blue-500 outline-none font-mono text-white"
                          />
                      </div>
                      <button 
                          onClick={() => {
                              const val = keyInputRef.current?.value || '';
                              if (val.trim().length > 10) saveApiKey(val);
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg font-medium transition-colors">
                          Save API Key
                      </button>
                      <div className="text-center">
                         <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">
                             Get a free key from Google AI Studio
                         </a>
                      </div>
                      {apiKey && (
                          <button onClick={() => setShowKeyModal(false)} className="w-full text-zinc-500 hover:text-white text-xs py-2">
                              Cancel
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Clarification Modal */}
      {status === AgentStatus.CLARIFYING && (
        <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/50">
              <h3 className="text-xl font-bold text-white mb-2">Refining Details</h3>
              <p className="text-zinc-400 text-sm">Design Director needs a bit more info.</p>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {clarificationQuestions.map((question, idx) => (
                <div key={idx} className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300 block">{question}</label>
                  <input 
                    type="text" 
                    value={clarificationAnswers[idx] || ''}
                    onChange={(e) => setClarificationAnswers(prev => ({...prev, [idx]: e.target.value}))}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm focus:border-pink-500 outline-none"
                    autoFocus={idx === 0}
                  />
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end">
              <button 
                onClick={submitClarification}
                className="bg-pink-600 hover:bg-pink-500 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2">
                <Send className="w-4 h-4" /> Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR: CHAT INTERFACE */}
      <div className={`${isLeftSidebarOpen ? 'w-80' : 'w-0'} border-r border-zinc-800 flex flex-col bg-[#0c0c0e] transition-all duration-300 overflow-hidden relative shrink-0`}>
        
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3 w-80">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                <Layout className="w-5 h-5 text-white" />
            </div>
            <div className="leading-none">
                <div className="font-bold text-sm text-white">Vibe Engineering</div>
                <div className="text-[10px] text-zinc-500 mt-1 font-mono">Agent Interface</div>
            </div>
            <div className="ml-auto flex gap-1">
                 <button onClick={() => setShowKeyModal(true)} title="API Settings" className="text-zinc-500 hover:text-white p-1">
                    <Key className="w-4 h-4" />
                 </button>
                 <button onClick={resetProject} title="New Project" className="text-zinc-500 hover:text-white p-1">
                    <RotateCcw className="w-4 h-4" />
                 </button>
                 <button onClick={() => setIsLeftSidebarOpen(false)} title="Close Sidebar" className="text-zinc-500 hover:text-white p-1">
                    <PanelLeftClose className="w-4 h-4" />
                 </button>
            </div>
        </div>

        {/* Project Context Info (Mini) */}
        {status !== AgentStatus.IDLE && (
            <div className="px-4 py-2 bg-zinc-900/50 border-b border-zinc-800 text-[10px] text-zinc-500 font-mono flex items-center gap-2 w-80">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                Working on: <span className="text-zinc-300 truncate max-w-[150px]">{pageName}</span>
            </div>
        )}

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar w-80">
            {chatHistory.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-zinc-800' : 'bg-blue-600/20'}`}>
                        {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-zinc-400" /> : <Bot className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <div className={`rounded-xl p-2.5 text-xs max-w-[85%] leading-relaxed ${
                        msg.role === 'user' 
                        ? 'bg-zinc-800 text-white rounded-tr-sm' 
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-sm'
                    }`}>
                        {msg.content}
                    </div>
                </div>
            ))}
            {status !== AgentStatus.IDLE && status !== AgentStatus.COMPLETE && status !== AgentStatus.ERROR && (
                <div className="flex gap-3 animate-pulse">
                     <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center">
                        <Bot className="w-3.5 h-3.5 text-blue-400" />
                     </div>
                     <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs rounded-tl-sm text-zinc-500 italic">
                        Processing...
                     </div>
                </div>
            )}
            <div ref={chatScrollRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-zinc-800 bg-[#0c0c0e] w-80">
             
             {/* Reference Image Indicator */}
             {referenceImage && (
                  <div className="mb-2 flex items-center gap-2 text-[10px] text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20 w-fit">
                        <Paperclip className="w-3 h-3" /> 
                        Ref Image Attached
                        <button onClick={() => setReferenceImage(null)} className="hover:text-red-400"><X className="w-3 h-3" /></button>
                  </div>
              )}

             <div className="relative">
                <textarea 
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                        }
                    }}
                    placeholder="Describe your app..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 pr-10 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none h-14 custom-scrollbar placeholder:text-zinc-600"
                />
                <button 
                    onClick={handleSendMessage}
                    disabled={status !== AgentStatus.IDLE && status !== AgentStatus.COMPLETE && status !== AgentStatus.ERROR}
                    className="absolute right-2 bottom-2 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    <Send className="w-3.5 h-3.5" />
                </button>
             </div>
             
             <div className="mt-3 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                     <label className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" checked={autoHeal} onChange={(e) => setAutoHeal(e.target.checked)} className="hidden" />
                        <div className={`w-3 h-3 rounded-full border ${autoHeal ? 'bg-green-500 border-green-500' : 'border-zinc-600 bg-transparent'}`}></div>
                        <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 transition-colors">Auto-Heal</span>
                     </label>
                 </div>
             </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative">
        
        {/* Toggle Left Sidebar Button (When Closed) */}
        {!isLeftSidebarOpen && (
            <button 
                onClick={() => setIsLeftSidebarOpen(true)}
                className="absolute top-3 left-3 z-50 p-2 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg shadow-lg"
            >
                <PanelLeftOpen className="w-4 h-4" />
            </button>
        )}

        {/* Top Bar */}
        <div className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-[#0c0c0e] shrink-0">
            <div className="flex items-center gap-4 pl-8"> {/* Added padding left for toggle button space */}
                <AgentVisualizer status={status} />
            </div>
            
            <div className="flex items-center gap-4">
                 
                 {/* Right Sidebar Toggle */}
                 <button 
                    onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                    className={`p-1.5 rounded-md transition-colors ${!isRightSidebarOpen ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}
                    title={isRightSidebarOpen ? "Close Tools" : "Open Tools"}
                 >
                    {isRightSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                 </button>
            </div>
        </div>
        
        {/* Workspace Columns */}
        <div className="flex-1 flex min-h-0 relative overflow-hidden">
            
            {/* Center: Canvas Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#121214] relative transition-all duration-300">
                
                {/* Canvas Toolbar */}
                <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 bg-[#0c0c0e]">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Canvas Output</span>
                        {currentVersion && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                                v{currentVersion.timestamp.toString().slice(-4)}
                            </span>
                        )}
                        {status !== AgentStatus.IDLE && status !== AgentStatus.COMPLETE && status !== AgentStatus.ERROR && (
                           <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                             <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                             <span className="text-[10px] text-blue-400 font-medium">Building...</span>
                           </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                         <div className="flex items-center gap-1 mr-2 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
                            <button
                                onClick={handleUndo}
                                disabled={historyIndex <= 0}
                                className="p-1 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors disabled:opacity-30"
                                title="Undo"
                            >
                                <Undo className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={handleRedo}
                                disabled={historyIndex >= versionHistory.length - 1}
                                className="p-1 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors disabled:opacity-30"
                                title="Redo"
                            >
                                <Redo className="w-3.5 h-3.5" />
                            </button>
                         </div>
                         
                         <div className="w-px h-3 bg-zinc-800"></div>

                         <div className="flex bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
                            <button 
                                onClick={() => setViewMode('PREVIEW')}
                                className={`p-1 px-2.5 rounded text-[10px] font-medium flex items-center gap-1.5 transition-all ${viewMode === 'PREVIEW' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                <Eye className="w-3 h-3" /> Preview
                            </button>
                            <button 
                                onClick={() => setViewMode('CODE')}
                                className={`p-1 px-2.5 rounded text-[10px] font-medium flex items-center gap-1.5 transition-all ${viewMode === 'CODE' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                <Code className="w-3 h-3" /> Code
                            </button>
                        </div>

                        <div className="w-px h-3 bg-zinc-800"></div>

                        <button
                                onClick={handleTakeScreenshot}
                                disabled={!currentVersion}
                                className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-30"
                                title="Screenshot"
                            >
                                <Camera className="w-3.5 h-3.5" />
                        </button>
                        <button
                                onClick={handleDownloadHtml}
                                disabled={!currentVersion}
                                className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors disabled:opacity-30"
                                title="Download HTML"
                            >
                                <Download className="w-3.5 h-3.5" />
                        </button>

                    </div>
                </div>

                <div className="flex-1 bg-[#121214] overflow-hidden relative group/preview p-4 flex items-center justify-center">
                    {/* Main Content */}
                    <div className="w-full h-full relative shadow-2xl rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900">
                        {viewMode === 'PREVIEW' ? (
                            <PreviewFrame 
                                html={currentVersion?.html || ''} 
                                isScanning={status === AgentStatus.UX_EVALUATING} 
                                triggerScreenshot={screenshotTrigger}
                                onScreenshotTaken={handleScreenshotReceived}
                            />
                        ) : (
                             <div className="w-full h-full bg-[#1e1e1e] overflow-auto p-4 custom-scrollbar">
                                <pre className="text-xs font-mono text-zinc-300 leading-relaxed">
                                    {currentVersion?.reactCode || '// No code generated yet'}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Unified Right Sidebar */}
            <div className={`${isRightSidebarOpen ? 'w-96' : 'w-0'} border-l border-zinc-800 bg-[#0c0c0e] flex flex-col transition-all duration-300 overflow-hidden shrink-0`}>
                
                {/* Tabs */}
                <div className="flex items-center border-b border-zinc-800 w-96 shrink-0 bg-zinc-900/50">
                    <button 
                        onClick={() => setRightSidebarTab('INSPECTOR')}
                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-colors ${rightSidebarTab === 'INSPECTOR' ? 'border-blue-500 text-white bg-zinc-800' : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
                        <Activity className="w-3.5 h-3.5" /> Inspector
                    </button>
                    <button 
                        onClick={() => setRightSidebarTab('HISTORY')}
                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-colors ${rightSidebarTab === 'HISTORY' ? 'border-blue-500 text-white bg-zinc-800' : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
                        <History className="w-3.5 h-3.5" /> History
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-hidden w-96 flex flex-col">
                    {rightSidebarTab === 'INSPECTOR' && (
                        <div className="flex flex-col h-full">
                             <div className="h-1/2 min-h-[200px] border-b border-zinc-800 flex flex-col">
                                <UXReportCard report={currentVersion?.uxReport || null} />
                             </div>
                             <div className="h-1/2 min-h-[200px] flex flex-col">
                                <TerminalLog logs={logs} />
                             </div>
                        </div>
                    )}
                    
                    {rightSidebarTab === 'HISTORY' && (
                         <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-[#0c0c0e]">
                            {versionHistory.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-2">
                                    <Clock className="w-6 h-6 opacity-50" />
                                    <span className="text-xs">No history yet</span>
                                </div>
                            )}
                            {versionHistory.slice().reverse().map((v, revIdx) => {
                                const actualIdx = versionHistory.length - 1 - revIdx;
                                const isActive = actualIdx === historyIndex;
                                return (
                                    <button 
                                    key={v.id}
                                    onClick={() => setHistoryIndex(actualIdx)}
                                    className={`w-full text-left p-3 rounded-lg border transition-all group ${
                                        isActive 
                                        ? 'bg-blue-900/10 border-blue-500/50 shadow-md' 
                                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800'
                                    }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`text-xs font-mono font-medium ${isActive ? 'text-blue-400' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                                                v{v.timestamp.toString().slice(-4)}
                                            </span>
                                            {v.uxReport && (
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${v.uxReport.status === 'PASS' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                                                    {v.uxReport.status}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-zinc-500 text-[10px]">
                                            <Clock className="w-3 h-3" />
                                            <span>
                                                {new Date(v.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default App;