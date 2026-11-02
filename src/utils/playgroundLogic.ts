import type {
  ProjectItem,
  ProjectStatus,
  ReminderItem,
  UserWorkspaceData,
} from '../types.ts';

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

export function detectAttachmentBadge(
  fileName: string,
  mimeType = ''
): { ext: string; defaultCategory: string } {
  const rawExt = fileName.includes('.')
    ? fileName.split('.').pop()?.trim().toUpperCase() || 'FILE'
    : 'FILE';
  const ext = rawExt.slice(0, 6);
  const lower = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (ext === 'PPT' || ext === 'PPTX' || ext === 'KEY' || lower.includes('pitch') || lower.includes('deck') || lower.includes('slide')) {
    return { ext, defaultCategory: 'Pitch Deck' };
  }
  if (ext === 'DOC' || ext === 'DOCX' || ext === 'MD' || ext === 'TXT' || ext === 'RTF') {
    return { ext, defaultCategory: 'Documentation' };
  }
  if (mime.startsWith('image/') || ['PNG', 'JPG', 'JPEG', 'WEBP', 'SVG', 'GIF'].includes(ext)) {
    return { ext, defaultCategory: 'Prototype / UI' };
  }
  if (['CSV', 'XLS', 'XLSX', 'JSON', 'ZIP', 'TAR', 'GZ'].includes(ext)) {
    return { ext, defaultCategory: 'Dataset / Code' };
  }
  if (ext === 'PDF') {
    return { ext: 'PDF', defaultCategory: 'Report / PDF' };
  }
  return { ext, defaultCategory: 'Related File' };
}

export function mergeWorkspacesSafely(
  localWs: UserWorkspaceData,
  serverWs: UserWorkspaceData
): UserWorkspaceData {
  // Merge projects by ID, never dropping projects from either side
  const serverProjMap = new Map<string, ProjectItem>();
  for (const sp of serverWs.projects || []) {
    serverProjMap.set(sp.id, sp);
  }

  const mergedProjects: ProjectItem[] = [];
  const seenProjectIds = new Set<string>();

  for (const lp of localWs.projects || []) {
    seenProjectIds.add(lp.id);
    const sp = serverProjMap.get(lp.id);
    if (!sp) {
      mergedProjects.push(lp);
      continue;
    }
    const localTime = Date.parse(lp.updatedAt || '') || 0;
    const serverTime = Date.parse(sp.updatedAt || '') || 0;

    // Merge attachments within the project so no uploaded file is ever lost
    const attMap = new Map<string, ProjectItem['attachments'][number]>();
    for (const a of sp.attachments || []) attMap.set(a.id, a);
    for (const a of lp.attachments || []) {
      const existing = attMap.get(a.id);
      attMap.set(a.id, existing ? { ...existing, ...a } : a);
    }
    const mergedAttachments = Array.from(attMap.values());

    if (localTime >= serverTime) {
      mergedProjects.push({ ...sp, ...lp, attachments: mergedAttachments });
    } else {
      mergedProjects.push({ ...lp, ...sp, attachments: mergedAttachments });
    }
  }

  for (const sp of serverWs.projects || []) {
    if (!seenProjectIds.has(sp.id)) {
      mergedProjects.push(sp);
    }
  }

  // Merge certificates by ID
  const certMap = new Map<string, UserWorkspaceData['certificates'][number]>();
  for (const sc of serverWs.certificates || []) certMap.set(sc.id, sc);
  for (const lc of localWs.certificates || []) {
    const existing = certMap.get(lc.id);
    certMap.set(lc.id, existing ? { ...existing, ...lc } : lc);
  }

  // Merge reminders by ID
  const remMap = new Map<string, ReminderItem>();
  for (const sr of serverWs.reminders || []) remMap.set(sr.id, sr);
  for (const lr of localWs.reminders || []) {
    remMap.set(lr.id, lr);
  }

  // Merge history log by ID (up to 100 entries)
  const logMap = new Map<string, UserWorkspaceData['historyLog'][number]>();
  for (const lh of localWs.historyLog || []) logMap.set(lh.id, lh);
  for (const sh of serverWs.historyLog || []) {
    if (!logMap.has(sh.id)) logMap.set(sh.id, sh);
  }
  const mergedLogs = Array.from(logMap.values()).slice(0, 100);

  // Merge profile fields preferring non-empty local values over empty server defaults
  const lp = localWs.profile;
  const sp = serverWs.profile;
  const mergedProfile = {
    username: lp.username || sp.username,
    fullName: lp.fullName || sp.fullName,
    dob: lp.dob || sp.dob,
    age: lp.age || sp.age,
    email: lp.email || sp.email,
    linkedin: lp.linkedin || sp.linkedin,
    github: lp.github || sp.github,
    portfolio: lp.portfolio || sp.portfolio,
    resumeLink: lp.resumeLink || sp.resumeLink,
    resumeFileName: lp.resumeFileName || sp.resumeFileName,
    resumeSizeBytes: lp.resumeSizeBytes ?? sp.resumeSizeBytes,
    resumeStorageId: lp.resumeStorageId || sp.resumeStorageId,
    resumeFileUrl: lp.resumeFileUrl || sp.resumeFileUrl,
    resumeDataUrl: lp.resumeDataUrl || sp.resumeDataUrl,
    avatarDataUrl: lp.avatarDataUrl || sp.avatarDataUrl,
  };

  return {
    theme: localWs.theme || serverWs.theme || 'lavender',
    profile: mergedProfile,
    projects: mergedProjects,
    certificates: Array.from(certMap.values()),
    reminders: Array.from(remMap.values()),
    historyLog: mergedLogs,
  };
}

