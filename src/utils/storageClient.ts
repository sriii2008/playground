import { createDemoWonderWorkspace, createEmptyWorkspace } from '../data/seedData';
import type { UserWorkspaceData } from '../types';
import {
  calculateProjectStorageBytes,
  calculateUserStorageBytes,
  generateUserHistoryCsv,
  mergeWorkspacesSafely,
  validateAuthCredentials,
  validateUploadQuota,
} from './playgroundLogic';
import { deleteBlobFromVault, saveBlobToVault } from './fileVault';

// Preserve exact localStorage keys so existing user workspaces on all devices stay 100% intact
const LOCAL_ACCOUNTS_KEY = 'playground_ide_accounts_v1';
const SESSION_USER_KEY = 'playground_ide_active_user_v1';

interface LocalAccountRecord {
  username: string;
  password: string;
  createdAt: string;
  workspace: UserWorkspaceData;
}

function getLocalAccounts(): Record<string, LocalAccountRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore storage errors
  }

  const seeded: Record<string, LocalAccountRecord> = {
    wonder: {
      username: 'wonder',
      password: 'wonder123',
      createdAt: '2026-08-01T09:00:00Z',
      workspace: createDemoWonderWorkspace(),
    },
  };
  saveLocalAccounts(seeded);
  return seeded;
}

function compactWorkspaceForLocalStorage(ws: UserWorkspaceData): UserWorkspaceData {
  // Keep localStorage nimble by omitting redundant multi-MB base64 dataUrls
  // when a file is already persisted in IndexedDB / server storage via storageId.
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

function saveLocalAccounts(accounts: Record<string, LocalAccountRecord>): void {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // If browser localStorage nears 5MB due to legacy inline dataUrls, compact only oversized dataUrls
    try {
      const compacted: Record<string, LocalAccountRecord> = {};
      for (const [k, rec] of Object.entries(accounts)) {
        compacted[k] = {
          ...rec,
          workspace: compactWorkspaceForLocalStorage(rec.workspace),
        };
      }
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(compacted));
    } catch {
      // ignore if still over browser quota
    }
  }
}

export function getSavedSessionUsername(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === '1') return null;
    if (params.get('autostart') === '1') return 'wonder';

    const stored = localStorage.getItem(SESSION_USER_KEY);
    if (stored === '__signed_out__') return null;
    return stored || 'wonder';
  } catch {
    return 'wonder';
  }
}

export function setSavedSessionUsername(username: string | null): void {
  try {
    localStorage.setItem(SESSION_USER_KEY, username ?? '__signed_out__');
  } catch {
    // ignore
  }
}

async function pushWorkspaceToServer(
  username: string,
  workspace: UserWorkspaceData,
  password?: string
): Promise<boolean> {
  try {
    const res = await fetch(`/api/workspace/${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace, password }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchRegisteredUsers(): Promise<
  { username: string; fullName: string; avatarDataUrl?: string; projectCount: number }[]
> {
  const local = getLocalAccounts();
  const byKey = new Map<
    string,
    { username: string; fullName: string; avatarDataUrl?: string; projectCount: number }
  >();

  for (const a of Object.values(local)) {
    byKey.set(a.username.toLowerCase(), {
      username: a.username,
      fullName: a.workspace.profile.fullName,
      avatarDataUrl: a.workspace.profile.avatarDataUrl,
      projectCount: a.workspace.projects.length,
    });
  }

  try {
    const res = await fetch('/api/accounts');
    if (res.ok) {
      const data = await res.json();
      for (const u of data.users || []) {
        const key = String(u.username || '').toLowerCase();
        if (!key) continue;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, u);
        } else {
          byKey.set(key, {
            username: existing.username || u.username,
            fullName: existing.fullName || u.fullName,
            avatarDataUrl: existing.avatarDataUrl || u.avatarDataUrl,
            projectCount: Math.max(existing.projectCount, u.projectCount || 0),
          });
        }
      }
    }
  } catch {
    // local accounts already populated
  }

  return Array.from(byKey.values());
}

export async function loadUserWorkspace(username: string): Promise<UserWorkspaceData> {
  const local = getLocalAccounts();
  const localKey = Object.keys(local).find(
    (k) => k.toLowerCase() === username.trim().toLowerCase()
  );
  const localRecord = localKey ? local[localKey] : undefined;

  try {
    const res = await fetch(`/api/workspace/${encodeURIComponent(username)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.workspace) {
        const serverWs = data.workspace as UserWorkspaceData;
        if (localRecord) {
          // Safe merge guarantees a cold-started or partial server workspace NEVER erases local projects
          const merged = mergeWorkspacesSafely(localRecord.workspace, serverWs);
          local[localKey!] = {
            ...localRecord,
            workspace: compactWorkspaceForLocalStorage(merged),
          };
          saveLocalAccounts(local);

          // If local had projects/items missing on server, sync merged state back to server
          if (merged.projects.length > (serverWs.projects?.length || 0)) {
            pushWorkspaceToServer(localRecord.username, merged, localRecord.password);
          }
          return merged;
        }

        const key = username.trim().toLowerCase();
        local[key] = {
          username: serverWs.profile.username || username.trim(),
          password: 'wonder123',
          createdAt: new Date().toISOString(),
          workspace: compactWorkspaceForLocalStorage(serverWs),
        };
        saveLocalAccounts(local);
        return serverWs;
      }
    } else if (res.status === 404 && localRecord) {
      // Server cold-started (e.g. Cloud Run scale-from-zero) -> immediately re-hydrate server from local!
      await pushWorkspaceToServer(
        localRecord.username,
        localRecord.workspace,
        localRecord.password
      );
      return localRecord.workspace;
    }
  } catch {
    // Offline fallback to local
  }

  if (localRecord) {
    return localRecord.workspace;
  }

  // Brand-new or custom session without prior record: initialize cleanly and sync
  if (username.trim().toLowerCase() !== 'wonder') {
    const fresh = createEmptyWorkspace(username.trim(), username.trim(), '');
    await pushWorkspaceToServer(username.trim(), fresh);
    return fresh;
  }
  return createDemoWonderWorkspace();
}

