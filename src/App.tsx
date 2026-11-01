/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import {
  CertificateItem,
  HistoryLogEntry,
  OpenTab,
  PastelThemeId,
  ProjectItem,
  ProjectStatus,
  TabId,
  UserProfile,
  UserWorkspaceData,
} from './types';
import { createDemoWonderWorkspace } from './data/seedData';
import { slugifyProjectName } from './utils/playgroundLogic';
import {
  getSavedSessionUsername,
  loadUserWorkspace,
  saveUserWorkspace,
  setSavedSessionUsername,
} from './utils/storageClient';
import { AuthScreen } from './components/AuthScreen';
import { IdeShell } from './components/IdeShell';
import { DashboardView } from './components/DashboardView';
import { ProjectsView } from './components/ProjectsView';
import { ProjectDetailView } from './components/ProjectDetailView';
import { CertificatesView } from './components/CertificatesView';
import { ProfileView } from './components/ProfileView';
import { SettingsView } from './components/SettingsView';

const DEFAULT_TABS: OpenTab[] = [
  { id: 'dashboard.md', label: 'dashboard.md', kind: 'dashboard' },
];

export default function App() {
  const [activeUsername, setActiveUsername] = useState<string | null>(() =>
    getSavedSessionUsername()
  );
  const [workspace, setWorkspace] = useState<UserWorkspaceData>(() =>
    createDemoWonderWorkspace()
  );
  const [loadingWorkspace, setLoadingWorkspace] = useState<boolean>(true);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>(DEFAULT_TABS);
  const [activeTabId, setActiveTabId] = useState<TabId>('dashboard.md');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePreviewCert, setActivePreviewCert] =
    useState<CertificateItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeUsername) {
      setLoadingWorkspace(false);
      return;
    }
    setLoadingWorkspace(true);
    loadUserWorkspace(activeUsername)
      .then((ws) => {
        if (!cancelled) {
          setWorkspace(ws);
          setLoadingWorkspace(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingWorkspace(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeUsername]);

  const commitWorkspace = useCallback(
    (
      updater: (prev: UserWorkspaceData) => UserWorkspaceData,
      logItem?: {
        action: string;
        category: HistoryLogEntry['category'];
        details: string;
      }
    ) => {
      setWorkspace((prev) => {
        const next = updater(prev);
        const withLog: UserWorkspaceData = logItem
          ? {
              ...next,
              historyLog: [
                {
                  id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
                  action: logItem.action,
                  category: logItem.category,
                  details: logItem.details,
                },
                ...next.historyLog.slice(0, 99),
              ],
            }
          : next;

        if (activeUsername) {
          saveUserWorkspace(activeUsername, withLog);
        }
        return withLog;
      });
    },
    [activeUsername]
  );

  const ensureTabOpen = useCallback((tab: OpenTab) => {
    setOpenTabs((prev) => {
      const exists = prev.some((t) => t.id === tab.id);
      if (exists) {
        return prev.map((t) => (t.id === tab.id ? tab : t));
      }
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
  }, []);

  const handleSelectSectionTab = useCallback(
    (tabId: TabId) => {
      const metaMap: Record<string, OpenTab> = {
        'dashboard.md': { id: 'dashboard.md', label: 'dashboard.md', kind: 'dashboard' },
        'projects/': { id: 'projects/', label: 'projects/', kind: 'projects' },
        'certificates/': {
          id: 'certificates/',
          label: 'certificates/',
          kind: 'certificates',
        },
        'profile.json': { id: 'profile.json', label: 'profile.json', kind: 'profile' },
        'settings.csv': { id: 'settings.csv', label: 'settings.csv', kind: 'settings' },
      };

      if (metaMap[tabId]) {
        ensureTabOpen(metaMap[tabId]);
      } else {
        setActiveTabId(tabId);
      }
    },
    [ensureTabOpen]
  );

  const handleOpenProject = useCallback(
    (project: ProjectItem) => {
      const tabId: TabId = `project:${project.id}`;
      ensureTabOpen({
        id: tabId,
        label: `${project.slug}.proj`,
        kind: 'project',
        projectId: project.id,
      });
    },
    [ensureTabOpen]
  );

  const handleCloseTab = useCallback(
    (tabId: TabId) => {
      setOpenTabs((prev) => {
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((t) => t.id === tabId);
        const filtered = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId && filtered.length > 0) {
          const fallback = filtered[Math.max(0, idx - 1)];
          setActiveTabId(fallback.id);
        }
        return filtered;
      });
    },
    [activeTabId]
  );

  const handleCreateProject = useCallback(
    (draft?: { name: string; domain: string; status: ProjectStatus }) => {
      const baseName = draft?.name || 'Untitled Project';
      const existingSlugs = workspace.projects.map((p) => p.slug);
      const slug = slugifyProjectName(baseName, existingSlugs);
      const status = draft?.status || 'Planned';
      const initialProgress =
        status === 'Completed' || status === 'Published'
          ? 100
          : status === 'Ongoing'
          ? 25
          : 0;

      const newProj: ProjectItem = {
        id: `proj-${Date.now()}`,
        slug,
        name: baseName,
        domain: draft?.domain || 'General',
        purpose: '',
        status,
        progress: initialProgress,
        problemStatement: '',
        solution: '',
        githubLink: '',
        prototypeLink: '',
        documentationLink: '',
        techStack: [],
        teamName: 'Solo',
        teamMembers: [
          {
            id: `tm-${Date.now()}`,
            name: workspace.profile.fullName || workspace.profile.username || 'You',
            role: 'Solo',
          },
        ],
        attachments: [],
        hackathonName: '',
        hackathonDeadline: '',
        hackathonUpdates: [],
        completedMonth:
          status === 'Completed' || status === 'Published'
            ? Math.min(7, new Date().getMonth())
            : undefined,
        updatedAt: new Date().toISOString(),
      };

      commitWorkspace(
        (prev) => ({
          ...prev,
          projects: [newProj, ...prev.projects],
        }),
        {
          action: 'Created Project',
          category: 'Project',
          details: `Created ${newProj.name} (${newProj.domain})`,
        }
      );

      handleOpenProject(newProj);
    },
    [workspace.projects, workspace.profile, commitWorkspace, handleOpenProject]
  );

  const handleUpdateProject = useCallback(
    (updated: ProjectItem, logMessage?: string) => {
      const updatedSlug = slugifyProjectName(
        updated.name,
        workspace.projects.filter((p) => p.id !== updated.id).map((p) => p.slug)
      );
      const normalized = { ...updated, slug: updatedSlug };

      commitWorkspace(
        (prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === normalized.id ? normalized : p
          ),
        }),
        logMessage
          ? {
              action: 'Updated Project',
              category: 'Project',
              details: logMessage,
            }
          : undefined
      );

      setOpenTabs((prev) =>
        prev.map((t) =>
          t.id === `project:${normalized.id}`
            ? { ...t, label: `${normalized.slug}.proj` }
            : t
        )
      );
    },
    [workspace.projects, commitWorkspace]
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      const target = workspace.projects.find((p) => p.id === projectId);
      commitWorkspace(
        (prev) => ({
          ...prev,
          projects: prev.projects.filter((p) => p.id !== projectId),
        }),
        target
          ? {
              action: 'Deleted Project',
              category: 'Project',
              details: `Removed ${target.name}`,
            }
          : undefined
      );

      const tabToClose: TabId = `project:${projectId}`;
      setOpenTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabToClose);
        return remaining.length > 0 ? remaining : DEFAULT_TABS;
      });
      setActiveTabId('projects/');
      ensureTabOpen({ id: 'projects/', label: 'projects/', kind: 'projects' });
    },
    [workspace.projects, commitWorkspace, ensureTabOpen]
  );

  const handleAddReminder = useCallback(
    (text: string, projectId?: string) => {
      const proj = workspace.projects.find((p) => p.id === projectId);
      commitWorkspace(
        (prev) => ({
          ...prev,
          reminders: [
            {
              id: `rem-${Date.now()}`,
              text,
              projectId: proj?.id,
              projectName: proj?.name || 'General',
              completed: false,
              createdAt: new Date().toISOString(),
            },
            ...prev.reminders,
          ],
        }),
        {
          action: 'Added Reminder',
          category: 'Reminder',
          details: `${text} (${proj?.name || 'General'})`,
        }
      );
    },
    [workspace.projects, commitWorkspace]
  );

  const handleToggleReminder = useCallback(
    (reminderId: string) => {
      commitWorkspace((prev) => ({
        ...prev,
        reminders: prev.reminders.map((r) =>
          r.id === reminderId ? { ...r, completed: !r.completed } : r
        ),
      }));
    },
    [commitWorkspace]
  );

  const handleDeleteReminder = useCallback(
    (reminderId: string) => {
      commitWorkspace((prev) => ({
        ...prev,
        reminders: prev.reminders.filter((r) => r.id !== reminderId),
      }));
    },
    [commitWorkspace]
  );

  const handleAddCertificate = useCallback(
    (cert: CertificateItem) => {
      commitWorkspace(
        (prev) => ({
          ...prev,
          certificates: [cert, ...prev.certificates],
        }),
        {
          action: 'Uploaded Certificate',
          category: 'Certificate',
          details: `${cert.title} (${cert.format})`,
        }
      );
    },
    [commitWorkspace]
  );

  const handleUpdateCertificate = useCallback(
    (cert: CertificateItem) => {
      commitWorkspace((prev) => ({
        ...prev,
        certificates: prev.certificates.map((c) => (c.id === cert.id ? cert : c)),
      }));
    },
    [commitWorkspace]
  );

  const handleDeleteCertificate = useCallback(
    (certId: string) => {
      commitWorkspace((prev) => ({
        ...prev,
        certificates: prev.certificates.filter((c) => c.id !== certId),
      }));
    },
    [commitWorkspace]
  );

  const handleUpdateProfile = useCallback(
    (profile: UserProfile, logMsg?: string) => {
      commitWorkspace(
        (prev) => ({
          ...prev,
          profile,
        }),
        logMsg
          ? { action: 'Updated Profile', category: 'Profile', details: logMsg }
          : undefined
      );
    },
    [commitWorkspace]
  );

  const handleThemeChange = useCallback(
    (theme: PastelThemeId) => {
      commitWorkspace((prev) => ({
        ...prev,
        theme,
      }));
    },
    [commitWorkspace]
  );

  const handleSignOut = useCallback(() => {
    setSavedSessionUsername(null);
    setActiveUsername(null);
    setOpenTabs(DEFAULT_TABS);
    setActiveTabId('dashboard.md');
    setSearchQuery('');
  }, []);

  if (!activeUsername) {
    return (
      <AuthScreen
        theme={workspace.theme}
        onThemeChange={(t) => setWorkspace((prev) => ({ ...prev, theme: t }))}
        onAuthenticated={(username, ws) => {
          setActiveUsername(username);
          setWorkspace(ws);
          setOpenTabs(DEFAULT_TABS);
          setActiveTabId('dashboard.md');
        }}
      />
    );
  }

  if (loadingWorkspace) {
    return (
      <div
        data-theme={workspace.theme}
        className="h-screen w-full flex items-center justify-center bg-[var(--bg-canvas)] text-sm text-[var(--text-secondary)]"
      >
        Loading Playground workspace...
      </div>
    );
  }

  const activeProject = activeTabId.startsWith('project:')
    ? workspace.projects.find((p) => `project:${p.id}` === activeTabId)
    : undefined;

  return (
    <IdeShell
      username={workspace.profile.username || activeUsername}
      projects={workspace.projects}
      certificates={workspace.certificates}
      theme={workspace.theme}
      openTabs={openTabs}
      activeTabId={activeTabId}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onSelectTab={handleSelectSectionTab}
      onCloseTab={handleCloseTab}
      onOpenProject={handleOpenProject}
      onCreateNewProject={() => handleCreateProject()}
      onPreviewCertificate={(cert) => setActivePreviewCert(cert)}
      onThemeChange={handleThemeChange}
      onSignOut={handleSignOut}
    >
      {activeTabId === 'dashboard.md' && (
        <DashboardView
          displayName={workspace.profile.fullName || workspace.profile.username}
          projects={workspace.projects}
          reminders={workspace.reminders}
          onAddReminder={handleAddReminder}
          onToggleReminder={handleToggleReminder}
          onDeleteReminder={handleDeleteReminder}
          onOpenProject={handleOpenProject}
          onNavigateTab={handleSelectSectionTab}
        />
      )}

      {activeTabId === 'projects/' && (
        <ProjectsView
          projects={workspace.projects}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
        />
      )}

      {activeTabId === 'certificates/' && (
        <CertificatesView
          certificates={workspace.certificates}
          activePreviewCert={activePreviewCert}
          onSetActivePreviewCert={setActivePreviewCert}
          onAddCertificate={handleAddCertificate}
          onUpdateCertificate={handleUpdateCertificate}
          onDeleteCertificate={handleDeleteCertificate}
        />
      )}

      {activeTabId === 'profile.json' && (
        <ProfileView
          profile={workspace.profile}
          onUpdateProfile={handleUpdateProfile}
        />
      )}

      {activeTabId === 'settings.csv' && (
        <SettingsView
          workspace={workspace}
          onThemeChange={handleThemeChange}
          onImportProjects={(imported) =>
            commitWorkspace(
              (prev) => ({
                ...prev,
                projects: [...imported, ...prev.projects],
              }),
              {
                action: 'Imported CSV',
                category: 'Project',
                details: `Imported ${imported.length} project(s) from CSV`,
              }
            )
          }
          onSignOut={handleSignOut}
        />
      )}

      {activeProject && (
        <ProjectDetailView
          project={activeProject}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
        />
      )}
    </IdeShell>
  );
}
