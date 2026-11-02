import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAgeFromDob,
  computeDashboardMetrics,
  escapeCsvCell,
  generateUserHistoryCsv,
  MAX_FILE_BYTES,
  MAX_PROJECT_BYTES,
  MAX_USER_BYTES,
  normalizeExternalUrl,
  parseCsvLine,
  slugifyProjectName,
  validateAuthCredentials,
  validateUploadQuota,
  calculateProjectStorageBytes,
  calculateUserStorageBytes,
  detectAttachmentBadge,
  mergeWorkspacesSafely,
  findRecoverableLocalWorkspaces,
  validateChosenUsername,
  sanitizeWorkspaceForFirestore,
  suggestUsernameFromIdentity,
} from './playgroundLogic';
import { createDemoWonderWorkspace, createEmptyWorkspace } from '../data/seedData';

test('calculateAgeFromDob computes accurate age for ISO and DD-MM-YYYY dates', () => {
  const ref = new Date('2026-11-01T00:00:00Z');
  assert.equal(calculateAgeFromDob('2005-05-15', ref), 21);
  assert.equal(calculateAgeFromDob('2005-12-10', ref), 20);
  assert.equal(calculateAgeFromDob('15-05-2004', ref), 22);
  assert.equal(calculateAgeFromDob('', ref), null);
  assert.equal(calculateAgeFromDob('invalid', ref), null);
});

test('computeDashboardMetrics matches Figma demo counts accurately', () => {
  const demo = createDemoWonderWorkspace();
  const metrics = computeDashboardMetrics(demo.projects, demo.reminders);

  assert.equal(metrics.totalProjects, 4);
  assert.equal(metrics.completedProjects, 2); // Published + Completed
  assert.equal(metrics.ongoingProjects, 1);
  assert.equal(metrics.plannedProjects, 1);
  assert.equal(metrics.openReminders, 2);
  assert.equal(metrics.monthlyCompleted.length, 8);
  assert.equal(metrics.productivitySeries.length, 8);
});

test('validateAuthCredentials enforces unique username on signup', () => {
  const existing = ['wonder', 'AdminUser'];

  const dup = validateAuthCredentials('signup', 'WONDER', 'secret123', existing);
  assert.equal(dup.valid, false);
  assert.match(dup.error || '', /already taken/i);

  const shortPass = validateAuthCredentials('signup', 'newbuilder', '12', existing);
  assert.equal(shortPass.valid, false);

  const okSignup = validateAuthCredentials('signup', 'newbuilder', 'pass1234', existing);
  assert.equal(okSignup.valid, true);

  const okSignin = validateAuthCredentials('signin', 'wonder', 'wonder123', existing);
  assert.equal(okSignin.valid, true);
});

test('slugifyProjectName generates unique .proj slugs', () => {
  assert.equal(slugifyProjectName('Budget Buddy', []), 'budget-buddy');
  assert.equal(
    slugifyProjectName('Budget Buddy', ['budget-buddy', 'budget-buddy-2']),
    'budget-buddy-3'
  );
});

test('generateUserHistoryCsv serializes projects, prototype links, docs links, and hackathon updates cleanly', () => {
  const demo = createDemoWonderWorkspace();
  const csv = generateUserHistoryCsv(demo);
  const lines = csv.split('\r\n');

  assert.ok(lines.length > 10);
  const headers = parseCsvLine(lines[0]);
  assert.ok(headers.includes('PrototypeLink'));
  assert.ok(headers.includes('DocumentationLink'));
  assert.ok(headers.includes('HackathonName'));

  assert.ok(csv.includes('Aurora Notes'));
  assert.ok(csv.includes('https://www.figma.com/proto/aurora-notes-interactive'));
  assert.ok(csv.includes('https://docs.wonder.dev/aurora-notes-architecture'));
});

test('escapeCsvCell and parseCsvLine roundtrip commas and quotes', () => {
  const tricky = 'Split-first, "gentle" tracker';
  const encoded = `${escapeCsvCell('Project')},${escapeCsvCell(tricky)}`;
  const parsed = parseCsvLine(encoded);
  assert.deepEqual(parsed, ['Project', tricky]);
});

