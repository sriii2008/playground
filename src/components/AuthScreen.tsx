import React, { useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Camera,
  CloudUpload,
  Code2,
  LogOut,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { PastelThemeId, UserWorkspaceData } from '../types';
import { PASTEL_THEMES } from '../data/seedData';
import {
  suggestUsernameFromIdentity,
  validateChosenUsername,
} from '../utils/playgroundLogic';
import {
  compressAvatarFile,
  getLocalDeviceBackupSummary,
  getLocalMigrationCandidates,
} from '../utils/storageClient';
import { claimUsernameAndProvisionCloudAccount } from '../utils/cloudSync';

interface AuthScreenProps {
  theme: PastelThemeId;
  pendingGoogleUser: User | null;
  authInitializing: boolean;
  onThemeChange: (t: PastelThemeId) => void;
  onEnterSandboxDemo: () => void;
  onOnboardingCompleted: (username: string, workspace: UserWorkspaceData) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  theme,
  pendingGoogleUser,
  authInitializing,
  onThemeChange,
  onEnterSandboxDemo,
  onOnboardingCompleted,
}) => {
  const localBackup = getLocalDeviceBackupSummary();

  const [chosenUsername, setChosenUsername] = useState<string>(() =>
    suggestUsernameFromIdentity({
      email: pendingGoogleUser?.email,
      displayName: pendingGoogleUser?.displayName,
      preferredLocalUsername: localBackup.preferredUsername,
    })
  );
  const [fullName, setFullName] = useState<string>(
    () => pendingGoogleUser?.displayName || ''
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(undefined);
  const [deferAvatar, setDeferAvatar] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync suggested handle & name when pendingGoogleUser arrives
  React.useEffect(() => {
    if (pendingGoogleUser) {
      setChosenUsername((prev) =>
        prev ||
        suggestUsernameFromIdentity({
          email: pendingGoogleUser.email,
          displayName: pendingGoogleUser.displayName,
          preferredLocalUsername: localBackup.preferredUsername,
        })
      );
      setFullName((prev) => prev || pendingGoogleUser.displayName || '');
    }
  }, [pendingGoogleUser, localBackup.preferredUsername]);

  const handleGoogleSignIn = async () => {
    setError('');
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // App.tsx onAuthStateChanged handles account lookup + phone-to-cloud sync automatically
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('popup-closed-by-user') && !msg.includes('cancelled-popup-request')) {
        setError('Google sign-in could not complete. Please allow popups and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressAvatarFile(file);
      setAvatarDataUrl(compressed);
      setDeferAvatar(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process image.');
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleUser) return;
    setError('');

    const check = validateChosenUsername(chosenUsername);
    if (!check.valid) {
      setError(check.error || 'Please enter a valid unique username.');
      return;
    }

    setSubmitting(true);
    try {
      const candidates = getLocalMigrationCandidates({
        authEmail: pendingGoogleUser.email,
        chosenUsername: chosenUsername.trim(),
      });
      const result = await claimUsernameAndProvisionCloudAccount({
        uid: pendingGoogleUser.uid,
        email: pendingGoogleUser.email || '',
        chosenUsername: chosenUsername.trim(),
        fullName: fullName.trim() || pendingGoogleUser.displayName || chosenUsername.trim(),
        avatarDataUrl: deferAvatar ? undefined : avatarDataUrl,
        localCandidateWorkspaces: candidates,
      });
      onOnboardingCompleted(result.username, result.workspace);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Could not claim username.';
      if (rawMsg.includes('Missing or insufficient permissions')) {
        setError(
          `Username "@${chosenUsername.trim()}" is already registered to another user. Please pick a unique username.`
        );
      } else {
        setError(rawMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchGoogleAccount = async () => {
    setError('');
    await signOut(auth);
  };

  return (
    <div
      data-theme={theme}
      className="min-h-screen w-full flex flex-col justify-between bg-[var(--bg-canvas)] text-[var(--text-primary)]"
    >
      {/* Top IDE Bar */}
      <header className="h-11 bg-[var(--bg-chrome)] border-b border-[var(--border-subtle)] px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="w-3 h-3 rounded-full bg-[#ff5f56]/85 inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e]/85 inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#27c93f]/85 inline-block" />
          </div>
          <div className="flex items-center gap-1.5">
            <Code2 className="w-4 h-4 text-[var(--accent)]" />
            <span className="font-bold text-sm tracking-tight">Playground</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {PASTEL_THEMES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onThemeChange(opt.id)}
              aria-label={`Select ${opt.label} pastel theme`}
              className={`w-4 h-4 rounded-full cursor-pointer transition-transform ${
                theme === opt.id
                  ? 'ring-2 ring-[var(--accent)] scale-110'
                  : 'opacity-75 hover:opacity-100'
              }`}
              style={{ backgroundColor: opt.swatch }}
            />
          ))}
        </div>
      </header>

      {/* Main Auth Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-[var(--border-subtle)] rounded-2xl p-7 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                {pendingGoogleUser
                  ? 'Claim your unique Playground ID'
                  : 'Welcome to Playground'}
              </h1>
              <p className="text-xs text-[var(--text-secondary)]">
                {pendingGoogleUser
                  ? 'Link a permanent @username to your verified Google account.'
                  : 'Manage projects, hackathon updates, prototypes & CSV history.'}
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="my-4 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium"
            >
              {error}
            </div>
          )}

          {/* Local Device Backup Notice (shown strictly from this browser's own localStorage, never exposing any account publicly) */}
          {localBackup.projectCount > 0 && (
            <div className="my-4 px-3.5 py-2.5 rounded-xl bg-[var(--accent-soft)]/70 border border-[var(--border-subtle)] flex items-start gap-2.5">
              <CloudUpload className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                <span className="font-semibold">
                  {localBackup.projectCount} saved{' '}
                  {localBackup.projectCount === 1 ? 'project' : 'projects'} detected on this device.
                </span>{' '}
                Sign in with Google to automatically back up and sync your work across phone & laptop without losing any data.
              </p>
            </div>
          )}

          {!pendingGoogleUser ? (
            <div className="space-y-4 mt-5">
              <button
                type="button"
                disabled={submitting || authInitializing}
                onClick={handleGoogleSignIn}
                className="w-full h-11 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2.5 shadow-2xs"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                  />
                </svg>
                <span>
                  {authInitializing
                    ? 'Checking session...'
                    : submitting
                    ? 'Connecting Google account...'
                    : 'Continue with Google'}
                </span>
              </button>

              {/* Isolated Local Sandbox Preview */}
              <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-[var(--text-secondary)]">
                  Want to preview the IDE layout first?
                </span>
                <button
                  type="button"
                  onClick={onEnterSandboxDemo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-90 text-xs font-semibold transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Explore demo sandbox</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCompleteOnboarding} className="space-y-4 mt-4">
              <div className="px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Verified Google account
                  </div>
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {pendingGoogleUser.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSwitchGoogleAccount}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Switch</span>
                </button>
              </div>

              <div>
                <label
                  htmlFor="auth-username"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Permanent unique username
                </label>
                <input
                  id="auth-username"
                  type="text"
                  value={chosenUsername}
                  onChange={(e) => setChosenUsername(e.target.value)}
                  placeholder="Choose your unique username"
                  autoComplete="username"
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none transition-colors font-mono"
                />
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Locked permanently to {pendingGoogleUser.email} (no duplicate accounts allowed).
                </p>
              </div>

              <div>
                <label
                  htmlFor="auth-fullname"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Full name
                </label>
                <input
                  id="auth-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {avatarDataUrl && !deferAvatar ? (
                    <img
                      src={avatarDataUrl}
                      alt="Selected profile avatar"
                      className="w-10 h-10 rounded-full object-cover border border-[var(--border-subtle)] shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-semibold flex items-center justify-center text-sm shrink-0">
                      {(fullName || chosenUsername || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)]">
                      Profile picture
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                      {deferAvatar ? 'Add a picture later in Profile' : 'Custom photo ready'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="px-2.5 py-1.5 rounded-lg bg-white border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                    <Camera className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </label>
                  {!deferAvatar && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeferAvatar(true);
                        setAvatarDataUrl(undefined);
                      }}
                      className="px-2 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Later
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-10 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <span>
                  {submitting
                    ? 'Claiming ID & syncing workspace...'
                    : 'Claim username & open workspace'}
                </span>
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="h-7 bg-[var(--statusbar-bg)] text-white text-[11px] px-4 flex items-center justify-between">
        <span>Playground IDE — Verified Google Cloud Sync</span>
        <span>Excel (.csv) User History Enabled</span>
      </footer>
    </div>
  );
};
