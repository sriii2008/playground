import React, { useState } from 'react';
import {
  ExternalLink,
  FileText,
  FolderPlus,
  Github,
  Layers,
  Plus,
  Trophy,
} from 'lucide-react';
import { ProjectItem, ProjectStatus } from '../types';
import { normalizeExternalUrl } from '../utils/playgroundLogic';

interface ProjectsViewProps {
  projects: ProjectItem[];
  onOpenProject: (project: ProjectItem) => void;
  onCreateProject: (draft?: { name: string; domain: string; status: ProjectStatus }) => void;
}

const STATUS_BADGE_STYLES: Record<ProjectStatus, string> = {
  Published: 'bg-[#ede9fe] text-[#6d28d9]',
  Ongoing: 'bg-[#fef3c7] text-[#b45309]',
  Completed: 'bg-[#d1fae5] text-[#047857]',
  Planned: 'bg-[#f1f5f9] text-[#475569]',
};

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  onOpenProject,
  onCreateProject,
}) => {
  const [statusFilter, setStatusFilter] = useState<'All' | ProjectStatus>('All');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newStatus, setNewStatus] = useState<ProjectStatus>('Planned');

  const filteredProjects =
    statusFilter === 'All'
      ? projects
      : projects.filter((p) => p.status === statusFilter);

  const handleQuickCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateProject({
      name: trimmed,
      domain: newDomain.trim() || 'General',
      status: newStatus,
    });
    setNewName('');
    setNewDomain('');
    setNewStatus('Planned');
    setShowQuickCreate(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">
            Projects
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5 tabular-nums">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'} in your workspace
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowQuickCreate((v) => !v)}
            className="h-10 px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New project</span>
          </button>
        </div>
      </div>

      {/* Quick Create Project Drawer */}
      {showQuickCreate && (
        <form
          onSubmit={handleQuickCreateSubmit}
          className="bg-white border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-[var(--accent)]" />
              <span>Create new project file (.proj)</span>
            </h2>
            <button
              type="button"
              onClick={() => setShowQuickCreate(false)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="new-proj-name"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Project name
              </label>
              <input
                id="new-proj-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Neural Notes"
                className="w-full h-9.5 px-3 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="new-proj-domain"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Domain
              </label>
              <input
                id="new-proj-domain"
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. AI/ML, FinTech, HealthTech"
                className="w-full h-9.5 px-3 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="new-proj-status"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Initial status
              </label>
              <select
                id="new-proj-status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as ProjectStatus)}
                className="w-full h-9.5 px-3 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm focus:outline-none"
              >
                <option value="Planned">Planned</option>
                <option value="Ongoing">Ongoing</option>
                <option value="Completed">Completed</option>
                <option value="Published">Published</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold cursor-pointer"
            >
              Create & open .proj
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      {projects.length > 0 && (
        <div
          role="group"
          aria-label="Filter projects by status"
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[var(--bg-chrome)] border border-[var(--border-subtle)]"
        >
          {(['All', 'Planned', 'Ongoing', 'Completed', 'Published'] as const).map(
            (st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-[var(--text-primary)] shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {st}
              </button>
            )
          )}
        </div>
      )}

      {/* 2-Column Project Cards Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white border border-[var(--border-subtle)] rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {projects.length === 0
              ? 'No projects in your workspace yet'
              : `No ${statusFilter.toLowerCase()} projects found`}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4">
            Create a project to track problem statements, prototype links, documentation, and hackathon milestones.
          </p>
          <button
            type="button"
            onClick={() => setShowQuickCreate(true)}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
          >
            + New project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredProjects.map((proj) => {
            const latestUpdate = proj.hackathonUpdates[0];
            return (
              <article
                key={proj.id}
                className="bg-white border border-[var(--border-subtle)] hover:border-[var(--accent)] rounded-2xl p-6 transition-colors flex flex-col justify-between gap-4"
              >
                <div>
                  {/* Title + Status Pill */}
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenProject(proj)}
                      className="text-left text-[17px] font-bold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                    >
                      {proj.name}
                    </button>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                        STATUS_BADGE_STYLES[proj.status]
                      }`}
                    >
                      {proj.status}
                    </span>
                  </div>

                  {/* Problem statement */}
                  <p className="text-[13px] text-[var(--text-secondary)] mt-2 line-clamp-2 min-h-[2.25rem]">
                    {proj.problemStatement || proj.purpose || 'Click to add problem statement and project overview.'}
                  </p>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="w-full h-2 rounded-full bg-[var(--accent-soft)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                        style={{ width: `${Math.max(0, Math.min(100, proj.progress))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mt-2 tabular-nums">
                      <span>{proj.domain || 'General'}</span>
                      <span>{proj.progress}%</span>
                    </div>
                  </div>
                </div>

                {/* Tech Stack + Prototype/Docs Quick Links */}
                <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {proj.techStack.length > 0 ? (
                      proj.techStack.map((tech) => (
                        <span
                          key={tech}
                          className="px-2.5 py-1 rounded-md bg-[var(--accent-soft)] text-[var(--text-primary)] text-[11px] font-mono"
                        >
                          {tech}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-[var(--text-muted)]">
                        No tech stack added
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {proj.prototypeLink && (
                      <a
                        href={normalizeExternalUrl(proj.prototypeLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open Prototype"
                        aria-label={`Open ${proj.name} prototype`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <Layers className="w-3 h-3 text-[var(--accent)]" />
                        <span>Proto</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                      </a>
                    )}
                    {proj.documentationLink && (
                      <a
                        href={normalizeExternalUrl(proj.documentationLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open Documentation"
                        aria-label={`Open ${proj.name} documentation`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <FileText className="w-3 h-3 text-[var(--accent)]" />
                        <span>Docs</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                      </a>
                    )}
                    {proj.githubLink && (
                      <a
                        href={normalizeExternalUrl(proj.githubLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open GitHub Repository"
                        aria-label={`Open ${proj.name} GitHub repository`}
                        className="p-1.5 rounded-md bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <Github className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Subtle Hackathon Footer Line if active */}
                {(proj.hackathonName || latestUpdate) && (
                  <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <Trophy className="w-3 h-3 text-[var(--accent)] shrink-0" />
                      <span className="font-medium text-[var(--text-primary)] truncate">
                        {proj.hackathonName || latestUpdate?.hackathonName}
                      </span>
                      {latestUpdate && (
                        <>
                          <span>·</span>
                          <span className="truncate">{latestUpdate.stage}</span>
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenProject(proj)}
                      className="text-[var(--accent)] font-medium hover:underline shrink-0 cursor-pointer"
                    >
                      Open .proj
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
