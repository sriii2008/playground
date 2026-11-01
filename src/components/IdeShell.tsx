import React, { useState, useRef, useEffect } from 'react';
import {
  Award,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  User,
  X,
} from 'lucide-react';
import {
  CertificateItem,
  OpenTab,
  PastelThemeId,
  ProjectItem,
  TabId,
} from '../types';
import { PASTEL_THEMES } from '../data/seedData';
import { getStatusDotColor } from '../utils/playgroundLogic';

interface IdeShellProps {
  username: string;
  projects: ProjectItem[];
  certificates: CertificateItem[];
  theme: PastelThemeId;
  openTabs: OpenTab[];
  activeTabId: TabId;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectTab: (tabId: TabId) => void;
  onCloseTab: (tabId: TabId) => void;
  onOpenProject: (project: ProjectItem) => void;
  onCreateNewProject: () => void;
  onPreviewCertificate: (cert: CertificateItem) => void;
  onThemeChange: (theme: PastelThemeId) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}

export const IdeShell: React.FC<IdeShellProps> = ({
  username,
  projects,
  certificates,
  theme,
  openTabs,
  activeTabId,
  searchQuery,
  onSearchChange,
  onSelectTab,
  onCloseTab,
  onOpenProject,
  onCreateNewProject,
  onPreviewCertificate,
  onThemeChange,
  onSignOut,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentThemeObj =
    PASTEL_THEMES.find((t) => t.id === theme) || PASTEL_THEMES[0];

  const q = searchQuery.trim().toLowerCase();
  const matchedProjects = q
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.domain.toLowerCase().includes(q) ||
          p.techStack.some((t) => t.toLowerCase().includes(q)) ||
          p.hackathonName.toLowerCase().includes(q)
      )
    : [];
  const matchedCertificates = q
    ? certificates.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.issuer.toLowerCase().includes(q) ||
          c.format.toLowerCase().includes(q)
      )
    : [];

  const renderTabIcon = (tab: OpenTab) => {
    switch (tab.kind) {
      case 'dashboard':
        return <LayoutGrid className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" />;
      case 'projects':
      case 'project':
        return <Folder className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" />;
      case 'certificates':
        return <Award className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" />;
      case 'profile':
        return <User className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" />;
      case 'settings':
        return <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" />;
    }
  };

  const explorerContent = (
    <div className="flex flex-col gap-5 py-3 px-2.5 text-[13px] select-none">
      {/* EXPLORER */}
      <div>
        <div className="px-2.5 mb-1.5 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
          Explorer
        </div>
        <nav aria-label="Workspace sections" className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectTab('dashboard.md');
              setMobileDrawerOpen(false);
            }}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors whitespace-nowrap ${
              activeTabId === 'dashboard.md'
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-secondary)] hover:bg-black/[0.03] hover:text-[var(--text-primary)]'
            }`}
          >
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('projects/');
              setMobileDrawerOpen(false);
            }}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors whitespace-nowrap ${
              activeTabId === 'projects/'
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-secondary)] hover:bg-black/[0.03] hover:text-[var(--text-primary)]'
            }`}
          >
            <Folder className="w-4 h-4 shrink-0" />
            <span>Projects</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('certificates/');
              setMobileDrawerOpen(false);
            }}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors whitespace-nowrap ${
              activeTabId === 'certificates/'
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-secondary)] hover:bg-black/[0.03] hover:text-[var(--text-primary)]'
            }`}
          >
            <Award className="w-4 h-4 shrink-0" />
            <span>Certificates</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('profile.json');
              setMobileDrawerOpen(false);
            }}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors whitespace-nowrap ${
              activeTabId === 'profile.json'
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-secondary)] hover:bg-black/[0.03] hover:text-[var(--text-primary)]'
            }`}
          >
            <User className="w-4 h-4 shrink-0" />
            <span>Profile</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('settings.csv');
              setMobileDrawerOpen(false);
            }}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors whitespace-nowrap ${
              activeTabId === 'settings.csv'
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-secondary)] hover:bg-black/[0.03] hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Settings & CSV</span>
          </button>
        </nav>
      </div>

      {/* PROJECTS */}
      <div>
        <div className="px-2.5 mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
            Projects
          </span>
          <button
            type="button"
            onClick={() => {
              onCreateNewProject();
              setMobileDrawerOpen(false);
            }}
            aria-label="Create new project"
            title="New project"
            className="p-0.5 rounded hover:bg-[var(--accent-soft)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {projects.length === 0 ? (
            <p className="px-2.5 py-1 text-xs text-[var(--text-muted)]">No projects yet</p>
          ) : (
            projects.map((proj) => {
              const projTabId: TabId = `project:${proj.id}`;
              const isSelected = activeTabId === projTabId;
              return (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => {
                    onOpenProject(proj);
                    setMobileDrawerOpen(false);
                  }}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors truncate ${
                    isSelected
                      ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-black/[0.03] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: getStatusDotColor(proj.status) }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{proj.name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* CERTIFICATES */}
      <div>
        <div className="px-2.5 mb-1.5 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
          Certificates
        </div>
        <div className="flex flex-col gap-0.5">
          {certificates.length === 0 ? (
            <p className="px-2.5 py-1 text-xs text-[var(--text-muted)]">No certificates yet</p>
          ) : (
            certificates.map((cert) => (
              <button
                key={cert.id}
                type="button"
                onClick={() => {
                  onSelectTab('certificates/');
                  onPreviewCertificate(cert);
                  setMobileDrawerOpen(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-[var(--text-secondary)] hover:bg-black/[0.03] hover:text-[var(--text-primary)] transition-colors truncate"
              >
                {cert.format === 'PDF' ? (
                  <FileText className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                )}
                <span className="truncate">{cert.title}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      data-theme={theme}
      className="h-screen w-full flex flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]"
    >
      {/* Top IDE Title Bar */}
      <header className="h-11 bg-[var(--bg-chrome)] border-b border-[var(--border-subtle)] px-3.5 flex items-center justify-between gap-4 shrink-0 z-20">
        {/* Left: Window Dots + Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-1.5 rounded-lg hover:bg-black/5 text-[var(--text-secondary)]"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="hidden sm:flex items-center gap-1.5" aria-hidden="true">
            <span className="w-3 h-3 rounded-full bg-[#ff5f56]/85 inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e]/85 inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#27c93f]/85 inline-block" />
          </div>
          <div className="flex items-center gap-1.5 pl-0.5">
            <Code2 className="w-4 h-4 text-[var(--accent)]" />
            <span className="font-bold text-[14px] tracking-tight text-[var(--text-primary)] whitespace-nowrap">
              Playground
            </span>
          </div>
        </div>

        {/* Center: Search Bar */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setSearchFocused(true);
            }}
            aria-label="Search projects and certificates"
            placeholder="Search projects and certificates"
            className="w-full h-7.5 pl-8 pr-3 rounded-lg bg-white border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />

          {/* Quick Search Results Dropdown */}
          {searchFocused && q.length > 0 && (
            <div className="absolute left-0 right-0 top-9 bg-white border border-[var(--border-subtle)] rounded-xl shadow-lg p-2 z-50 max-h-72 overflow-y-auto">
              {matchedProjects.length === 0 && matchedCertificates.length === 0 ? (
                <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                  No matching projects or certificates for "{searchQuery}"
                </p>
              ) : (
                <div className="space-y-2">
                  {matchedProjects.length > 0 && (
                    <div>
                      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Projects ({matchedProjects.length})
                      </div>
                      {matchedProjects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onOpenProject(p);
                            setSearchFocused(false);
                          }}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[var(--accent-soft)] text-left text-xs transition-colors"
                        >
                          <span className="font-medium text-[var(--text-primary)] truncate">
                            {p.name}
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] shrink-0 ml-2">
                            {p.domain} · {p.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {matchedCertificates.length > 0 && (
                    <div>
                      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Certificates ({matchedCertificates.length})
                      </div>
                      {matchedCertificates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            onSelectTab('certificates/');
                            onPreviewCertificate(c);
                            setSearchFocused(false);
                          }}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[var(--accent-soft)] text-left text-xs transition-colors"
                        >
                          <span className="font-medium text-[var(--text-primary)] truncate">
                            {c.title}
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] shrink-0 ml-2">
                            {c.issuer} · {c.format}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Sign out */}
        <button
          type="button"
          onClick={onSignOut}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign out</span>
        </button>
      </header>

      {/* Main Middle Layout */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Narrow Left Activity Rail (Desktop) */}
        <aside
          aria-label="Activity bar"
          className="hidden md:flex w-12 bg-[var(--bg-chrome)] border-r border-[var(--border-subtle)] flex-col items-center justify-between py-2.5 shrink-0"
        >
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectTab('dashboard.md')}
              aria-label="Open Dashboard"
              title="Dashboard"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                activeTabId === 'dashboard.md'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('projects/')}
              aria-label="Open Projects"
              title="Projects"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                activeTabId === 'projects/' || activeTabId.startsWith('project:')
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5'
              }`}
            >
              <Folder className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('certificates/')}
              aria-label="Open Certificates"
              title="Certificates"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                activeTabId === 'certificates/'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5'
              }`}
            >
              <Award className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('profile.json')}
              aria-label="Open Profile"
              title="Profile"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                activeTabId === 'profile.json'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5'
              }`}
            >
              <User className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Collapse explorer sidebar' : 'Expand explorer sidebar'}
              title={sidebarOpen ? 'Collapse explorer' : 'Expand explorer'}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 transition-colors cursor-pointer"
            >
              {sidebarOpen ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('settings.csv')}
              aria-label="Open Settings and User History CSV"
              title="Settings & User History (CSV)"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                activeTabId === 'settings.csv'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* Explorer Sidebar (Desktop) */}
        {sidebarOpen && (
          <aside
            aria-label="Explorer tree"
            className="hidden md:block w-60 bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] overflow-y-auto shrink-0"
          >
            {explorerContent}
          </aside>
        )}

        {/* Mobile Slide-Over Explorer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/25"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <aside className="relative z-50 w-64 max-w-[80vw] bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] h-full overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                <span className="font-semibold text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  Workspace Explorer
                </span>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1 rounded-lg hover:bg-black/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {explorerContent}
            </aside>
          </div>
        )}

        {/* Right Editor Pane */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Open Editor File Tabs */}
          <div
            role="tablist"
            aria-label="Open workspace files"
            className="h-9.5 bg-[var(--bg-chrome)] border-b border-[var(--border-subtle)] flex items-stretch overflow-x-auto shrink-0"
          >
            {openTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  className={`group flex items-center gap-2 px-3.5 text-xs font-mono border-r border-[var(--border-subtle)] shrink-0 transition-colors ${
                    isActive
                      ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)] font-medium border-t-2 border-t-[var(--accent)]'
                      : 'bg-[var(--bg-chrome)] text-[var(--text-secondary)] hover:bg-white/60 border-t-2 border-t-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTab(tab.id)}
                    className="flex items-center gap-2 py-2 cursor-pointer whitespace-nowrap"
                  >
                    {renderTabIcon(tab)}
                    <span>{tab.label}</span>
                  </button>
                  {openTabs.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      aria-label={`Close ${tab.label} tab`}
                      className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-black/10 transition-opacity cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Main Editor Content */}
          <main className="flex-1 overflow-y-auto px-5 py-7 md:px-10 md:py-9">
            <div className="max-w-5xl mx-auto">{children}</div>
          </main>
        </div>
      </div>

      {/* Bottom IDE Status Bar */}
      <footer className="h-7 bg-[var(--statusbar-bg)] text-white text-[11px] px-3.5 flex items-center justify-between gap-4 shrink-0 z-20">
        <div className="flex items-center gap-4 overflow-hidden whitespace-nowrap tabular-nums">
          <button
            type="button"
            onClick={() => onSelectTab('profile.json')}
            className="flex items-center gap-1.5 hover:underline cursor-pointer"
          >
            <User className="w-3 h-3" />
            <span>{username}</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('projects/')}
            className="hover:underline cursor-pointer"
          >
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('certificates/')}
            className="hidden sm:inline hover:underline cursor-pointer"
          >
            {certificates.length}{' '}
            {certificates.length === 1 ? 'certificate' : 'certificates'}
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('settings.csv')}
            className="hidden md:inline-flex items-center gap-1 hover:underline opacity-90 hover:opacity-100 cursor-pointer"
          >
            <FileSpreadsheet className="w-3 h-3" />
            <span>user_history.csv</span>
          </button>
        </div>

        {/* Right: 5 Pastel Theme Dots + Current Theme Name */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5" role="group" aria-label="Pastel color themes">
            {PASTEL_THEMES.map((opt) => {
              const selected = opt.id === theme;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onThemeChange(opt.id)}
                  aria-label={`Switch to ${opt.label} pastel theme`}
                  title={`${opt.label} theme`}
                  className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer ${
                    selected
                      ? 'ring-2 ring-white scale-110'
                      : 'opacity-80 hover:opacity-100 hover:scale-105'
                  }`}
                  style={{ backgroundColor: opt.swatch }}
                />
              );
            })}
          </div>
          <span className="font-medium ml-1 whitespace-nowrap">
            {currentThemeObj.label}
          </span>
        </div>
      </footer>
    </div>
  );
};
