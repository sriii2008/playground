import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { createEmptyWorkspace } from '../data/seedData';
import type {
  CertificateItem,
  HistoryLogEntry,
  PastelThemeId,
  ProjectItem,
  ProjectStatus,
  ReminderItem,
  UserProfile,
  UserWorkspaceData,
} from '../types';
import {
  MAX_FILE_BYTES,
  mergeWorkspacesSafely,
  sanitizeFirestoreId,
  sanitizeWorkspaceForFirestore,
  slugifyProjectName,
  validateChosenUsername,
} from './playgroundLogic';

export interface CloudAccountSummary {
  uid: string;
  username: string;
  usernameLower: string;
  theme: PastelThemeId;
}

// ============================================================================
// Payload Serializers & Deserializers (100% Blueprint & Rules Synchronized)
// ============================================================================

function toFirestorePrivateProfileFields(profile: UserProfile, emailFallback = '') {
  const safeAvatar =
    profile.avatarDataUrl && profile.avatarDataUrl.length <= 120000
      ? profile.avatarDataUrl
      : '';
  return {
    fullName: String(profile.fullName || profile.username || '').slice(0, 120),
    dob: String(profile.dob || '').slice(0, 20),
    age: String(profile.age || '').slice(0, 10),
    email: String(profile.email || emailFallback || '').slice(0, 254),
    linkedin: String(profile.linkedin || '').slice(0, 500),
    github: String(profile.github || '').slice(0, 500),
    portfolio: String(profile.portfolio || '').slice(0, 500),
    resumeLink: String(profile.resumeLink || '').slice(0, 500),
    resumeFileName: String(profile.resumeFileName || '').slice(0, 260),
    resumeSizeBytes: Math.max(
      0,
      Math.min(MAX_FILE_BYTES, Math.round(Number(profile.resumeSizeBytes) || 0))
    ),
    resumeStorageId: String(profile.resumeStorageId || '').slice(0, 128),
    resumeFileUrl: String(profile.resumeFileUrl || '').slice(0, 500),
    avatarDataUrl: safeAvatar,
  };
}

function fromFirestorePrivateProfile(
  data: Record<string, unknown>,
  usernameFallback: string
): UserProfile {
  return {
    username: String(data.username || usernameFallback),
    fullName: String(data.fullName || ''),
    dob: String(data.dob || ''),
    age: String(data.age || ''),
    email: String(data.email || ''),
    linkedin: String(data.linkedin || ''),
    github: String(data.github || ''),
    portfolio: String(data.portfolio || ''),
    resumeLink: String(data.resumeLink || ''),
    resumeFileName: data.resumeFileName ? String(data.resumeFileName) : undefined,
    resumeSizeBytes: Number(data.resumeSizeBytes) || undefined,
    resumeStorageId: data.resumeStorageId ? String(data.resumeStorageId) : undefined,
    resumeFileUrl: data.resumeFileUrl ? String(data.resumeFileUrl) : undefined,
    avatarDataUrl: data.avatarDataUrl ? String(data.avatarDataUrl) : undefined,
  };
}

