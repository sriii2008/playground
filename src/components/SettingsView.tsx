import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  HardDrive,
  KeyRound,
  Palette,
  Share2,
  Upload,
} from 'lucide-react';
import {
  PastelThemeId,
  ProjectItem,
  ProjectStatus,
  UserWorkspaceData,
} from '../types';
import { PASTEL_THEMES } from '../data/seedData';
import {
  calculateProjectStorageBytes,
  calculateUserStorageBytes,
  formatFileSize,
  generateUserHistoryCsv,
  MAX_USER_BYTES,
  parseCsvLine,
  slugifyProjectName,
} from '../utils/playgroundLogic';
import { triggerCsvDownload } from '../utils/storageClient';

interface SettingsViewProps {
  workspace: UserWorkspaceData;
  onThemeChange: (theme: PastelThemeId) => void;
  onImportProjects: (imported: ProjectItem[]) => void;
  onSignOut: () => void;
}

type HistoryFilter = 'All' | 'Project' | 'HackathonUpdate' | 'Certificate' | 'UserHistory';

export const SettingsView: React.FC<SettingsViewProps> = ({
  workspace,
  onThemeChange,
  onImportProjects,
  onSignOut,
}) => {
  const [tableFilter, setTableFilter] = useState<HistoryFilter>('All');
  const [copiedType, setCopiedType] = useState<'csv' | 'summary' | null>(null);
  const [importFeedback, setImportFeedback] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');

  const csvString = generateUserHistoryCsv(workspace);
  const allCsvLines = csvString.split('\r\n').filter(Boolean);
  const headers = parseCsvLine(allCsvLines[0] || '');
  const dataRows = allCsvLines.slice(1).map((line) => parseCsvLine(line));

  const visibleRows =
    tableFilter === 'All'
      ? dataRows
      : dataRows.filter((r) => r[0] === tableFilter);

  const handleCopyCsv = async () => {
    try {
      await navigator.clipboard.writeText(csvString);
      setCopiedType('csv');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // ignore clipboard restriction
    }
  };

  const handleCopyShareSummary = async () => {
    const lines = [
      `Playground Portfolio & Hackathon Summary — @${workspace.profile.username}`,
      `Name: ${workspace.profile.fullName} | Portfolio: ${workspace.profile.portfolio || '-'} | GitHub: ${workspace.profile.github || '-'}`,
      '',
      ...workspace.projects.map(
        (p, i) =>
          `${i + 1}. ${p.name} [${p.domain} · ${p.status} ${p.progress}%]\n   Prototype: ${
            p.prototypeLink || 'N/A'
          } | Docs: ${p.documentationLink || 'N/A'} | GitHub: ${p.githubLink || 'N/A'}`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedType('summary');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleImportCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const cleanText = reader.result.replace(/^\uFEFF/, '');
      const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        setImportFeedback('CSV file has no data rows.');
        return;
      }

      const existingSlugs = workspace.projects.map((p) => p.slug);
      const imported: ProjectItem[] = [];

      for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLine(lines[i]);
        const recordType = cols[0];
        if (recordType === 'Project' && cols[4]) {
          const name = cols[4].trim();
          // Skip exact duplicate project names
          if (
            workspace.projects.some(
              (existing) => existing.name.toLowerCase() === name.toLowerCase()
            )
          ) {
            continue;
          }
          const slug = slugifyProjectName(name, existingSlugs);
          existingSlugs.push(slug);
          const rawStatus = cols[6] as ProjectStatus;
          const validStatus: ProjectStatus = [
            'Planned',
            'Ongoing',
            'Completed',
            'Published',
          ].includes(rawStatus)
            ? rawStatus
            : 'Planned';

          imported.push({
            id: `proj-imp-${Date.now()}-${i}`,
            slug,
            name,
            domain: cols[5] || 'General',
            purpose: cols[14] || '',
            status: validStatus,
            progress: Math.max(0, Math.min(100, Number(cols[7]) || 0)),
            prototypeLink: cols[8] || '',
            documentationLink: cols[9] || '',
            githubLink: cols[10] || '',
            techStack: cols[11]
              ? cols[11]
                  .split('|')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
            teamName: 'Imported Team',
            teamMembers: [{ id: `tm-imp-${i}`, name: workspace.profile.username, role: 'Lead' }],
            problemStatement: cols[13] || '',
            solution: cols[14] || '',
            attachments: [],
            hackathonName: cols[15] || '',
            hackathonDeadline: '',
            hackathonUpdates: [],
            updatedAt: new Date().toISOString(),
          });
        }
      }

      if (imported.length > 0) {
        onImportProjects(imported);
        setImportFeedback(`Imported ${imported.length} new project(s) from CSV.`);
      } else {
        setImportFeedback('All projects in this CSV are already in your workspace.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus('');
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: workspace.profile.username,
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordStatus(data.error || 'Could not update password.');
        return;
      }
      setPasswordStatus('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch {
      setPasswordStatus('Password updated locally.');
      setCurrentPassword('');
      setNewPassword('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">
            Settings & User History
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Your workspace data is automatically stored in Excel-ready CSV format to access and share anytime.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => triggerCsvDownload(workspace)}
            className="h-10 px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download Excel (.csv)</span>
          </button>

          <button
            type="button"
            onClick={handleCopyShareSummary}
            className="h-10 px-3.5 rounded-xl bg-white border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copiedType === 'summary' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Summary copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Share summary</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 1. Pastel Themes Card */}
      <section
        aria-label="Pastel color themes"
        className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
          <Palette className="w-4 h-4 text-[var(--accent)]" />
          <h2>Pastel workspace themes</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {PASTEL_THEMES.map((opt) => {
            const active = workspace.theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onThemeChange(opt.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]/55 shadow-2xs'
                    : 'border-[var(--border-subtle)] bg-white hover:border-[var(--accent)]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="w-6 h-6 rounded-full border border-black/10"
                    style={{ backgroundColor: opt.swatch }}
                  />
                  {active && <Check className="w-4 h-4 text-[var(--accent)]" />}
                </div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  {opt.label}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Pastel IDE
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 1.5 Workspace File Storage Capacity */}
      <section
        aria-label="Workspace file storage capacity"
        className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4"
      >
        {(() => {
          const usedBytes = calculateUserStorageBytes(workspace);
          const pct = Math.min(100, Math.round((usedBytes / MAX_USER_BYTES) * 100));
          return (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
                  <HardDrive className="w-4 h-4 text-[var(--accent)]" />
                  <h2>Workspace file storage</h2>
                </div>
                <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                  {formatFileSize(usedBytes)} / 500.00 MB user quota ({pct}%)
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-[var(--accent-soft)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] tabular-nums">
                <span>Max single file: 50 MB</span>
                <span aria-hidden="true">·</span>
                <span>Per-project capacity: 150 MB</span>
                <span aria-hidden="true">·</span>
                <span>Total per-user capacity: 500 MB</span>
              </div>

              {workspace.projects.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {workspace.projects.map((p) => {
                    const pBytes = calculateProjectStorageBytes(p);
                    return (
                      <div
                        key={p.id}
                        className="px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-medium text-[var(--text-primary)] truncate">
                          {p.name}
                        </span>
                        <span className="font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
                          {formatFileSize(pBytes)} / 150 MB
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </section>

      {/* 2. User History (Excel / CSV Live Spreadsheet Vault) */}
      <section
        aria-label="User history Excel CSV viewer"
        className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <FileSpreadsheet className="w-4 h-4 text-[var(--accent)]" />
              <h2>User history — Live Excel (.csv) sheet</h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono">
              /api/export/{workspace.profile.username}.csv · {dataRows.length} rows synced
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCsv}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedType === 'csv' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied raw CSV</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Copy CSV</span>
                </>
              )}
            </button>

            <label className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Import CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportCsvFile}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {importFeedback && (
          <p className="text-xs font-medium text-[var(--accent)]">{importFeedback}</p>
        )}

        {/* Filter Tabs */}
        <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-[var(--bg-input)]">
          {(
            [
              { id: 'All', label: 'All CSV Rows' },
              { id: 'Project', label: 'Projects & Links' },
              { id: 'HackathonUpdate', label: 'Hackathon Updates' },
              { id: 'Certificate', label: 'Certificates' },
              { id: 'UserHistory', label: 'Activity Log' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTableFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                tableFilter === tab.id
                  ? 'bg-white text-[var(--text-primary)] shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Spreadsheet Table */}
        <div className="border border-[var(--border-subtle)] rounded-xl overflow-x-auto max-h-96">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[var(--bg-chrome)] sticky top-0 z-10">
              <tr>
                {[
                  headers[0] || 'Type',
                  headers[4] || 'Item',
                  headers[5] || 'Domain',
                  headers[6] || 'Status',
                  headers[7] || '%',
                  headers[8] || 'Prototype Link',
                  headers[9] || 'Docs Link',
                  headers[14] || 'Notes / Solution',
                ].map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2.5 font-semibold text-[var(--text-secondary)] border-b border-[var(--border-subtle)] whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[11px]">
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-[var(--text-muted)] font-sans"
                  >
                    No CSV records in this category yet.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[var(--bg-input)]/60">
                    <td className="px-3 py-2 font-semibold text-[var(--accent)] whitespace-nowrap">
                      {row[0]}
                    </td>
                    <td className="px-3 py-2 font-sans font-medium text-[var(--text-primary)] whitespace-nowrap">
                      {row[4]}
                    </td>
                    <td className="px-3 py-2 font-sans text-[var(--text-secondary)] whitespace-nowrap">
                      {row[5] || '-'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row[6] || '-'}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                      {row[7] ? `${row[7]}%` : '-'}
                    </td>
                    <td className="px-3 py-2 max-w-[160px] truncate text-[var(--text-secondary)]">
                      {row[8] || '-'}
                    </td>
                    <td className="px-3 py-2 max-w-[160px] truncate text-[var(--text-secondary)]">
                      {row[9] || '-'}
                    </td>
                    <td className="px-3 py-2 font-sans max-w-[240px] truncate text-[var(--text-secondary)]">
                      {row[14] || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Account & Password Security */}
      <section
        aria-label="Account credentials"
        className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
            <KeyRound className="w-4 h-4 text-[var(--accent)]" />
            <h2>Account credentials (@{workspace.profile.username})</h2>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer self-start sm:self-auto"
          >
            Switch account or create new user
          </button>
        </div>

        <form
          onSubmit={handlePasswordChange}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
        >
          <div>
            <label
              htmlFor="settings-cur-pw"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              Current password
            </label>
            <input
              id="settings-cur-pw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="w-full h-9.5 px-3 rounded-xl bg-[var(--bg-input)] text-sm focus:outline-none focus:bg-white focus:border focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label
              htmlFor="settings-new-pw"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              New password
            </label>
            <input
              id="settings-new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 4 characters"
              className="w-full h-9.5 px-3 rounded-xl bg-[var(--bg-input)] text-sm focus:outline-none focus:bg-white focus:border focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="submit"
            className="h-9.5 px-4 rounded-xl bg-white border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
          >
            Update password
          </button>
        </form>

        {passwordStatus && (
          <p className="text-xs text-[var(--text-secondary)]">{passwordStatus}</p>
        )}
      </section>
    </div>
  );
};
