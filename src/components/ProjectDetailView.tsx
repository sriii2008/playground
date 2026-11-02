import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Code2,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Layers,
  Link2,
  Paperclip,
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
import {
  calculateProjectStorageBytes,
  detectAttachmentBadge,
  formatFileSize,
  MAX_FILE_BYTES,
  MAX_PROJECT_BYTES,
  normalizeExternalUrl,
  validateUploadQuota,
} from '../utils/playgroundLogic';
import {
  deleteWorkspaceFile,
  uploadWorkspaceFile,
} from '../utils/storageClient';
import {
  resolveStoredFileUrl,
  triggerStoredFileDownload,
} from '../utils/fileVault';

interface ProjectDetailViewProps {
  username: string;
  totalUserStorageBytes: number;
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
  username,
  totalUserStorageBytes,
  project,
  onUpdateProject,
  onDeleteProject,
}) => {
  const [techInput, setTechInput] = useState('');
  const [memberNameInput, setMemberNameInput] = useState('');
  const [memberRoleInput, setMemberRoleInput] = useState('');
  const [hackStage, setHackStage] = useState<HackathonStage>('Prototype Ready');
  const [hackNote, setHackNote] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>('Auto');
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewState, setPreviewState] = useState<{
    att: ProjectAttachment;
    url: string | null;
    textPreview?: string;
    revoke: boolean;
    loading: boolean;
  } | null>(null);
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

  const projectUsedBytes = calculateProjectStorageBytes(project);
  const projectUsagePct = Math.min(
    100,
    Math.round((projectUsedBytes / MAX_PROJECT_BYTES) * 100)
  );

  const processProjectFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setUploadError('');
    setUploadSuccess('');
    setUploadingFile(true);

    let runningProjectBytes = projectUsedBytes;
    let runningUserBytes = totalUserStorageBytes;
    const newlyUploaded: ProjectAttachment[] = [];

    try {
      for (const file of files) {
        const quotaCheck = validateUploadQuota({
          fileSizeBytes: file.size,
          currentProjectBytes: runningProjectBytes,
          currentUserBytes: runningUserBytes,
        });

        if (!quotaCheck.allowed) {
          setUploadError(
            quotaCheck.error ||
              `"${file.name}" exceeds the ${formatFileSize(MAX_FILE_BYTES)} limit.`
          );
          break;
        }

        const uploaded = await uploadWorkspaceFile({
          username,
          file,
          projectId: project.id,
        });

        const badge = detectAttachmentBadge(uploaded.fileName, uploaded.mimeType);
        const category = uploadCategory === 'Auto' ? badge.defaultCategory : uploadCategory;

        newlyUploaded.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: uploaded.fileName,
          sizeBytes: uploaded.sizeBytes,
          mimeType: uploaded.mimeType,
          uploadedAt: uploaded.uploadedAt,
          category,
          storageId: uploaded.storageId,
          fileUrl: uploaded.fileUrl,
        });

        runningProjectBytes += uploaded.sizeBytes;
        runningUserBytes += uploaded.sizeBytes;
      }

      if (newlyUploaded.length > 0) {
        const namesSummary =
          newlyUploaded.length === 1
            ? `${newlyUploaded[0].name} (${formatFileSize(newlyUploaded[0].sizeBytes)})`
            : `${newlyUploaded.length} files`;
        patch(
          { attachments: [...newlyUploaded, ...project.attachments] },
          `Attached ${namesSummary} to ${project.name}`
        );
        setUploadSuccess(
          newlyUploaded.length === 1
            ? `Attached ${newlyUploaded[0].name}`
            : `Attached ${newlyUploaded.length} project files`
        );
        setTimeout(() => setUploadSuccess(''), 3000);
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Could not attach file to project.'
      );
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    await processProjectFiles(files);
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDraggingFiles(false);
    if (uploadingFile) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processProjectFiles(e.dataTransfer.files);
    }
  };

  const handleOpenPreview = async (att: ProjectAttachment) => {
    setPreviewState({ att, url: null, revoke: false, loading: true });
    const resolved = await resolveStoredFileUrl({
      storageId: att.storageId,
      fileUrl: att.fileUrl,
      dataUrl: att.dataUrl,
      username,
      fileName: att.name,
      mimeType: att.mimeType,
    });

    if (!resolved) {
      setPreviewState({ att, url: null, revoke: false, loading: false });
      return;
    }

    let textPreview: string | undefined;
    const lowerName = att.name.toLowerCase();
    const isTextLike =
      att.mimeType.startsWith('text/') ||
      /\.(md|txt|csv|json|ts|tsx|js|py|html|css|yml|yaml)$/.test(lowerName);

    if (isTextLike && resolved.blob && resolved.blob.size <= 512 * 1024) {
      try {
        textPreview = await resolved.blob.text();
      } catch {
        // ignore text decode errors
      }
    }

    setPreviewState({
      att,
      url: resolved.url,
      textPreview,
      revoke: resolved.revoke,
      loading: false,
    });
  };

  const handleClosePreview = () => {
    if (previewState?.revoke && previewState.url) {
      URL.revokeObjectURL(previewState.url);
    }
    setPreviewState(null);
  };

  const handleDownloadAttachment = async (att: ProjectAttachment) => {
    const ok = await triggerStoredFileDownload({
      storageId: att.storageId,
      fileUrl: att.fileUrl,
      dataUrl: att.dataUrl,
      username,
      fileName: att.name,
      mimeType: att.mimeType,
    });
    if (!ok) {
      setUploadError(
        `Original binary for "${att.name}" is not stored on this device yet. Re-upload the file to attach its binary.`
      );
    }
  };

  const handleRemoveAttachment = (att: ProjectAttachment) => {
    if (att.storageId) {
      deleteWorkspaceFile(username, att.storageId);
    }
    patch(
      {
        attachments: project.attachments.filter((a) => a.id !== att.id),
      },
      `Removed ${att.name} from ${project.name}`
    );
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

          {/* 4. Project documents & related files (max 50 MB per file) */}
          <section className="bg-white border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
                <Paperclip className="w-4 h-4 text-[var(--accent)]" />
                <h2>Project documents &amp; files</h2>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                {formatFileSize(projectUsedBytes)} / 150 MB
              </span>
            </div>

            <div className="w-full h-1.5 rounded-full bg-[var(--accent-soft)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${projectUsagePct}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="proj-doc-category"
                className="text-xs text-[var(--text-secondary)]"
              >
                Document type
              </label>
              <select
                id="proj-doc-category"
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="h-8 px-2.5 rounded-lg bg-[var(--bg-input)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
              >
                <option value="Auto">Auto-detect</option>
                <option value="Pitch Deck">Pitch Deck</option>
                <option value="Documentation">Documentation</option>
                <option value="Report / PDF">Report / PDF</option>
                <option value="Prototype / UI">Prototype / UI</option>
                <option value="Dataset / Code">Dataset / Code</option>
                <option value="Related File">Related File</option>
              </select>
            </div>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDraggingFiles(true);
              }}
              onDragLeave={() => setDraggingFiles(false)}
              onDrop={handleFileDrop}
              className={`w-full py-4 px-3 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1 text-center transition-colors ${
                draggingFiles
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]/60'
                  : 'border-[var(--border-subtle)] hover:border-[var(--accent)] bg-[var(--bg-canvas)] hover:bg-[var(--accent-soft)]/40'
              } ${uploadingFile ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <Upload className="w-4 h-4 text-[var(--accent)]" />
                <span>
                  {uploadingFile
                    ? 'Saving to project workspace...'
                    : 'Upload documents & related files'}
                </span>
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">
                PDF, PPT/PPTX, DOC/DOCX, Images, CSV/XLSX, MD, ZIP · max 50 MB each
              </span>
              <input
                type="file"
                multiple
                disabled={uploadingFile}
                onChange={handleFileUpload}
                aria-label="Upload project documents and related files"
                className="hidden"
              />
            </label>

            {uploadError && (
              <p role="alert" className="text-xs text-rose-600 font-medium">
                {uploadError}
              </p>
            )}

            {uploadSuccess && !uploadError && (
              <p className="text-xs text-emerald-700 font-medium inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{uploadSuccess}</span>
              </p>
            )}

            {project.attachments.length > 0 && (
              <ul className="space-y-2">
                {project.attachments.map((att) => {
                  const badge = detectAttachmentBadge(att.name, att.mimeType);
                  const categoryLabel = att.category || badge.defaultCategory;
                  return (
                    <li
                      key={att.id}
                      className="px-3 py-2.5 rounded-xl bg-[var(--bg-input)] flex items-center justify-between gap-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(att)}
                        className="min-w-0 text-left flex-1 group cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-white text-[var(--accent)] font-mono text-[10px] font-bold shrink-0">
                            {badge.ext}
                          </span>
                          <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] truncate transition-colors">
                            {att.name}
                          </p>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] tabular-nums mt-0.5 truncate">
                          {categoryLabel} · {formatFileSize(att.sizeBytes)} · {att.uploadedAt}
                        </p>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(att)}
                          aria-label={`Preview ${att.name}`}
                          title="Preview document"
                          className="p-1.5 rounded-lg hover:bg-white text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(att)}
                          aria-label={`Download ${att.name}`}
                          title="Download file"
                          className="p-1.5 rounded-lg hover:bg-white text-[var(--accent)] cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att)}
                          aria-label={`Remove attachment ${att.name}`}
                          title="Remove file"
                          className="p-1.5 rounded-lg hover:bg-white text-[var(--text-muted)] hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* In-App Document & File Preview Modal */}
      {previewState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewState.att.name}`}
          onClick={handleClosePreview}
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[86vh] bg-white border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-xl flex flex-col"
          >
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                  {previewState.att.name}
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                  {previewState.att.category ||
                    detectAttachmentBadge(previewState.att.name, previewState.att.mimeType)
                      .defaultCategory}{' '}
                  · {formatFileSize(previewState.att.sizeBytes)} · Uploaded{' '}
                  {previewState.att.uploadedAt}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewState.url && (
                  <button
                    type="button"
                    onClick={() => handleDownloadAttachment(previewState.att)}
                    className="h-8 px-3 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClosePreview}
                  aria-label="Close document preview"
                  className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1 bg-[var(--bg-canvas)]">
              {previewState.loading ? (
                <div className="h-64 flex items-center justify-center text-xs text-[var(--text-secondary)]">
                  Loading document preview...
                </div>
              ) : !previewState.url ? (
                <div className="h-64 flex flex-col items-center justify-center text-center px-6 space-y-2">
                  <FileText className="w-10 h-10 text-[var(--accent)] opacity-80" />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Metadata record ({formatFileSize(previewState.att.sizeBytes)})
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] max-w-md">
                    Re-attach this file from your device if you would like to store its full binary for live preview and download.
                  </p>
                </div>
              ) : previewState.att.mimeType.startsWith('image/') ||
                /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(previewState.att.name) ? (
                <div className="flex items-center justify-center">
                  <img
                    src={previewState.url}
                    alt={previewState.att.name}
                    className="max-h-[65vh] rounded-xl object-contain"
                  />
                </div>
              ) : previewState.att.mimeType === 'application/pdf' ||
                /\.pdf$/i.test(previewState.att.name) ? (
                <iframe
                  src={previewState.url}
                  title={previewState.att.name}
                  className="w-full h-[65vh] rounded-xl border border-[var(--border-subtle)] bg-white"
                />
              ) : previewState.textPreview !== undefined ? (
                <pre className="p-4 rounded-xl bg-white border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap overflow-x-auto max-h-[65vh]">
                  {previewState.textPreview}
                </pre>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center px-6 space-y-3">
                  <FileText className="w-10 h-10 text-[var(--accent)]" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {previewState.att.name}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Ready to download ({formatFileSize(previewState.att.sizeBytes)})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadAttachment(previewState.att)}
                    className="h-9 px-4 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download {previewState.att.name}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