function toFirestoreProjectMutableFields(project: ProjectItem) {
  const validStatuses: ProjectStatus[] = ['Planned', 'Ongoing', 'Completed', 'Published'];
  const workflowStage: ProjectStatus = validStatuses.includes(project.status)
    ? project.status
    : 'Planned';

  const completedMonth =
    typeof project.completedMonth === 'number' &&
    Number.isFinite(project.completedMonth) &&
    project.completedMonth >= 0 &&
    project.completedMonth <= 11
      ? Math.round(project.completedMonth)
      : -1;

  return {
    slug: (project.slug || slugifyProjectName(project.name || 'project')).slice(0, 140),
    name: (project.name || 'Untitled Project').trim().slice(0, 160) || 'Untitled Project',
    domain: String(project.domain || 'General').slice(0, 100),
    purpose: String(project.purpose || '').slice(0, 2000),
    workflowStage,
    progress: Math.max(0, Math.min(100, Math.round(Number(project.progress) || 0))),
    problemStatement: String(project.problemStatement || '').slice(0, 5000),
    solution: String(project.solution || '').slice(0, 5000),
    githubLink: String(project.githubLink || '').slice(0, 500),
    prototypeLink: String(project.prototypeLink || '').slice(0, 500),
    documentationLink: String(project.documentationLink || '').slice(0, 500),
    techStack: (project.techStack || [])
      .map((t) => String(t || '').trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 30),
    teamName: String(project.teamName || 'Solo').slice(0, 120),
    teamMembers: (project.teamMembers || []).slice(0, 25).map((m, idx) => ({
      id: sanitizeFirestoreId(m.id, `tm_${idx}`),
      name: String(m.name || '').slice(0, 120),
      role: String(m.role || '').slice(0, 80),
      email: String(m.email || '').slice(0, 254),
    })),
    attachments: (project.attachments || []).slice(0, 50).map((att, idx) => ({
      id: sanitizeFirestoreId(att.id, `att_${idx}`),
      name: String(att.name || 'document').trim().slice(0, 260) || 'document',
      sizeBytes: Math.max(
        0,
        Math.min(MAX_FILE_BYTES, Math.round(Number(att.sizeBytes) || 0))
      ),
      mimeType: String(att.mimeType || 'application/octet-stream').slice(0, 120),
      uploadedAt: String(att.uploadedAt || new Date().toISOString().slice(0, 10)).slice(0, 40),
      category: String(att.category || '').slice(0, 60),
      storageId: String(att.storageId || '').slice(0, 128),
      fileUrl: String(att.fileUrl || '').slice(0, 500),
    })),
    hackathonName: String(project.hackathonName || '').slice(0, 160),
    hackathonDeadline: String(project.hackathonDeadline || '').slice(0, 32),
    hackathonUpdates: (project.hackathonUpdates || []).slice(0, 50).map((hu, idx) => ({
      id: sanitizeFirestoreId(hu.id, `hu_${idx}`),
      hackathonName: String(hu.hackathonName || '').slice(0, 160),
      stage: String(hu.stage || 'Idea').slice(0, 32),
      note: String(hu.note || '').slice(0, 1000),
      date: String(hu.date || '').slice(0, 40),
    })),
    completedMonth,
    clientUpdatedAt: String(project.updatedAt || new Date().toISOString()).slice(0, 40),
  };
}

function fromFirestoreProject(data: Record<string, unknown>): ProjectItem {
  const validStatuses: ProjectStatus[] = ['Planned', 'Ongoing', 'Completed', 'Published'];
  const rawStage = String(data.workflowStage || 'Planned') as ProjectStatus;
  const cm = Number(data.completedMonth);

  return {
    id: String(data.id || ''),
    slug: String(data.slug || 'project'),
    name: String(data.name || 'Untitled Project'),
    domain: String(data.domain || 'General'),
    purpose: String(data.purpose || ''),
    status: validStatuses.includes(rawStage) ? rawStage : 'Planned',
    progress: Number(data.progress) || 0,
    problemStatement: String(data.problemStatement || ''),
    solution: String(data.solution || ''),
    githubLink: String(data.githubLink || ''),
    prototypeLink: String(data.prototypeLink || ''),
    documentationLink: String(data.documentationLink || ''),
    techStack: Array.isArray(data.techStack) ? data.techStack.map(String) : [],
    teamName: String(data.teamName || 'Solo'),
    teamMembers: Array.isArray(data.teamMembers)
      ? data.teamMembers.map((m: Record<string, unknown>) => ({
          id: String(m.id || ''),
          name: String(m.name || ''),
          role: String(m.role || ''),
          email: m.email ? String(m.email) : undefined,
        }))
      : [],
    attachments: Array.isArray(data.attachments)
      ? data.attachments.map((a: Record<string, unknown>) => ({
          id: String(a.id || ''),
          name: String(a.name || 'document'),
          sizeBytes: Number(a.sizeBytes) || 0,
          mimeType: String(a.mimeType || 'application/octet-stream'),
          uploadedAt: String(a.uploadedAt || ''),
          category: a.category ? String(a.category) : undefined,
          storageId: a.storageId ? String(a.storageId) : undefined,
          fileUrl: a.fileUrl ? String(a.fileUrl) : undefined,
        }))
      : [],
    hackathonName: String(data.hackathonName || ''),
    hackathonDeadline: String(data.hackathonDeadline || ''),
    hackathonUpdates: Array.isArray(data.hackathonUpdates)
      ? data.hackathonUpdates.map((hu: Record<string, unknown>) => ({
          id: String(hu.id || ''),
          hackathonName: String(hu.hackathonName || ''),
          stage: (['Idea', 'Prototype Ready', 'Submitted', 'Finalist', 'Winner'].includes(
            String(hu.stage)
          )
            ? String(hu.stage)
            : 'Idea') as ProjectItem['hackathonUpdates'][number]['stage'],
          note: String(hu.note || ''),
          date: String(hu.date || ''),
        }))
      : [],
    completedMonth: Number.isFinite(cm) && cm >= 0 && cm <= 11 ? cm : undefined,
    updatedAt: String(data.clientUpdatedAt || new Date().toISOString()),
  };
}