// ============================================================================
// Firebase Blueprint Synchronicity & Zero-Data-Loss Migration Helpers
// ============================================================================
export const BLUEPRINT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const BLUEPRINT_USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
export const BLUEPRINT_USERNAME_MIN = 3;
export const BLUEPRINT_USERNAME_MAX = 32;

export function sanitizeFirestoreId(rawId: string, prefix = 'item'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 128);
  if (cleaned && BLUEPRINT_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function validateChosenUsername(username: string): AuthValidationResult {
  const clean = username.trim();
  if (!clean) {
    return { valid: false, error: 'Please choose a unique username.' };
  }
  if (
    clean.length < BLUEPRINT_USERNAME_MIN ||
    clean.length > BLUEPRINT_USERNAME_MAX ||
    !BLUEPRINT_USERNAME_REGEX.test(clean)
  ) {
    return {
      valid: false,
      error: 'Username must be 3–32 characters (letters, numbers, _, ., -).',
    };
  }
  if (clean.toLowerCase() === 'wonder') {
    return {
      valid: false,
      error: '"wonder" is reserved for the read-only demo sandbox. Please pick your own username.',
    };
  }
  return { valid: true };
}

export function suggestUsernameFromIdentity(params: {
  email?: string | null;
  displayName?: string | null;
  preferredLocalUsername?: string | null;
}): string {
  const { email, displayName, preferredLocalUsername } = params;
  if (preferredLocalUsername) {
    const cleanPref = preferredLocalUsername.trim();
    if (
      cleanPref.toLowerCase() !== 'wonder' &&
      cleanPref.length >= BLUEPRINT_USERNAME_MIN &&
      cleanPref.length <= BLUEPRINT_USERNAME_MAX &&
      BLUEPRINT_USERNAME_REGEX.test(cleanPref)
    ) {
      return cleanPref;
    }
  }

  const emailPrefix = (email || '').split('@')[0] || '';
  const fromEmail = emailPrefix
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, BLUEPRINT_USERNAME_MAX);
  if (
    fromEmail.length >= BLUEPRINT_USERNAME_MIN &&
    fromEmail.toLowerCase() !== 'wonder'
  ) {
    return fromEmail;
  }

  const fromName = (displayName || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, BLUEPRINT_USERNAME_MAX);
  if (fromName.length >= BLUEPRINT_USERNAME_MIN && fromName !== 'wonder') {
    return fromName;
  }

  return `builder_${Math.random().toString(36).slice(2, 6)}`;
}

export interface LegacyLocalRecordLike {
  username: string;
  workspace: UserWorkspaceData;
}

/**
 * Finds local workspaces saved on the current browser (e.g. the user's 5 projects on her phone)
 * that belong to this authenticated user so they can be merged non-destructively into Firestore.
 */
