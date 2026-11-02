import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_FILE_BYTES,
  MAX_PROJECT_BYTES,
  MAX_USER_BYTES,
  validateUploadQuota,
} from './src/utils/playgroundLogic.ts';

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
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const UPLOADS_INDEX_FILE = path.join(DATA_DIR, 'uploads_index.json');
const LEGACY_ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

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

function ensureVaultInitialized(): Record<string, StoredFileMeta> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  // Security hardening: remove legacy disk accounts.json so no PII or password hashes rest on disk
  if (fs.existsSync(LEGACY_ACCOUNTS_FILE)) {
    try {
      fs.unlinkSync(LEGACY_ACCOUNTS_FILE);
    } catch {
      // ignore
    }
  }

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

function computeDiskBytesForUser(
  uploadsIndex: Record<string, StoredFileMeta>,
  username: string
): { userBytes: number; projectBytesById: Record<string, number> } {
  const norm = username.trim().toLowerCase();
  let userBytes = 0;
  const projectBytesById: Record<string, number> = {};

  for (const meta of Object.values(uploadsIndex)) {
    if (String(meta.username || '').trim().toLowerCase() !== norm) continue;
    userBytes += meta.sizeBytes || 0;
    if (meta.projectId) {
      projectBytesById[meta.projectId] =
        (projectBytesById[meta.projectId] || 0) + (meta.sizeBytes || 0);
    }
  }
  return { userBytes, projectBytesById };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  const uploadsIndex = ensureVaultInitialized();

  // Binary file upload endpoint (supports single-shot and 16 MB chunked uploads up to 50 MB)
  app.post(
    '/api/uploads/:username',
    express.raw({ type: 'application/octet-stream', limit: '30mb' }),
    (req: Request, res: Response) => {
      const cleanUsername = String(req.params.username || '').trim();
      if (!cleanUsername || !/^[a-zA-Z0-9_.-]{1,64}$/.test(cleanUsername)) {
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
        const diskStats = computeDiskBytesForUser(uploadsIndex, cleanUsername);
        const currentUserBytes =
          Number.isFinite(headerUserBytes) && headerUserBytes >= 0
            ? Math.max(diskStats.userBytes, headerUserBytes)
            : diskStats.userBytes;

        const diskProjectBytes = projectId
          ? diskStats.projectBytesById[projectId]
          : undefined;
        const currentProjectBytes =
          Number.isFinite(headerProjectBytes) && headerProjectBytes >= 0
            ? Math.max(diskProjectBytes ?? 0, headerProjectBytes)
            : diskProjectBytes;

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

      const safeUser = cleanUsername.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
      const userUploadDir = path.join(UPLOADS_DIR, safeUser);
      if (!fs.existsSync(userUploadDir)) {
        fs.mkdirSync(userUploadDir, { recursive: true });
      }

      const storageId =
        requestedStorageId && /^[a-zA-Z0-9_.-]+$/.test(requestedStorageId)
          ? requestedStorageId
          : `file_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
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
          username: cleanUsername,
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
        fileUrl: `/api/files/${encodeURIComponent(cleanUsername)}/${encodeURIComponent(
          storageId
        )}`,
      });
    }
  );

  app.use(express.json({ limit: '10mb' }));

  // Explicitly block any legacy account enumeration endpoints
  app.get('/api/accounts', (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Public account enumeration is disabled.' });
  });

  app.get('/api/storage/status/:username', (req: Request, res: Response) => {
    const cleanUsername = String(req.params.username || '').trim();
    if (!cleanUsername) {
      res.status(400).json({ error: 'Username is required.' });
      return;
    }
    const { userBytes, projectBytesById } = computeDiskBytesForUser(
      uploadsIndex,
      cleanUsername
    );
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
        userUsedBytes: userBytes,
        remainingUserBytes: Math.max(0, MAX_USER_BYTES - userBytes),
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
