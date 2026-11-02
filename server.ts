import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoWonderWorkspace, createEmptyWorkspace } from './src/data/seedData.ts';
import {
  calculateProjectStorageBytes,
  calculateUserStorageBytes,
  generateUserHistoryCsv,
  MAX_FILE_BYTES,
  MAX_PROJECT_BYTES,
  MAX_USER_BYTES,
  validateAuthCredentials,
  validateUploadQuota,
} from './src/utils/playgroundLogic.ts';
import type { StoredAccount, UserWorkspaceData } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveWritableDataDir(): string {
  const preferred = process.env.PLAYGROUND_DATA_DIR || path.join(__dirname, 'data');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    const probe = path.join(preferred, `.probe_${process.pid}`);
    fs.writeFileSync(probe, 'ok', 'utf-8');
    fs.unlinkSync(probe);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'playground-data');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

const DATA_DIR = resolveWritableDataDir();
const CSV_DIR = path.join(DATA_DIR, 'csv');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const UPLOADS_INDEX_FILE = path.join(DATA_DIR, 'uploads_index.json');

interface StoredFileMeta {
  storageId: string;
  username: string;
  projectId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  relativeDiskPath: string;
  uploadedAt: string;
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`playground_salt_v1:${password}`).digest('hex');
}

function ensureStorageInitialized(): Record<string, StoredAccount> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CSV_DIR)) {
    fs.mkdirSync(CSV_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, StoredAccount>;
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return parsed;
      }
    } catch {
      // Re-seed if corrupted
    }
  }

  const demoWorkspace = createDemoWonderWorkspace();
  const initialAccounts: Record<string, StoredAccount> = {
    wonder: {
      username: 'wonder',
      passwordHash: hashPassword('wonder123'),
      createdAt: '2026-08-01T09:00:00Z',
      workspace: demoWorkspace,
    },
  };

  persistAccounts(initialAccounts);
  writeUserCsvFile('wonder', demoWorkspace);
  return initialAccounts;
}

function persistAccounts(accounts: Record<string, StoredAccount>): void {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist accounts file:', err);
  }
}

function writeUserCsvFile(username: string, workspace: UserWorkspaceData): string {
  const safeName = username.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  const csvPath = path.join(CSV_DIR, `${safeName}_user_history.csv`);
  const csvBody = '\uFEFF' + generateUserHistoryCsv(workspace);
  try {
    fs.writeFileSync(csvPath, csvBody, 'utf-8');
  } catch (err) {
    console.warn('Could not write user CSV file:', err);
  }
  return csvPath;
}

