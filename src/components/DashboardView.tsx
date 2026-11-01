import React, { useState } from 'react';
import {
  Bell,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Folder,
  Layers,
  Plus,
  Trash2,
  Trophy,
} from 'lucide-react';
import { ProjectItem, ReminderItem, TabId } from '../types';
import { computeDashboardMetrics, normalizeExternalUrl } from '../utils/playgroundLogic';

interface DashboardViewProps {
  displayName: string;
  projects: ProjectItem[];
  reminders: ReminderItem[];
  onAddReminder: (text: string, projectId?: string) => void;
  onToggleReminder: (reminderId: string) => void;
  onDeleteReminder: (reminderId: string) => void;
  onOpenProject: (project: ProjectItem) => void;
  onNavigateTab: (tab: TabId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  displayName,
  projects,
  reminders,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
  onOpenProject,
  onNavigateTab,
}) => {
  const [reminderInput, setReminderInput] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id || ''
  );
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);
  const [hoveredScoreIdx, setHoveredScoreIdx] = useState<number | null>(null);

  const metrics = computeDashboardMetrics(projects, reminders);
  const maxMonthlyCount = Math.max(
    2,
    ...metrics.monthlyCompleted.map((m) => m.count)
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reminderInput.trim();
    if (!trimmed) return;
    onAddReminder(trimmed, selectedProjectId || undefined);
    setReminderInput('');
  };

  // SVG coordinates for Productivity insights chart (Jan..Aug)
  const svgWidth = 420;
  const svgHeight = 148;
  const padX = 24;
  const padTop = 18;
  const padBottom = 26;
  const plotW = svgWidth - padX * 2;
  const plotH = svgHeight - padTop - padBottom;

  const points = metrics.productivitySeries.map((pt, idx) => {
    const x = padX + (idx / (metrics.productivitySeries.length - 1)) * plotW;
    const y = padTop + plotH - (pt.score / 100) * plotH;
    return { ...pt, x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(
    padTop + plotH
  ).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  // Gather recent hackathon updates across projects
  const recentHackathonItems = projects.flatMap((p) =>
    p.hackathonUpdates.map((u) => ({
      ...u,
      project: p,
    }))
  );

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-[26px] md:text-[28px] font-bold tracking-tight text-[var(--text-primary)]">
          Good to see you, {displayName}
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Here is how your projects are moving this month.
        </p>
      </div>

      {/* 4 KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigateTab('projects/')}
          className="bg-white border border-[var(--border-subtle)] hover:border-[var(--accent)] rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-4">
            <Folder className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {metrics.totalProjects}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Total projects
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('projects/')}
          className="bg-white border border-[var(--border-subtle)] hover:border-[var(--accent)] rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-4">
            <Check className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {metrics.completedProjects}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Completed
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('projects/')}
          className="bg-white border border-[var(--border-subtle)] hover:border-[var(--accent)] rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-4">
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {metrics.ongoingProjects}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Ongoing
          </div>
        </button>

        <a
          href="#todo-reminders"
          className="bg-white border border-[var(--border-subtle)] hover:border-[var(--accent)] rounded-2xl p-5 text-left transition-colors block"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-4">
            <Bell className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {metrics.openReminders}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Open reminders
          </div>
        </a>
      </div>

      {/* Charts Row: Monthly tracker + Productivity insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monthly tracker */}
        <section
          aria-label="Monthly tracker"
          className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col justify-between"
        >
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Monthly tracker
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Projects completed per month
              </p>
            </div>
            {hoveredMonthIdx !== null && (
              <span className="text-xs font-mono tabular-nums text-[var(--accent)] font-medium">
                {metrics.monthlyCompleted[hoveredMonthIdx].month}:{' '}
                {metrics.monthlyCompleted[hoveredMonthIdx].count} completed
              </span>
            )}
          </div>

          <div className="h-40 flex items-end justify-between gap-3 pt-4 px-2">
            {metrics.monthlyCompleted.map((item, idx) => {
              const barPct =
                item.count === 0
                  ? 8
                  : Math.max(22, Math.round((item.count / maxMonthlyCount) * 100));
              return (
                <div
                  key={item.month}
                  onMouseEnter={() => setHoveredMonthIdx(idx)}
                  onMouseLeave={() => setHoveredMonthIdx(null)}
                  className="flex-1 flex flex-col items-center gap-2 h-full justify-end group"
                >
                  <div className="w-full flex-1 flex items-end justify-center">
                    <div
                      className={`w-full max-w-[26px] rounded-t-lg transition-all duration-200 ${
                        item.count > 0
                          ? 'bg-[var(--accent)] group-hover:opacity-90'
                          : 'bg-[var(--accent-soft)]'
                      }`}
                      style={{ height: `${barPct}%` }}
                      title={`${item.month}: ${item.count} completed`}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                    {item.month}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Productivity insights */}
        <section
          aria-label="Productivity insights"
          className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col justify-between"
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Productivity insights
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Score over the past months
              </p>
            </div>
            {hoveredScoreIdx !== null && (
              <span className="text-xs font-mono tabular-nums text-[var(--accent)] font-medium">
                {points[hoveredScoreIdx].month}: {points[hoveredScoreIdx].score} pts
              </span>
            )}
          </div>

          <div className="w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-40 overflow-visible"
              role="img"
              aria-label="Monthly productivity score line graph"
            >
              <defs>
                <linearGradient id="playgroundAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Subtle horizontal grid lines */}
              {[0.2, 0.5, 0.8].map((ratio) => {
                const gy = padTop + plotH * ratio;
                return (
                  <line
                    key={ratio}
                    x1={padX}
                    x2={svgWidth - padX}
                    y1={gy}
                    y2={gy}
                    stroke="var(--border-subtle)"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Area + Line */}
              <path d={areaPath} fill="url(#playgroundAreaGrad)" />
              <path
                d={linePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Nodes & Labels */}
              {points.map((pt, idx) => (
                <g
                  key={pt.month}
                  onMouseEnter={() => setHoveredScoreIdx(idx)}
                  onMouseLeave={() => setHoveredScoreIdx(null)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredScoreIdx === idx ? 5 : 3.8}
                    fill="#ffffff"
                    stroke="var(--accent)"
                    strokeWidth="2.2"
                  />
                  <text
                    x={pt.x}
                    y={svgHeight - 6}
                    textAnchor="middle"
                    fontSize="10.5"
                    fill="var(--text-secondary)"
                  >
                    {pt.month}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </section>
      </div>

      {/* To-do reminders */}
      <section
        id="todo-reminders"
        aria-label="To-do reminders"
        className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-4">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            To-do reminders
          </h2>
          <span className="text-xs text-[var(--text-secondary)]">
            Complete the project, one step at a time
          </span>
        </div>

        <form onSubmit={handleAddSubmit} className="flex flex-col sm:flex-row gap-2.5 mb-4">
          <input
            type="text"
            value={reminderInput}
            onChange={(e) => setReminderInput(e.target.value)}
            placeholder="Add a reminder..."
            aria-label="Add a reminder"
            className="flex-1 h-10 px-4 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
          />
          {projects.length > 0 && (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="Link reminder to project"
              className="h-10 px-3 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-xs font-medium text-[var(--text-secondary)] focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="">General</option>
            </select>
          )}
          <button
            type="submit"
            className="h-10 px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        </form>

        {reminders.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-4 text-center">
            No reminders yet. Add your next milestone step above.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {reminders.map((rem) => {
              const linkedProject = projects.find((p) => p.id === rem.projectId);
              return (
                <li
                  key={rem.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={rem.completed}
                      aria-label={`Mark "${rem.text}" as ${
                        rem.completed ? 'incomplete' : 'complete'
                      }`}
                      onClick={() => onToggleReminder(rem.id)}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        rem.completed
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                          : 'bg-white border-[var(--border-subtle)] hover:border-[var(--accent)]'
                      }`}
                    >
                      {rem.completed && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    </button>
                    <span
                      className={`text-sm truncate ${
                        rem.completed
                          ? 'line-through text-[var(--text-muted)]'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {rem.text}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {rem.projectName && (
                      <button
                        type="button"
                        onClick={() => {
                          if (linkedProject) onOpenProject(linkedProject);
                        }}
                        className="px-2.5 py-1 rounded-md bg-[var(--accent-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] font-mono transition-colors cursor-pointer"
                      >
                        {rem.projectName}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteReminder(rem.id)}
                      aria-label={`Delete reminder "${rem.text}"`}
                      className="p-1 text-[var(--text-muted)] hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Hackathon Updates & Prototype / Docs Quick Hub */}
      <section
        aria-label="Hackathon updates and prototype links"
        className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
              Hackathon updates & prototype links
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('projects/')}
            className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer self-start sm:self-auto"
          >
            View all projects
          </button>
        </div>

        {recentHackathonItems.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-3">
            Open any project file (.proj) to log hackathon updates, prototype URLs, and documentation links.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {recentHackathonItems.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="py-3.5 first:pt-1 last:pb-1 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onOpenProject(item.project)}
                      className="font-semibold text-sm text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                    >
                      {item.project.name}
                    </button>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="font-medium text-[var(--accent)]">
                      {item.hackathonName}
                    </span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="text-[var(--text-secondary)]">
                      {item.stage} ({item.date})
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {item.note}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.project.prototypeLink && (
                    <a
                      href={normalizeExternalUrl(item.project.prototypeLink)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap"
                    >
                      <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Prototype</span>
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </a>
                  )}
                  {item.project.documentationLink && (
                    <a
                      href={normalizeExternalUrl(item.project.documentationLink)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap"
                    >
                      <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Docs</span>
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
