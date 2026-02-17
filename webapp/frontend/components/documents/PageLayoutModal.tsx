"use client";

import { useState, useCallback, useRef } from "react";
import { X, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { documentsAPI } from "@/lib/document-api";
import type { DocumentMetadata, DocumentMargins, DocumentHeaderFooter, DocumentWatermark } from "@/types";

type LayoutTab = "margins" | "headerFooter" | "watermark";

const DEFAULT_MARGINS: DocumentMargins = { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 };

const MARGIN_PRESETS = [
  { label: "Normal", margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 } },
  { label: "Narrow", margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 } },
  { label: "Wide", margins: { top: 25.4, right: 31.8, bottom: 25.4, left: 31.8 } },
];

const DEFAULT_HEADER_FOOTER: DocumentHeaderFooter = {
  enabled: false, left: "", center: "", right: "", imageUrl: null, imagePosition: null,
};

const DEFAULT_WATERMARK: DocumentWatermark = {
  enabled: false, type: "text", text: "DRAFT", imageUrl: null, opacity: 0.1,
};

const PLACEHOLDER_HINTS = [
  { tag: "{title}", desc: "Document title" },
  { tag: "{page}", desc: "Page number" },
  { tag: "{date}", desc: "Current date" },
];

interface PageLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: DocumentMetadata | null | undefined;
  onSave: (metadata: DocumentMetadata) => void;
  docId: number;
}

