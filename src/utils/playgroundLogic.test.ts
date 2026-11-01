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
} from './playgroundLogic';
import { createDemoWonderWorkspace } from '../data/seedData';

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