export function findRecoverableLocalWorkspaces(params: {
  localAccounts: Record<string, LegacyLocalRecordLike>;
  authEmail?: string | null;
  chosenUsername?: string | null;
  lastActiveLocalUser?: string | null;
}): UserWorkspaceData[] {
  const { localAccounts, authEmail, chosenUsername, lastActiveLocalUser } = params;
  const normEmail = (authEmail || '').trim().toLowerCase();
  const normChosen = (chosenUsername || '').trim().toLowerCase();
  const normLastActive = (lastActiveLocalUser || '').trim().toLowerCase();

  const nonDemoEntries = Object.values(localAccounts).filter(
    (rec) =>
      rec &&
      rec.workspace &&
      String(rec.username || '').trim().toLowerCase() !== 'wonder'
  );

  const matched: UserWorkspaceData[] = [];
  const seen = new Set<UserWorkspaceData>();

  const addIfNew = (ws: UserWorkspaceData) => {
    if (!seen.has(ws)) {
      seen.add(ws);
      matched.push(ws);
    }
  };

  for (const rec of nonDemoEntries) {
    const recUser = String(rec.username || rec.workspace.profile?.username || '')
      .trim()
      .toLowerCase();
    const recEmail = String(rec.workspace.profile?.email || '')
      .trim()
      .toLowerCase();

    // 1. Exact email match
    if (normEmail && recEmail && recEmail === normEmail) {
      addIfNew(rec.workspace);
      continue;
    }

    // 2. Exact username match (provided the local record wasn't explicitly tied to a different email)
    if (normChosen && recUser === normChosen && (!recEmail || recEmail === normEmail)) {
      addIfNew(rec.workspace);
      continue;
    }

    // 3. Previously signed-in local user on this personal browser
    if (
      normLastActive &&
      normLastActive !== '__signed_out__' &&
      normLastActive !== 'wonder' &&
      recUser === normLastActive &&
      (!recEmail || recEmail === normEmail)
    ) {
      addIfNew(rec.workspace);
    }
  }

  // 4. Single personal workspace on this device with blank or matching email
  if (matched.length === 0 && nonDemoEntries.length === 1) {
    const sole = nonDemoEntries[0];
    const soleEmail = String(sole.workspace.profile?.email || '')
      .trim()
      .toLowerCase();
    if (!soleEmail || soleEmail === normEmail) {
      addIfNew(sole.workspace);
    }
  }

  return matched;
}

