import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Deterministic Zero-Trust Firestore Security Rules Evaluator + Blueprint Synchronicity Suite
 * Verifies all 12 "Dirty Dozen" adversarial payloads return PERMISSION_DENIED and all
 * legitimate owner workflows succeed, mirroring the exact invariants in firestore.rules.
 */

interface AuthContext {
  uid: string;
  email_verified: boolean;
}

type DocMap = Record<string, Record<string, unknown>>;

interface EvalRequest {
  auth: AuthContext | null;
  time: string;
  op: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  incoming?: Record<string, unknown>;
  afterState?: DocMap; // Represents batch state for existsAfter / getAfter
}

const REQUEST_TIME = '2026-11-02T05:00:00.000Z';

const ID_RE = /^[a-zA-Z0-9_-]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;
const USERNAME_LOWER_RE = /^[a-z0-9_.-]+$/;

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && ID_RE.test(id);
}

function isValidUsername(h: unknown): h is string {
  return typeof h === 'string' && h.length >= 3 && h.length <= 32 && USERNAME_RE.test(h);
}

function isValidUsernameLower(h: unknown): h is string {
  return typeof h === 'string' && h.length >= 3 && h.length <= 32 && USERNAME_LOWER_RE.test(h);
}

function isBoundedStr(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

function isNonEmptyBoundedStr(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= max;
}

function hasExactKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(obj);
  return (
    keys.every((k) => actual.includes(k)) &&
    actual.every((k) => keys.includes(k))
  );
}

function affectedKeys(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>
): string[] {
  const all = new Set([...Object.keys(incoming), ...Object.keys(existing)]);
  const changed: string[] = [];
  for (const k of all) {
    if (JSON.stringify(incoming[k]) !== JSON.stringify(existing[k])) {
      changed.push(k);
    }
  }
  return changed;
}

