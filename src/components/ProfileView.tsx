import React, { useState } from 'react';
import { Camera, Check, ExternalLink, Upload, X } from 'lucide-react';
import { UserProfile } from '../types';
import { calculateAgeFromDob, normalizeExternalUrl } from '../utils/playgroundLogic';

interface ProfileViewProps {
  profile: UserProfile;
  onUpdateProfile: (profile: UserProfile, logMessage?: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  onUpdateProfile,
}) => {
  const [savedNotice, setSavedNotice] = useState(false);

  const patch = (fields: Partial<UserProfile>, logMsg?: string) => {
    const next = { ...profile, ...fields };
    if ('dob' in fields && fields.dob !== undefined) {
      const computedAge = calculateAgeFromDob(fields.dob, new Date());
      if (computedAge !== null) {
        next.age = String(computedAge);
      } else if (!fields.dob) {
        next.age = '';
      }
    }
    onUpdateProfile(next, logMsg);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1600);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        patch({ avatarDataUrl: reader.result }, 'Updated profile picture');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleResumeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        patch(
          {
            resumeFileName: file.name,
            resumeDataUrl: reader.result,
            resumeLink: profile.resumeLink || file.name,
          },
          `Uploaded resume ${file.name}`
        );
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const initial = (profile.fullName || profile.username || 'W')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">
            Profile
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Your details, links and documents
          </p>
        </div>

        {savedNotice && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold">
            <Check className="w-3.5 h-3.5" />
            <span>Saved to CSV</span>
          </span>
        )}
      </div>

      {/* 2-Card Layout matching Figma Screenshot 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Avatar Card */}
        <section className="lg:col-span-4 bg-white border border-[var(--border-subtle)] rounded-2xl p-7 flex flex-col items-center justify-center text-center">
          <div className="relative mb-4">
            {profile.avatarDataUrl ? (
              <img
                src={profile.avatarDataUrl}
                alt={`${profile.fullName || profile.username} avatar`}
                className="w-24 h-24 rounded-full object-cover border-2 border-[var(--accent-soft)]"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-3xl font-bold flex items-center justify-center">
                {initial}
              </div>
            )}
            {profile.avatarDataUrl && (
              <button
                type="button"
                onClick={() => patch({ avatarDataUrl: undefined }, 'Removed profile picture')}
                aria-label="Remove profile picture"
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-rose-600 flex items-center justify-center shadow-xs cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <h2 className="text-base font-bold text-[var(--text-primary)]">
            {profile.fullName || profile.username}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 mb-5">
            {profile.email || `@${profile.username}`}
          </p>

          <label className="px-4 py-2 rounded-xl bg-white border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 transition-colors cursor-pointer">
            <Camera className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{profile.avatarDataUrl ? 'Change picture' : 'Add picture later'}</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </label>
        </section>

        {/* Right Form Card */}
        <section className="lg:col-span-8 bg-white border border-[var(--border-subtle)] rounded-2xl p-6 md:p-7 space-y-5">
          {/* Row 1: Full name, DOB, Age */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-6">
              <label
                htmlFor="profile-fullname"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Full name
              </label>
              <input
                id="profile-fullname"
                type="text"
                value={profile.fullName}
                onChange={(e) => patch({ fullName: e.target.value })}
                placeholder="Your full name"
                className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-4">
              <label
                htmlFor="profile-dob"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Date of birth
              </label>
              <input
                id="profile-dob"
                type="date"
                value={profile.dob}
                onChange={(e) => patch({ dob: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="profile-age"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Age
              </label>
              <input
                id="profile-age"
                type="text"
                value={profile.age}
                onChange={(e) => patch({ age: e.target.value })}
                placeholder="-"
                className="w-full h-10 px-3 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-center text-[var(--text-primary)] focus:outline-none tabular-nums"
              />
            </div>
          </div>

          {/* Row 2: Email & LinkedIn */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="profile-email"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Email
              </label>
              <input
                id="profile-email"
                type="text"
                value={profile.email}
                onChange={(e) => patch({ email: e.target.value })}
                placeholder="you@example.com"
                className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="profile-linkedin"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                LinkedIn
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="profile-linkedin"
                  type="text"
                  value={profile.linkedin}
                  onChange={(e) => patch({ linkedin: e.target.value })}
                  placeholder="linkedin.com/in/..."
                  className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                />
                {profile.linkedin && (
                  <a
                    href={normalizeExternalUrl(profile.linkedin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open LinkedIn profile"
                    className="h-10 w-10 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Row 3: GitHub & Portfolio */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="profile-github"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                GitHub
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="profile-github"
                  type="text"
                  value={profile.github}
                  onChange={(e) => patch({ github: e.target.value })}
                  placeholder="github.com/..."
                  className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                />
                {profile.github && (
                  <a
                    href={normalizeExternalUrl(profile.github)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open GitHub profile"
                    className="h-10 w-10 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="profile-portfolio"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Portfolio
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="profile-portfolio"
                  type="text"
                  value={profile.portfolio}
                  onChange={(e) => patch({ portfolio: e.target.value })}
                  placeholder="yourname.dev"
                  className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                />
                {profile.portfolio && (
                  <a
                    href={normalizeExternalUrl(profile.portfolio)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open Portfolio site"
                    className="h-10 w-10 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Row 4: Resume link + optional Resume PDF upload */}
          <div>
            <label
              htmlFor="profile-resume"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Resume link
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="profile-resume"
                type="text"
                value={profile.resumeLink}
                onChange={(e) => patch({ resumeLink: e.target.value })}
                placeholder="Link to your resume"
                className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--bg-input)] border border-transparent focus:bg-white focus:border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <label className="h-10 px-3.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                  <Upload className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>{profile.resumeFileName ? 'Replace PDF' : 'Attach PDF'}</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleResumeUpload}
                    className="hidden"
                  />
                </label>
                {profile.resumeLink && /^https?:\/\//i.test(profile.resumeLink) && (
                  <a
                    href={profile.resumeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open Resume link"
                    className="h-10 w-10 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
