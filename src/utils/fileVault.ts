/**
 * Browser IndexedDB binary vault for project documents, certificates, and resumes.
 * Keeps binary Blobs up to 500 MB persisted directly on the user's device so
 * files remain previewable and downloadable offline or across Cloud Run cold starts,
 * without consuming localStorage's 5 MB quota.
 */

const DB_NAME = 'playground_file_vault_v1';
const DB_VERSION = 1;
const STORE_NAME = 'files';

export interface VaultFileRecord {
  storageId: string;
  username: string;
  projectId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  blob: Blob;
}

function openVaultDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'storageId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveBlobToVault(record: VaultFileRecord): Promise<boolean> {
  const db = await openVaultDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function getBlobFromVault(storageId?: string): Promise<VaultFileRecord | null> {
  if (!storageId) return null;
  const db = await openVaultDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(storageId);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as VaultFileRecord) || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function deleteBlobFromVault(storageId?: string): Promise<void> {
  if (!storageId) return;
  const db = await openVaultDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(storageId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/**
 * Resolves a playable/downloadable URL for a stored file:
 * 1. Checks local IndexedDB vault first (instant, offline-ready, survives Cloud Run restarts).
 *    Also re-hydrates server copy in background if missing on server.
 * 2. Falls back to fetching server fileUrl (and caches into IndexedDB for future offline access).
 * 3. Falls back to inline dataUrl for legacy items.
 */
export async function resolveStoredFileUrl(params: {
  storageId?: string;
  fileUrl?: string;
  dataUrl?: string;
  username?: string;
  fileName?: string;
  mimeType?: string;
}): Promise<{ url: string; revoke: boolean; blob?: Blob } | null> {
  const { storageId, fileUrl, dataUrl, username, fileName, mimeType } = params;

  if (storageId) {
    const localRecord = await getBlobFromVault(storageId);
    if (localRecord && localRecord.blob) {
      // Background re-push to server if server cold-started and lost its disk copy
      if (username && fileUrl) {
        fetch(fileUrl, { method: 'HEAD' })
          .then((res) => {
            if (!res.ok) {
              const headers: Record<string, string> = {
                'Content-Type': 'application/octet-stream',
                'X-File-Name': encodeURIComponent(localRecord.fileName || fileName || 'document'),
                'X-Mime-Type': localRecord.mimeType || mimeType || 'application/octet-stream',
                'X-Storage-Id': storageId,
              };
              if (localRecord.projectId) {
                headers['X-Project-Id'] = localRecord.projectId;
              }
              return fetch(`/api/uploads/${encodeURIComponent(username)}`, {
                method: 'POST',
                headers,
                body: localRecord.blob,
              });
            }
            return undefined;
          })
          .catch(() => {
            // ignore background sync error
          });
      }
      const typedBlob =
        localRecord.blob.type || !mimeType
          ? localRecord.blob
          : new Blob([localRecord.blob], { type: mimeType });
      return {
        url: URL.createObjectURL(typedBlob),
        revoke: true,
        blob: typedBlob,
      };
    }
  }

  if (fileUrl) {
    try {
      const res = await fetch(fileUrl);
      if (res.ok) {
        const blob = await res.blob();
        if (storageId && username) {
          saveBlobToVault({
            storageId,
            username,
            fileName: fileName || 'document',
            mimeType: mimeType || blob.type || 'application/octet-stream',
            sizeBytes: blob.size,
            uploadedAt: new Date().toISOString().slice(0, 10),
            blob,
          });
        }
        return {
          url: URL.createObjectURL(blob),
          revoke: true,
          blob,
        };
      }
    } catch {
      // fall through to dataUrl
    }
  }

  if (dataUrl) {
    return { url: dataUrl, revoke: false };
  }

  return null;
}

export async function triggerStoredFileDownload(params: {
  storageId?: string;
  fileUrl?: string;
  dataUrl?: string;
  username?: string;
  fileName: string;
  mimeType?: string;
}): Promise<boolean> {
  const resolved = await resolveStoredFileUrl(params);
  if (!resolved) return false;

  const anchor = document.createElement('a');
  anchor.href = resolved.url;
  anchor.download = params.fileName || 'document';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  if (resolved.revoke) {
    setTimeout(() => URL.revokeObjectURL(resolved.url), 10000);
  }
  return true;
}