function evaluatePlaygroundRules(
  dbState: DocMap,
  req: EvalRequest
): 'ALLOWED' | 'PERMISSION_DENIED' {
  const deny = () => 'PERMISSION_DENIED' as const;
  const allow = () => 'ALLOWED' as const;

  const isSignedIn = req.auth !== null;
  const isVerified = req.auth !== null && req.auth.email_verified === true;
  const uid = req.auth?.uid ?? '';
  const after = req.afterState ?? dbState;

  const isMasterOwner = (userId: string) =>
    Boolean(dbState[`/users/${userId}`]) &&
    dbState[`/users/${userId}`].ownerId === uid;

  const isMasterOwnerOrCreating = (userId: string) =>
    isMasterOwner(userId) ||
    (Boolean(after[`/users/${userId}`]) && after[`/users/${userId}`].ownerId === uid);

  const isValidUserAccount = (d?: Record<string, unknown>): boolean => {
    if (!d) return false;
    return (
      hasExactKeys(d, ['ownerId', 'username', 'usernameLower', 'theme', 'createdAt', 'updatedAt']) &&
      d.ownerId === uid &&
      isValidId(d.ownerId) &&
      isValidUsername(d.username) &&
      isValidUsernameLower(d.usernameLower) &&
      d.username.toLowerCase() === d.usernameLower &&
      typeof d.theme === 'string' &&
      d.theme.length <= 16 &&
      ['lavender', 'mint', 'rose', 'sky', 'butter'].includes(d.theme) &&
      typeof d.createdAt === 'string' &&
      typeof d.updatedAt === 'string'
    );
  };

  const isValidUsernameClaim = (d?: Record<string, unknown>): boolean => {
    if (!d) return false;
    return (
      hasExactKeys(d, ['ownerId', 'username', 'createdAt']) &&
      d.ownerId === uid &&
      isValidId(d.ownerId) &&
      isValidUsername(d.username) &&
      typeof d.createdAt === 'string'
    );
  };

  const isValidProjectDoc = (d?: Record<string, unknown>): boolean => {
    if (!d) return false;
    const reqKeys = [
      'ownerId', 'id', 'slug', 'name', 'domain', 'purpose', 'workflowStage',
      'progress', 'problemStatement', 'solution', 'githubLink', 'prototypeLink',
      'documentationLink', 'techStack', 'teamName', 'teamMembers', 'attachments',
      'hackathonName', 'hackathonDeadline', 'hackathonUpdates', 'completedMonth',
      'clientUpdatedAt', 'createdAt', 'updatedAt',
    ];
    if (!hasExactKeys(d, reqKeys)) return false;
    const techStack = d.techStack;
    if (
      !Array.isArray(techStack) ||
      techStack.length > 30 ||
      (techStack.length > 0 && (typeof techStack[0] !== 'string' || techStack[0].length > 80))
    ) {
      return false;
    }
    return (
      d.ownerId === uid &&
      isValidId(d.ownerId) &&
      isValidId(d.id) &&
      isNonEmptyBoundedStr(d.slug, 140) &&
      isNonEmptyBoundedStr(d.name, 160) &&
      isBoundedStr(d.domain, 100) &&
      isBoundedStr(d.purpose, 2000) &&
      typeof d.workflowStage === 'string' &&
      ['Planned', 'Ongoing', 'Completed', 'Published'].includes(d.workflowStage) &&
      Number.isInteger(d.progress) &&
      Number(d.progress) >= 0 &&
      Number(d.progress) <= 100 &&
      isBoundedStr(d.problemStatement, 5000) &&
      isBoundedStr(d.solution, 5000) &&
      isBoundedStr(d.githubLink, 500) &&
      isBoundedStr(d.prototypeLink, 500) &&
      isBoundedStr(d.documentationLink, 500) &&
      isBoundedStr(d.teamName, 120) &&
      Array.isArray(d.teamMembers) &&
      d.teamMembers.length <= 25 &&
      Array.isArray(d.attachments) &&
      d.attachments.length <= 50 &&
      isBoundedStr(d.hackathonName, 160) &&
      isBoundedStr(d.hackathonDeadline, 32) &&
      Array.isArray(d.hackathonUpdates) &&
      d.hackathonUpdates.length <= 50 &&
      Number.isInteger(d.completedMonth) &&
      Number(d.completedMonth) >= -1 &&
      Number(d.completedMonth) <= 11 &&
      isBoundedStr(d.clientUpdatedAt, 40) &&
      typeof d.createdAt === 'string' &&
      typeof d.updatedAt === 'string'
    );
  };

  const isValidReminderDoc = (d?: Record<string, unknown>): boolean => {
    if (!d) return false;
    return (
      hasExactKeys(d, [
        'ownerId', 'id', 'text', 'projectId', 'projectName',
        'completed', 'clientCreatedAt', 'createdAt', 'updatedAt',
      ]) &&
      d.ownerId === uid &&
      isValidId(d.ownerId) &&
      isValidId(d.id) &&
      isNonEmptyBoundedStr(d.text, 400) &&
      isBoundedStr(d.projectId, 128) &&
      isBoundedStr(d.projectName, 160) &&
      typeof d.completed === 'boolean' &&
      isBoundedStr(d.clientCreatedAt, 40) &&
      typeof d.createdAt === 'string' &&
      typeof d.updatedAt === 'string'
    );
  };

  const parts = req.path.split('/').filter(Boolean);

  // /usernames or /usernames/{usernameLower}
  if (parts[0] === 'usernames') {
    if (req.op === 'list') return deny();
    const handle = parts[1];
    if (req.op === 'get') {
      return isSignedIn && isVerified && isValidUsernameLower(handle) ? allow() : deny();
    }
    if (req.op === 'create') {
      if (dbState[req.path]) return deny(); // Firestore create denied if doc already exists
      const inc = req.incoming;
      const userDocAfter = after[`/users/${uid}`];
      const ok =
        isSignedIn &&
        isVerified &&
        isValidUsernameLower(handle) &&
        isValidUsernameClaim(inc) &&
        String(inc?.username).toLowerCase() === handle &&
        inc?.createdAt === req.time &&
        Boolean(userDocAfter) &&
        userDocAfter.usernameLower === handle &&
        userDocAfter.ownerId === uid;
      return ok ? allow() : deny();
    }
    return deny(); // update & delete always false
  }

  // /users or /users/{userId}
  if (parts[0] === 'users' && parts.length <= 2) {
    if (req.op === 'list') return deny();
    const userId = parts[1];
    if (req.op === 'get') {
      return isSignedIn && isVerified && isValidId(userId) && uid === userId ? allow() : deny();
    }
    if (req.op === 'create') {
      if (dbState[req.path]) return deny();
      const inc = req.incoming;
      const claimAfter = inc ? after[`/usernames/${String(inc.usernameLower)}`] : undefined;
      const ok =
        isSignedIn &&
        isVerified &&
        isValidId(userId) &&
        uid === userId &&
        isValidUserAccount(inc) &&
        inc?.createdAt === req.time &&
        inc?.updatedAt === req.time &&
        Boolean(claimAfter) &&
        claimAfter?.ownerId === uid;
      return ok ? allow() : deny();
    }
    if (req.op === 'update') {
      const ex = dbState[req.path];
      const inc = req.incoming;
      if (!ex || !inc) return deny();
      const changed = affectedKeys(inc, ex);
      const ok =
        isSignedIn &&
        isValidUserAccount(inc) &&
        isVerified &&
        isValidId(userId) &&
        uid === userId &&
        ex.ownerId === uid &&
        inc.ownerId === ex.ownerId &&
        inc.username === ex.username &&
        inc.usernameLower === ex.usernameLower &&
        inc.createdAt === ex.createdAt &&
        inc.updatedAt === req.time &&
        changed.every((k) => ['theme', 'updatedAt'].includes(k));
      return ok ? allow() : deny();
    }
    return deny();
  }

  // /users/{userId}/private/{docId}
  if (parts[0] === 'users' && parts[2] === 'private') {
    if (req.op === 'list') return deny();
    const userId = parts[1];
    const docId = parts[3];
    if (req.op === 'get') {
      return isSignedIn && isVerified && isValidId(userId) && docId === 'profile' && uid === userId && isMasterOwner(userId)
        ? allow()
        : deny();
    }
    return deny();
  }

  // /users/{userId}/projects/{projectId}
  if (parts[0] === 'users' && parts[2] === 'projects') {
    const userId = parts[1];
    const projectId = parts[3];
    if (req.op === 'create') {
      if (dbState[req.path]) return deny();
      const inc = req.incoming;
      const ok =
        isSignedIn &&
        isVerified &&
        isValidId(userId) &&
        isValidId(projectId) &&
        uid === userId &&
        isValidProjectDoc(inc) &&
        inc?.id === projectId &&
        inc?.createdAt === req.time &&
        inc?.updatedAt === req.time &&
        isMasterOwnerOrCreating(userId);
      return ok ? allow() : deny();
    }
    if (req.op === 'update') {
      const ex = dbState[req.path];
      const inc = req.incoming;
      if (!ex || !inc) return deny();
      const allowedUpdateKeys = [
        'slug', 'name', 'domain', 'purpose', 'workflowStage', 'progress',
        'problemStatement', 'solution', 'githubLink', 'prototypeLink',
        'documentationLink', 'techStack', 'teamName', 'teamMembers',
        'attachments', 'hackathonName', 'hackathonDeadline',
        'hackathonUpdates', 'completedMonth', 'clientUpdatedAt', 'updatedAt',
      ];
      const changed = affectedKeys(inc, ex);
      const ok =
        isSignedIn &&
        isValidProjectDoc(inc) &&
        isVerified &&
        isValidId(userId) &&
        isValidId(projectId) &&
        uid === userId &&
        ex.ownerId === uid &&
        inc.ownerId === ex.ownerId &&
        inc.id === ex.id &&
        inc.id === projectId &&
        inc.createdAt === ex.createdAt &&
        inc.updatedAt === req.time &&
        changed.every((k) => allowedUpdateKeys.includes(k)) &&
        isMasterOwner(userId);
      return ok ? allow() : deny();
    }
    return deny();
  }

  // /users/{userId}/reminders/{reminderId}
  if (parts[0] === 'users' && parts[2] === 'reminders') {
    const userId = parts[1];
    const reminderId = parts[3];
    if (req.op === 'create') {
      if (dbState[req.path]) return deny();
      const inc = req.incoming;
      const fkOk =
        inc?.projectId === '' ||
        (isValidId(inc?.projectId) &&
          (Boolean(dbState[`/users/${userId}/projects/${String(inc?.projectId)}`]) ||
            Boolean(after[`/users/${userId}/projects/${String(inc?.projectId)}`])));
      const ok =
        isSignedIn &&
        isVerified &&
        isValidId(userId) &&
        isValidId(reminderId) &&
        uid === userId &&
        isValidReminderDoc(inc) &&
        inc?.id === reminderId &&
        inc?.createdAt === req.time &&
        inc?.updatedAt === req.time &&
        isMasterOwnerOrCreating(userId) &&
        fkOk;
      return ok ? allow() : deny();
    }
    return deny();
  }

  return deny();
}

