import React, { useState } from 'react';
import {
  Bell,
  Code2,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Link2,
  Plus,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  HackathonStage,
  ProjectAttachment,
  ProjectItem,
  ProjectStatus,
} from '../types';
import { formatFileSize, normalizeExternalUrl } from '../utils/playgroundLogic';

interface ProjectDetailViewProps {
  project: ProjectItem;
  onUpdateProject: (updated: ProjectItem, logMessage?: string) => void;
  onDeleteProject: (projectId: string) => void;
}

const ALL_STATUSES: ProjectStatus[] = ['Planned', 'Ongoing', 'Completed', 'Published'];
const HACKATHON_STAGES: HackathonStage[] = [
  'Idea',
  'Prototype Ready',
  'Submitted',
  'Finalist',
  'Winner',
];

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
  project,
  onUpdateProject,
  onDeleteProject,
}) => {
  const [techInput, setTechInput] = useState('');
  const [memberNameInput, setMemberNameInput] = useState('');
  const [memberRoleInput, setMemberRoleInput] = useState('');
  const [hackStage, setHackStage] = useState<HackathonStage>('Prototype Ready');
  const [hackNote, setHackNote] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = (fields: Partial<ProjectItem>, logMsg?: string) => {
    onUpdateProject(
      {
        ...project,
        ...fields,
        updatedAt: new Date().toISOString(),
      },
      logMsg
    );
  };

  const handleStatusSelect = (status: ProjectStatus) => {
    let nextProgress = project.progress;
    let completedMonth = project.completedMonth;
    if (status === 'Completed' || status === 'Published') {
      if (nextProgress < 100) nextProgress = 100;
      if (typeof completedMonth !== 'number') {
        completedMonth = Math.min(7, new Date().getMonth());
      }
    } else if (status === 'Planned' && nextProgress === 100) {
      nextProgress = 10;
    }
    patch(
      { status, progress: nextProgress, completedMonth },
      `Updated ${project.name} status to ${status} (${nextProgress}%)`
    );
  };

  const handleTechKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = techInput.trim().replace(/,$/, '');
      if (!val) return;
      if (!project.techStack.some((t) => t.toLowerCase() === val.toLowerCase())) {
        patch(
          { techStack: [...project.techStack, val] },
          `Added ${val} to ${project.name} tech stack`
        );
      }
      setTechInput('');
    }
  };

  const handleRemoveTech = (tech: string) => {
    patch({ techStack: project.techStack.filter((t) => t !== tech) });
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = memberNameInput.trim();
    if (!trimmed) return;
    const role = memberRoleInput.trim() || (project.teamMembers.length === 0 ? 'Solo' : 'Member');
    patch(
      {
        teamMembers: [
          ...project.teamMembers,
          { id: `tm-${Date.now()}`, name: trimmed, role },
        ],
      },
      `Added team member ${trimmed} to ${project.name}`
    );
    setMemberNameInput('');
    setMemberRoleInput('');
  };

  const handleRemoveMember = (id: string) => {
    patch({
      teamMembers: project.teamMembers.filter((m) => m.id !== id),
    });
  };

  const handleAddHackathonUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = hackNote.trim();
    if (!trimmed) return;
    const eventName = project.hackathonName.trim() || 'Hackathon Sprint';
    const newUpdate = {
      id: `hu-${Date.now()}`,
      hackathonName: eventName,
      stage: hackStage,
      note: trimmed,
      date: new Date().toISOString().slice(0, 10),
    };
    patch(
      {
        hackathonName: eventName,
        hackathonUpdates: [newUpdate, ...project.hackathonUpdates],
      },
      `Hackathon update on ${project.name} (${hackStage}): ${trimmed}`
    );
    setHackNote('');
  };

  const handleRemoveHackathonUpdate = (updateId: string) => {
    patch({
      hackathonUpdates: project.hackathonUpdates.filter((u) => u.id !== updateId),
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const maxBytes = 50 * 1024 * 1024; // 50 MB
    if (file.size > maxBytes) {
      setUploadError('File exceeds the 50 MB maximum limit.');
      e.target.value = '';
      return;
    }

    const storeAttachment = (dataUrl?: string) => {
      const att: ProjectAttachment = {
        id: `att-${Date.now()}`,
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString().slice(0, 10),
        dataUrl,
      };
      patch(
        { attachments: [...project.attachments, att] },
        `Uploaded ${file.name} (${formatFileSize(file.size)}) to ${project.name}`
      );
    };

    // Keep base64 payload in-browser if <= 4 MB; store full metadata for larger up to 50 MB
    if (file.size <= 4 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = () => {
        storeAttachment(typeof reader.result === 'string' ? reader.result : undefined);
      };
      reader.readAsDataURL(file);
    } else {
      storeAttachment(undefined);
    }
    e.target.value = '';
  };

  const sliderBg = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${project.progress}%, var(--accent-soft) ${project.progress}%, var(--accent-soft) 100%)`;

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">
            {project.name || 'Untitled Project'}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Domain: {project.domain || 'General'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {project.prototypeLink && (
            <a
              href={normalizeExternalUrl(project.prototypeLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9.5 px-3.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-90 text-xs font-semibold inline-flex items-center gap-1.5 transition-opacity whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Open Prototype</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {project.documentationLink && (
            <a
              href={normalizeExternalUrl(project.documentationLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9.5 px-3.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-90 text-xs font-semibold inline-flex items-center gap-1.5 transition-opacity whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Open Docs</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-9.5 px-3.5 rounded-xl bg-white border border-[var(--border-subtle)] hover:border-rose-300 hover:text-rose-600 text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1">
              <span className="text-xs text-rose-700 font-medium">Delete project?</span>
              <button
                type="button"
                onClick={() => onDeleteProject(project.id)}
                className="px-2 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded-lg text-xs text-[var(--text-secondary)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2-Column Asymmetric Inspector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Overview */}
          <section className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <Code2 className="w-4 h-4 text-[var(--accent)]" />
              <h2>Overview</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="proj-name-input"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Project name
                </label>
                <input
                  id="proj-name-input"
                  type="text"
                  value={project.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="proj-domain-input"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Domain
                </label>
                <input
                  id="proj-domain-input"
                  type="text"
                  value={project.domain}
                  onChange={(e) => patch({ domain: e.target.value })}
                  placeholder="e.g. FinTech, AgriTech, AI"
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="proj-purpose-input"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Purpose of building
              </label>
              <textarea
                id="proj-purpose-input"
                rows={3}
                value={project.purpose}
                onChange={(e) => patch({ purpose: e.target.value })}
                placeholder="Why are you building this project?"
                className="w-full p-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none transition-colors resize-y"
              />
            </div>
          </section>

          {/* 2. Problem and solution */}
          <section className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <Bell className="w-4 h-4 text-[var(--accent)]" />
              <h2>Problem and solution</h2>
            </div>

            <div>
              <label
                htmlFor="proj-problem-input"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Problem statement
              </label>
              <textarea
                id="proj-problem-input"
                rows={3}
                value={project.problemStatement}
                onChange={(e) => patch({ problemStatement: e.target.value })}
                placeholder="Describe the core user pain point..."
                className="w-full p-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none transition-colors resize-y"
              />
            </div>

            <div>
              <label
                htmlFor="proj-solution-input"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Our solution
              </label>
              <textarea
                id="proj-solution-input"
                rows={3}
                value={project.solution}
                onChange={(e) => patch({ solution: e.target.value })}
                placeholder="How does your architecture solve it?"
                className="w-full p-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none transition-colors resize-y"
              />
            </div>
          </section>

          {/* 3. Hackathon updates */}
          <section className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
                <Trophy className="w-4 h-4 text-[var(--accent)]" />
                <h2>Hackathon updates</h2>
              </div>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                {project.hackathonUpdates.length}{' '}
                {project.hackathonUpdates.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="proj-hackathon-name"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Hackathon / Event name
                </label>
                <input
                  id="proj-hackathon-name"
                  type="text"
                  value={project.hackathonName}
                  onChange={(e) => patch({ hackathonName: e.target.value })}
                  placeholder="e.g. Smart India Hackathon, DevFest"
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="proj-hackathon-deadline"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Submission deadline
                </label>
                <input
                  id="proj-hackathon-deadline"
                  type="date"
                  value={project.hackathonDeadline}
                  onChange={(e) => patch({ hackathonDeadline: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                />
              </div>
            </div>

            <form onSubmit={handleAddHackathonUpdate} className="space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  aria-label="Hackathon stage"
                  value={hackStage}
                  onChange={(e) => setHackStage(e.target.value as HackathonStage)}
                  className="h-10 px-3 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-xs font-medium text-[var(--text-primary)] focus:outline-none"
                >
                  {HACKATHON_STAGES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={hackNote}
                  onChange={(e) => setHackNote(e.target.value)}
                  placeholder="Log round progress, mentor feedback, or demo link status..."
                  aria-label="Hackathon update note"
                  className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                />
                <button
                  type="submit"
                  className="h-10 px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Post</span>
                </button>
              </div>
            </form>

            {project.hackathonUpdates.length > 0 && (
              <div className="space-y-2 pt-1">
                {project.hackathonUpdates.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 rounded-xl bg-[var(--bg-input)] flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-semibold text-[var(--accent)]">
                          {u.stage}
                        </span>
                        <span className="text-[var(--text-muted)]">·</span>
                        <span className="text-[var(--text-secondary)] tabular-nums">
                          {u.date}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-primary)] mt-1">
                        {u.note}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveHackathonUpdate(u.id)}
                      aria-label={`Remove hackathon update "${u.note}"`}
                      className="p-1 text-[var(--text-muted)] hover:text-rose-600 cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 4. Team */}
          <section className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
                <Users className="w-4 h-4 text-[var(--accent)]" />
                <h2>Team</h2>
              </div>
              <input
                type="text"
                value={project.teamName}
                onChange={(e) => patch({ teamName: e.target.value })}
                aria-label="Team name"
                placeholder="Team name (e.g. Solo)"
                className="h-8 px-2.5 w-40 rounded-lg bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-xs text-right text-[var(--text-secondary)] focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              {project.teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold flex items-center justify-center shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {member.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-xs text-[var(--text-secondary)]">
                      {member.role}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                      aria-label={`Remove team member ${member.name}`}
                      className="p-0.5 text-[var(--text-muted)] hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={memberNameInput}
                onChange={(e) => setMemberNameInput(e.target.value)}
                placeholder="Add team member"
                aria-label="Team member name"
                className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
              />
              <input
                type="text"
                value={memberRoleInput}
                onChange={(e) => setMemberRoleInput(e.target.value)}
                placeholder="Role / email (optional)"
                aria-label="Team member role or details"
                className="sm:w-40 h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-xs text-[var(--text-primary)] focus:outline-none"
              />
              <button
                type="submit"
                className="h-10 px-4 rounded-xl bg-white border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>
          </section>
        </div>

        {/* RIGHT COLUMN (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Status & Progress */}
          <section className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
              <h2>Status</h2>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {ALL_STATUSES.map((st) => {
                const active = project.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusSelect(st)}
                    className={`h-9.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-white border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between text-xs mb-2 tabular-nums">
                <label
                  htmlFor="proj-progress-slider"
                  className="text-[var(--text-secondary)] font-medium"
                >
                  Progress
                </label>
                <span className="font-bold text-[var(--text-primary)]">
                  {project.progress}%
                </span>
              </div>
              <input
                id="proj-progress-slider"
                type="range"
                min={0}
                max={100}
                value={project.progress}
                onChange={(e) => patch({ progress: Number(e.target.value) })}
                style={{ background: sliderBg }}
                className="w-full playground-slider"
              />
            </div>
          </section>

          {/* 2. Links (GitHub, Prototype, Documentation) */}
          <section className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <Link2 className="w-4 h-4 text-[var(--accent)]" />
              <h2>Links</h2>
            </div>

            <div>
              <label
                htmlFor="proj-github-link"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                GitHub
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="proj-github-link"
                  type="text"
                  value={project.githubLink}
                  onChange={(e) => patch({ githubLink: e.target.value })}
                  placeholder="github.com/..."
                  className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                />
                {project.githubLink && (
                  <a
                    href={normalizeExternalUrl(project.githubLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open GitHub link"
                    className="h-10 w-10 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="proj-prototype-link"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Prototype
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="proj-prototype-link"
                  type="text"
                  value={project.prototypeLink}
                  onChange={(e) => patch({ prototypeLink: e.target.value })}
                  placeholder="figma.com/... or live demo URL"
                  className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                />
                {project.prototypeLink && (
                  <a
                    href={normalizeExternalUrl(project.prototypeLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open Prototype link"
                    className="h-10 w-10 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="proj-docs-link"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Documentation
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="proj-docs-link"
                  type="text"
                  value={project.documentationLink}
                  onChange={(e) => patch({ documentationLink: e.target.value })}
                  placeholder="docs.google.com/... or notion.so/..."
                  className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                />
                {project.documentationLink && (
                  <a
                    href={normalizeExternalUrl(project.documentationLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open Documentation link"
                    className="h-10 w-10 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </section>

          {/* 3. Tech stack */}
          <section className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <Code2 className="w-4 h-4 text-[var(--accent)]" />
              <h2>Tech stack</h2>
            </div>

            {project.techStack.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {project.techStack.map((tech) => (
                  <span
                    key={tech}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--text-primary)] text-xs font-mono"
                  >
                    <span>{tech}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTech(tech)}
                      aria-label={`Remove ${tech} from tech stack`}
                      className="text-[var(--text-secondary)] hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <input
              type="text"
              value={techInput}
              onChange={(e) => setTechInput(e.target.value)}
              onKeyDown={handleTechKeyDown}
              aria-label="Add an app or tool to tech stack"
              placeholder="Add an app or tool, press Enter"
              className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
            />
          </section>

          {/* 4. PDF / PPT (max 50 MB) */}
          <section className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <FileText className="w-4 h-4 text-[var(--accent)]" />
              <h2>PDF / PPT (max 50 MB)</h2>
            </div>

            <label className="w-full h-12 rounded-xl border border-dashed border-[var(--border-subtle)] hover:border-[var(--accent)] bg-[var(--bg-canvas)] hover:bg-[var(--accent-soft)]/40 flex items-center justify-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
              <Upload className="w-4 h-4 text-[var(--accent)]" />
              <span>Upload file</span>
              <input
                type="file"
                accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {uploadError && (
              <p role="alert" className="text-xs text-rose-600">
                {uploadError}
              </p>
            )}

            {project.attachments.length > 0 && (
              <ul className="space-y-2">
                {project.attachments.map((att) => (
                  <li
                    key={att.id}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-input)] flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text-primary)] truncate">
                        {att.name}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        {formatFileSize(att.sizeBytes)} · {att.uploadedAt}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {att.dataUrl && (
                        <a
                          href={att.dataUrl}
                          download={att.name}
                          aria-label={`Download ${att.name}`}
                          className="p-1.5 rounded-lg hover:bg-white text-[var(--accent)]"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          patch({
                            attachments: project.attachments.filter(
                              (a) => a.id !== att.id
                            ),
                          })
                        }
                        aria-label={`Remove attachment ${att.name}`}
                        className="p-1.5 rounded-lg hover:bg-white text-[var(--text-muted)] hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