export async function saveUserWorkspace(
  username: string,
  workspace: UserWorkspaceData
): Promise<void> {
  const local = getLocalAccounts();
  const key =
    Object.keys(local).find((k) => k.toLowerCase() === username.trim().toLowerCase()) ||
    username.trim().toLowerCase();

  const existingPassword = local[key]?.password;
  local[key] = {
    username: workspace.profile.username || username,
    password: existingPassword || 'wonder123',
    createdAt: local[key]?.createdAt || new Date().toISOString(),
    workspace: compactWorkspaceForLocalStorage(workspace),
  };
  saveLocalAccounts(local);

  await pushWorkspaceToServer(
    workspace.profile.username || username,
    workspace,
    existingPassword
  );
}

export async function signUpAccount(params: {
  username: string;
  password: string;
  fullName: string;
  email: string;
  avatarDataUrl?: string;
}): Promise<{ username: string; workspace: UserWorkspaceData }> {
  const local = getLocalAccounts();
  const localNames = Object.values(local).map((a) => a.username);
  const preCheck = validateAuthCredentials(
    'signup',
    params.username,
    params.password,
    localNames
  );
  if (!preCheck.valid) {
    throw new Error(preCheck.error);
  }

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not create account.');
    }

    local[data.username.toLowerCase()] = {
      username: data.username,
      password: params.password,
      createdAt: new Date().toISOString(),
      workspace: data.workspace,
    };
    saveLocalAccounts(local);
    setSavedSessionUsername(data.username);
    return data;
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Failed to fetch')) {
      throw err;
    }
    const clean = params.username.trim();
    const ws = createEmptyWorkspace(clean, params.fullName, params.email, params.avatarDataUrl);
    local[clean.toLowerCase()] = {
      username: clean,
      password: params.password,
      createdAt: new Date().toISOString(),
      workspace: ws,
    };
    saveLocalAccounts(local);
    setSavedSessionUsername(clean);
    return { username: clean, workspace: ws };
  }
}

export async function signInAccount(
  username: string,
  password: string
): Promise<{ username: string; workspace: UserWorkspaceData }> {
  const local = getLocalAccounts();
  const localKey = Object.keys(local).find(
    (k) => k.toLowerCase() === username.trim().toLowerCase()
  );

  try {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (res.ok && data.workspace) {
      const merged = localKey
        ? mergeWorkspacesSafely(local[localKey].workspace, data.workspace)
        : (data.workspace as UserWorkspaceData);
      const saveKey = localKey || data.username.toLowerCase();
      local[saveKey] = {
        username: data.username,
        password,
        createdAt: local[saveKey]?.createdAt || new Date().toISOString(),
        workspace: compactWorkspaceForLocalStorage(merged),
      };
      saveLocalAccounts(local);
      setSavedSessionUsername(data.username);
      if (localKey && merged.projects.length > (data.workspace.projects?.length || 0)) {
        pushWorkspaceToServer(data.username, merged, password);
      }
      return { username: data.username, workspace: merged };
    }

    // If Cloud Run cold-started and doesn't know this account yet, authenticate against local record and re-hydrate server!
    if (localKey && local[localKey].password === password) {
      const record = local[localKey];
      await pushWorkspaceToServer(record.username, record.workspace, record.password);
      setSavedSessionUsername(record.username);
      return { username: record.username, workspace: record.workspace };
    }

    throw new Error(data.error || 'Sign in failed.');
  } catch (err) {
    if (localKey && local[localKey].password === password) {
      const record = local[localKey];
      pushWorkspaceToServer(record.username, record.workspace, record.password);
      setSavedSessionUsername(record.username);
      return { username: record.username, workspace: record.workspace };
    }
    if (err instanceof Error && !err.message.includes('Failed to fetch')) {
      throw err;
    }
    if (!localKey) throw new Error('Account not found. Check your username or sign up.');
    throw new Error('Incorrect password. Please try again.');
  }
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

  // Read current local workspace to enforce accurate quota & ensure server is synced
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

  // Ensure server knows this workspace if Cloud Run cold-started
  if (localRecord) {
    await pushWorkspaceToServer(
      localRecord.username,
      localRecord.workspace,
      localRecord.password
    );
  }

  const clientStorageId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const uploadedAt = new Date().toISOString().slice(0, 10);
  const mimeType = file.type || 'application/octet-stream';

  // 1. Always save binary Blob in browser IndexedDB first so file survives offline & Cloud Run restarts
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

  // 2. Upload binary stream to backend storage (in 16 MB chunks so 50 MB files pass cleanly through 32 MB Cloud Run / Nginx proxies)
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
    // IndexedDB vault already holds the complete binary safely on temporary network drops
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