function toFirestoreCertificateMutableFields(cert: CertificateItem) {
  const format = ['PDF', 'PNG', 'JPG'].includes(cert.format) ? cert.format : 'PDF';
  return {
    title: String(cert.title || 'Certificate').trim().slice(0, 200) || 'Certificate',
    issuer: String(cert.issuer || '').slice(0, 160),
    date: String(cert.date || '').slice(0, 32),
    format,
    sizeBytes: Math.max(
      0,
      Math.min(MAX_FILE_BYTES, Math.round(Number(cert.sizeBytes) || 0))
    ),
    storageId: String(cert.storageId || '').slice(0, 128),
    fileUrl: String(cert.fileUrl || '').slice(0, 500),
    fileName: String(cert.fileName || '').slice(0, 260),
  };
}

function fromFirestoreCertificate(data: Record<string, unknown>): CertificateItem {
  const fmt = String(data.format || 'PDF');
  return {
    id: String(data.id || ''),
    title: String(data.title || 'Certificate'),
    issuer: String(data.issuer || ''),
    date: String(data.date || ''),
    format: (['PDF', 'PNG', 'JPG'].includes(fmt) ? fmt : 'PDF') as CertificateItem['format'],
    sizeBytes: Number(data.sizeBytes) || undefined,
    storageId: data.storageId ? String(data.storageId) : undefined,
    fileUrl: data.fileUrl ? String(data.fileUrl) : undefined,
    fileName: data.fileName ? String(data.fileName) : undefined,
  };
}

function toFirestoreReminderMutableFields(
  reminder: ReminderItem,
  validProjectIds?: Set<string>
) {
  const cleanProjId = reminder.projectId
    ? sanitizeFirestoreId(reminder.projectId, 'proj')
    : '';
  const projectId =
    cleanProjId && (!validProjectIds || validProjectIds.has(cleanProjId))
      ? cleanProjId
      : '';

  return {
    text: String(reminder.text || 'Reminder').trim().slice(0, 400) || 'Reminder',
    projectId,
    projectName: String(reminder.projectName || 'General').slice(0, 160),
    completed: Boolean(reminder.completed),
  };
}

function fromFirestoreReminder(data: Record<string, unknown>): ReminderItem {
  return {
    id: String(data.id || ''),
    text: String(data.text || ''),
    projectId: data.projectId ? String(data.projectId) : undefined,
    projectName: String(data.projectName || 'General'),
    completed: Boolean(data.completed),
    createdAt: String(data.clientCreatedAt || new Date().toISOString()),
  };
}

function fromFirestoreHistory(data: Record<string, unknown>): HistoryLogEntry {
  const cat = String(data.category || 'Project');
  const validCats: HistoryLogEntry['category'][] = [
    'Project',
    'Hackathon',
    'Certificate',
    'Reminder',
    'Profile',
    'Auth',
  ];
  return {
    id: String(data.id || ''),
    timestamp: String(data.entryTime || ''),
    action: String(data.action || ''),
    category: validCats.includes(cat as HistoryLogEntry['category'])
      ? (cat as HistoryLogEntry['category'])
      : 'Project',
    details: String(data.details || ''),
  };
}

// ============================================================================
// Account Lookup, Username Uniqueness Check, & Atomic Onboarding
// ============================================================================