export function sanitizeWorkspaceForFirestore(
  ws: UserWorkspaceData,
  canonicalUsername: string,
  canonicalEmail: string
): UserWorkspaceData {
  const validThemes = ['lavender', 'mint', 'rose', 'sky', 'butter'] as const;
  const theme = validThemes.includes(ws.theme as (typeof validThemes)[number])
    ? ws.theme
    : 'lavender';

  const usedProjectIds = new Set<string>();
  const projectIdRemap = new Map<string, string>();

  const sanitizedProjects: ProjectItem[] = (ws.projects || []).map((p, idx) => {
    let cleanId = sanitizeFirestoreId(p.id, `proj_${idx}`);
    while (usedProjectIds.has(cleanId)) {
      cleanId = `${cleanId.slice(0, 118)}_${idx}`;
    }
    usedProjectIds.add(cleanId);
    projectIdRemap.set(p.id, cleanId);

    const validStatuses: ProjectStatus[] = ['Planned', 'Ongoing', 'Completed', 'Published'];
    const status: ProjectStatus = validStatuses.includes(p.status) ? p.status : 'Planned';
    const progress = Math.max(0, Math.min(100, Math.round(Number(p.progress) || 0)));
    const rawCompletedMonth =
      typeof p.completedMonth === 'number' && Number.isFinite(p.completedMonth)
        ? Math.max(0, Math.min(11, Math.round(p.completedMonth)))
        : undefined;

    return {
      id: cleanId,
      slug: (p.slug || slugifyProjectName(p.name || 'project')).slice(0, 140),
      name: (p.name || 'Untitled Project').trim().slice(0, 160) || 'Untitled Project',
      domain: (p.domain || 'General').slice(0, 100),
      purpose: (p.purpose || '').slice(0, 2000),
      status,
      progress,
      problemStatement: (p.problemStatement || '').slice(0, 5000),
      solution: (p.solution || '').slice(0, 5000),
      githubLink: (p.githubLink || '').slice(0, 500),
      prototypeLink: (p.prototypeLink || '').slice(0, 500),
      documentationLink: (p.documentationLink || '').slice(0, 500),
      techStack: (p.techStack || [])
        .map((t) => String(t || '').trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 30),
      teamName: (p.teamName || 'Solo').slice(0, 120),
      teamMembers: (p.teamMembers || []).slice(0, 25).map((m, mIdx) => ({
        id: sanitizeFirestoreId(m.id, `tm_${mIdx}`),
        name: String(m.name || '').slice(0, 120),
        role: String(m.role || '').slice(0, 80),
        email: String(m.email || '').slice(0, 254),
      })),
      // Omit inline base64 dataUrl in Firestore documents (1MB doc limit); binary stays in IndexedDB / upload storage
      attachments: (p.attachments || []).slice(0, 50).map((att, aIdx) => ({
        id: sanitizeFirestoreId(att.id, `att_${aIdx}`),
        name: (String(att.name || 'document').trim().slice(0, 260)) || 'document',
        sizeBytes: Math.max(0, Math.min(MAX_FILE_BYTES, Math.round(Number(att.sizeBytes) || 0))),
        mimeType: String(att.mimeType || 'application/octet-stream').slice(0, 120),
        uploadedAt: String(att.uploadedAt || new Date().toISOString().slice(0, 10)).slice(0, 40),
        category: String(att.category || '').slice(0, 60),
        storageId: String(att.storageId || '').slice(0, 128),
        fileUrl: String(att.fileUrl || '').slice(0, 500),
      })),
      hackathonName: (p.hackathonName || '').slice(0, 160),
      hackathonDeadline: (p.hackathonDeadline || '').slice(0, 32),
      hackathonUpdates: (p.hackathonUpdates || []).slice(0, 50).map((hu, hIdx) => ({
        id: sanitizeFirestoreId(hu.id, `hu_${hIdx}`),
        hackathonName: String(hu.hackathonName || '').slice(0, 160),
        stage: (['Idea', 'Prototype Ready', 'Submitted', 'Finalist', 'Winner'].includes(hu.stage)
          ? hu.stage
          : 'Idea'),
        note: String(hu.note || '').slice(0, 1000),
        date: String(hu.date || '').slice(0, 40),
      })),
      completedMonth: rawCompletedMonth,
      updatedAt: String(p.updatedAt || new Date().toISOString()).slice(0, 40),
    };
  });

  const sanitizedCertificates = (ws.certificates || []).map((c, idx) => ({
    id: sanitizeFirestoreId(c.id, `cert_${idx}`),
    title: (String(c.title || 'Certificate').trim().slice(0, 200)) || 'Certificate',
    issuer: String(c.issuer || '').slice(0, 160),
    date: String(c.date || '').slice(0, 32),
    format: (['PDF', 'PNG', 'JPG'].includes(c.format) ? c.format : 'PDF') as UserWorkspaceData['certificates'][number]['format'],
    sizeBytes: Math.max(0, Math.min(MAX_FILE_BYTES, Math.round(Number(c.sizeBytes) || 0))),
    storageId: String(c.storageId || '').slice(0, 128),
    fileUrl: String(c.fileUrl || '').slice(0, 500),
    fileName: String(c.fileName || '').slice(0, 260),
  }));

  const sanitizedReminders: ReminderItem[] = (ws.reminders || []).map((r, idx) => {
    const mappedProjId = r.projectId ? projectIdRemap.get(r.projectId) || sanitizeFirestoreId(r.projectId, 'proj') : '';
    const linkedExists = mappedProjId && usedProjectIds.has(mappedProjId);
    return {
      id: sanitizeFirestoreId(r.id, `rem_${idx}`),
      text: (String(r.text || 'Task').trim().slice(0, 400)) || 'Task',
      projectId: linkedExists ? mappedProjId : undefined,
      projectName: String(r.projectName || 'General').slice(0, 160),
      completed: Boolean(r.completed),
      createdAt: String(r.createdAt || new Date().toISOString()).slice(0, 40),
    };
  });

  const validLogCategories = ['Project', 'Hackathon', 'Certificate', 'Reminder', 'Profile', 'Auth'] as const;
  const sanitizedHistory = (ws.historyLog || []).slice(0, 100).map((h, idx) => ({
    id: sanitizeFirestoreId(h.id, `log_${idx}`),
    timestamp: (String(h.timestamp || new Date().toISOString().slice(0, 16).replace('T', ' ')).trim().slice(0, 40)) || '2026-11-01 00:00',
    action: (String(h.action || 'Activity').trim().slice(0, 120)) || 'Activity',
    category: validLogCategories.includes(h.category as (typeof validLogCategories)[number])
      ? h.category
      : 'Project',
    details: String(h.details || '').slice(0, 500),
  }));

  const safeAvatar =
    ws.profile?.avatarDataUrl && ws.profile.avatarDataUrl.length <= 120000
      ? ws.profile.avatarDataUrl
      : undefined;

  return {
    theme,
    profile: {
      username: canonicalUsername,
      fullName: String(ws.profile?.fullName || canonicalUsername).slice(0, 120),
      dob: String(ws.profile?.dob || '').slice(0, 20),
      age: String(ws.profile?.age || '').slice(0, 10),
      email: String(canonicalEmail || ws.profile?.email || '').slice(0, 254),
      linkedin: String(ws.profile?.linkedin || '').slice(0, 500),
      github: String(ws.profile?.github || '').slice(0, 500),
      portfolio: String(ws.profile?.portfolio || '').slice(0, 500),
      resumeLink: String(ws.profile?.resumeLink || '').slice(0, 500),
      resumeFileName: String(ws.profile?.resumeFileName || '').slice(0, 260),
      resumeSizeBytes: Math.max(
        0,
        Math.min(MAX_FILE_BYTES, Math.round(Number(ws.profile?.resumeSizeBytes) || 0))
      ),
      resumeStorageId: String(ws.profile?.resumeStorageId || '').slice(0, 128),
      resumeFileUrl: String(ws.profile?.resumeFileUrl || '').slice(0, 500),
      avatarDataUrl: safeAvatar,
    },
    projects: sanitizedProjects,
    certificates: sanitizedCertificates,
    reminders: sanitizedReminders,
    historyLog: sanitizedHistory,
  };
}