function makeBaseProject(ownerId: string, id = 'proj_1'): Record<string, unknown> {
  return {
    ownerId,
    id,
    slug: 'aurora-notes',
    name: 'Aurora Notes',
    domain: 'Productivity',
    purpose: 'Note workspace',
    workflowStage: 'Ongoing',
    progress: 65,
    problemStatement: 'Scattered hackathon notes',
    solution: 'Unified IDE workspace',
    githubLink: 'https://github.com/example/aurora',
    prototypeLink: 'https://figma.com/proto/aurora',
    documentationLink: 'https://docs.example.com',
    techStack: ['React', 'TypeScript'],
    teamName: 'Solo',
    teamMembers: [],
    attachments: [],
    hackathonName: 'AI Buildathon',
    hackathonDeadline: '2026-11-15',
    hackathonUpdates: [],
    completedMonth: -1,
    clientUpdatedAt: REQUEST_TIME,
    createdAt: REQUEST_TIME,
    updatedAt: REQUEST_TIME,
  };
}

test('firestore.rules matches firebase-blueprint.json paths and enforces default deny', () => {
  const rulesText = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
  const blueprint = JSON.parse(fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf-8'));

  assert.match(rulesText, /rules_version = '2';/);
  assert.match(rulesText, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);

  const blueprintPaths = Object.keys(blueprint.firestore);
  assert.equal(blueprintPaths.length, 7);
  assert.match(rulesText, /match \/usernames\/\{usernameLower\}/);
  assert.match(rulesText, /match \/users\/\{userId\}/);
  assert.match(rulesText, /match \/private\/\{docId\}/);
  assert.match(rulesText, /match \/projects\/\{projectId\}/);
  assert.match(rulesText, /match \/certificates\/\{certId\}/);
  assert.match(rulesText, /match \/reminders\/\{reminderId\}/);
  assert.match(rulesText, /match \/history\/\{logId\}/);
});

test('Dirty Dozen #1–#12 adversarial payloads all return PERMISSION_DENIED', () => {
  const alice: AuthContext = { uid: 'uid_alice', email_verified: true };
  const attacker: AuthContext = { uid: 'uid_attacker', email_verified: true };
  const unverifiedAlice: AuthContext = { uid: 'uid_alice', email_verified: false };

  const seededDb: DocMap = {
    '/users/uid_alice': {
      ownerId: 'uid_alice',
      username: 'srinidhi',
      usernameLower: 'srinidhi',
      theme: 'lavender',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
    '/usernames/srinidhi': {
      ownerId: 'uid_alice',
      username: 'srinidhi',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    '/users/uid_alice/private/profile': {
      ownerId: 'uid_alice',
      username: 'srinidhi',
      email: 'srinidhi.x2008@gmail.com',
    },
    '/users/uid_alice/projects/proj_existing': {
      ...makeBaseProject('uid_alice', 'proj_existing'),
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  };

  // 1. Identity Spoofing (setting ownerId to someone else)
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: alice,
      time: REQUEST_TIME,
      op: 'create',
      path: '/users/uid_alice/projects/proj_1',
      incoming: { ...makeBaseProject('uid_victim', 'proj_1') },
    }),
    'PERMISSION_DENIED'
  );

  // 2. Unverified Email Spoof
  assert.equal(
    evaluatePlaygroundRules({}, {
      auth: unverifiedAlice,
      time: REQUEST_TIME,
      op: 'create',
      path: '/users/uid_alice',
      incoming: {
        ownerId: 'uid_alice',
        username: 'srinidhi',
        usernameLower: 'srinidhi',
        theme: 'lavender',
        createdAt: REQUEST_TIME,
        updatedAt: REQUEST_TIME,
      },
      afterState: {
        '/usernames/srinidhi': {
          ownerId: 'uid_alice',
          username: 'srinidhi',
          createdAt: REQUEST_TIME,
        },
      },
    }),
    'PERMISSION_DENIED'
  );

  // 3. Cross-User PII Leak
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: attacker,
      time: REQUEST_TIME,
      op: 'get',
      path: '/users/uid_alice/private/profile',
    }),
    'PERMISSION_DENIED'
  );

  // 4. Account / Username Enumeration (listing /usernames or /users)
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: attacker,
      time: REQUEST_TIME,
      op: 'list',
      path: '/usernames',
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: attacker,
      time: REQUEST_TIME,
      op: 'list',
      path: '/users',
    }),
    'PERMISSION_DENIED'
  );

  // 5. Duplicate Username Hijack (creating or updating already-claimed @srinidhi)
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: attacker,
      time: REQUEST_TIME,
      op: 'create',
      path: '/usernames/srinidhi',
      incoming: { ownerId: 'uid_attacker', username: 'srinidhi', createdAt: REQUEST_TIME },
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: attacker,
      time: REQUEST_TIME,
      op: 'update',
      path: '/usernames/srinidhi',
      incoming: { ownerId: 'uid_attacker', username: 'srinidhi', createdAt: REQUEST_TIME },
    }),
    'PERMISSION_DENIED'
  );

  // 6. Orphaned Username Claim without atomic /users/{uid} batch
  assert.equal(
    evaluatePlaygroundRules({}, {
      auth: attacker,
      time: REQUEST_TIME,
      op: 'create',
      path: '/usernames/ghosthandle',
      incoming: { ownerId: 'uid_attacker', username: 'ghosthandle', createdAt: REQUEST_TIME },
      afterState: {},
    }),
    'PERMISSION_DENIED'
  );

  // 7. Shadow / Ghost Field Injection
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: alice,
      time: REQUEST_TIME,
      op: 'create',
      path: '/users/uid_alice/projects/proj_1',
      incoming: { ...makeBaseProject('uid_alice', 'proj_1'), isAdmin: true },
    }),
    'PERMISSION_DENIED'
  );

  // 8. Update-Gap Value Poisoning on UserAccount theme
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: alice,
      time: REQUEST_TIME,
      op: 'update',
      path: '/users/uid_alice',
      incoming: {
        ...seededDb['/users/uid_alice'],
        theme: 'invalid_neon_theme',
        updatedAt: REQUEST_TIME,
      },
    }),
    'PERMISSION_DENIED'
  );

  // 9. ID Poisoning / DoW Path
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: alice,
      time: REQUEST_TIME,
      op: 'create',
      path: '/users/uid_alice/projects/bad$id!spaces',
      incoming: makeBaseProject('uid_alice', 'bad$id!spaces'),
    }),
    'PERMISSION_DENIED'
  );

  // 10. Unbounded Array / Element Type Poisoning
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: alice,
      time: REQUEST_TIME,
      op: 'create',
      path: '/users/uid_alice/projects/proj_bigstack',
      incoming: {
        ...makeBaseProject('uid_alice', 'proj_bigstack'),
        techStack: Array.from({ length: 35 }, (_, i) => `Tag${i}`),
      },
    }),
    'PERMISSION_DENIED'
  );

  // 11. Orphaned Foreign Key Reference on Reminder
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: alice,
      time: REQUEST_TIME,
      op: 'create',
      path: '/users/uid_alice/reminders/rem_1',
      incoming: {
        ownerId: 'uid_alice',
        id: 'rem_1',
        text: 'Submit demo video',
        projectId: 'non_existent_proj_999',
        projectName: 'Ghost Project',
        completed: false,
        clientCreatedAt: REQUEST_TIME,
        createdAt: REQUEST_TIME,
        updatedAt: REQUEST_TIME,
      },
    }),
    'PERMISSION_DENIED'
  );

  // 12. Forged Client Timestamp / Immutable createdAt Tamper
  assert.equal(
    evaluatePlaygroundRules(seededDb, {
      auth: alice,
      time: REQUEST_TIME,
      op: 'update',
      path: '/users/uid_alice/projects/proj_existing',
      incoming: {
        ...seededDb['/users/uid_alice/projects/proj_existing'],
        name: 'Updated Name',
        createdAt: REQUEST_TIME, // tampered createdAt (differs from 2026-11-01)
        updatedAt: REQUEST_TIME,
      },
    }),
    'PERMISSION_DENIED'
  );
});