function loadUploadsIndex(): Record<string, StoredFileMeta> {
  if (fs.existsSync(UPLOADS_INDEX_FILE)) {
    try {
      const raw = fs.readFileSync(UPLOADS_INDEX_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, StoredFileMeta>;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // reset if unreadable
    }
  }
  return {};
}

function saveUploadsIndex(index: Record<string, StoredFileMeta>): void {
  try {
    fs.writeFileSync(UPLOADS_INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist uploads index:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  let accounts = ensureStorageInitialized();
  let uploadsIndex = loadUploadsIndex();

  const findAccountKey = (username: string): string | undefined =>
    Object.keys(accounts).find((k) => k.toLowerCase() === username.trim().toLowerCase());

  const getOrProvisionAccount = (
    rawUsername: string,
    incomingWorkspace?: UserWorkspaceData,
    rawPassword?: string
  ): StoredAccount | null => {
    const clean = rawUsername.trim();
    if (!clean) return null;
    const existingKey = findAccountKey(clean);
    if (existingKey) {
      if (rawPassword) {
        accounts[existingKey].passwordHash = hashPassword(rawPassword);
      }
      return accounts[existingKey];
    }

    // Cloud Run cold-start auto-rehydration: create account entry without wiping client data
    const workspace =
      incomingWorkspace && incomingWorkspace.profile
        ? {
            ...incomingWorkspace,
            profile: { ...incomingWorkspace.profile, username: clean },
          }
        : createEmptyWorkspace(clean, clean, '');

    const key = clean.toLowerCase();
    accounts[key] = {
      username: clean,
      passwordHash: hashPassword(rawPassword || 'wonder123'),
      createdAt: new Date().toISOString(),
      workspace,
    };
    persistAccounts(accounts);
    writeUserCsvFile(clean, workspace);
    return accounts[key];
  };

  // Binary file upload endpoint (supports single-shot and 16 MB chunked uploads up to 50 MB)
  app.post(
    '/api/uploads/:username',
    express.raw({ type: 'application/octet-stream', limit: '30mb' }),
    (req: Request, res: Response) => {
      const account = getOrProvisionAccount(String(req.params.username || ''));
      if (!account) {
        res.status(400).json({ error: 'Valid username is required for file upload.' });
        return;
      }

      const bodyBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const rawName = decodeURIComponent(String(req.header('x-file-name') || 'document.pdf'));
      const mimeType = String(req.header('x-mime-type') || 'application/octet-stream');
      const projectId = String(req.header('x-project-id') || '').trim() || undefined;
      const requestedStorageId = String(req.header('x-storage-id') || '').trim();
      const chunkIndex = Number(req.header('x-chunk-index') || '0');
      const totalChunks = Number(req.header('x-total-chunks') || '1');
      const declaredTotalBytes = Number(req.header('x-total-file-bytes') || bodyBuf.length);
      const headerProjectBytes = Number(req.header('x-current-project-bytes'));
      const headerUserBytes = Number(req.header('x-current-user-bytes'));

      const effectiveTotalSize =
        totalChunks > 1 && Number.isFinite(declaredTotalBytes) && declaredTotalBytes > 0
          ? declaredTotalBytes
          : bodyBuf.length;

      if (chunkIndex === 0) {
        const serverUserBytes = calculateUserStorageBytes(account.workspace);
        const currentUserBytes =
          Number.isFinite(headerUserBytes) && headerUserBytes >= 0
            ? Math.max(serverUserBytes, headerUserBytes)
            : serverUserBytes;

        const targetProject = projectId
          ? account.workspace.projects.find((p) => p.id === projectId)
          : undefined;
        const serverProjectBytes = targetProject
          ? calculateProjectStorageBytes(targetProject)
          : undefined;
        const currentProjectBytes =
          Number.isFinite(headerProjectBytes) && headerProjectBytes >= 0
            ? Math.max(serverProjectBytes ?? 0, headerProjectBytes)
            : serverProjectBytes;

        const quotaCheck = validateUploadQuota({
          fileSizeBytes: effectiveTotalSize,
          currentProjectBytes,
          currentUserBytes,
        });

        if (!quotaCheck.allowed) {
          res.status(413).json({ error: quotaCheck.error });
          return;
        }
      }

      const safeUser = account.username.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
      const userUploadDir = path.join(UPLOADS_DIR, safeUser);
      if (!fs.existsSync(userUploadDir)) {
        fs.mkdirSync(userUploadDir, { recursive: true });
      }

      const storageId =
        requestedStorageId && /^[a-zA-Z0-9_.-]+$/.test(requestedStorageId)
          ? requestedStorageId
          : `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const safeFile = rawName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const diskFileName = `${storageId}_${safeFile}`;
      const fullDiskPath = path.join(userUploadDir, diskFileName);

      if (chunkIndex === 0) {
        fs.writeFileSync(fullDiskPath, bodyBuf);
      } else {
        fs.appendFileSync(fullDiskPath, bodyBuf);
      }

      const currentSizeOnDisk = fs.statSync(fullDiskPath).size;
      if (currentSizeOnDisk > MAX_FILE_BYTES) {
        try {
          fs.unlinkSync(fullDiskPath);
        } catch {
          // ignore
        }
        res.status(413).json({ error: 'File exceeds the 50 MB single-file limit.' });
        return;
      }

      const isFinalChunk = chunkIndex >= totalChunks - 1;
      if (isFinalChunk) {
        const meta: StoredFileMeta = {
          storageId,
          username: account.username,
          projectId,
          fileName: rawName,
          mimeType,
          sizeBytes: currentSizeOnDisk,
          relativeDiskPath: path.join(safeUser, diskFileName),
          uploadedAt: new Date().toISOString().slice(0, 10),
        };
        uploadsIndex[storageId] = meta;
        saveUploadsIndex(uploadsIndex);
      }

      res.status(201).json({
        storageId,
        fileName: rawName,
        mimeType,
        sizeBytes: currentSizeOnDisk,
        complete: isFinalChunk,
        uploadedAt: new Date().toISOString().slice(0, 10),
        fileUrl: `/api/files/${encodeURIComponent(account.username)}/${encodeURIComponent(
          storageId
        )}`,
      });
    }
  );

  app.use(express.json({ limit: '60mb' }));

  app.get('/api/storage/status/:username', (req: Request, res: Response) => {
    const account = getOrProvisionAccount(String(req.params.username || ''));
    if (!account) {
      res.status(400).json({ error: 'Username is required.' });
      return;
    }
    const userUsedBytes = calculateUserStorageBytes(account.workspace);
    const projectBytesById: Record<string, number> = {};
    for (const p of account.workspace.projects) {
      projectBytesById[p.id] = calculateProjectStorageBytes(p);
    }

    const geminiKey = process.env.GEMINI_API_KEY || '';
    const apiKeyAttached = Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');

    res.json({
      storageReady: fs.existsSync(UPLOADS_DIR),
      apiKeyAttached,
      limits: {
        maxFileBytes: MAX_FILE_BYTES,
        maxProjectBytes: MAX_PROJECT_BYTES,
        maxUserBytes: MAX_USER_BYTES,
      },
      usage: {
        userUsedBytes,
        remainingUserBytes: Math.max(0, MAX_USER_BYTES - userUsedBytes),
        projectBytesById,
      },
    });
  });

  app.get('/api/files/:username/:storageId', (req: Request, res: Response) => {
    const storageId = String(req.params.storageId || '');
    const meta = uploadsIndex[storageId];
    if (!meta) {
      res.status(404).send('File not found');
      return;
    }
    const fullPath = path.join(UPLOADS_DIR, meta.relativeDiskPath);
    if (!fs.existsSync(fullPath)) {
      res.status(404).send('Stored file missing on disk');
      return;
    }

    const forceDownload = req.query.download === '1';
    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${meta.fileName.replace(
        /"/g,
        ''
      )}"`
    );
    res.sendFile(fullPath);
  });

  app.delete('/api/files/:username/:storageId', (req: Request, res: Response) => {
    const storageId = String(req.params.storageId || '');
    const meta = uploadsIndex[storageId];
    if (meta) {
      const fullPath = path.join(UPLOADS_DIR, meta.relativeDiskPath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // ignore unlink error
        }
      }
      delete uploadsIndex[storageId];
      saveUploadsIndex(uploadsIndex);
    }
    res.json({ ok: true });
  });

  app.get('/api/accounts', (_req: Request, res: Response) => {
    const users = Object.values(accounts).map((acc) => ({
      username: acc.username,
      fullName: acc.workspace.profile.fullName,
      avatarDataUrl: acc.workspace.profile.avatarDataUrl || '',
      projectCount: acc.workspace.projects.length,
      createdAt: acc.createdAt,
    }));
    res.json({ users });
  });

  app.post('/api/auth/signup', (req: Request, res: Response) => {
    const { username = '', password = '', fullName = '', email = '', avatarDataUrl } = req.body || {};
    const existingNames = Object.values(accounts).map((a) => a.username);
    const check = validateAuthCredentials('signup', String(username), String(password), existingNames);
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }

    const cleanUsername = String(username).trim();
    const workspace = createEmptyWorkspace(
      cleanUsername,
      String(fullName || cleanUsername),
      String(email || ''),
      typeof avatarDataUrl === 'string' && avatarDataUrl ? avatarDataUrl : undefined
    );

    const key = cleanUsername.toLowerCase();
    accounts[key] = {
      username: cleanUsername,
      passwordHash: hashPassword(String(password)),
      createdAt: new Date().toISOString(),
      workspace,
    };

    persistAccounts(accounts);
    writeUserCsvFile(cleanUsername, workspace);

    res.status(201).json({
      username: cleanUsername,
      workspace,
    });
  });

  app.post('/api/auth/signin', (req: Request, res: Response) => {
    const { username = '', password = '' } = req.body || {};
    const key = findAccountKey(String(username));
    if (!key) {
      res.status(401).json({ error: 'Account not found. Check your username or sign up.' });
      return;
    }

    const account = accounts[key];
    // Allow demo account quick login when demoFlag is passed or valid password
    if (account.passwordHash !== hashPassword(String(password))) {
      res.status(401).json({ error: 'Incorrect password. Please try again.' });
      return;
    }

    writeUserCsvFile(account.username, account.workspace);
    res.json({
      username: account.username,
      workspace: account.workspace,
    });
  });

  app.post('/api/auth/password', (req: Request, res: Response) => {
    const { username = '', currentPassword = '', newPassword = '' } = req.body || {};
    const key = findAccountKey(String(username));
    if (!key) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    const account = accounts[key];
    if (account.passwordHash !== hashPassword(String(currentPassword))) {
      res.status(401).json({ error: 'Current password does not match.' });
      return;
    }
    if (!newPassword || String(newPassword).length < 4) {
      res.status(400).json({ error: 'New password must be at least 4 characters.' });
      return;
    }
    account.passwordHash = hashPassword(String(newPassword));
    persistAccounts(accounts);
    res.json({ ok: true });
  });

  app.get('/api/workspace/:username', (req: Request, res: Response) => {
    const key = findAccountKey(String(req.params.username || ''));
    if (!key) {
      res.status(404).json({ error: 'User workspace not found.' });
      return;
    }
    res.json({
      username: accounts[key].username,
      workspace: accounts[key].workspace,
    });
  });

  app.put('/api/workspace/:username', (req: Request, res: Response) => {
    const incomingWorkspace = req.body?.workspace as UserWorkspaceData | undefined;
    const rawPassword =
      typeof req.body?.password === 'string' && req.body.password
        ? req.body.password
        : undefined;

    if (!incomingWorkspace || !incomingWorkspace.profile) {
      res.status(400).json({ error: 'Invalid workspace payload.' });
      return;
    }

    const account = getOrProvisionAccount(
      String(req.params.username || ''),
      incomingWorkspace,
      rawPassword
    );
    if (!account) {
      res.status(400).json({ error: 'Valid username is required.' });
      return;
    }

    // Preserve immutable unique username
    incomingWorkspace.profile.username = account.username;
    account.workspace = incomingWorkspace;
    persistAccounts(accounts);
    writeUserCsvFile(account.username, incomingWorkspace);

    res.json({ ok: true });
  });

  app.get('/api/export/:username.csv', (req: Request, res: Response) => {
    const account = getOrProvisionAccount(String(req.params.username || ''));
    if (!account) {
      res.status(404).send('User not found');
      return;
    }
    const csvPath = writeUserCsvFile(account.username, account.workspace);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${account.username}_playground_history.csv"`
    );
    res.sendFile(csvPath);
  });

  const distPath = path.join(__dirname, 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const isDevLifecycle =
    process.env.NODE_ENV === 'development' ||
    process.env.npm_lifecycle_event === 'dev';
  const useProdStatic =
    !isDevLifecycle &&
    fs.existsSync(distIndexPath) &&
    (process.env.NODE_ENV === 'production' ||
      process.env.npm_lifecycle_event === 'start' ||
      Boolean(process.env.K_SERVICE));

  if (useProdStatic) {
    app.use(express.static(distPath));
    app.use((req: Request, res: Response, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(distIndexPath);
    });
  } else {
    // Bind port 3000 immediately while Vite initializes in background so Nginx never sees 502/503
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const viteMiddlewarePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          hmr: disableHmr ? false : true,
          watch: disableHmr ? null : {},
        },
        appType: 'spa',
      })
    );

    app.use(async (req: Request, res: Response, next) => {
      try {
        const vite = await viteMiddlewarePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Playground server running at http://0.0.0.0:${PORT} (mode=${
        useProdStatic ? 'production' : 'development'
      }, dataDir=${DATA_DIR})`
    );
  });
}

startServer().catch((err) => {
  console.error('Fatal Playground server startup error:', err);
  process.exit(1);
});
