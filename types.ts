export interface Project {
  id: string;
  name: string;
  pages: Page[];
}

export interface Page {
  id: string;
  name: string;
  purpose: string;
  primaryTask: string;
  versions: PageVersion[];
  currentVersionId: string;
}

export interface PageVersion {
  id: string;
  timestamp: number;
  html: string;
  reactCode: string;
  logs: string[]; // Browser agent logs
  uxReport: UXReport | null;
  designContract?: DesignContract | null;
}

export interface UXReport {
  status: 'PASS' | 'FAIL';
  ux_score: number;
  iteration: number; // Added to track which attempt this is
  issues: string[];
  recommendations: string[];
}

export interface DesignContract {
  visual_motif: string;
  mood: string;
  layout_strategy: string;
  typography: string;
  color_strategy: string;
  motion_depth: string;
  non_negotiables: string[];
}

export interface DesignDirectorResponse {
  design_contract?: DesignContract;
  clarification_required?: boolean;
  questions?: string[];
}

export interface ProjectRequirements {
  pageName: string;
  purpose: string;
  primaryTask: string;
  isNewContext: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'system' | 'assistant';
  content: string;
  timestamp: number;
  isAction?: boolean; // If true, this message triggered a build cycle
}

export enum AgentStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  DESIGN_DIRECTING = 'DESIGN_DIRECTING',
  CLARIFYING = 'CLARIFYING',
  UI_GENERATING = 'UI_GENERATING',
  BROWSER_SIMULATING = 'BROWSER_SIMULATING',
  UX_EVALUATING = 'UX_EVALUATING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface LogEntry {
  agent: 'SYSTEM' | 'DIRECTOR' | 'UI' | 'BROWSER' | 'UX' | 'MANAGER';
  message: string;
  timestamp: number;
}