import React from 'react';
import { UXReport } from '../types';
import { CheckCircle2, XCircle, AlertTriangle, Lightbulb, History } from 'lucide-react';

interface UXReportCardProps {
  report: UXReport | null;
}

const UXReportCard: React.FC<UXReportCardProps> = ({ report }) => {
  if (!report) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg p-8 m-4">
        <span className="text-sm font-mono">NO REPORT DATA</span>
      </div>
    );
  }

  const isPass = report.status === 'PASS';
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];

  return (
    <div className="flex flex-col h-full bg-[#09090b] border-zinc-800 rounded-lg overflow-hidden shadow-lg">
      <div className={`flex items-center justify-between px-6 py-4 border-b ${isPass ? 'border-green-900/30 bg-green-900/10' : 'border-red-900/30 bg-red-900/10'}`}>
        <div className="flex items-center gap-3">
          {isPass ? <CheckCircle2 className="text-green-500 w-6 h-6" /> : <XCircle className="text-red-500 w-6 h-6" />}
          <div>
            <h3 className={`text-lg font-bold tracking-tight flex items-center gap-2 ${isPass ? 'text-green-400' : 'text-red-400'}`}>
              UX STATUS: {report.status}
              {report.iteration && (
                  <span className="px-2 py-0.5 rounded-full bg-black/30 border border-white/10 text-[10px] text-zinc-300 font-mono">
                      ITERATION #{report.iteration}
                  </span>
              )}
            </h3>
            <p className="text-xs text-zinc-400 uppercase tracking-wider">Automated Audit</p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-3xl font-black text-white">{report.ux_score}</span>
          <span className="text-[10px] text-zinc-500 uppercase">Quality Score</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        
        {/* Previous History Indicator - Pseudo Sparkline */}
        {report.iteration && report.iteration > 1 && (
            <div className="flex items-center gap-2 pb-4 border-b border-zinc-800">
                <History className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-500 font-mono">
                    Improvement detected over {report.iteration} iterations. Use Undo/Redo to compare.
                </span>
            </div>
        )}

        {issues.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3 text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <h4 className="text-sm font-bold uppercase tracking-wide">Critical Issues Detected</h4>
            </div>
            <ul className="space-y-2">
              {issues.map((issue, idx) => (
                <li key={idx} className="text-sm text-zinc-300 bg-red-500/5 border border-red-500/10 p-3 rounded-md flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                  <span className="leading-relaxed">{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-3 text-yellow-400">
            <Lightbulb className="w-4 h-4" />
            <h4 className="text-sm font-bold uppercase tracking-wide">Technical Fixes</h4>
          </div>
          <ul className="space-y-2">
            {recommendations.map((rec, idx) => (
              <li key={idx} className="text-sm text-zinc-300 bg-yellow-500/5 border border-yellow-500/10 p-3 rounded-md flex items-start gap-2 group hover:bg-yellow-500/10 transition-colors">
                 <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0 group-hover:animate-pulse"></span>
                 <span className="font-mono text-xs leading-relaxed text-yellow-100/80">{rec}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
};

export default UXReportCard;