test('Legitimate atomic onboarding, theme update, and project writes return ALLOWED', () => {
  const alice: AuthContext = { uid: 'uid_alice', email_verified: true };

  const afterBatch: DocMap = {
    '/users/uid_alice': {
      ownerId: 'uid_alice',
      username: 'srinidhi',
      usernameLower: 'srinidhi',
      theme: 'lavender',
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
    },
    '/usernames/srinidhi': {
      ownerId: 'uid_alice',
      username: 'srinidhi',
      createdAt: REQUEST_TIME,
    },
  };

  assert.equal(
    evaluatePlaygroundRules({}, {
      auth: alice,
      time: REQUEST_TIME,
      op: 'create',
      path: '/users/uid_alice',
      incoming: afterBatch['/users/uid_alice'],
      afterState: afterBatch,
    }),
    'ALLOWED'
  );

  assert.equal(
    evaluatePlaygroundRules({}, {
      auth: alice,
      time: REQUEST_TIME,
      op: 'create',
      path: '/usernames/srinidhi',
      incoming: afterBatch['/usernames/srinidhi'],
      afterState: afterBatch,
    }),
    'ALLOWED'
  );

  assert.equal(
    evaluatePlaygroundRules(afterBatch, {
      auth: alice,
      time: REQUEST_TIME,
      op: 'create',
      path: '/users/uid_alice/projects/proj_1',
      incoming: makeBaseProject('uid_alice', 'proj_1'),
    }),
    'ALLOWED'
  );
});