export async function getCloudAccountSummary(
  uid: string
): Promise<CloudAccountSummary | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid,
      username: String(d.username || ''),
      usernameLower: String(d.usernameLower || ''),
      theme: (d.theme as PastelThemeId) || 'lavender',
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function checkUsernameAvailability(
  rawUsername: string,
  currentUid: string
): Promise<{ available: boolean; ownedByCurrentUser: boolean; error?: string }> {
  const validation = validateChosenUsername(rawUsername);
  if (!validation.valid) {
    return { available: false, ownedByCurrentUser: false, error: validation.error };
  }
  const usernameLower = rawUsername.trim().toLowerCase();
  const path = `usernames/${usernameLower}`;
  try {
    const snap = await getDoc(doc(db, 'usernames', usernameLower));
    if (!snap.exists()) {
      return { available: true, ownedByCurrentUser: false };
    }
    const ownerId = String(snap.data()?.ownerId || '');
    if (ownerId === currentUid) {
      return { available: true, ownedByCurrentUser: true };
    }
    return {
      available: false,
      ownedByCurrentUser: false,
      error: `Username "@${rawUsername.trim()}" is already registered to another account. Each username can only belong to one user.`,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function claimUsernameAndProvisionCloudAccount(params: {
  uid: string;
  email: string;
  chosenUsername: string;
  fullName: string;
  avatarDataUrl?: string;
  localCandidateWorkspaces: UserWorkspaceData[];
}): Promise<{ username: string; workspace: UserWorkspaceData }> {
  const {
    uid,
    email,
    chosenUsername,
    fullName,
    avatarDataUrl,
    localCandidateWorkspaces,
  } = params;

  const cleanUsername = chosenUsername.trim();
  const usernameLower = cleanUsername.toLowerCase();

  const availability = await checkUsernameAvailability(cleanUsername, uid);
  if (!availability.available) {
    throw new Error(
      availability.error || 'That username is already taken. Please pick another.'
    );
  }

  // Merge any local phone/laptop workspaces onto an initial workspace so 0 projects are ever lost
  let merged = createEmptyWorkspace(cleanUsername, fullName || cleanUsername, email, avatarDataUrl);
  for (const candidate of localCandidateWorkspaces) {
    merged = mergeWorkspacesSafely(candidate, merged);
  }
  if (fullName.trim()) {
    merged.profile.fullName = fullName.trim();
  }
  if (avatarDataUrl) {
    merged.profile.avatarDataUrl = avatarDataUrl;
  }
  merged.profile.username = cleanUsername;
  merged.profile.email = email;

  const sanitized = sanitizeWorkspaceForFirestore(merged, cleanUsername, email);

  // Batch 1: Atomic Master Account + Username Lock + Private PII Profile
  const coreBatch = writeBatch(db);
  if (!availability.ownedByCurrentUser) {
    coreBatch.set(doc(db, 'usernames', usernameLower), {
      ownerId: uid,
      username: cleanUsername,
      createdAt: serverTimestamp(),
    });
  }
  coreBatch.set(doc(db, 'users', uid), {
    ownerId: uid,
    username: cleanUsername,
    usernameLower,
    theme: sanitized.theme,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  coreBatch.set(doc(db, 'users', uid, 'private', 'profile'), {
    ownerId: uid,
    username: cleanUsername,
    ...toFirestorePrivateProfileFields(sanitized.profile, email),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await coreBatch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }

  // Batch 2: Migrate all existing local projects, certificates, reminders, and history logs
  await upsertWorkspaceCollectionsToCloud(uid, sanitized, {
    existingProjectIds: new Set(),
    existingCertIds: new Set(),
    existingReminderIds: new Set(),
    existingLogIds: new Set(),
  });

  return { username: cleanUsername, workspace: sanitized };
}

// ============================================================================
// Non-Destructive Login Sync (Merges Phone's 5 Projects into Cloud Seamlessly)
// ============================================================================

async function upsertWorkspaceCollectionsToCloud(
  uid: string,
  sanitized: UserWorkspaceData,
  existingSets: {
    existingProjectIds: Set<string>;
    existingCertIds: Set<string>;
    existingReminderIds: Set<string>;
    existingLogIds: Set<string>;
  }
): Promise<void> {
  const validProjectIds = new Set(sanitized.projects.map((p) => p.id));

  // Commit projects first so Reminder foreign-key checks (exists) always pass
  for (const proj of sanitized.projects) {
    const projId = sanitizeFirestoreId(proj.id, 'proj');
    const path = `users/${uid}/projects/${projId}`;
    const mutable = toFirestoreProjectMutableFields({ ...proj, id: projId });
    try {
      if (existingSets.existingProjectIds.has(projId)) {
        await updateDoc(doc(db, 'users', uid, 'projects', projId), {
          ...mutable,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'users', uid, 'projects', projId), {
          ownerId: uid,
          id: projId,
          ...mutable,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingSets.existingProjectIds.add(projId);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  for (const cert of sanitized.certificates) {
    const certId = sanitizeFirestoreId(cert.id, 'cert');
    const path = `users/${uid}/certificates/${certId}`;
    const mutable = toFirestoreCertificateMutableFields({ ...cert, id: certId });
    try {
      if (existingSets.existingCertIds.has(certId)) {
        await updateDoc(doc(db, 'users', uid, 'certificates', certId), {
          ...mutable,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'users', uid, 'certificates', certId), {
          ownerId: uid,
          id: certId,
          ...mutable,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingSets.existingCertIds.add(certId);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  for (const rem of sanitized.reminders) {
    const remId = sanitizeFirestoreId(rem.id, 'rem');
    const path = `users/${uid}/reminders/${remId}`;
    const mutable = toFirestoreReminderMutableFields(rem, validProjectIds);
    try {
      if (existingSets.existingReminderIds.has(remId)) {
        await updateDoc(doc(db, 'users', uid, 'reminders', remId), {
          ...mutable,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'users', uid, 'reminders', remId), {
          ownerId: uid,
          id: remId,
          ...mutable,
          clientCreatedAt: String(rem.createdAt || new Date().toISOString()).slice(0, 40),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingSets.existingReminderIds.add(remId);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  for (const entry of sanitized.historyLog.slice(0, 40)) {
    const logId = sanitizeFirestoreId(entry.id, 'log');
    if (existingSets.existingLogIds.has(logId)) continue;
    const path = `users/${uid}/history/${logId}`;
    try {
      await setDoc(doc(db, 'users', uid, 'history', logId), {
        ownerId: uid,
        id: logId,
        entryTime:
          String(entry.timestamp || new Date().toISOString().slice(0, 16).replace('T', ' '))
            .trim()
            .slice(0, 40) || '2026-11-01 00:00',
        action: String(entry.action || 'Activity').trim().slice(0, 120) || 'Activity',
        category: entry.category,
        details: String(entry.details || '').slice(0, 500),
        createdAt: serverTimestamp(),
      });
      existingSets.existingLogIds.add(logId);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }
}

export async function loadAndSyncCloudWorkspace(params: {
  uid: string;
  email: string;
  accountSummary: CloudAccountSummary;
  localCandidateWorkspaces: UserWorkspaceData[];
}): Promise<UserWorkspaceData> {
  const { uid, email, accountSummary, localCandidateWorkspaces } = params;
  const username = accountSummary.username;

  // 1. Read Private Profile
  let cloudProfile: UserProfile = createEmptyWorkspace(username, username, email).profile;
  let hasProfileDoc = false;
  try {
    const profSnap = await getDoc(doc(db, 'users', uid, 'private', 'profile'));
    if (profSnap.exists()) {
      hasProfileDoc = true;
      cloudProfile = fromFirestorePrivateProfile(profSnap.data(), username);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}/private/profile`);
  }

  // 2. Query owner subcollections (with explicit ownerId filter per Pillar 8)
  const existingProjectIds = new Set<string>();
  const cloudProjects: ProjectItem[] = [];
  try {
    const projSnap = await getDocs(
      query(collection(db, 'users', uid, 'projects'), where('ownerId', '==', uid))
    );
    projSnap.forEach((docSnap) => {
      existingProjectIds.add(docSnap.id);
      cloudProjects.push(fromFirestoreProject(docSnap.data()));
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/projects`);
  }

  const existingCertIds = new Set<string>();
  const cloudCertificates: CertificateItem[] = [];
  try {
    const certSnap = await getDocs(
      query(collection(db, 'users', uid, 'certificates'), where('ownerId', '==', uid))
    );
    certSnap.forEach((docSnap) => {
      existingCertIds.add(docSnap.id);
      cloudCertificates.push(fromFirestoreCertificate(docSnap.data()));
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/certificates`);
  }

  const existingReminderIds = new Set<string>();
  const cloudReminders: ReminderItem[] = [];
  try {
    const remSnap = await getDocs(
      query(collection(db, 'users', uid, 'reminders'), where('ownerId', '==', uid))
    );
    remSnap.forEach((docSnap) => {
      existingReminderIds.add(docSnap.id);
      cloudReminders.push(fromFirestoreReminder(docSnap.data()));
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/reminders`);
  }

  const existingLogIds = new Set<string>();
  const cloudHistory: HistoryLogEntry[] = [];
  try {
    const histSnap = await getDocs(
      query(collection(db, 'users', uid, 'history'), where('ownerId', '==', uid))
    );
    histSnap.forEach((docSnap) => {
      existingLogIds.add(docSnap.id);
      cloudHistory.push(fromFirestoreHistory(docSnap.data()));
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/history`);
  }

  cloudProjects.sort(
    (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
  );
  cloudHistory.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const cloudWorkspace: UserWorkspaceData = {
    theme: accountSummary.theme || 'lavender',
    profile: cloudProfile,
    projects: cloudProjects,
    certificates: cloudCertificates,
    reminders: cloudReminders,
    historyLog: cloudHistory,
  };

  // 3. Non-destructively fold any local phone/device workspaces into cloudWorkspace
  let merged = cloudWorkspace;
  let localContributedNewItems = false;

  for (const localCandidate of localCandidateWorkspaces) {
    const sanitizedLocal = sanitizeWorkspaceForFirestore(localCandidate, username, email);
    const hasMissingProject = sanitizedLocal.projects.some(
      (lp) => !existingProjectIds.has(lp.id)
    );
    const hasMissingCert = sanitizedLocal.certificates.some(
      (lc) => !existingCertIds.has(lc.id)
    );
    const hasMissingRem = sanitizedLocal.reminders.some(
      (lr) => !existingReminderIds.has(lr.id)
    );
    if (hasMissingProject || hasMissingCert || hasMissingRem) {
      localContributedNewItems = true;
    }
    merged = mergeWorkspacesSafely(sanitizedLocal, merged);
  }

  const finalWorkspace = sanitizeWorkspaceForFirestore(merged, username, email);

  // Ensure private profile exists or sync newly recovered profile fields
  if (!hasProfileDoc) {
    try {
      await setDoc(doc(db, 'users', uid, 'private', 'profile'), {
        ownerId: uid,
        username,
        ...toFirestorePrivateProfileFields(finalWorkspace.profile, email),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/private/profile`);
    }
  } else if (localContributedNewItems) {
    await saveCloudProfile(uid, username, finalWorkspace.profile, email);
  }

  if (localContributedNewItems) {
    await upsertWorkspaceCollectionsToCloud(uid, finalWorkspace, {
      existingProjectIds,
      existingCertIds,
      existingReminderIds,
      existingLogIds,
    });
  }

  return finalWorkspace;
}

// ============================================================================
// Live Real-Time Listeners Across Phone & Laptop
// ============================================================================

export function subscribeToCloudWorkspace(params: {
  uid: string;
  username: string;
  onPatch: (patch: Partial<UserWorkspaceData>) => void;
}): Unsubscribe {
  const { uid, username, onPatch } = params;
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const theme = snap.data().theme as PastelThemeId | undefined;
          if (theme) onPatch({ theme });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'users', uid, 'private', 'profile'),
      (snap) => {
        if (snap.exists()) {
          onPatch({ profile: fromFirestorePrivateProfile(snap.data(), username) });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}/private/profile`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'projects'), where('ownerId', '==', uid)),
      (snap) => {
        const projects: ProjectItem[] = [];
        snap.forEach((d) => projects.push(fromFirestoreProject(d.data())));
        projects.sort(
          (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
        );
        onPatch({ projects });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/projects`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'certificates'), where('ownerId', '==', uid)),
      (snap) => {
        const certificates: CertificateItem[] = [];
        snap.forEach((d) => certificates.push(fromFirestoreCertificate(d.data())));
        onPatch({ certificates });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/certificates`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'reminders'), where('ownerId', '==', uid)),
      (snap) => {
        const reminders: ReminderItem[] = [];
        snap.forEach((d) => reminders.push(fromFirestoreReminder(d.data())));
        reminders.sort(
          (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
        );
        onPatch({ reminders });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/reminders`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'history'), where('ownerId', '==', uid)),
      (snap) => {
        const historyLog: HistoryLogEntry[] = [];
        snap.forEach((d) => historyLog.push(fromFirestoreHistory(d.data())));
        historyLog.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        onPatch({ historyLog: historyLog.slice(0, 100) });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/history`)
    )
  );

  return () => {
    for (const u of unsubs) u();
  };
}

// ============================================================================
// Granular Cloud Mutations
// ============================================================================

export async function saveCloudTheme(uid: string, theme: PastelThemeId): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      theme,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveCloudProfile(
  uid: string,
  username: string,
  profile: UserProfile,
  emailFallback = ''
): Promise<void> {
  const path = `users/${uid}/private/profile`;
  const ref = doc(db, 'users', uid, 'private', 'profile');
  const mutable = toFirestorePrivateProfileFields(profile, emailFallback);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...mutable,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        username,
        ...mutable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveCloudProject(
  uid: string,
  project: ProjectItem
): Promise<void> {
  const projId = sanitizeFirestoreId(project.id, 'proj');
  const path = `users/${uid}/projects/${projId}`;
  const ref = doc(db, 'users', uid, 'projects', projId);
  const mutable = toFirestoreProjectMutableFields({ ...project, id: projId });
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...mutable,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        id: projId,
        ...mutable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCloudProject(uid: string, projectId: string): Promise<void> {
  const projId = sanitizeFirestoreId(projectId, 'proj');
  const path = `users/${uid}/projects/${projId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'projects', projId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveCloudCertificate(
  uid: string,
  cert: CertificateItem
): Promise<void> {
  const certId = sanitizeFirestoreId(cert.id, 'cert');
  const path = `users/${uid}/certificates/${certId}`;
  const ref = doc(db, 'users', uid, 'certificates', certId);
  const mutable = toFirestoreCertificateMutableFields({ ...cert, id: certId });
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...mutable,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        id: certId,
        ...mutable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCloudCertificate(uid: string, certId: string): Promise<void> {
  const cleanId = sanitizeFirestoreId(certId, 'cert');
  const path = `users/${uid}/certificates/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'certificates', cleanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveCloudReminder(
  uid: string,
  reminder: ReminderItem,
  validProjectIds: Set<string>
): Promise<void> {
  const remId = sanitizeFirestoreId(reminder.id, 'rem');
  const path = `users/${uid}/reminders/${remId}`;
  const ref = doc(db, 'users', uid, 'reminders', remId);
  const mutable = toFirestoreReminderMutableFields(reminder, validProjectIds);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...mutable,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        id: remId,
        ...mutable,
        clientCreatedAt: String(reminder.createdAt || new Date().toISOString()).slice(0, 40),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCloudReminder(uid: string, reminderId: string): Promise<void> {
  const cleanId = sanitizeFirestoreId(reminderId, 'rem');
  const path = `users/${uid}/reminders/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'reminders', cleanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function appendCloudHistoryLog(
  uid: string,
  entry: HistoryLogEntry
): Promise<void> {
  const logId = sanitizeFirestoreId(entry.id, 'log');
  const path = `users/${uid}/history/${logId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'history', logId), {
      ownerId: uid,
      id: logId,
      entryTime:
        String(entry.timestamp || new Date().toISOString().slice(0, 16).replace('T', ' '))
          .trim()
          .slice(0, 40) || '2026-11-01 00:00',
      action: String(entry.action || 'Activity').trim().slice(0, 120) || 'Activity',
      category: entry.category,
      details: String(entry.details || '').slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}