export function PageLayoutModal({ isOpen, onClose, metadata, onSave, docId }: PageLayoutModalProps) {
  const [activeTab, setActiveTab] = useState<LayoutTab>("margins");

  // Margins state
  const [margins, setMargins] = useState<DocumentMargins>(metadata?.margins ?? DEFAULT_MARGINS);

  // Header/Footer state
  const [header, setHeader] = useState<DocumentHeaderFooter>(metadata?.header ?? DEFAULT_HEADER_FOOTER);
  const [footer, setFooter] = useState<DocumentHeaderFooter>(metadata?.footer ?? { ...DEFAULT_HEADER_FOOTER, enabled: true, center: "Page {page}" });

  // Watermark state
  const [watermark, setWatermark] = useState<DocumentWatermark>(metadata?.watermark ?? DEFAULT_WATERMARK);

  // Image upload refs
  const headerImageRef = useRef<HTMLInputElement>(null);
  const footerImageRef = useRef<HTMLInputElement>(null);
  const watermarkImageRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = useCallback(async (
    file: File,
    target: "header" | "footer" | "watermark",
  ) => {
    setUploading(true);
    try {
      const result = await documentsAPI.uploadImage(file);
      if (target === "header") setHeader(h => ({ ...h, imageUrl: result.url }));
      else if (target === "footer") setFooter(f => ({ ...f, imageUrl: result.url }));
      else setWatermark(w => ({ ...w, imageUrl: result.url }));
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleSave = () => {
    onSave({ margins, header, footer, watermark });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl"
        style={{ width: "32rem", maxWidth: "calc(100vw - 2rem)", maxHeight: "calc(100vh - 4rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <h2 className="text-base font-semibold text-foreground">Page Layout</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#e8d4b8] dark:border-[#6b5a4a] px-5">
          {([
            { key: "margins" as const, label: "Margins" },
            { key: "headerFooter" as const, label: "Header & Footer" },
            { key: "watermark" as const, label: "Watermark" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px",
                activeTab === key
                  ? "border-[#a0704b] text-[#a0704b] dark:text-[#cd853f] dark:border-[#cd853f]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 16rem)" }}>
          {/* Margins Tab */}
          {activeTab === "margins" && (
            <div>
              {/* Presets */}
              <p className="text-xs text-muted-foreground mb-2">Presets</p>
              <div className="flex gap-2 mb-4">
                {MARGIN_PRESETS.map(({ label, margins: preset }) => {
                  const isActive = margins.top === preset.top && margins.right === preset.right
                    && margins.bottom === preset.bottom && margins.left === preset.left;
                  return (
                    <button
                      key={label}
                      onClick={() => setMargins(preset)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                        isActive
                          ? "bg-[#a0704b] text-white border-[#a0704b]"
                          : "border-[#e8d4b8] dark:border-[#6b5a4a] text-foreground hover:border-[#a0704b]/50"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Custom inputs */}
              <p className="text-xs text-muted-foreground mb-2">Custom (mm)</p>
              <div className="grid grid-cols-2 gap-3">
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <label key={side} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground capitalize w-12">{side}</span>
                    <input
                      type="number"
                      min={5}
                      max={50}
                      step={0.1}
                      value={margins[side]}
                      onChange={(e) => setMargins(m => ({ ...m, [side]: parseFloat(e.target.value) || 0 }))}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#2a2420] text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#a0704b]/40"
                    />
                  </label>
                ))}
              </div>

              {/* Visual preview */}
              <div className="mt-4 flex justify-center">
                <div className="relative bg-white dark:bg-[#2a2420] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded" style={{ width: 120, height: 170 }}>
                  <div
                    className="absolute bg-[#f5ede3]/60 dark:bg-[#3d2e1e]/60 border border-dashed border-[#a0704b]/30"
                    style={{
                      top: `${(margins.top / 297) * 170}px`,
                      right: `${(margins.right / 210) * 120}px`,
                      bottom: `${(margins.bottom / 297) * 170}px`,
                      left: `${(margins.left / 210) * 120}px`,
                    }}
                  >
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[8px] text-muted-foreground">Content</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Header & Footer Tab */}
          {activeTab === "headerFooter" && (
            <div className="space-y-5">
              {/* Header section */}
              <HeaderFooterSection
                label="Header"
                config={header}
                onChange={setHeader}
                imageRef={headerImageRef}
                onImageUpload={(f) => handleImageUpload(f, "header")}
                uploading={uploading}
              />

              <div className="h-px bg-[#e8d4b8] dark:bg-[#6b5a4a]" />

              {/* Footer section */}
              <HeaderFooterSection
                label="Footer"
                config={footer}
                onChange={setFooter}
                imageRef={footerImageRef}
                onImageUpload={(f) => handleImageUpload(f, "footer")}
                uploading={uploading}
              />

              {/* Placeholder hints */}
              <div className="bg-[#f5ede3]/50 dark:bg-[#2d2618]/50 rounded-lg p-3">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Available placeholders</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  {PLACEHOLDER_HINTS.map(({ tag, desc }) => (
                    <span key={tag} className="text-[10px] text-muted-foreground">
                      <code className="bg-[#e8d4b8]/50 dark:bg-[#6b5a4a]/50 px-1 rounded text-[#a0704b] dark:text-[#cd853f]">{tag}</code> {desc}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Watermark Tab */}
          {activeTab === "watermark" && (
            <div>
              {/* Enable toggle */}
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={watermark.enabled}
                  onChange={(e) => setWatermark(w => ({ ...w, enabled: e.target.checked }))}
                  className="rounded border-[#e8d4b8] dark:border-[#6b5a4a] text-[#a0704b] focus:ring-[#a0704b]"
                />
                <span className="text-sm text-foreground">Show watermark</span>
              </label>

              {watermark.enabled && (
                <>
                  {/* Type selector */}
                  <div className="flex gap-2 mb-3">
                    {(["text", "image"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setWatermark(w => ({ ...w, type: t }))}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize",
                          watermark.type === t
                            ? "bg-[#a0704b] text-white border-[#a0704b]"
                            : "border-[#e8d4b8] dark:border-[#6b5a4a] text-foreground hover:border-[#a0704b]/50"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {watermark.type === "text" ? (
                    <div className="mb-3">
                      <label className="text-xs text-muted-foreground mb-1 block">Watermark text</label>
                      <input
                        type="text"
                        value={watermark.text || ""}
                        onChange={(e) => setWatermark(w => ({ ...w, text: e.target.value }))}
                        placeholder="e.g. DRAFT, CONFIDENTIAL"
                        className="w-full px-3 py-1.5 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#2a2420] text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#a0704b]/40"
                      />
                    </div>
                  ) : (
                    <div className="mb-3">
                      <label className="text-xs text-muted-foreground mb-1 block">Watermark image</label>
                      {watermark.imageUrl ? (
                        <div className="flex items-center gap-2">
                          <img src={watermark.imageUrl} alt="Watermark" className="h-10 rounded border border-[#e8d4b8] dark:border-[#6b5a4a]" />
                          <button
                            onClick={() => setWatermark(w => ({ ...w, imageUrl: null }))}
                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => watermarkImageRef.current?.click()}
                          disabled={uploading}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-[#e8d4b8] dark:border-[#6b5a4a] text-xs text-muted-foreground hover:border-[#a0704b]/50 hover:text-foreground transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Upload image
                        </button>
                      )}
                      <input
                        ref={watermarkImageRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f, "watermark");
                          e.target.value = "";
                        }}
                      />
                    </div>
                  )}

                  {/* Opacity slider */}
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Opacity: {Math.round(watermark.opacity * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0.02}
                    max={1}
                    step={0.01}
                    value={watermark.opacity}
                    onChange={(e) => setWatermark(w => ({ ...w, opacity: parseFloat(e.target.value) }))}
                    className="w-full accent-[#a0704b]"
                  />

                  {/* Size slider (image only) */}
                  {watermark.type === "image" && (
                    <>
                      <label className="text-xs text-muted-foreground mb-1 block mt-2">
                        Size: {watermark.imageSize ?? 60}%
                      </label>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        step={5}
                        value={watermark.imageSize ?? 60}
                        onChange={(e) => setWatermark(w => ({ ...w, imageSize: parseInt(e.target.value) }))}
                        className="w-full accent-[#a0704b]"
                      />
                    </>
                  )}

                  {/* Preview */}
                  <div className="mt-3 flex justify-center">
                    <div className="relative bg-white dark:bg-[#2a2420] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded overflow-hidden" style={{ width: 120, height: 170 }}>
                      {watermark.type === "text" ? (
                        <span
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 font-bold text-black dark:text-white whitespace-nowrap pointer-events-none select-none"
                          style={{ fontSize: "14px", opacity: watermark.opacity }}
                        >
                          {watermark.text || "DRAFT"}
                        </span>
                      ) : watermark.imageUrl ? (
                        <img
                          src={watermark.imageUrl}
                          alt="Preview"
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
                          style={{ opacity: watermark.opacity, maxWidth: `${watermark.imageSize ?? 60}%`, maxHeight: `${watermark.imageSize ?? 60}%` }}
                        />
                      ) : null}
                      <div className="absolute inset-3 flex items-center justify-center">
                        <span className="text-[8px] text-muted-foreground">Preview</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/* Header/Footer sub-section */
function HeaderFooterSection({
  label,
  config,
  onChange,
  imageRef,
  onImageUpload,
  uploading,
}: {
  label: string;
  config: DocumentHeaderFooter;
  onChange: (c: DocumentHeaderFooter) => void;
  imageRef: React.RefObject<HTMLInputElement | null>;
  onImageUpload: (f: File) => void;
  uploading: boolean;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 mb-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
          className="rounded border-[#e8d4b8] dark:border-[#6b5a4a] text-[#a0704b] focus:ring-[#a0704b]"
        />
        <span className="text-sm font-medium text-foreground">Show {label.toLowerCase()}</span>
      </label>

      {config.enabled && (
        <div className="pl-6 space-y-2">
          {/* 3-column text inputs */}
          <div className="grid grid-cols-3 gap-2">
            {(["left", "center", "right"] as const).map((pos) => (
              <div key={pos}>
                <label className="text-[10px] text-muted-foreground capitalize">{pos}</label>
                <input
                  type="text"
                  value={config[pos]}
                  onChange={(e) => onChange({ ...config, [pos]: e.target.value })}
                  placeholder={pos === "center" ? "e.g. Page {page}" : ""}
                  className="w-full px-2 py-1 rounded border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#2a2420] text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-[#a0704b]/40"
                />
              </div>
            ))}
          </div>

          {/* Image upload */}
          <div className="flex items-center gap-2">
            {config.imageUrl ? (
              <>
                <img src={config.imageUrl} alt={`${label} image`} className="h-6 rounded border border-[#e8d4b8] dark:border-[#6b5a4a]" />
                <select
                  value={config.imagePosition || "left"}
                  onChange={(e) => onChange({ ...config, imagePosition: e.target.value as "left" | "center" | "right" })}
                  className="text-[10px] px-1 py-0.5 rounded border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#2a2420] text-foreground"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
                <button
                  onClick={() => onChange({ ...config, imageUrl: null, imagePosition: null })}
                  className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            ) : (
              <button
                onClick={() => imageRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 px-2 py-1 rounded border border-dashed border-[#e8d4b8] dark:border-[#6b5a4a] text-[10px] text-muted-foreground hover:border-[#a0704b]/50 hover:text-foreground transition-colors"
              >
                <Upload className="w-3 h-3" />
                Add logo
              </button>
            )}
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImageUpload(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
