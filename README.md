# Self-Healing UX Foundry

You type what you want. The AI builds it, checks it, and fixes it automatically.

Built using Google Gemini 3 Pro API, Next.js, and Puppeteer.

---

## What does this do?

Most AI tools generate code and stop. This one goes a step further.

You type something like "Build a login page for a coffee shop." The system generates the code, opens it in a browser, takes a screenshot, and checks if it actually looks good. If something is wrong, it automatically fixes it and tries again. This keeps repeating until the result passes the check.

Think of it as three people working together:
- The **Manager** takes your request and runs the process
- The **Builder** writes the code
- The **Critic** looks at the final page and decides if it is good or not

---

## How it works step by step

```
You type a prompt
        |
        v
Manager (Node.js) starts the process
        |
        v
Builder (Gemini AI) writes the React component
        |
        v
Next.js renders it on a local web page
        |
        v
Critic (Puppeteer) opens the page and takes a screenshot
        |
        v
Gemini Vision looks at the screenshot and checks for problems
        |
        v
Did it pass?
    YES  -->  Done. Your page is ready.
    NO   -->  Critic explains what is wrong, Builder fixes it, loop repeats
```

---

## Tech Stack

| What | Tool | Why |
|---|---|---|
| Page rendering | Next.js | Updates the page instantly when code changes |
| AI that writes code | Google Gemini 3 Pro | Generates React components from text |
| AI that checks the page | Gemini 3 Pro Vision | Looks at a screenshot and spots problems |
| Screenshot tool | Puppeteer | Opens a browser and takes a photo of the page |
| Glue that connects everything | Node.js | Runs the scripts and passes data between tools |
| Styling | Tailwind CSS | Easy for AI to write, looks clean |

---

## Project Structure

```
vibe-foundry/
├── src/
│   ├── app/
│   │   └── preview/page.tsx          # Shows the generated page
│   ├── components/
│   │   └── generated/
│   │       └── CurrentDesign.tsx     # The AI-generated component goes here
│   ├── scripts/
│   │   ├── builder.js                # Asks Gemini to write the code
│   │   ├── critic.js                 # Takes a screenshot and checks it
│   │   └── main.js                   # Runs the full loop
│   └── prompts/                      # Instructions given to the AI
├── package.json
└── README.md
```

---

## Getting Started

**What you need before starting**
- Node.js installed on your computer
- A free Gemini API key from Google AI Studio

**Setup**

```bash
# Clone the project
git clone <repo-link>
cd vibe-foundry

# Install everything
npm install

# Add your API key
# Create a file called .env.local and write this inside it:
GEMINI_API_KEY=your_api_key_here
```

**Run it**

```bash
# Terminal 1: Start the web page
npm run dev

# Terminal 2: Start the AI loop
node src/scripts/main.js
```

Open http://localhost:3000/preview in your browser to see the page being built in real time.

---

## Things we had to figure out

**Getting clean code from the AI**
Gemini sometimes adds extra text like "Here is your code!" before the actual code. That breaks the file. We fixed this by giving the AI strict instructions to return only the code and nothing else.

**Waiting for things to finish**
Taking a screenshot has to happen after the page fully loads. If you do not wait, the script crashes. We used async/await in Node.js to handle this properly.

**File paths**
The file the AI saves has to be in exactly the right place for Next.js to pick it up. One wrong folder name and nothing renders.

---

## What could be added later

- A proper website UI so you do not have to use the terminal
- Support for generating multiple pages at once
- A history of all the designs that were generated
- Ability to use other AI models like Claude or GPT

---

## Built with

Google Gemini 3 Pro API by Google AI Studio
