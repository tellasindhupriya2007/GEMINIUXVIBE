import React, { useEffect, useRef } from 'react';

interface PreviewFrameProps {
  html: string;
  isScanning?: boolean;
  triggerScreenshot?: number; // Increment this to trigger a screenshot
  onScreenshotTaken?: (dataUrl: string) => void;
}

const PreviewFrame: React.FC<PreviewFrameProps> = ({ html, isScanning = false, triggerScreenshot, onScreenshotTaken }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Inject Tailwind via CDN into the iframe
  // We also inject a script to handle internal screenshots using html2canvas
  const srcDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <style>
            body { background-color: white; } 
            /* Fix for some tailwind defaults in iframe */
            html, body { height: 100%; margin: 0; padding: 0; }
            /* Hide scrollbar for cleaner preview */
            ::-webkit-scrollbar { width: 0px; background: transparent; }
        </style>
      </head>
      <body>
        ${html || '<div class="flex h-full items-center justify-center text-gray-400 font-sans text-sm">Waiting for UI Generation...</div>'}
        
        <script>
          // Listen for screenshot messages from parent
          window.addEventListener('message', async (event) => {
            if (event.data.type === 'CAPTURE_SCREENSHOT') {
              try {
                // Wait for images to load if needed
                await document.fonts.ready;
                
                const canvas = await html2canvas(document.body, {
                    useCORS: true,
                    scale: 2, // Retina quality
                    logging: false,
                    backgroundColor: '#ffffff'
                });
                
                const dataUrl = canvas.toDataURL('image/png');
                
                // Send back to parent
                window.parent.postMessage({ type: 'SCREENSHOT_RESULT', dataUrl: dataUrl }, '*');
              } catch (e) {
                console.error("Screenshot failed inside iframe", e);
              }
            }
          });
        </script>
      </body>
    </html>
  `;

  useEffect(() => {
    if (triggerScreenshot && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'CAPTURE_SCREENSHOT' }, '*');
    }
  }, [triggerScreenshot]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'SCREENSHOT_RESULT' && onScreenshotTaken) {
            onScreenshotTaken(event.data.dataUrl);
        }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onScreenshotTaken]);

  return (
    <div className="w-full h-full bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700 shadow-xl relative group">
       <iframe
        ref={iframeRef}
        title="Preview"
        srcDoc={srcDoc}
        className="w-full h-full border-0 block bg-white"
        sandbox="allow-scripts allow-same-origin"
      />
      
      {/* UX Scanner Overlay */}
      {isScanning && (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
            {/* Dark tint */}
            <div className="absolute inset-0 bg-blue-900/10 backdrop-blur-[1px]"></div>
            
            {/* Scan Grid */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] opacity-20"></div>

            {/* Scanning Line */}
            <div className="absolute w-full h-1 bg-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-[scan_2s_ease-in-out_infinite] top-0"></div>
            
            {/* Scanning Text */}
            <div className="absolute bottom-4 right-4 bg-black/70 text-blue-400 px-3 py-1 text-xs font-mono rounded border border-blue-500/30 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                UX AGENT ANALYZING...
            </div>
        </div>
      )}
      
      {/* Styles for scan animation */}
      <style>{`
        @keyframes scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default PreviewFrame;