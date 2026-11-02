import { createDemoWonderWorkspace } from '../data/seedData';
import type { UserWorkspaceData } from '../types';
import {
  calculateProjectStorageBytes,
  calculateUserStorageBytes,
  findRecoverableLocalWorkspaces,
  generateUserHistoryCsv,
  validateUploadQuota,
} from './playgroundLogic';
import { deleteBlobFromVault, saveBlobToVault } from './fileVault';

// Preserve exact localStorage key so all existing phone/browser workspaces (e.g. srinidhi's 5 projects) stay intact for automatic cloud migration!
const LOCAL_ACCOUNTS_KEY = 'playground_ide_accounts_v1';
const SESSION_USER_KEY = 'playground_ide_active_user_v1';

interface LocalAccountRecord {
  username: string;
  password?: string; // Legacy field — scrubbed immediately on read/write for security
  createdAt: string;
  workspace: UserWorkspaceData;
}

function compactWorkspaceForLocalStorage(ws: UserWorkspaceData): UserWorkspaceData {
  return {
    ...ws,
    projects: ws.projects.map((p) => ({
      ...p,
      attachments: p.attachments.map((att) =>
        att.storageId && att.dataUrl && att.dataUrl.length > 200_000
          ? { ...att, dataUrl: undefined }
          : att
      ),
    })),
    certificates: ws.certificates.map((c) =>
      c.storageId && c.dataUrl && c.dataUrl.length > 200_000
        ? { ...c, dataUrl: undefined }
        : c
    ),
    profile:
      ws.profile.resumeStorageId &&
      ws.profile.resumeDataUrl &&
      ws.profile.resumeDataUrl.length > 200_000
        ? { ...ws.profile, resumeDataUrl: undefined }
        : ws.profile,
  };
}

function scrubPasswordsMap(
  rawAccounts: Record<string, LocalAccountRecord>
): { cleaned: Record<string, LocalAccountRecord>; hadPasswords: boolean } {
  const cleaned: Record<string, LocalAccountRecord> = {};
  let hadPasswords = false;

  for (const [k, rec] of Object.entries(rawAccounts)) {
    if (!rec || typeof rec !== 'object' || !rec.workspace) continue;
    if ('password' in rec && rec.password !== undefined) {
      hadPasswords = true;
    }
    cleaned[k] = {
      username: rec.username,
      createdAt: rec.createdAt || new Date().toISOString(),
      workspace: rec.workspace,
    };
  }
  return { cleaned, hadPasswords };
}

function getLocalAccounts(): Record<string, LocalAccountRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const { cleaned, hadPasswords } = scrubPasswordsMap(parsed);
        if (hadPasswords) {
          saveLocalAccounts(cleaned);
        }
        return cleaned;
      }
    }
  } catch {
    // ignore storage errors
  }

  const seeded: Record<string, LocalAccountRecord> = {
    wonder: {
      username: 'wonder',
      createdAt: '2026-08-01T09:00:00Z',
      workspace: createDemoWonderWorkspace(),
    },
  };
  saveLocalAccounts(seeded);
  return seeded;
}

function saveLocalAccounts(accounts: Record<string, LocalAccountRecord>): void {
  const { cleaned } = scrubPasswordsMap(accounts);
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(cleaned));
  } catch {
    try {
      const compacted: Record<string, LocalAccountRecord> = {};
      for (const [k, rec] of Object.entries(cleaned)) {
        compacted[k] = {
          username: rec.username,
          createdAt: rec.createdAt,
          workspace: compactWorkspaceForLocalStorage(rec.workspace),
        };
      }
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(compacted));
    } catch {
      // ignore if still over browser quota
    }
  }
}

export function isSandboxAutostartRequested(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  } catch {
    return false;
  }
}

