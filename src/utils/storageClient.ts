import { createDemoWonderWorkspace, createEmptyWorkspace } from '../data/seedData';
import { UserWorkspaceData } from '../types';
import { generateUserHistoryCsv, validateAuthCredentials } from './playgroundLogic';

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

function saveLocalAccounts(accounts: Record<string, LocalAccountRecord>): void {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // ignore quota errors
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

export async function fetchRegisteredUsers(): Promise<
  { username: string; fullName: string; avatarDataUrl?: string; projectCount: number }[]
> {
  try {
    const res = await fetch('/api/accounts');
    if (res.ok) {
      const data = await res.json();
      return data.users || [];
    }
  } catch {
    // fallback to local
  }
  const local = getLocalAccounts();
  return Object.values(local).map((a) => ({
    username: a.username,
    fullName: a.workspace.profile.fullName,
    avatarDataUrl: a.workspace.profile.avatarDataUrl,
    projectCount: a.workspace.projects.length,
  }));
}

export async function loadUserWorkspace(username: string): Promise<UserWorkspaceData> {
  const local = getLocalAccounts();
  const localKey = Object.keys(local).find(
    (k) => k.toLowerCase() === username.trim().toLowerCase()
  );

  try {
    const res = await fetch(`/api/workspace/${encodeURIComponent(username)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.workspace) {
        if (localKey) {
          local[localKey].workspace = data.workspace;
          saveLocalAccounts(local);
        }
        return data.workspace as UserWorkspaceData;
      }
    }
  } catch {
    // fallback to local
  }

  if (localKey) {
    return local[localKey].workspace;
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

  local[key] = {
    username: workspace.profile.username || username,
    password: local[key]?.password || 'wonder123',
    createdAt: local[key]?.createdAt || new Date().toISOString(),
    workspace,
  };
  saveLocalAccounts(local);

  try {
    await fetch(`/api/workspace/${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace }),
    });
  } catch {
    // local backup already persisted
  }
}

export async function signUpAccount(params: {
  username: string;
  password: string;
  fullName: string;
  email: string;
  avatarDataUrl?: string;
}): Promise<{ username: string; workspace: UserWorkspaceData }> {
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

    const local = getLocalAccounts();
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
    // Offline fallback
    const local = getLocalAccounts();
    const existingNames = Object.values(local).map((a) => a.username);
    const check = validateAuthCredentials('signup', params.username, params.password, existingNames);
    if (!check.valid) throw new Error(check.error);

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
  try {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Sign in failed.');
    }
    setSavedSessionUsername(data.username);
    return data;
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Failed to fetch')) {
      throw err;
    }
    const local = getLocalAccounts();
    const key = Object.keys(local).find(
      (k) => k.toLowerCase() === username.trim().toLowerCase()
    );
    if (!key) throw new Error('Account not found. Check your username or sign up.');
    if (local[key].password !== password) {
      throw new Error('Incorrect password. Please try again.');
    }
    setSavedSessionUsername(local[key].username);
    return { username: local[key].username, workspace: local[key].workspace };
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'X-File-Name': encodeURIComponent(file.name),
    'X-Mime-Type': file.type || 'application/octet-stream',
  };
  if (projectId) {
    headers['X-Project-Id'] = projectId;
  }

  const res = await fetch(`/api/uploads/${encodeURIComponent(username)}`, {
    method: 'POST',
    headers,
    body: file,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'File upload failed.');
  }
  return data as UploadedFileResponse;
}

export async function deleteWorkspaceFile(
  username: string,
  storageId?: string
): Promise<void> {
  if (!storageId) return;
  try {
    await fetch(
      `/api/files/${encodeURIComponent(username)}/${encodeURIComponent(storageId)}`,
      { method: 'DELETE' }
    );
  } catch {
    // ignore network error
  }
}

