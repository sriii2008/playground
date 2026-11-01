import React, { useState } from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CertificateFormat, CertificateItem } from '../types';

interface CertificatesViewProps {
  certificates: CertificateItem[];
  activePreviewCert: CertificateItem | null;
  onSetActivePreviewCert: (cert: CertificateItem | null) => void;
  onAddCertificate: (cert: CertificateItem) => void;
  onUpdateCertificate: (cert: CertificateItem) => void;
  onDeleteCertificate: (certId: string) => void;
}

const FORMAT_BADGE_STYLES: Record<CertificateFormat, string> = {
  PDF: 'bg-[#fee2e2] text-[#dc2626]',
  PNG: 'bg-[#e0f2fe] text-[#0284c7]',
  JPG: 'bg-[#fef3c7] text-[#d97706]',
};

export const CertificatesView: React.FC<CertificatesViewProps> = ({
  certificates,
  activePreviewCert,
  onSetActivePreviewCert,
  onAddCertificate,
  onUpdateCertificate,
  onDeleteCertificate,
}) => {
  const [dragging, setDragging] = useState(false);

  const processFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop()?.toUpperCase() || '';
      let format: CertificateFormat = 'PDF';
      if (ext === 'PNG') format = 'PNG';
      else if (ext === 'JPG' || ext === 'JPEG') format = 'JPG';

      const baseTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      const monthYear = new Date().toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });

      const reader = new FileReader();
      reader.onload = () => {
        const newCert: CertificateItem = {
          id: `cert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: baseTitle || 'New Certificate',
          issuer: 'Uploaded Credential',
          date: monthYear,
          format,
          fileName: file.name,
          dataUrl: typeof reader.result === 'string' ? reader.result : undefined,
        };
        onAddCertificate(newCert);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-6">
      {/* Top Drag-and-Drop Card matching Figma Screenshot 4 */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`w-full rounded-2xl border-2 border-dashed p-10 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
          dragging
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]/50'
            : 'border-[var(--border-subtle)] bg-white hover:border-[var(--accent)]'
        }`}
      >
        <div className="w-11 h-11 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-3">
          <Upload className="w-5 h-5" />
        </div>
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          Drop certificates here or browse
        </span>
        <span className="text-xs text-[var(--text-secondary)] mt-1">
          PNG, JPG, PDF
        </span>
        <input
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
          onChange={(e) => {
            processFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
      </label>

      {/* 3-Column Certificates Grid */}
      {certificates.length === 0 ? (
        <div className="bg-white border border-[var(--border-subtle)] rounded-2xl p-8 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            No certificates stored yet
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Upload your hackathon finalist badges, course completions, or cloud credentials above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {certificates.map((cert) => (
            <article
              key={cert.id}
              onClick={() => onSetActivePreviewCert(cert)}
              className="group bg-white border border-[var(--border-subtle)] hover:border-[var(--accent)] rounded-2xl overflow-hidden transition-colors cursor-pointer flex flex-col"
            >
              {/* Pastel Preview Header */}
              <div className="h-36 bg-[var(--accent-soft)] flex items-center justify-center relative overflow-hidden">
                {cert.dataUrl && cert.format !== 'PDF' ? (
                  <img
                    src={cert.dataUrl}
                    alt={cert.title}
                    className="w-full h-full object-cover"
                  />
                ) : cert.format === 'PDF' ? (
                  <FileText className="w-8 h-8 text-[var(--accent)] opacity-85" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-[var(--accent)] opacity-85" />
                )}
              </div>

              {/* Card Body */}
              <div className="p-4 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {cert.title}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 ${
                      FORMAT_BADGE_STYLES[cert.format]
                    }`}
                  >
                    {cert.format}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  {cert.issuer} · {cert.date}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Certificate Inspector / Lightbox Modal */}
      {activePreviewCert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Certificate details for ${activePreviewCert.title}`}
          className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4"
          onClick={() => onSetActivePreviewCert(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-xl"
          >
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--text-primary)] truncate">
                {activePreviewCert.title}
              </span>
              <button
                type="button"
                onClick={() => onSetActivePreviewCert(null)}
                aria-label="Close certificate preview"
                className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="h-52 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center overflow-hidden">
                {activePreviewCert.dataUrl && activePreviewCert.format !== 'PDF' ? (
                  <img
                    src={activePreviewCert.dataUrl}
                    alt={activePreviewCert.title}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center space-y-2">
                    <FileText className="w-10 h-10 text-[var(--accent)] mx-auto" />
                    <p className="text-xs font-mono text-[var(--text-secondary)]">
                      {activePreviewCert.fileName || `${activePreviewCert.title}.${activePreviewCert.format.toLowerCase()}`}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Certificate title
                  </label>
                  <input
                    type="text"
                    value={activePreviewCert.title}
                    onChange={(e) => {
                      const updated = { ...activePreviewCert, title: e.target.value };
                      onSetActivePreviewCert(updated);
                      onUpdateCertificate(updated);
                    }}
                    className="w-full h-9.5 px-3 rounded-xl bg-[var(--bg-input)] text-sm focus:outline-none focus:bg-white focus:border focus:border-[var(--accent)]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Issuer / Organization
                  </label>
                  <input
                    type="text"
                    value={activePreviewCert.issuer}
                    onChange={(e) => {
                      const updated = { ...activePreviewCert, issuer: e.target.value };
                      onSetActivePreviewCert(updated);
                      onUpdateCertificate(updated);
                    }}
                    className="w-full h-9.5 px-3 rounded-xl bg-[var(--bg-input)] text-sm focus:outline-none focus:bg-white focus:border focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Date
                  </label>
                  <input
                    type="text"
                    value={activePreviewCert.date}
                    onChange={(e) => {
                      const updated = { ...activePreviewCert, date: e.target.value };
                      onSetActivePreviewCert(updated);
                      onUpdateCertificate(updated);
                    }}
                    className="w-full h-9.5 px-3 rounded-xl bg-[var(--bg-input)] text-sm focus:outline-none focus:bg-white focus:border focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteCertificate(activePreviewCert.id);
                    onSetActivePreviewCert(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete certificate</span>
                </button>

                <div className="flex items-center gap-2">
                  {activePreviewCert.dataUrl && (
                    <a
                      href={activePreviewCert.dataUrl}
                      download={activePreviewCert.fileName || activePreviewCert.title}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onSetActivePreviewCert(null)}
                    className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