test('normalizeExternalUrl prepends https when scheme missing', () => {
  assert.equal(normalizeExternalUrl('figma.com/file/123'), 'https://figma.com/file/123');
  assert.equal(normalizeExternalUrl('https://github.com/u/repo'), 'https://github.com/u/repo');
  assert.equal(normalizeExternalUrl('   '), '');
});

test('storage quota helpers enforce 50MB file, 150MB project, and 500MB user limits', () => {
  const demo = createDemoWonderWorkspace();
  const auroraBytes = calculateProjectStorageBytes(demo.projects[0]);
  assert.equal(auroraBytes, 3420160);

  const totalSeededBytes = calculateUserStorageBytes(demo);
  assert.equal(totalSeededBytes, 3420160 + 6184960);

  // Valid 25 MB upload
  const ok = validateUploadQuota({
    fileSizeBytes: 25 * 1024 * 1024,
    currentProjectBytes: 10 * 1024 * 1024,
    currentUserBytes: 50 * 1024 * 1024,
  });
  assert.equal(ok.allowed, true);

  // Exceeds 50 MB single file limit
  const overFile = validateUploadQuota({
    fileSizeBytes: MAX_FILE_BYTES + 1024,
    currentProjectBytes: 0,
    currentUserBytes: 0,
  });
  assert.equal(overFile.allowed, false);
  assert.match(overFile.error || '', /50 MB single-file limit/i);

  // Exceeds 150 MB per-project limit
  const overProject = validateUploadQuota({
    fileSizeBytes: 40 * 1024 * 1024,
    currentProjectBytes: MAX_PROJECT_BYTES - 20 * 1024 * 1024,
    currentUserBytes: 130 * 1024 * 1024,
  });
  assert.equal(overProject.allowed, false);
  assert.match(overProject.error || '', /150 MB per-project/i);

  // Exceeds 500 MB per-user limit
  const overUser = validateUploadQuota({
    fileSizeBytes: 30 * 1024 * 1024,
    currentProjectBytes: 0,
    currentUserBytes: MAX_USER_BYTES - 10 * 1024 * 1024,
  });
  assert.equal(overUser.allowed, false);
  assert.match(overUser.error || '', /500 MB total user storage/i);
});

test('mergeWorkspacesSafely preserves all existing local projects when server cold-starts empty', () => {
  const localWs = createDemoWonderWorkspace();
  localWs.profile.username = 'srinidhi';
  localWs.profile.fullName = 'Srinidhi';
  // Simulate 5 user projects on device
  localWs.projects.push({
    ...localWs.projects[0],
    id: 'proj-srinidhi-5',
    slug: 'ai-space-proto',
    name: 'AI Space Prototype',
    prototypeLink: 'https://a18nc7f0b9z1-d.space-z',
    techStack: ['Z ai', 'Dribble'],
    attachments: [],
    updatedAt: '2026-11-02T04:20:00Z',
  });
  assert.equal(localWs.projects.length, 5);

  const emptyServerWs = createEmptyWorkspace('srinidhi', 'srinidhi', '');
  assert.equal(emptyServerWs.projects.length, 0);

  const merged = mergeWorkspacesSafely(localWs, emptyServerWs);
  assert.equal(merged.projects.length, 5);
  assert.equal(merged.profile.fullName, 'Srinidhi');
  assert.equal(merged.projects[4].prototypeLink, 'https://a18nc7f0b9z1-d.space-z');
});

test('detectAttachmentBadge categorizes PDF, PPTX, DOCX, images, and archives cleanly', () => {
  assert.deepEqual(detectAttachmentBadge('Hackathon_Pitch.pptx'), {
    ext: 'PPTX',
    defaultCategory: 'Pitch Deck',
  });
  assert.deepEqual(detectAttachmentBadge('Architecture_Spec.docx'), {
    ext: 'DOCX',
    defaultCategory: 'Documentation',
  });
  assert.deepEqual(detectAttachmentBadge('Screen_Mockup.png', 'image/png'), {
    ext: 'PNG',
    defaultCategory: 'Prototype / UI',
  });
  assert.deepEqual(detectAttachmentBadge('Final_Report.pdf', 'application/pdf'), {
    ext: 'PDF',
    defaultCategory: 'Report / PDF',
  });
});

