import {
  ProjectItem,
  ProjectStatus,
  ReminderItem,
  UserWorkspaceData,
} from '../types';

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'] as const;

export interface DashboardMetrics {
  totalProjects: number;
  completedProjects: number;
  ongoingProjects: number;
  plannedProjects: number;
  openReminders: number;
  monthlyCompleted: { month: string; count: number }[];
  productivitySeries: { month: string; score: number }[];
}

export function calculateAgeFromDob(dob: string, referenceDate: Date = new Date('2026-11-01T00:00:00Z')): number | null {
  const trimmed = dob.trim();
  if (!trimmed) return null;

  let year: number;
  let month: number;
  let day: number;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const dmyMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (dmyMatch) {
    day = Number(dmyMatch[1]);
    month = Number(dmyMatch[2]);
    year = Number(dmyMatch[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return null;
  }

  let age = referenceDate.getUTCFullYear() - year;
  const monthDiff = referenceDate.getUTCMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getUTCDate() < day)) {
    age -= 1;
  }

  return age >= 0 && age <= 130 ? age : null;
}

export function computeDashboardMetrics(
  projects: ProjectItem[],
  reminders: ReminderItem[]
): DashboardMetrics {
  const totalProjects = projects.length;
  const completedProjects = projects.filter(
    (p) => p.status === 'Completed' || p.status === 'Published'
  ).length;
  const ongoingProjects = projects.filter((p) => p.status === 'Ongoing').length;
  const plannedProjects = projects.filter((p) => p.status === 'Planned').length;
  const openReminders = reminders.filter((r) => !r.completed).length;

  // Baseline monthly completions across Jan..Aug (indices 0..7)
  const counts = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const proj of projects) {
    if (proj.status === 'Completed' || proj.status === 'Published') {
      const m = typeof proj.completedMonth === 'number' ? proj.completedMonth : 7;
      const bucket = Math.max(0, Math.min(7, m));
      counts[bucket] += 1;
    }
  }

  const monthlyCompleted = MONTH_LABELS.map((month, idx) => ({
    month,
    count: counts[idx],
  }));

  // Compute meaningful productivity score trajectory Jan..Aug (0..100)
  const avgProgress =
    totalProjects > 0
      ? Math.round(projects.reduce((acc, p) => acc + p.progress, 0) / totalProjects)
      : 0;
  const completedTasksBonus = Math.min(20, reminders.filter((r) => r.completed).length * 5);
  const baseAnchor = totalProjects === 0 ? 15 : Math.max(32, Math.min(68, Math.round(avgProgress * 0.65)));

  const offsets = [-14, -4, -9, 4, 0, 10, 7, 17];
  const productivitySeries = MONTH_LABELS.map((month, idx) => {
    if (totalProjects === 0 && reminders.length === 0) {
      return { month, score: 0 };
    }
    const monthCompletionBoost = counts[idx] * 8;
    const raw = baseAnchor + offsets[idx] + monthCompletionBoost + Math.round(completedTasksBonus * ((idx + 1) / 8));
    return {
      month,
      score: Math.max(10, Math.min(100, raw)),
    };
  });

  return {
    totalProjects,
    completedProjects,
    ongoingProjects,
    plannedProjects,
    openReminders,
    monthlyCompleted,
    productivitySeries,
  };
}