export function getLastLocalUsernameHint(): string | null {
  try {
    const stored = localStorage.getItem(SESSION_USER_KEY);
    if (!stored || stored === '__signed_out__' || stored.toLowerCase() === 'wonder') {
      // Check if there is a single personal workspace stored on this device
      const local = getLocalAccounts();
      const nonDemo = Object.values(local).filter(
        (r) => r.username && r.username.toLowerCase() !== 'wonder'
      );
      if (nonDemo.length === 1) {
        return nonDemo[0].username;
      }
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function setSavedSessionUsername(username: string | null): void {
  try {
    localStorage.setItem(SESSION_USER_KEY, username ?? '__signed_out__');
  } catch {
    // ignore
  }
}

/**
 * Counts personal (non-demo) projects stored in this browser's localStorage so the user
 * on her phone sees a reassuring local-only backup notice before signing in with Google.
 * Never queries any server endpoint or exposes any username/password.
 */
export function getLocalDeviceBackupSummary(): {
  projectCount: number;
  preferredUsername: string | null;
} {
  const local = getLocalAccounts();
  let projectCount = 0;
  let preferredUsername: string | null = getLastLocalUsernameHint();

  for (const rec of Object.values(local)) {
    if (!rec?.workspace || rec.username?.toLowerCase() === 'wonder') continue;
    projectCount += rec.workspace.projects?.length || 0;
    if (!preferredUsername && rec.username) {
      preferredUsername = rec.username;
    }
  }

  return { projectCount, preferredUsername };
}

export function getLocalMigrationCandidates(params: {
  authEmail?: string | null;
  chosenUsername?: string | null;
}): UserWorkspaceData[] {
  const local = getLocalAccounts();
  return findRecoverableLocalWorkspaces({
    localAccounts: local,
    authEmail: params.authEmail,
    chosenUsername: params.chosenUsername,
    lastActiveLocalUser: getLastLocalUsernameHint(),
  });
}

export function mirrorWorkspaceToLocalCache(
  username: string,
  workspace: UserWorkspaceData
): void {
  const local = getLocalAccounts();
  const key =
    Object.keys(local).find((k) => k.toLowerCase() === username.trim().toLowerCase()) ||
    username.trim().toLowerCase();

  local[key] = {
    username: workspace.profile.username || username,
    createdAt: local[key]?.createdAt || new Date().toISOString(),
    workspace: compactWorkspaceForLocalStorage(workspace),
  };
  saveLocalAccounts(local);
}

export function loadSandboxDemoWorkspace(): UserWorkspaceData {
  const local = getLocalAccounts();
  return local.wonder?.workspace || createDemoWonderWorkspace();
}

export function saveSandboxDemoWorkspace(workspace: UserWorkspaceData): void {
  mirrorWorkspaceToLocalCache('wonder', workspace);
}

export async function compressAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        reject(new Error('Empty image data.'));
        return;
      }
      const img = new Image();
      img.onerror = () => {
        if (dataUrl.length <= 110_000) {
          resolve(dataUrl);
        } else {
          reject(new Error('Unsupported image format. Please choose a PNG or JPG image.'));
        }
      };
      img.onload = () => {
        try {
          const MAX_DIM = 160;
          const scale = Math.min(1, MAX_DIM / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl.slice(0, 110_000));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          resolve(compressed);
        } catch {
          resolve(dataUrl.slice(0, 110_000));
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function triggerCsvDownload(workspace: UserWorkspaceData): void {
  const csvContent = '\uFEFF' + generateUserHistoryCsv(workspace);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${workspace.profile.username || 'user'}_playground_history.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface UploadedFileResponse {
  storageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  fileUrl: string;
}

export async function uploadWorkspaceFile(params: {
  username: string;
  file: File;
  projectId?: string;
}): Promise<UploadedFileResponse> {
  const { username, file, projectId } = params;
  const cleanUser = username.trim() || 'wonder';

  const local = getLocalAccounts();
  const localKey = Object.keys(local).find(
    (k) => k.toLowerCase() === cleanUser.toLowerCase()
  );
  const localRecord = localKey ? local[localKey] : undefined;

  const currentUserBytes = localRecord
    ? calculateUserStorageBytes(localRecord.workspace)
    : 0;
  const targetProject =
    projectId && localRecord
      ? localRecord.workspace.projects.find((p) => p.id === projectId)
      : undefined;
  const currentProjectBytes = targetProject
    ? calculateProjectStorageBytes(targetProject)
    : undefined;

  const clientQuota = validateUploadQuota({
    fileSizeBytes: file.size,
    currentProjectBytes,
    currentUserBytes,
  });
  if (!clientQuota.allowed) {
    throw new Error(clientQuota.error || 'File exceeds workspace storage quota.');
  }

  const clientStorageId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const uploadedAt = new Date().toISOString().slice(0, 10);
  const mimeType = file.type || 'application/octet-stream';

  // 1. Persist binary Blob in IndexedDB so file survives offline & container restarts
  await saveBlobToVault({
    storageId: clientStorageId,
    username: cleanUser,
    projectId,
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
    uploadedAt,
    blob: file,
  });

  // 2. Stream in 16 MB chunks to backend binary vault
  const CHUNK_SIZE = 16 * 1024 * 1024;
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  try {
    let lastResponse: UploadedFileResponse | null = null;

    for (let idx = 0; idx < totalChunks; idx += 1) {
      const start = idx * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunkBlob = totalChunks === 1 ? file : file.slice(start, end);

      const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        'X-Mime-Type': mimeType,
        'X-Storage-Id': clientStorageId,
        'X-Chunk-Index': String(idx),
        'X-Total-Chunks': String(totalChunks),
        'X-Total-File-Bytes': String(file.size),
        'X-Current-User-Bytes': String(currentUserBytes),
      };
      if (projectId) {
        headers['X-Project-Id'] = projectId;
      }
      if (currentProjectBytes !== undefined) {
        headers['X-Current-Project-Bytes'] = String(currentProjectBytes);
      }

      const res = await fetch(`/api/uploads/${encodeURIComponent(cleanUser)}`, {
        method: 'POST',
        headers,
        body: chunkBlob,
      });

      if (res.status === 413) {
        const errData = await res.json().catch(() => ({}));
        await deleteBlobFromVault(clientStorageId);
        throw new Error(errData.error || 'File exceeds workspace storage quota.');
      }

      if (!res.ok) {
        break;
      }
      lastResponse = (await res.json()) as UploadedFileResponse;
    }

    if (lastResponse) {
      return lastResponse;
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('limit')) {
      throw err;
    }
  }

  return {
    storageId: clientStorageId,
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
    uploadedAt,
    fileUrl: `/api/files/${encodeURIComponent(cleanUser)}/${encodeURIComponent(
      clientStorageId
    )}`,
  };
}

export async function deleteWorkspaceFile(
  username: string,
  storageId?: string
): Promise<void> {
  if (!storageId) return;
  await deleteBlobFromVault(storageId);
  try {
    await fetch(
      `/api/files/${encodeURIComponent(username)}/${encodeURIComponent(storageId)}`,
      { method: 'DELETE' }
    );
  } catch {
    // ignore network error
  }
}
