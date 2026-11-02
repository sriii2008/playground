/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import {
  CertificateItem,
  HistoryLogEntry,
  OpenTab,
  PastelThemeId,
  ProjectItem,
  ProjectStatus,
  ReminderItem,
  TabId,
  UserProfile,
  UserWorkspaceData,
} from './types';
import { createDemoWonderWorkspace } from './data/seedData';
import {
  calculateUserStorageBytes,
  sanitizeFirestoreId,
  slugifyProjectName,
} from './utils/playgroundLogic';
import {
  deleteWorkspaceFile,
  getLocalMigrationCandidates,
  isSandboxAutostartRequested,
  loadSandboxDemoWorkspace,
  mirrorWorkspaceToLocalCache,
  saveSandboxDemoWorkspace,
  setSavedSessionUsername,
} from './utils/storageClient';
import {
  appendCloudHistoryLog,
  deleteCloudCertificate,
  deleteCloudProject,
  deleteCloudReminder,
  getCloudAccountSummary,
  loadAndSyncCloudWorkspace,
  saveCloudCertificate,
  saveCloudProfile,
  saveCloudProject,
  saveCloudReminder,
  saveCloudTheme,
  subscribeToCloudWorkspace,
} from './utils/cloudSync';
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

type SessionMode = 'none' | 'sandbox' | 'cloud';

