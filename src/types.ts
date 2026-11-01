export type ProjectStatus = 'Planned' | 'Ongoing' | 'Completed' | 'Published';

export type PastelThemeId = 'lavender' | 'mint' | 'rose' | 'sky' | 'butter';

export interface PastelThemeOption {
  id: PastelThemeId;
  label: string;
  swatch: string;
  chromePreview: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email?: string;
}

export interface ProjectAttachment {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: string;
  storageId?: string;
  fileUrl?: string;
  dataUrl?: string;
}

export type HackathonStage = 'Idea' | 'Prototype Ready' | 'Submitted' | 'Finalist' | 'Winner';

export interface HackathonUpdate {
  id: string;
  hackathonName: string;
  stage: HackathonStage;
  note: string;
  date: string;
}

export interface ProjectItem {
  id: string;
  slug: string;
  name: string;
  domain: string;
  purpose: string;
  status: ProjectStatus;
  progress: number;
  problemStatement: string;
  solution: string;
  githubLink: string;
  prototypeLink: string;
  documentationLink: string;
  techStack: string[];
  teamName: string;
  teamMembers: TeamMember[];
  attachments: ProjectAttachment[];
  hackathonName: string;
  hackathonDeadline: string;
  hackathonUpdates: HackathonUpdate[];
  completedMonth?: number; // 0-11 (Jan=0 ... Aug=7)
  updatedAt: string;
}

export type CertificateFormat = 'PDF' | 'PNG' | 'JPG';

export interface CertificateItem {
  id: string;
  title: string;
  issuer: string;
  date: string;
  format: CertificateFormat;
  sizeBytes?: number;
  storageId?: string;
  fileUrl?: string;
  dataUrl?: string;
  fileName?: string;
}

export interface ReminderItem {
  id: string;
  text: string;
  projectId?: string;
  projectName: string;
  completed: boolean;
  createdAt: string;
}

export interface UserProfile {
  username: string;
  fullName: string;
  dob: string; // YYYY-MM-DD
  age: string;
  email: string;
  linkedin: string;
  github: string;
  portfolio: string;
  resumeLink: string;
  resumeFileName?: string;
  resumeSizeBytes?: number;
  resumeFileUrl?: string;
  resumeDataUrl?: string;
  avatarDataUrl?: string;
}

export interface HistoryLogEntry {
  id: string;
  timestamp: string;
  action: string;
  category: 'Project' | 'Hackathon' | 'Certificate' | 'Reminder' | 'Profile' | 'Auth';
  details: string;
}

export interface UserWorkspaceData {
  profile: UserProfile;
  theme: PastelThemeId;
  projects: ProjectItem[];
  certificates: CertificateItem[];
  reminders: ReminderItem[];
  historyLog: HistoryLogEntry[];
}

export interface StoredAccount {
  username: string;
  passwordHash: string;
  createdAt: string;
  workspace: UserWorkspaceData;
}

export type TabId =
  | 'dashboard.md'
  | 'projects/'
  | 'certificates/'
  | 'profile.json'
  | 'settings.csv'
  | `project:${string}`;

export interface OpenTab {
  id: TabId;
  label: string;
  kind: 'dashboard' | 'projects' | 'certificates' | 'profile' | 'settings' | 'project';
  projectId?: string;
}
