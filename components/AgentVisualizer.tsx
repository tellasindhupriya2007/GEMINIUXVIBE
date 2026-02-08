import React from 'react';
import { AgentStatus } from '../types';
import { Bot, AppWindow, PenTool, Search } from 'lucide-react';

interface AgentVisualizerProps {
  status: AgentStatus;
}

const AgentVisualizer: React.FC<AgentVisualizerProps> = ({ status }) => {
  const getStatusColor = (active: boolean, error: boolean = false) => {
    if (error) return 'bg-red-500/10 border-red-500/50 text-red-500';
    if (active) return 'bg-blue-500/10 border-blue-500/50 text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] ring-1 ring-blue-500/20';
    return 'bg-zinc-900 border-zinc-800 text-zinc-600 grayscale opacity-40';
  };

  return (
    <div className="flex justify-center items-center gap-2 py-2 px-4 bg-[#0c0c0e] border-b border-zinc-800/50 select-none">
      
      {/* Design Director */}
      <div className={`flex items-center gap-2 p-1.5 px-3 border rounded-full transition-all duration-500 ${getStatusColor(status === AgentStatus.DESIGN_DIRECTING || status === AgentStatus.CLARIFYING)}`}>
        <div className="relative shrink-0">
          <PenTool className="w-3 h-3" />
          {(status === AgentStatus.DESIGN_DIRECTING || status === AgentStatus.CLARIFYING) && (
            <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-pink-500"></span>
            </span>
          )}
        </div>
        <div className="text-[9px] font-bold tracking-wider">DIRECTOR</div>
      </div>

      <div className={`h-px w-4 shrink-0 transition-colors duration-500 ${status === AgentStatus.DESIGN_DIRECTING || status === AgentStatus.UI_GENERATING ? 'bg-blue-500/50' : 'bg-zinc-800'}`}></div>

      {/* UI Agent */}
      <div className={`flex items-center gap-2 p-1.5 px-3 border rounded-full transition-all duration-500 ${getStatusColor(status === AgentStatus.UI_GENERATING)}`}>
        <div className="relative shrink-0">
          <AppWindow className="w-3 h-3" />
          {status === AgentStatus.UI_GENERATING && (
            <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
            </span>
          )}
        </div>
        <div className="text-[9px] font-bold tracking-wider">BUILD</div>
      </div>

      <div className={`h-px w-4 shrink-0 transition-colors duration-500 ${status === AgentStatus.UI_GENERATING || status === AgentStatus.BROWSER_SIMULATING ? 'bg-blue-500/50' : 'bg-zinc-800'}`}></div>

      {/* Browser Agent */}
      <div className={`flex items-center gap-2 p-1.5 px-3 border rounded-full transition-all duration-500 ${getStatusColor(status === AgentStatus.BROWSER_SIMULATING)}`}>
        <div className="relative shrink-0">
          <Bot className="w-3 h-3" />
          {status === AgentStatus.BROWSER_SIMULATING && (
            <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
            </span>
          )}
        </div>
        <div className="text-[9px] font-bold tracking-wider">SIMULATE</div>
      </div>

      <div className={`h-px w-4 shrink-0 transition-colors duration-500 ${status === AgentStatus.BROWSER_SIMULATING || status === AgentStatus.UX_EVALUATING ? 'bg-blue-500/50' : 'bg-zinc-800'}`}></div>

      {/* UX Agent */}
      <div className={`flex items-center gap-2 p-1.5 px-3 border rounded-full transition-all duration-500 ${getStatusColor(status === AgentStatus.UX_EVALUATING)}`}>
        <div className="relative shrink-0">
          <Search className="w-3 h-3" />
           {status === AgentStatus.UX_EVALUATING && (
            <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
            </span>
          )}
        </div>
        <div className="text-[9px] font-bold tracking-wider">AUDIT</div>
      </div>

    </div>
  );
};

export default AgentVisualizer;