export default function App() {
  const [sessionMode, setSessionMode] = useState<SessionMode>(() =>
    isSandboxAutostartRequested() ? 'sandbox' : 'none'
  );
  const [authInitializing, setAuthInitializing] = useState<boolean>(
    () => !isSandboxAutostartRequested()
  );
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [pendingGoogleUser, setPendingGoogleUser] = useState<User | null>(null);
  const [activeUsername, setActiveUsername] = useState<string | null>(() =>
    isSandboxAutostartRequested() ? 'wonder' : null
  );
  const [workspace, setWorkspace] = useState<UserWorkspaceData>(() =>
    isSandboxAutostartRequested() ? loadSandboxDemoWorkspace() : createDemoWonderWorkspace()
  );
  const [loadingWorkspace, setLoadingWorkspace] = useState<boolean>(false);
  const [syncErrorBanner, setSyncErrorBanner] = useState<string>('');
  const [openTabs, setOpenTabs] = useState<OpenTab[]>(DEFAULT_TABS);
  const [activeTabId, setActiveTabId] = useState<TabId>('dashboard.md');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePreviewCert, setActivePreviewCert] =
    useState<CertificateItem | null>(null);

  const reportCloudError = useCallback((err: unknown) => {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('Quota exceeded')) {
      setSyncErrorBanner(
        'Cloud database daily free-tier quota reached. Your local changes are safe and cloud sync will resume when quota resets tomorrow.'
      );
    } else {
      setSyncErrorBanner('Could not sync latest change to cloud. Retrying automatically on next update.');
    }
  }, []);

  // Listen to Firebase Google Auth state across sessions & devices
  useEffect(() => {
    let cancelled = false;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;

      if (!user) {
        setFirebaseUser(null);
        setPendingGoogleUser(null);
        setAuthInitializing(false);
        setLoadingWorkspace(false);
        setSessionMode((prev) => (prev === 'sandbox' ? 'sandbox' : 'none'));
        return;
      }

      setFirebaseUser(user);
      setLoadingWorkspace(true);
      setSyncErrorBanner('');

      try {
        const accountSummary = await getCloudAccountSummary(user.uid);
        if (cancelled) return;

        if (!accountSummary) {
          // Verified Google user has not claimed their permanent @username yet
          setPendingGoogleUser(user);
          setSessionMode('none');
          setActiveUsername(null);
          setAuthInitializing(false);
          setLoadingWorkspace(false);
          return;
        }

        // Existing cloud user -> automatically merge any unsynced phone/local projects into Firestore!
        const candidates = getLocalMigrationCandidates({
          authEmail: user.email,
          chosenUsername: accountSummary.username,
        });
        const syncedWs = await loadAndSyncCloudWorkspace({
          uid: user.uid,
          email: user.email || '',
          accountSummary,
          localCandidateWorkspaces: candidates,
        });
        if (cancelled) return;

        mirrorWorkspaceToLocalCache(accountSummary.username, syncedWs);
        setSavedSessionUsername(accountSummary.username);
        setPendingGoogleUser(null);
        setActiveUsername(accountSummary.username);
        setWorkspace(syncedWs);
        setSessionMode('cloud');
      } catch (err) {
        if (!cancelled) reportCloudError(err);
      } finally {
        if (!cancelled) {
          setAuthInitializing(false);
          setLoadingWorkspace(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
    };
  }, [reportCloudError]);

  // Attach real-time Firestore listeners once authenticated in cloud mode
  useEffect(() => {
    if (sessionMode !== 'cloud' || !firebaseUser || !activeUsername || loadingWorkspace) {
      return;
    }

    let unsubCloud: (() => void) | undefined;
    try {
      unsubCloud = subscribeToCloudWorkspace({
        uid: firebaseUser.uid,
        username: activeUsername,
        onPatch: (patch) => {
          setWorkspace((prev) => {
            const next = { ...prev, ...patch };
            mirrorWorkspaceToLocalCache(activeUsername, next);
            return next;
          });
        },
      });
    } catch (err) {
      reportCloudError(err);
    }

    return () => {
      if (unsubCloud) unsubCloud();
    };
  }, [sessionMode, firebaseUser, activeUsername, loadingWorkspace, reportCloudError]);

  const recordActivity = useCallback(
    (
      prevHistory: HistoryLogEntry[],
      logItem?: {
        action: string;
        category: HistoryLogEntry['category'];
        details: string;
      }
    ): { updatedHistory: HistoryLogEntry[]; createdEntry?: HistoryLogEntry } => {
      if (!logItem) return { updatedHistory: prevHistory };
      const createdEntry: HistoryLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
        action: logItem.action,
        category: logItem.category,
        details: logItem.details,
      };
      return {
        updatedHistory: [createdEntry, ...prevHistory.slice(0, 99)],
        createdEntry,
      };
    },
    []
  );

  const persistLocalMirror = useCallback(
    (next: UserWorkspaceData, createdEntry?: HistoryLogEntry) => {
      if (sessionMode === 'sandbox') {
        saveSandboxDemoWorkspace(next);
      } else if (activeUsername) {
        mirrorWorkspaceToLocalCache(activeUsername, next);
      }
      if (sessionMode === 'cloud' && firebaseUser && createdEntry) {
        appendCloudHistoryLog(firebaseUser.uid, createdEntry).catch(reportCloudError);
      }
    },
    [sessionMode, activeUsername, firebaseUser, reportCloudError]
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
        id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
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
            id: `tm_${Date.now()}`,
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

      setWorkspace((prev) => {
        const { updatedHistory, createdEntry } = recordActivity(prev.historyLog, {
          action: 'Created Project',
          category: 'Project',
          details: `Created ${newProj.name} (${newProj.domain})`,
        });
        const next: UserWorkspaceData = {
          ...prev,
          projects: [newProj, ...prev.projects],
          historyLog: updatedHistory,
        };
        persistLocalMirror(next, createdEntry);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser) {
        saveCloudProject(firebaseUser.uid, newProj).catch(reportCloudError);
      }

      handleOpenProject(newProj);
    },
    [
      workspace.projects,
      workspace.profile,
      recordActivity,
      persistLocalMirror,
      sessionMode,
      firebaseUser,
      reportCloudError,
      handleOpenProject,
    ]
  );

  const handleUpdateProject = useCallback(
    (updated: ProjectItem, logMessage?: string) => {
      const updatedSlug = slugifyProjectName(
        updated.name,
        workspace.projects.filter((p) => p.id !== updated.id).map((p) => p.slug)
      );
      const normalized: ProjectItem = {
        ...updated,
        id: sanitizeFirestoreId(updated.id, 'proj'),
        slug: updatedSlug,
        updatedAt: new Date().toISOString(),
      };

      setWorkspace((prev) => {
        const { updatedHistory, createdEntry } = recordActivity(
          prev.historyLog,
          logMessage
            ? { action: 'Updated Project', category: 'Project', details: logMessage }
            : undefined
        );
        const next: UserWorkspaceData = {
          ...prev,
          projects: prev.projects.map((p) => (p.id === updated.id ? normalized : p)),
          historyLog: updatedHistory,
        };
        persistLocalMirror(next, createdEntry);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser) {
        saveCloudProject(firebaseUser.uid, normalized).catch(reportCloudError);
      }

      setOpenTabs((prev) =>
        prev.map((t) =>
          t.id === `project:${updated.id}`
            ? { ...t, id: `project:${normalized.id}`, projectId: normalized.id, label: `${normalized.slug}.proj` }
            : t
        )
      );
    },
    [
      workspace.projects,
      recordActivity,
      persistLocalMirror,
      sessionMode,
      firebaseUser,
      reportCloudError,
    ]
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      const target = workspace.projects.find((p) => p.id === projectId);
      if (target && activeUsername) {
        for (const att of target.attachments) {
          if (att.storageId) {
            deleteWorkspaceFile(activeUsername, att.storageId);
          }
        }
      }

      const affectedReminders: ReminderItem[] = [];
      setWorkspace((prev) => {
        const remainingProjects = prev.projects.filter((p) => p.id !== projectId);
        const updatedReminders = prev.reminders.map((r) => {
          if (r.projectId === projectId) {
            const unlinked = { ...r, projectId: undefined };
            affectedReminders.push(unlinked);
            return unlinked;
          }
          return r;
        });
        const { updatedHistory, createdEntry } = recordActivity(
          prev.historyLog,
          target
            ? {
                action: 'Deleted Project',
                category: 'Project',
                details: `Removed ${target.name}`,
              }
            : undefined
        );
        const next: UserWorkspaceData = {
          ...prev,
          projects: remainingProjects,
          reminders: updatedReminders,
          historyLog: updatedHistory,
        };
        persistLocalMirror(next, createdEntry);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser) {
        const validIds = new Set(
          workspace.projects.filter((p) => p.id !== projectId).map((p) => p.id)
        );
        for (const rem of affectedReminders) {
          saveCloudReminder(firebaseUser.uid, rem, validIds).catch(reportCloudError);
        }
        deleteCloudProject(firebaseUser.uid, projectId).catch(reportCloudError);
      }

      const tabToClose: TabId = `project:${projectId}`;
      setOpenTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabToClose);
        return remaining.length > 0 ? remaining : DEFAULT_TABS;
      });
      setActiveTabId('projects/');
      ensureTabOpen({ id: 'projects/', label: 'projects/', kind: 'projects' });
    },
    [
      workspace.projects,
      activeUsername,
      recordActivity,
      persistLocalMirror,
      sessionMode,
      firebaseUser,
      reportCloudError,
      ensureTabOpen,
    ]
  );

  const handleAddReminder = useCallback(
    (text: string, projectId?: string) => {
      const proj = workspace.projects.find((p) => p.id === projectId);
      const newRem: ReminderItem = {
        id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        text,
        projectId: proj?.id,
        projectName: proj?.name || 'General',
        completed: false,
        createdAt: new Date().toISOString(),
      };

      setWorkspace((prev) => {
        const { updatedHistory, createdEntry } = recordActivity(prev.historyLog, {
          action: 'Added Reminder',
          category: 'Reminder',
          details: `${text} (${proj?.name || 'General'})`,
        });
        const next: UserWorkspaceData = {
          ...prev,
          reminders: [newRem, ...prev.reminders],
          historyLog: updatedHistory,
        };
        persistLocalMirror(next, createdEntry);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser) {
        const validIds = new Set(workspace.projects.map((p) => p.id));
        saveCloudReminder(firebaseUser.uid, newRem, validIds).catch(reportCloudError);
      }
    },
    [
      workspace.projects,
      recordActivity,
      persistLocalMirror,
      sessionMode,
      firebaseUser,
      reportCloudError,
    ]
  );

  const handleToggleReminder = useCallback(
    (reminderId: string) => {
      let toggled: ReminderItem | undefined;
      setWorkspace((prev) => {
        const reminders = prev.reminders.map((r) => {
          if (r.id === reminderId) {
            toggled = { ...r, completed: !r.completed };
            return toggled;
          }
          return r;
        });
        const next = { ...prev, reminders };
        persistLocalMirror(next);
        return next;
      });

      if (toggled && sessionMode === 'cloud' && firebaseUser) {
        const validIds = new Set(workspace.projects.map((p) => p.id));
        saveCloudReminder(firebaseUser.uid, toggled, validIds).catch(reportCloudError);
      }
    },
    [workspace.projects, persistLocalMirror, sessionMode, firebaseUser, reportCloudError]
  );

  const handleDeleteReminder = useCallback(
    (reminderId: string) => {
      setWorkspace((prev) => {
        const next = {
          ...prev,
          reminders: prev.reminders.filter((r) => r.id !== reminderId),
        };
        persistLocalMirror(next);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser) {
        deleteCloudReminder(firebaseUser.uid, reminderId).catch(reportCloudError);
      }
    },
    [persistLocalMirror, sessionMode, firebaseUser, reportCloudError]
  );

  const handleAddCertificate = useCallback(
    (cert: CertificateItem) => {
      const normalized: CertificateItem = {
        ...cert,
        id: sanitizeFirestoreId(cert.id, 'cert'),
      };
      setWorkspace((prev) => {
        const { updatedHistory, createdEntry } = recordActivity(prev.historyLog, {
          action: 'Uploaded Certificate',
          category: 'Certificate',
          details: `${normalized.title} (${normalized.format})`,
        });
        const next: UserWorkspaceData = {
          ...prev,
          certificates: [normalized, ...prev.certificates],
          historyLog: updatedHistory,
        };
        persistLocalMirror(next, createdEntry);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser) {
        saveCloudCertificate(firebaseUser.uid, normalized).catch(reportCloudError);
      }
    },
    [recordActivity, persistLocalMirror, sessionMode, firebaseUser, reportCloudError]
  );

  const handleUpdateCertificate = useCallback(
    (cert: CertificateItem) => {
      const normalized: CertificateItem = {
        ...cert,
        id: sanitizeFirestoreId(cert.id, 'cert'),
      };
      setWorkspace((prev) => {
        const next: UserWorkspaceData = {
          ...prev,
          certificates: prev.certificates.map((c) => (c.id === cert.id ? normalized : c)),
        };
        persistLocalMirror(next);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser) {
        saveCloudCertificate(firebaseUser.uid, normalized).catch(reportCloudError);
      }
    },
    [persistLocalMirror, sessionMode, firebaseUser, reportCloudError]
  );

  const handleDeleteCertificate = useCallback(
    (certId: string) => {
      setWorkspace((prev) => {
        const next: UserWorkspaceData = {
          ...prev,
          certificates: prev.certificates.filter((c) => c.id !== certId),
        };
        persistLocalMirror(next);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser) {
        deleteCloudCertificate(firebaseUser.uid, certId).catch(reportCloudError);
      }
    },
    [persistLocalMirror, sessionMode, firebaseUser, reportCloudError]
  );

  const handleUpdateProfile = useCallback(
    (profile: UserProfile, logMsg?: string) => {
      const canonicalUser = activeUsername || profile.username;
      const lockedProfile: UserProfile = {
        ...profile,
        username: canonicalUser,
      };
      setWorkspace((prev) => {
        const { updatedHistory, createdEntry } = recordActivity(
          prev.historyLog,
          logMsg ? { action: 'Updated Profile', category: 'Profile', details: logMsg } : undefined
        );
        const next: UserWorkspaceData = {
          ...prev,
          profile: lockedProfile,
          historyLog: updatedHistory,
        };
        persistLocalMirror(next, createdEntry);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser && canonicalUser) {
        saveCloudProfile(
          firebaseUser.uid,
          canonicalUser,
          lockedProfile,
          firebaseUser.email || ''
        ).catch(reportCloudError);
      }
    },
    [
      activeUsername,
      recordActivity,
      persistLocalMirror,
      sessionMode,
      firebaseUser,
      reportCloudError,
    ]
  );

  const handleThemeChange = useCallback(
    (theme: PastelThemeId) => {
      setWorkspace((prev) => {
        const next = { ...prev, theme };
        persistLocalMirror(next);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser) {
        saveCloudTheme(firebaseUser.uid, theme).catch(reportCloudError);
      }
    },
    [persistLocalMirror, sessionMode, firebaseUser, reportCloudError]
  );

  const handleImportProjects = useCallback(
    (imported: ProjectItem[]) => {
      const normalized = imported.map((p, idx) => ({
        ...p,
        id: sanitizeFirestoreId(p.id, `proj_imp_${idx}`),
      }));

      setWorkspace((prev) => {
        const { updatedHistory, createdEntry } = recordActivity(prev.historyLog, {
          action: 'Imported CSV',
          category: 'Project',
          details: `Imported ${normalized.length} project(s) from CSV`,
        });
        const next: UserWorkspaceData = {
          ...prev,
          projects: [...normalized, ...prev.projects],
          historyLog: updatedHistory,
        };
        persistLocalMirror(next, createdEntry);
        return next;
      });

      if (sessionMode === 'cloud' && firebaseUser) {
        for (const proj of normalized) {
          saveCloudProject(firebaseUser.uid, proj).catch(reportCloudError);
        }
      }
    },
    [recordActivity, persistLocalMirror, sessionMode, firebaseUser, reportCloudError]
  );

  const handleSignOut = useCallback(async () => {
    setSavedSessionUsername(null);
    setSessionMode('none');
    setActiveUsername(null);
    setPendingGoogleUser(null);
    setOpenTabs(DEFAULT_TABS);
    setActiveTabId('dashboard.md');
    setSearchQuery('');
    setSyncErrorBanner('');
    try {
      await signOut(auth);
    } catch {
      // ignore sign-out error
    }
  }, []);

  if (loadingWorkspace) {
    return (
      <div
        data-theme={workspace.theme}
        className="h-screen w-full flex items-center justify-center bg-[var(--bg-canvas)] text-sm text-[var(--text-secondary)]"
      >
        Syncing your Playground workspace...
      </div>
    );
  }

  if (sessionMode === 'none' || !activeUsername) {
    return (
      <AuthScreen
        theme={workspace.theme}
        pendingGoogleUser={pendingGoogleUser}
        authInitializing={authInitializing}
        onThemeChange={(t) => setWorkspace((prev) => ({ ...prev, theme: t }))}
        onEnterSandboxDemo={() => {
          setWorkspace(loadSandboxDemoWorkspace());
          setActiveUsername('wonder');
          setSessionMode('sandbox');
          setOpenTabs(DEFAULT_TABS);
          setActiveTabId('dashboard.md');
        }}
        onOnboardingCompleted={(username, ws) => {
          mirrorWorkspaceToLocalCache(username, ws);
          setSavedSessionUsername(username);
          setPendingGoogleUser(null);
          setActiveUsername(username);
          setWorkspace(ws);
          setSessionMode('cloud');
          setOpenTabs(DEFAULT_TABS);
          setActiveTabId('dashboard.md');
        }}
      />
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
      {syncErrorBanner && (
        <div
          role="alert"
          className="mb-4 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between gap-2"
        >
          <span>{syncErrorBanner}</span>
          <button
            type="button"
            onClick={() => setSyncErrorBanner('')}
            className="font-semibold underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

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
          username={workspace.profile.username || activeUsername}
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
          onImportProjects={handleImportProjects}
          onSignOut={handleSignOut}
        />
      )}

      {activeProject && (
        <ProjectDetailView
          username={workspace.profile.username || activeUsername}
          totalUserStorageBytes={calculateUserStorageBytes(workspace)}
          project={activeProject}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
        />
      )}
    </IdeShell>
  );
}
