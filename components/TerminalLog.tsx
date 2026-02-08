import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { Terminal } from 'lucide-react';

interface TerminalLogProps {
  logs: LogEntry[];
}

const TerminalLog: React.FC<TerminalLogProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getAgentColor = (agent: LogEntry['agent']) => {
    switch (agent) {
      case 'DIRECTOR': return 'text-pink-500';
      case 'UI': return 'text-blue-400';
      case 'BROWSER': return 'text-yellow-400';
      case 'UX': return 'text-purple-400';
      case 'SYSTEM': return 'text-gray-400';
      default: return 'text-white';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b] border border-zinc-800 rounded-lg overflow-hidden shadow-lg">
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <Terminal className="w-4 h-4 text-zinc-400" />
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">System Logs</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-2">
        {logs.map((log, idx) => (
          <div key={idx} className="flex gap-3">
            <span className="text-zinc-600 text-xs whitespace-nowrap pt-0.5">
              {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <div className="flex-1 break-words">
              <span className={`font-bold mr-2 text-xs uppercase ${getAgentColor(log.agent)}`}>
                [{log.agent}]
              </span>
              <span className="text-zinc-300">{log.message}</span>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default TerminalLog;