"use client";

import { useState, useCallback, useRef } from "react";
import { X, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { documentsAPI } from "@/lib/document-api";
import type { DocumentMetadata, DocumentMargins, DocumentHeaderFooter, DocumentWatermark } from "@/types";
import { Button, Field, IconButton, Input, Label, Segmented, Select } from "@/components/controls";

type LayoutTab = "margins" | "headerFooter" | "watermark" | "fonts";

const DEFAULT_MARGINS: DocumentMargins = { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 };

const MARGIN_PRESETS = [
  { label: "Normal", margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 } },
  { label: "Narrow", margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 } },
  { label: "Wide", margins: { top: 25.4, right: 31.8, bottom: 25.4, left: 31.8 } },
];

const DEFAULT_HEADER_FOOTER: DocumentHeaderFooter = {
  enabled: false, left: "", center: "", right: "", imageUrl: null, imagePosition: null,
  fontSize: 9, fontFamily: null, fontFamilyCjk: null,
};

const HF_FONT_SIZES = [7, 8, 9, 10, 11, 12, 14];

const HF_FONTS_LATIN = [
  { label: "Default", value: null as string | null },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Calibri", value: "Calibri, 'Gill Sans', sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
];

const HF_FONTS_CJK = [
  { label: "Default", value: null as string | null },
  { label: "思源黑體", value: "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif" },
  { label: "思源宋體", value: "'Noto Serif TC', 'PMingLiU', 'Songti TC', serif" },
  { label: "標楷體", value: "'DFKai-SB', 'BiauKai', 'Kaiti TC', serif" },
];

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

  // Body font state
  const [bodyFontFamily, setBodyFontFamily] = useState<string | null>(metadata?.bodyFontFamily ?? null);
  const [bodyFontFamilyCjk, setBodyFontFamilyCjk] = useState<string | null>(metadata?.bodyFontFamilyCjk ?? null);
  const [bodyFontSize, setBodyFontSize] = useState<number>(metadata?.bodyFontSize ?? 12);

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
    onSave({ margins, header, footer, watermark, bodyFontFamily, bodyFontFamilyCjk, bodyFontSize: bodyFontSize !== 12 ? bodyFontSize : null });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-line shadow-xl"
        style={{ width: "32rem", maxWidth: "calc(100vw - 2rem)", maxHeight: "calc(100vh - 4rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h2 className="text-base font-semibold text-foreground">Page layout</h2>
          <IconButton icon={X} size="sm" label="Close" onClick={onClose} />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-line px-5">
          {([
            { key: "margins" as const, label: "Margins" },
            { key: "headerFooter" as const, label: "Header & footer" },
            { key: "watermark" as const, label: "Watermark" },
            { key: "fonts" as const, label: "Fonts" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px",
                activeTab === key
                  ? "border-primary text-accent-ink dark:border-[#cd853f]"
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
              {/* No option is pressed while the margins are custom. */}
              <Segmented
                label="Margin preset"
                className="mb-4"
                value={MARGIN_PRESETS.find(({ margins: preset }) =>
                  margins.top === preset.top && margins.right === preset.right
                  && margins.bottom === preset.bottom && margins.left === preset.left
                )?.label ?? ""}
                onChange={(label) => {
                  const preset = MARGIN_PRESETS.find((p) => p.label === label);
                  if (preset) setMargins(preset.margins);
                }}
                options={MARGIN_PRESETS.map(({ label }) => ({ value: label, label }))}
              />

              {/* Custom inputs */}
              <p className="text-xs text-muted-foreground mb-2">Custom (mm)</p>
              <div className="grid grid-cols-2 gap-3">
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <label key={side} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground capitalize w-12">{side}</span>
                    <Input
                      type="number"
                      min={5}
                      max={50}
                      step={0.1}
                      value={margins[side]}
                      onChange={(e) => setMargins(m => ({ ...m, [side]: parseFloat(e.target.value) || 0 }))}
                      className="flex-1"
                    />
                  </label>
                ))}
              </div>

              {/* Visual preview */}
              <div className="mt-4 flex justify-center">
                <div className="relative bg-white dark:bg-[#2a2420] border border-line rounded" style={{ width: 120, height: 170 }}>
                  <div
                    className="absolute bg-[#f5ede3]/60 dark:bg-[#3d2e1e]/60 border border-dashed border-primary/30"
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

              <div className="h-px bg-line" />

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
                      <code className="bg-line/50 px-1 rounded text-accent-ink">{tag}</code> {desc}
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
                  className="rounded border-line text-accent-ink focus:ring-primary"
                />
                <span className="text-sm text-foreground">Show watermark</span>
              </label>

              {watermark.enabled && (
                <>
                  {/* Type selector */}
                  <Segmented
                    label="Watermark type"
                    className="mb-3"
                    value={watermark.type}
                    onChange={(t) => setWatermark(w => ({ ...w, type: t }))}
                    options={[
                      { value: "text", label: "Text" },
                      { value: "image", label: "Image" },
                    ]}
                  />

                  {watermark.type === "text" ? (
                    <Field label="Watermark text" id="watermark-text" className="mb-3">
                      <Input
                        type="text"
                        value={watermark.text || ""}
                        onChange={(e) => setWatermark(w => ({ ...w, text: e.target.value }))}
                        placeholder="e.g. DRAFT, CONFIDENTIAL"
                      />
                    </Field>
                  ) : (
                    <div className="mb-3">
                      <Label>Watermark image</Label>
                      {watermark.imageUrl ? (
                        <div className="flex items-center gap-2">
                          <img src={watermark.imageUrl} alt="Watermark" className="h-10 rounded border border-line" />
                          <IconButton
                            icon={Trash2}
                            size="sm"
                            tone="danger"
                            label="Remove watermark image"
                            onClick={() => setWatermark(w => ({ ...w, imageUrl: null }))}
                          />
                        </div>
                      ) : (
                        <Button size="sm" icon={Upload} loading={uploading} onClick={() => watermarkImageRef.current?.click()}>
                          Upload image
                        </Button>
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
                  <Label htmlFor="watermark-opacity">
                    Opacity: {Math.round(watermark.opacity * 100)}%
                  </Label>
                  <input
                    id="watermark-opacity"
                    type="range"
                    min={0.02}
                    max={1}
                    step={0.01}
                    value={watermark.opacity}
                    onChange={(e) => setWatermark(w => ({ ...w, opacity: parseFloat(e.target.value) }))}
                    className="w-full accent-primary"
                  />

                  {/* Size slider (image only) */}
                  {watermark.type === "image" && (
                    <>
                      <Label htmlFor="watermark-size" className="mt-2">
                        Size: {watermark.imageSize ?? 60}%
                      </Label>
                      <input
                        id="watermark-size"
                        type="range"
                        min={20}
                        max={100}
                        step={5}
                        value={watermark.imageSize ?? 60}
                        onChange={(e) => setWatermark(w => ({ ...w, imageSize: parseInt(e.target.value) }))}
                        className="w-full accent-primary"
                      />
                    </>
                  )}

                  {/* Preview */}
                  <div className="mt-3 flex justify-center">
                    <div className="relative bg-white dark:bg-[#2a2420] border border-line rounded overflow-hidden" style={{ width: 120, height: 170 }}>
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

          {/* Fonts Tab */}
          {activeTab === "fonts" && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Body font</p>
              <p className="text-[10px] text-muted-foreground mb-2">Default font for document content (can be overridden per selection)</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="body-font-latin">English font</Label>
                  <Select
                    id="body-font-latin"
                    size="sm"
                    value={bodyFontFamily || ""}
                    onChange={(e) => setBodyFontFamily(e.target.value || null)}
                  >
                    {HF_FONTS_LATIN.map((ff) => (
                      <option key={ff.label} value={ff.value || ""}>{ff.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex-1 min-w-0">
                  <Label htmlFor="body-font-cjk">Chinese font</Label>
                  <Select
                    id="body-font-cjk"
                    size="sm"
                    value={bodyFontFamilyCjk || ""}
                    onChange={(e) => setBodyFontFamilyCjk(e.target.value || null)}
                  >
                    {HF_FONTS_CJK.map((ff) => (
                      <option key={ff.label} value={ff.value || ""}>{ff.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="w-20 shrink-0">
                  <Label htmlFor="body-font-size">Size</Label>
                  <Select
                    id="body-font-size"
                    size="sm"
                    value={bodyFontSize}
                    onChange={(e) => setBodyFontSize(parseInt(e.target.value))}
                  >
                    {[8, 10, 12, 14, 16, 18, 20, 24].map((s) => (
                      <option key={s} value={s}>{s}px</option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
          <Button onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Apply
          </Button>
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
  const idPrefix = `layout-${label.toLowerCase()}`;
  return (
    <div>
      <label className="flex items-center gap-2 mb-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
          className="rounded border-line text-accent-ink focus:ring-primary"
        />
        <span className="text-sm font-medium text-foreground">Show {label.toLowerCase()}</span>
      </label>

      {config.enabled && (
        <div className="pl-6 space-y-2">
          {/* 3-column text inputs */}
          <div className="grid grid-cols-3 gap-2">
            {(["left", "center", "right"] as const).map((pos) => (
              <div key={pos}>
                <Label htmlFor={`${idPrefix}-${pos}`}>{pos}</Label>
                <Input
                  id={`${idPrefix}-${pos}`}
                  size="sm"
                  type="text"
                  value={config[pos]}
                  onChange={(e) => onChange({ ...config, [pos]: e.target.value })}
                  placeholder={pos === "center" ? "e.g. Page {page}" : ""}
                />
              </div>
            ))}
          </div>

          {/* Font controls */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor={`${idPrefix}-font-latin`}>English font</Label>
              <Select
                id={`${idPrefix}-font-latin`}
                size="sm"
                value={config.fontFamily || ""}
                onChange={(e) => onChange({ ...config, fontFamily: e.target.value || null })}
              >
                {HF_FONTS_LATIN.map((ff) => (
                  <option key={ff.label} value={ff.value || ""}>{ff.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Label htmlFor={`${idPrefix}-font-cjk`}>Chinese font</Label>
              <Select
                id={`${idPrefix}-font-cjk`}
                size="sm"
                value={config.fontFamilyCjk || ""}
                onChange={(e) => onChange({ ...config, fontFamilyCjk: e.target.value || null })}
              >
                {HF_FONTS_CJK.map((ff) => (
                  <option key={ff.label} value={ff.value || ""}>{ff.label}</option>
                ))}
              </Select>
            </div>
            <div className="w-20 shrink-0">
              <Label htmlFor={`${idPrefix}-font-size`}>Size</Label>
              <Select
                id={`${idPrefix}-font-size`}
                size="sm"
                value={config.fontSize ?? 9}
                onChange={(e) => onChange({ ...config, fontSize: parseInt(e.target.value) })}
              >
                {HF_FONT_SIZES.map((s) => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Image upload */}
          <div className="flex items-center gap-2">
            {config.imageUrl ? (
              <>
                <img src={config.imageUrl} alt={`${label} image`} className="h-6 rounded border border-line" />
                <Select
                  size="sm"
                  aria-label={`${label} image position`}
                  value={config.imagePosition || "left"}
                  onChange={(e) => onChange({ ...config, imagePosition: e.target.value as "left" | "center" | "right" })}
                  className="w-24"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </Select>
                <IconButton
                  icon={Trash2}
                  size="sm"
                  tone="danger"
                  label={`Remove ${label.toLowerCase()} image`}
                  onClick={() => onChange({ ...config, imageUrl: null, imagePosition: null })}
                />
              </>
            ) : (
              <Button size="sm" icon={Upload} loading={uploading} onClick={() => imageRef.current?.click()}>
                Add logo
              </Button>
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