export function slugifyProjectName(name: string, existingSlugs: string[] = []): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled-project';

  if (!existingSlugs.includes(base)) return base;
  let counter = 2;
  while (existingSlugs.includes(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

export interface AuthValidationResult {
  valid: boolean;
  error?: string;
}

export function validateAuthCredentials(
  mode: 'signin' | 'signup',
  username: string,
  password: string,
  existingUsernames: string[]
): AuthValidationResult {
  const cleanUser = username.trim();
  if (!cleanUser) {
    return { valid: false, error: 'Username is required.' };
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanUser)) {
    return {
      valid: false,
      error: 'Username must be 3–32 characters (letters, numbers, _, ., -).',
    };
  }
  if (!password || password.length < 4) {
    return { valid: false, error: 'Password must be at least 4 characters.' };
  }
  if (mode === 'signup') {
    const taken = existingUsernames.some(
      (u) => u.toLowerCase() === cleanUser.toLowerCase()
    );
    if (taken) {
      return {
        valid: false,
        error: `Username "${cleanUser}" is already taken. Please choose a unique username.`,
      };
    }
  }
  return { valid: true };
}

export function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateUserHistoryCsv(workspace: UserWorkspaceData): string {
  const headers = [
    'RecordType',
    'Username',
    'FullName',
    'Email',
    'ItemName',
    'DomainOrCategory',
    'StatusOrStage',
    'ProgressPercent',
    'PrototypeLink',
    'DocumentationLink',
    'GitHubLink',
    'TechStack',
    'TeamDetails',
    'ProblemStatement',
    'SolutionOrNotes',
    'HackathonName',
    'UpdatedAt',
  ];

  const rows: string[][] = [headers];
  const { profile, projects, certificates, reminders, historyLog } = workspace;

  // Profile summary row
  rows.push([
    'Profile',
    profile.username,
    profile.fullName,
    profile.email,
    profile.fullName || profile.username,
    `DOB: ${profile.dob || '-'} | Age: ${profile.age || '-'}`,
    'Active',
    '100',
    profile.portfolio,
    profile.resumeLink,
    profile.github,
    profile.linkedin,
    'Individual Profile',
    '',
    `Portfolio: ${profile.portfolio || '-'} | LinkedIn: ${profile.linkedin || '-'}`,
    '',
    new Date().toISOString().slice(0, 10),
  ]);

  // Project rows
  for (const p of projects) {
    const teamSummary = p.teamMembers
      .map((m) => `${m.name}${m.role ? ` (${m.role})` : ''}`)
      .join('; ');
    const latestHackathon =
      p.hackathonUpdates.length > 0
        ? `${p.hackathonUpdates[0].stage}: ${p.hackathonUpdates[0].note}`
        : '';

    rows.push([
      'Project',
      profile.username,
      profile.fullName,
      profile.email,
      p.name,
      p.domain,
      p.status,
      String(p.progress),
      p.prototypeLink,
      p.documentationLink,
      p.githubLink,
      p.techStack.join(' | '),
      teamSummary,
      p.problemStatement,
      p.solution || p.purpose,
      p.hackathonName ? `${p.hackathonName}${latestHackathon ? ` — ${latestHackathon}` : ''}` : latestHackathon,
      p.updatedAt,
    ]);

    for (const hu of p.hackathonUpdates) {
      rows.push([
        'HackathonUpdate',
        profile.username,
        profile.fullName,
        profile.email,
        p.name,
        p.domain,
        hu.stage,
        String(p.progress),
        p.prototypeLink,
        p.documentationLink,
        p.githubLink,
        p.techStack.join(' | '),
        teamSummary,
        p.problemStatement,
        hu.note,
        hu.hackathonName,
        hu.date,
      ]);
    }
  }

  // Certificate rows
  for (const c of certificates) {
    rows.push([
      'Certificate',
      profile.username,
      profile.fullName,
      profile.email,
      c.title,
      c.issuer,
      c.format,
      '100',
      '',
      c.fileName || '',
      '',
      '',
      '',
      '',
      `Issued by ${c.issuer} (${c.date})`,
      '',
      c.date,
    ]);
  }

  // Reminder rows
  for (const r of reminders) {
    rows.push([
      'Reminder',
      profile.username,
      profile.fullName,
      profile.email,
      r.text,
      r.projectName,
      r.completed ? 'Completed' : 'Open',
      r.completed ? '100' : '0',
      '',
      '',
      '',
      '',
      '',
      '',
      `Linked project: ${r.projectName}`,
      '',
      r.createdAt,
    ]);
  }

  // Activity history log rows
  for (const h of historyLog) {
    rows.push([
      'UserHistory',
      profile.username,
      profile.fullName,
      profile.email,
      h.action,
      h.category,
      'Logged',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      h.details,
      '',
      h.timestamp,
    ]);
  }

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function normalizeExternalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getStatusDotColor(status: ProjectStatus): string {
  switch (status) {
    case 'Published':
      return '#8b5cf6';
    case 'Ongoing':
      return '#f59e0b';
    case 'Completed':
      return '#10b981';
    case 'Planned':
    default:
      return '#94a3b8';
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per single file
export const MAX_PROJECT_BYTES = 150 * 1024 * 1024; // 150 MB per project
export const MAX_USER_BYTES = 500 * 1024 * 1024; // 500 MB total per user

export function calculateProjectStorageBytes(project: ProjectItem): number {
  return project.attachments.reduce((sum, att) => sum + (att.sizeBytes || 0), 0);
}

export function calculateUserStorageBytes(workspace: UserWorkspaceData): number {
  const projectsTotal = workspace.projects.reduce(
    (sum, proj) => sum + calculateProjectStorageBytes(proj),
    0
  );
  const certsTotal = workspace.certificates.reduce(
    (sum, cert) => sum + (cert.sizeBytes || 0),
    0
  );
  const resumeBytes = workspace.profile.resumeSizeBytes || 0;
  return projectsTotal + certsTotal + resumeBytes;
}

export interface QuotaCheckResult {
  allowed: boolean;
  error?: string;
  remainingProjectBytes?: number;
  remainingUserBytes: number;
}

export function validateUploadQuota(params: {
  fileSizeBytes: number;
  currentProjectBytes?: number;
  currentUserBytes: number;
}): QuotaCheckResult {
  const { fileSizeBytes, currentProjectBytes, currentUserBytes } = params;

  if (fileSizeBytes <= 0) {
    return {
      allowed: false,
      error: 'Selected file is empty.',
      remainingProjectBytes:
        currentProjectBytes !== undefined
          ? Math.max(0, MAX_PROJECT_BYTES - currentProjectBytes)
          : undefined,
      remainingUserBytes: Math.max(0, MAX_USER_BYTES - currentUserBytes),
    };
  }

  if (fileSizeBytes > MAX_FILE_BYTES) {
    return {
      allowed: false,
      error: `File size (${formatFileSize(fileSizeBytes)}) exceeds the 50 MB single-file limit.`,
      remainingProjectBytes:
        currentProjectBytes !== undefined
          ? Math.max(0, MAX_PROJECT_BYTES - currentProjectBytes)
          : undefined,
      remainingUserBytes: Math.max(0, MAX_USER_BYTES - currentUserBytes),
    };
  }

  if (
    currentProjectBytes !== undefined &&
    currentProjectBytes + fileSizeBytes > MAX_PROJECT_BYTES
  ) {
    const avail = Math.max(0, MAX_PROJECT_BYTES - currentProjectBytes);
    return {
      allowed: false,
      error: `Exceeds the 150 MB per-project storage limit (${formatFileSize(avail)} remaining in this project).`,
      remainingProjectBytes: avail,
      remainingUserBytes: Math.max(0, MAX_USER_BYTES - currentUserBytes),
    };
  }

  if (currentUserBytes + fileSizeBytes > MAX_USER_BYTES) {
    const avail = Math.max(0, MAX_USER_BYTES - currentUserBytes);
    return {
      allowed: false,
      error: `Exceeds your 500 MB total user storage quota (${formatFileSize(avail)} remaining).`,
      remainingProjectBytes:
        currentProjectBytes !== undefined
          ? Math.max(0, MAX_PROJECT_BYTES - currentProjectBytes)
          : undefined,
      remainingUserBytes: avail,
    };
  }

  return {
    allowed: true,
    remainingProjectBytes:
      currentProjectBytes !== undefined
        ? MAX_PROJECT_BYTES - (currentProjectBytes + fileSizeBytes)
        : undefined,
    remainingUserBytes: MAX_USER_BYTES - (currentUserBytes + fileSizeBytes),
  };
}

