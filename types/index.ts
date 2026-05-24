export interface Resume {
  id: string;
  name: string;
  role: string;
  initials: string;
  fileName: string;
  fileSize: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress: number;
  currentAgent: string | null;
  scores?: {
    technical: number;
    experience: number;
    projects: number;
    culture: number;
    overall: number;
  };
  redFlags?: { severity: 'low' | 'medium' | 'high'; text: string }[];
  skills?: string[];
  ocrQuality?: number;
  crawledLinks?: { type: string; url: string }[];
}

export interface Agent {
  id: string;
  name: string;
  icon: string;
  color: string;
  status: 'active' | 'idle';
  resumes: Resume[];
  progress: number;
}

export interface ActivityEvent {
  id: string;
  agent: string;
  message: string;
  timestamp: string;
  type: 'processing' | 'complete' | 'handoff' | 'error';
}

export interface WeightPreset {
  id: string;
  name: string;
  technical: number;
  experience: number;
  projects: number;
  culture: number;
}