test('cross-device phone & laptop sync recovers all 5 phone projects even after empty laptop signup', () => {
  // Phone localStorage has srinidhi's 5 projects + demo wonder
  const phoneWs = createDemoWonderWorkspace();
  phoneWs.profile.username = 'srinidhi';
  phoneWs.profile.fullName = 'Srinidhi';
  phoneWs.profile.email = 'srinidhi.x2008@gmail.com';
  phoneWs.projects.push({
    ...phoneWs.projects[0],
    id: 'proj-srinidhi-5',
    slug: 'ai-space-proto',
    name: 'AI Space Prototype',
    prototypeLink: 'https://a18nc7f0b9z1-d.space-z',
    techStack: ['Z ai', 'Dribble'],
    attachments: [],
    updatedAt: '2026-11-02T04:20:00Z',
  });

  const phoneLocalAccounts = {
    wonder: { username: 'wonder', workspace: createDemoWonderWorkspace() },
    srinidhi: { username: 'srinidhi', workspace: phoneWs },
  };

  // Case 1: Laptop signed up first with 0 projects in cloud, then Phone signs in with same Gmail
  const emptyCloudFromLaptop = createEmptyWorkspace(
    'srinidhi',
    'Srinidhi',
    'srinidhi.x2008@gmail.com'
  );
  const candidatesOnPhone = findRecoverableLocalWorkspaces({
    localAccounts: phoneLocalAccounts,
    authEmail: 'srinidhi.x2008@gmail.com',
    chosenUsername: 'srinidhi',
    lastActiveLocalUser: 'srinidhi',
  });
  assert.equal(candidatesOnPhone.length, 1);

  let syncedAfterPhoneLogin = emptyCloudFromLaptop;
  for (const c of candidatesOnPhone) {
    syncedAfterPhoneLogin = mergeWorkspacesSafely(c, syncedAfterPhoneLogin);
  }
  assert.equal(syncedAfterPhoneLogin.projects.length, 5);

  // Case 2: Laptop later reloads with its 0-project local cache against the 5-project cloud state
  const laptopLocalAccounts = {
    wonder: { username: 'wonder', workspace: createDemoWonderWorkspace() },
    srinidhi: {
      username: 'srinidhi',
      workspace: createEmptyWorkspace('srinidhi', 'srinidhi', 'srinidhi.x2008@gmail.com'),
    },
  };
  const candidatesOnLaptop = findRecoverableLocalWorkspaces({
    localAccounts: laptopLocalAccounts,
    authEmail: 'srinidhi.x2008@gmail.com',
    chosenUsername: 'srinidhi',
    lastActiveLocalUser: 'srinidhi',
  });
  let syncedAfterLaptopReload = syncedAfterPhoneLogin;
  for (const c of candidatesOnLaptop) {
    syncedAfterLaptopReload = mergeWorkspacesSafely(c, syncedAfterLaptopReload);
  }
  assert.equal(syncedAfterLaptopReload.projects.length, 5);
});

test('validateChosenUsername and sanitizeWorkspaceForFirestore enforce strict blueprint rules', () => {
  assert.equal(validateChosenUsername('wonder').valid, false);
  assert.equal(validateChosenUsername('ab').valid, false);
  assert.equal(validateChosenUsername('bad space').valid, false);
  assert.equal(validateChosenUsername('srinidhi').valid, true);
  assert.equal(
    suggestUsernameFromIdentity({
      email: 'srinidhi.x2008@gmail.com',
      preferredLocalUsername: 'srinidhi',
    }),
    'srinidhi'
  );

  const dirty = createDemoWonderWorkspace();
  dirty.projects[0].id = 'proj.with$invalid!chars';
  dirty.projects[0].attachments = [
    {
      id: 'att.1',
      name: 'Deck.pptx',
      sizeBytes: 1024,
      mimeType: 'application/vnd.ms-powerpoint',
      uploadedAt: '2026-11-01',
      dataUrl: 'data:application/octet-stream;base64,' + 'A'.repeat(500_000),
    },
  ];
  const clean = sanitizeWorkspaceForFirestore(
    dirty,
    'srinidhi',
    'srinidhi.x2008@gmail.com'
  );
  assert.match(clean.projects[0].id, /^[a-zA-Z0-9_-]+$/);
  assert.equal(clean.projects[0].attachments[0].dataUrl, undefined);
  assert.equal(clean.profile.username, 'srinidhi');
});



