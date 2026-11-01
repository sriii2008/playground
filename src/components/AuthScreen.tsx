import React, { useState, useEffect } from 'react';
import { Camera, CheckCircle2, Code2, Eye, EyeOff, Sparkles, UserCheck } from 'lucide-react';
import { PastelThemeId, UserWorkspaceData } from '../types';
import { PASTEL_THEMES } from '../data/seedData';
import { validateAuthCredentials } from '../utils/playgroundLogic';
import {
  fetchRegisteredUsers,
  signInAccount,
  signUpAccount,
} from '../utils/storageClient';

interface AuthScreenProps {
  theme: PastelThemeId;
  onThemeChange: (t: PastelThemeId) => void;
  onAuthenticated: (username: string, workspace: UserWorkspaceData) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  theme,
  onThemeChange,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(undefined);
  const [deferAvatar, setDeferAvatar] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingUsers, setExistingUsers] = useState<
    { username: string; fullName: string; projectCount: number }[]
  >([]);

  useEffect(() => {
    fetchRegisteredUsers().then(setExistingUsers).catch(() => {});
  }, []);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarDataUrl(reader.result);
        setDeferAvatar(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validation = validateAuthCredentials(
      mode,
      username,
      password,
      existingUsers.map((u) => u.username)
    );
    if (!validation.valid) {
      setError(validation.error || 'Please check your credentials.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const res = await signUpAccount({
          username: username.trim(),
          password,
          fullName: fullName.trim() || username.trim(),
          email: email.trim(),
          avatarDataUrl: deferAvatar ? undefined : avatarDataUrl,
        });
        onAuthenticated(res.username, res.workspace);
      } else {
        const res = await signInAccount(username.trim(), password);
        onAuthenticated(res.username, res.workspace);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDemoLogin = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await signInAccount('wonder', 'wonder123');
      onAuthenticated(res.username, res.workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign into demo workspace.');
    } finally {
      setSubmitting(false);
    }
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
                theme === opt.id ? 'ring-2 ring-[var(--accent)] scale-110' : 'opacity-75 hover:opacity-100'
              }`}
              style={{ backgroundColor: opt.swatch }}
            />
          ))}
        </div>
      </header>

      {/* Main Auth Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-[var(--border-subtle)] rounded-2xl p-7 shadow-sm">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                {mode === 'signin' ? 'Welcome back to Playground' : 'Create your Playground ID'}
              </h1>
              <p className="text-xs text-[var(--text-secondary)]">
                Manage projects, hackathon updates, prototypes & CSV history.
              </p>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-input)] my-5">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError('');
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError('');
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Sign up
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="auth-username"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Unique username
              </label>
              <input
                id="auth-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === 'signin' ? 'e.g. wonder' : 'Choose a unique username'}
                autoComplete="username"
                className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (min 4 characters)"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      placeholder="Your name"
                      className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="auth-email"
                      className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                    >
                      Email
                    </label>
                    <input
                      id="auth-email"
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Optional Profile Picture or Add Picture Later */}
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
                        {(fullName || username || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--text-primary)]">
                        Profile picture
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                        {deferAvatar
                          ? 'Add a picture later in Profile'
                          : 'Custom photo ready'}
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
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>
                {submitting
                  ? 'Opening workspace...'
                  : mode === 'signin'
                  ? 'Sign in to workspace'
                  : 'Create account & open workspace'}
              </span>
            </button>
          </form>

          {/* Quick Demo Access */}
          <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
              Demo: <span className="font-mono font-medium">@wonder</span>
            </div>
            <button
              type="button"
              onClick={handleQuickDemoLogin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-90 text-xs font-semibold transition-opacity cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Continue as wonder</span>
            </button>
          </div>

          {existingUsers.length > 0 && mode === 'signin' && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Registered workspaces:</span>
              {existingUsers.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => setUsername(u.username)}
                  className="font-mono underline hover:text-[var(--accent)] cursor-pointer"
                >
                  @{u.username}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="h-7 bg-[var(--statusbar-bg)] text-white text-[11px] px-4 flex items-center justify-between">
        <span>Playground IDE — Unique Account Authentication</span>
        <span>Excel (.csv) User History Enabled</span>
      </footer>
    </div>
  );
};
