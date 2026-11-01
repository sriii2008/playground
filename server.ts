import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoWonderWorkspace, createEmptyWorkspace } from './src/data/seedData.ts';
import { generateUserHistoryCsv, validateAuthCredentials } from './src/utils/playgroundLogic.ts';
import type { StoredAccount, UserWorkspaceData } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const CSV_DIR = path.join(DATA_DIR, 'csv');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

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
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
}

function writeUserCsvFile(username: string, workspace: UserWorkspaceData): string {
  const safeName = username.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  const csvPath = path.join(CSV_DIR, `${safeName}_user_history.csv`);
  const csvBody = '\uFEFF' + generateUserHistoryCsv(workspace);
  fs.writeFileSync(csvPath, csvBody, 'utf-8');
  return csvPath;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '60mb' }));

  let accounts = ensureStorageInitialized();

  const findAccountKey = (username: string): string | undefined =>
    Object.keys(accounts).find((k) => k.toLowerCase() === username.trim().toLowerCase());

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
    const key = findAccountKey(String(req.params.username || ''));
    if (!key) {
      res.status(404).json({ error: 'User workspace not found.' });
      return;
    }
    const incomingWorkspace = req.body?.workspace as UserWorkspaceData | undefined;
    if (!incomingWorkspace || !incomingWorkspace.profile) {
      res.status(400).json({ error: 'Invalid workspace payload.' });
      return;
    }

    // Preserve immutable unique username
    incomingWorkspace.profile.username = accounts[key].username;
    accounts[key].workspace = incomingWorkspace;
    persistAccounts(accounts);
    writeUserCsvFile(accounts[key].username, incomingWorkspace);

    res.json({ ok: true });
  });

  app.get('/api/export/:username.csv', (req: Request, res: Response) => {
    const key = findAccountKey(String(req.params.username || ''));
    if (!key) {
      res.status(404).send('User not found');
      return;
    }
    const account = accounts[key];
    const csvPath = writeUserCsvFile(account.username, account.workspace);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${account.username}_playground_history.csv"`
    );
    res.sendFile(csvPath);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Playground server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
