"use client";

import { useState, useEffect, useMemo } from "react";
import { summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import type {
  SummerCourseConfig,
  SummerCourseFormConfig,
  SummerLocation,
  SummerBilingualOption,
} from "@/types";
import {
  ChevronDown,
  ChevronLeft,
  Plus,
  Trash2,
  Save,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { SummerConfigPreview } from "./SummerConfigPreview";
import { Modal } from "@/components/ui/modal";

interface SummerConfigEditorProps {
  configId: number | null;
  isNew: boolean;
  isReadOnly: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

// Helper to format date strings for input[type=date] and input[type=datetime-local]
function toDateInput(val: string | null | undefined): string {
  if (!val) return "";
  return val.slice(0, 10);
}
function toDatetimeInput(val: string | null | undefined): string {
  if (!val) return "";
  return val.slice(0, 16);
}

const ALL_DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const TEXT_CONTENT_GROUPS = [
  {
    group: "Step 1: Student Info",
    step: 1,
    keys: [
      { key: "title", label: "Form Title", help: "Displayed at the top of the form" },
      { key: "intro", label: "Intro Paragraph", help: "Welcome message below the banner" },
      { key: "target_grades", label: "Target Grades", help: "Eligible grades description in course facts" },
      { key: "schedule_format", label: "Schedule Format", help: "Lesson count and frequency (e.g. 8 lessons · 1/week · 90 min)" },
    ],
  },
  {
    group: "Step 2: Background",
    step: 2,
    keys: [
      { key: "existing_student_question", label: "Existing Student Question", help: "Main question about MathConcept enrollment" },
      { key: "center_selection_prompt", label: "Center Selection Prompt", help: "Label for center selection" },
    ],
  },
  {
    group: "Step 3: Schedule",
    step: 3,
    keys: [
      { key: "preference_1_label", label: "1st Preference Label", help: "Heading for first day/time selection" },
      { key: "preference_2_label", label: "2nd Preference Label", help: "Heading for second day/time selection" },
      { key: "unavailability_prompt", label: "Unavailability Prompt", help: "Label for holiday unavailability" },
    ],
  },
  {
    group: "Step 4: Contact",
    step: 4,
    keys: [
      { key: "wechat_prompt", label: "WeChat Prompt", help: "Label asking for WeChat ID" },
      { key: "phone_prompt", label: "Phone Prompt", help: "Label asking for phone number" },
      { key: "buddy_title", label: "Buddy Group Title", help: "Heading for buddy group section" },
      { key: "buddy_description", label: "Buddy Group Description", help: "Explanation of group discount" },
    ],
  },
  {
    group: "Step 5: Review",
    step: 5,
    keys: [
      { key: "disclaimer", label: "Disclaimer", help: "Legal notice about schedule finalization" },
      { key: "success_message", label: "Success Message", help: "Thank you message after submission" },
    ],
  },
];

// Collapsible section component
function Section({
  title,
  defaultOpen = false,
  onOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen && onOpen) onOpen();
        }}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 text-sm font-semibold text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {title}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

// Reusable field label
function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-medium text-muted-foreground mb-1"
    >
      {children}
    </label>
  );
}

// Reusable input
const inputClass =
  "w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground text-sm disabled:opacity-50";

// Inline validation helper text
function ValidationHint({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1">{message}</p>;
}

// Image thumbnail preview
function ImagePreview({ url, className = "w-32 h-12" }: { url: string; className?: string }) {
  if (!url) return null;
  return (
    <div className={`mt-1.5 rounded border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
}

export function SummerConfigEditor({
  configId,
  isNew,
  isReadOnly,
  onSaved,
  onCancel,
}: SummerConfigEditorProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Form state — mirrors SummerCourseConfig fields
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [appOpenDate, setAppOpenDate] = useState("");
  const [appCloseDate, setAppCloseDate] = useState("");
  const [courseStartDate, setCourseStartDate] = useState("");
  const [courseEndDate, setCourseEndDate] = useState("");
  const [totalLessons, setTotalLessons] = useState(8);
  const [baseFee, setBaseFee] = useState(0);
  const [registrationFee, setRegistrationFee] = useState(0);
  const [discounts, setDiscounts] = useState<
    Array<{
      code: string;
      name_zh: string;
      name_en: string;
      amount: number;
      conditions: Record<string, unknown>;
    }>
  >([]);
  const [locations, setLocations] = useState<SummerLocation[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [grades, setGrades] = useState<SummerBilingualOption[]>([]);
  const [existingStudentOptions, setExistingStudentOptions] = useState<
    SummerBilingualOption[]
  >([]);
  const [centerOptions, setCenterOptions] = useState<SummerBilingualOption[]>(
    []
  );
  const [textContent, setTextContent] = useState<Record<string, string>>({});

  // Dirty state tracking
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Field-level validation (shown on blur)
  const [validationErrors, setValidationErrors] = useState<Record<string, string | null>>({});

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        year, title, description, isActive, bannerImageUrl,
        appOpenDate, appCloseDate, courseStartDate, courseEndDate,
        totalLessons, baseFee, registrationFee, discounts,
        locations, timeSlots, grades, existingStudentOptions,
        centerOptions, textContent,
      }),
    [
      year, title, description, isActive, bannerImageUrl,
      appOpenDate, appCloseDate, courseStartDate, courseEndDate,
      totalLessons, baseFee, registrationFee, discounts,
      locations, timeSlots, grades, existingStudentOptions,
      centerOptions, textContent,
    ]
  );

  const isDirty = snapshotReady && currentSnapshot !== initialSnapshot;

  // Set initial snapshot once loading is done
  useEffect(() => {
    if (!loading && !snapshotReady) {
      setInitialSnapshot(currentSnapshot);
      setSnapshotReady(true);
    }
  }, [loading, snapshotReady, currentSnapshot]);

  // Load config data
  useEffect(() => {
    if (isNew || configId === null) return;
    (async () => {
      try {
        const config = await summerAPI.getConfig(configId);
        setYear(config.year);
        setTitle(config.title);
        setDescription(config.description || "");
        setIsActive(config.is_active);
        setBannerImageUrl(config.banner_image_url || "");
        setAppOpenDate(toDatetimeInput(config.application_open_date));
        setAppCloseDate(toDatetimeInput(config.application_close_date));
        setCourseStartDate(toDateInput(config.course_start_date));
        setCourseEndDate(toDateInput(config.course_end_date));
        setTotalLessons(config.total_lessons);
        setBaseFee(config.pricing_config.base_fee);
        setRegistrationFee(config.pricing_config.registration_fee || 0);
        setDiscounts(
          (config.pricing_config.discounts || []).map((d) => ({
            code: d.code,
            name_zh: d.name_zh,
            name_en: d.name_en,
            amount: d.amount,
            conditions: d.conditions || {},
          }))
        );
        setLocations(config.locations);
        setTimeSlots(config.time_slots);
        setGrades(config.available_grades);
        setExistingStudentOptions(config.existing_student_options || []);
        setCenterOptions(config.center_options || []);
        setTextContent(config.text_content || {});
      } catch {
        showToast("Failed to load config", "error");
        onCancel();
      } finally {
        setLoading(false);
      }
    })();
  }, [configId, isNew, showToast, onCancel]);

  // Validation helpers
  const validateField = (field: string) => {
    let error: string | null = null;
    switch (field) {
      case "year":
        if (year < 2020 || year > 2099) error = "Year must be between 2020 and 2099";
        break;
      case "dates":
        if (appOpenDate && appCloseDate && appCloseDate <= appOpenDate)
          error = "Close date must be after open date";
        if (courseStartDate && courseEndDate && courseEndDate <= courseStartDate)
          error = (error ? error + ". " : "") + "End date must be after start date";
        break;
      case "baseFee":
        if (baseFee <= 0) error = "Base fee should be greater than 0";
        break;
    }
    // Location name validation (field = "locationName_0", "locationName_1", etc.)
    if (field.startsWith("locationName_")) {
      const idx = parseInt(field.split("_")[1]);
      const loc = locations[idx];
      if (loc && !loc.name.trim() && !loc.name_en.trim()) {
        error = "Location name is required";
      }
    }
    // Time slot format validation (field = "timeSlot_0_Monday", etc.)
    if (field.startsWith("timeSlot_")) {
      const parts = field.split("_");
      const locIdx = parseInt(parts[1]);
      const day = parts.slice(2).join("_");
      const loc = locations[locIdx];
      const slots = loc?.time_slots?.[day] || [];
      const pattern = /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/;
      const bad = slots.filter((s) => s && !pattern.test(s));
      if (bad.length > 0) {
        error = `Invalid format: ${bad.join(", ")}. Expected HH:MM - HH:MM`;
      }
    }
    setValidationErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleCancel = () => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      onCancel();
    }
  };

  const handleSave = async () => {
    if (isReadOnly || saving) return;

    // Basic validation
    if (!title.trim()) {
      showToast("Title is required", "error");
      return;
    }
    if (!appOpenDate || !appCloseDate || !courseStartDate || !courseEndDate) {
      showToast("All dates are required", "error");
      return;
    }

    setSaving(true);
    const payload: Partial<SummerCourseConfig> = {
      year,
      title: title.trim(),
      description: description.trim() || null,
      is_active: isActive,
      banner_image_url: bannerImageUrl.trim() || null,
      application_open_date: appOpenDate,
      application_close_date: appCloseDate,
      course_start_date: courseStartDate,
      course_end_date: courseEndDate,
      total_lessons: totalLessons,
      pricing_config: {
        base_fee: baseFee,
        registration_fee: registrationFee || undefined,
        discounts: discounts.length > 0 ? discounts : undefined,
      },
      locations,
      available_grades: grades,
      time_slots: timeSlots,
      existing_student_options: existingStudentOptions.length > 0 ? existingStudentOptions : null,
      center_options: centerOptions.length > 0 ? centerOptions : null,
      text_content: Object.keys(textContent).length > 0 ? textContent : null,
    };

    try {
      if (isNew) {
        await summerAPI.createConfig(payload);
        showToast("Config created", "success");
      } else {
        await summerAPI.updateConfig(configId!, payload);
        showToast("Config saved", "success");
      }
      setInitialSnapshot(currentSnapshot);
      onSaved();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  // Delete array items with undo toast
  const deleteWithUndo = <T,>(
    items: T[],
    index: number,
    setter: (items: T[]) => void,
    label: string
  ) => {
    const removed = items[index];
    const next = items.filter((_, j) => j !== index);
    setter(next);
    showToast(`${label} deleted`, "info", {
      label: "Undo",
      onClick: () => {
        const restored = [...next];
        restored.splice(index, 0, removed);
        setter(restored);
      },
    });
  };

  // Assemble a live config object for the preview
  const [previewStep, setPreviewStep] = useState(1);
  const [showPreview, setShowPreview] = useState(false);

  const assembledConfig: SummerCourseFormConfig = useMemo(
    () => ({
      year,
      title,
      description: description || null,
      application_open_date: appOpenDate || "",
      application_close_date: appCloseDate || "",
      course_start_date: courseStartDate || "",
      course_end_date: courseEndDate || "",
      total_lessons: totalLessons,
      pricing_config: {
        base_fee: baseFee,
        registration_fee: registrationFee || undefined,
        discounts: discounts.length > 0 ? discounts : undefined,
      },
      locations,
      available_grades: grades,
      time_slots: timeSlots,
      existing_student_options: existingStudentOptions.length > 0 ? existingStudentOptions : null,
      center_options: centerOptions.length > 0 ? centerOptions : null,
      text_content: Object.keys(textContent).length > 0 ? textContent : null,
      banner_image_url: bannerImageUrl || null,
    }),
    [
      year, title, description, appOpenDate, appCloseDate,
      courseStartDate, courseEndDate, totalLessons, baseFee,
      registrationFee, discounts, locations, grades, timeSlots,
      existingStudentOptions, centerOptions, textContent, bannerImageUrl,
    ]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <h2 className="text-xl font-bold text-foreground">
            {isNew ? "New Config" : `Edit ${year} Config`}
          </h2>
          {isDirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              (unsaved)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile preview toggle */}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {showPreview ? (
              <><EyeOff className="h-4 w-4" /> Editor</>
            ) : (
              <><Eye className="h-4 w-4" /> Preview</>
            )}
          </button>
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Split layout: editor + preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: editor */}
        <div className={`space-y-4 ${showPreview ? "hidden lg:block" : ""}`}>

      {/* Section 1: Basic Info */}
      <Section title="Basic Info" defaultOpen onOpen={() => setPreviewStep(1)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="year">Year</Label>
            <input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value) || 0)}
              onBlur={() => validateField("year")}
              className={`${inputClass} ${validationErrors.year ? "border-red-300 dark:border-red-700" : ""}`}
              disabled={isReadOnly}
            />
            <ValidationHint message={validationErrors.year ?? null} />
          </div>
          <div>
            <Label>Status</Label>
            <label className="flex items-center gap-2 mt-1.5">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isReadOnly}
                className="rounded"
              />
              <span className="text-sm text-foreground">Active (visible to public)</span>
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              Activating this config will deactivate all others.
            </p>
          </div>
        </div>
        <div>
          <Label htmlFor="title">Title</Label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            disabled={isReadOnly}
            placeholder="e.g. 2026 Summer Course"
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} min-h-[60px]`}
            disabled={isReadOnly}
            rows={2}
          />
        </div>
        <div>
          <Label htmlFor="bannerUrl">Banner Image URL</Label>
          <input
            id="bannerUrl"
            type="text"
            value={bannerImageUrl}
            onChange={(e) => setBannerImageUrl(e.target.value)}
            className={inputClass}
            disabled={isReadOnly}
            placeholder="/summer/summer-banner.jpg"
          />
          <ImagePreview url={bannerImageUrl} className="w-48 h-16" />
        </div>
      </Section>

      {/* Section 2: Dates */}
      <Section title="Dates" onOpen={() => setPreviewStep(1)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Application Open</Label>
            <input
              type="datetime-local"
              value={appOpenDate}
              onChange={(e) => setAppOpenDate(e.target.value)}
              onBlur={() => validateField("dates")}
              className={inputClass}
              disabled={isReadOnly}
            />
          </div>
          <div>
            <Label>Application Close</Label>
            <input
              type="datetime-local"
              value={appCloseDate}
              onChange={(e) => setAppCloseDate(e.target.value)}
              onBlur={() => validateField("dates")}
              className={`${inputClass} ${validationErrors.dates ? "border-red-300 dark:border-red-700" : ""}`}
              disabled={isReadOnly}
            />
          </div>
          <div>
            <Label>Course Start</Label>
            <input
              type="date"
              value={courseStartDate}
              onChange={(e) => setCourseStartDate(e.target.value)}
              onBlur={() => validateField("dates")}
              className={inputClass}
              disabled={isReadOnly}
            />
          </div>
          <div>
            <Label>Course End</Label>
            <input
              type="date"
              value={courseEndDate}
              onChange={(e) => setCourseEndDate(e.target.value)}
              onBlur={() => validateField("dates")}
              className={inputClass}
              disabled={isReadOnly}
            />
          </div>
        </div>
        <ValidationHint message={validationErrors.dates ?? null} />
        <div className="max-w-xs">
          <Label>Total Lessons</Label>
          <input
            type="number"
            value={totalLessons}
            onChange={(e) => setTotalLessons(parseInt(e.target.value) || 0)}
            className={inputClass}
            disabled={isReadOnly}
            min={1}
          />
        </div>
      </Section>

      {/* Section 3: Pricing */}
      <Section title="Pricing" onOpen={() => setPreviewStep(1)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Base Fee ($)</Label>
            <input
              type="number"
              value={baseFee}
              onChange={(e) => setBaseFee(parseInt(e.target.value) || 0)}
              onBlur={() => validateField("baseFee")}
              className={`${inputClass} ${validationErrors.baseFee ? "border-red-300 dark:border-red-700" : ""}`}
              disabled={isReadOnly}
            />
            <ValidationHint message={validationErrors.baseFee ?? null} />
          </div>
          <div>
            <Label>Registration Fee ($)</Label>
            <input
              type="number"
              value={registrationFee}
              onChange={(e) => setRegistrationFee(parseInt(e.target.value) || 0)}
              className={inputClass}
              disabled={isReadOnly}
            />
          </div>
        </div>

        {/* Discounts */}
        <div>
          <Label>Discounts</Label>
          {discounts.map((d, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_1fr_80px_auto] gap-2 mb-2 items-end"
            >
              <div>
                {i === 0 && <span className="text-[10px] text-muted-foreground">Code</span>}
                <input
                  value={d.code}
                  onChange={(e) => {
                    const next = [...discounts];
                    next[i] = { ...d, code: e.target.value };
                    setDiscounts(next);
                  }}
                  className={inputClass}
                  disabled={isReadOnly}
                  placeholder="early_bird"
                />
              </div>
              <div>
                {i === 0 && <span className="text-[10px] text-muted-foreground">Name (ZH)</span>}
                <input
                  value={d.name_zh}
                  onChange={(e) => {
                    const next = [...discounts];
                    next[i] = { ...d, name_zh: e.target.value };
                    setDiscounts(next);
                  }}
                  className={inputClass}
                  disabled={isReadOnly}
                />
              </div>
              <div>
                {i === 0 && <span className="text-[10px] text-muted-foreground">Name (EN)</span>}
                <input
                  value={d.name_en}
                  onChange={(e) => {
                    const next = [...discounts];
                    next[i] = { ...d, name_en: e.target.value };
                    setDiscounts(next);
                  }}
                  className={inputClass}
                  disabled={isReadOnly}
                />
              </div>
              <div>
                {i === 0 && <span className="text-[10px] text-muted-foreground">Amount</span>}
                <input
                  type="number"
                  value={d.amount}
                  onChange={(e) => {
                    const next = [...discounts];
                    next[i] = { ...d, amount: parseInt(e.target.value) || 0 };
                    setDiscounts(next);
                  }}
                  className={inputClass}
                  disabled={isReadOnly}
                />
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => deleteWithUndo(discounts, i, setDiscounts, "Discount")}
                  className="p-2 text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {!isReadOnly && (
            <button
              type="button"
              onClick={() =>
                setDiscounts([
                  ...discounts,
                  { code: "", name_zh: "", name_en: "", amount: 0, conditions: {} },
                ])
              }
              className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
            >
              <Plus className="h-3 w-3" /> Add Discount
            </button>
          )}
        </div>
      </Section>

      {/* Section 4: Locations */}
      <Section title="Locations" onOpen={() => setPreviewStep(3)}>
        {locations.map((loc, i) => (
          <div
            key={i}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Location {i + 1}
              </span>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => deleteWithUndo(locations, i, setLocations, "Location")}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Name (ZH)</Label>
                <input
                  value={loc.name}
                  onChange={(e) => {
                    const next = [...locations];
                    next[i] = { ...loc, name: e.target.value };
                    setLocations(next);
                  }}
                  onBlur={() => validateField(`locationName_${i}`)}
                  className={`${inputClass} ${validationErrors[`locationName_${i}`] ? "border-red-300 dark:border-red-700" : ""}`}
                  disabled={isReadOnly}
                />
              </div>
              <div>
                <Label>Name (EN)</Label>
                <input
                  value={loc.name_en}
                  onChange={(e) => {
                    const next = [...locations];
                    next[i] = { ...loc, name_en: e.target.value };
                    setLocations(next);
                  }}
                  onBlur={() => validateField(`locationName_${i}`)}
                  className={`${inputClass} ${validationErrors[`locationName_${i}`] ? "border-red-300 dark:border-red-700" : ""}`}
                  disabled={isReadOnly}
                />
                <ValidationHint message={validationErrors[`locationName_${i}`] ?? null} />
              </div>
              <div>
                <Label>Address (ZH)</Label>
                <input
                  value={loc.address}
                  onChange={(e) => {
                    const next = [...locations];
                    next[i] = { ...loc, address: e.target.value };
                    setLocations(next);
                  }}
                  className={inputClass}
                  disabled={isReadOnly}
                />
              </div>
              <div>
                <Label>Address (EN)</Label>
                <input
                  value={loc.address_en || ""}
                  onChange={(e) => {
                    const next = [...locations];
                    next[i] = { ...loc, address_en: e.target.value };
                    setLocations(next);
                  }}
                  className={inputClass}
                  disabled={isReadOnly}
                />
              </div>
              <div>
                <Label>Image URL</Label>
                <input
                  value={loc.image_url || ""}
                  onChange={(e) => {
                    const next = [...locations];
                    next[i] = { ...loc, image_url: e.target.value };
                    setLocations(next);
                  }}
                  className={inputClass}
                  disabled={isReadOnly}
                  placeholder="/summer/branch.jpg"
                />
                <ImagePreview url={loc.image_url || ""} className="w-24 h-16" />
              </div>
              <div>
                <Label>Open Days</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {ALL_DAYS.map((day) => {
                    const isOn = loc.open_days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => {
                          const next = [...locations];
                          if (isOn) {
                            const newDays = loc.open_days.filter((d) => d !== day);
                            const newTimeSlots = { ...loc.time_slots };
                            delete newTimeSlots[day];
                            next[i] = { ...loc, open_days: newDays, time_slots: newTimeSlots };
                          } else {
                            const newDays = ALL_DAYS.filter(
                              (d) => loc.open_days.includes(d) || d === day
                            );
                            const newTimeSlots = { ...(loc.time_slots || {}) };
                            newTimeSlots[day] = timeSlots;
                            next[i] = { ...loc, open_days: newDays, time_slots: newTimeSlots };
                          }
                          setLocations(next);
                        }}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                          isOn
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-white dark:bg-gray-800 text-muted-foreground border-gray-200 dark:border-gray-700 hover:border-primary/50"
                        } disabled:opacity-50`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Open days labels */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Open Days Label (ZH)</Label>
                <input
                  value={loc.open_days_label || ""}
                  onChange={(e) => {
                    const next = [...locations];
                    next[i] = { ...loc, open_days_label: e.target.value };
                    setLocations(next);
                  }}
                  className={inputClass}
                  disabled={isReadOnly}
                  placeholder="e.g. 一星期開七日"
                />
              </div>
              <div>
                <Label>Open Days Label (EN)</Label>
                <input
                  value={loc.open_days_label_en || ""}
                  onChange={(e) => {
                    const next = [...locations];
                    next[i] = { ...loc, open_days_label_en: e.target.value };
                    setLocations(next);
                  }}
                  className={inputClass}
                  disabled={isReadOnly}
                  placeholder="e.g. Open 7 days a week"
                />
              </div>
            </div>

            {/* Per-day time slots */}
            {loc.open_days.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Time Slots per Day</Label>
                  {!isReadOnly && loc.open_days.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const firstDay = loc.open_days[0];
                        const firstSlots = loc.time_slots?.[firstDay] || timeSlots;
                        const next = [...locations];
                        const newTimeSlots: Record<string, string[]> = {};
                        for (const day of loc.open_days) {
                          newTimeSlots[day] = [...firstSlots];
                        }
                        next[i] = { ...loc, time_slots: newTimeSlots };
                        setLocations(next);
                      }}
                      className="text-[10px] text-primary hover:text-primary-hover font-medium"
                    >
                      Copy first day to all
                    </button>
                  )}
                </div>
                {loc.open_days.map((day) => {
                  const slotKey = `timeSlot_${i}_${day}`;
                  return (
                  <div key={day}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">{day}</span>
                      <input
                        value={(loc.time_slots?.[day] || timeSlots).join(", ")}
                        onChange={(e) => {
                          const next = [...locations];
                          const newTimeSlots = { ...(loc.time_slots || {}) };
                          newTimeSlots[day] = e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          next[i] = { ...loc, time_slots: newTimeSlots };
                          setLocations(next);
                        }}
                        onBlur={() => validateField(slotKey)}
                        className={`${inputClass} flex-1 ${validationErrors[slotKey] ? "border-red-300 dark:border-red-700" : ""}`}
                        disabled={isReadOnly}
                        placeholder="10:00 - 11:30, 14:30 - 16:00"
                      />
                    </div>
                    <ValidationHint message={validationErrors[slotKey] ?? null} />
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {!isReadOnly && (
          <button
            type="button"
            onClick={() =>
              setLocations([
                ...locations,
                { name: "", name_en: "", address: "", open_days: [] },
              ])
            }
            className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
          >
            <Plus className="h-3 w-3" /> Add Location
          </button>
        )}
      </Section>

      {/* Section 5: Default Time Slots (fallback) */}
      <Section title="Default Time Slots" onOpen={() => setPreviewStep(3)}>
        <p className="text-xs text-muted-foreground mb-2">
          Fallback time slots used when a location doesn&apos;t define per-day slots.
        </p>
        <div className="space-y-2">
          {timeSlots.map((slot, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={slot}
                onChange={(e) => {
                  const next = [...timeSlots];
                  next[i] = e.target.value;
                  setTimeSlots(next);
                }}
                className={`${inputClass} flex-1`}
                disabled={isReadOnly}
                placeholder="e.g. 10:00 - 11:30"
              />
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => deleteWithUndo(timeSlots, i, setTimeSlots, "Time slot")}
                  className="p-2 text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() => setTimeSlots([...timeSlots, ""])}
            className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
          >
            <Plus className="h-3 w-3" /> Add Time Slot
          </button>
        )}
      </Section>

      {/* Section 6: Grades */}
      <Section title="Available Grades" onOpen={() => setPreviewStep(1)}>
        {grades.map((g, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_100px_auto] gap-2 items-end">
            <div>
              {i === 0 && <span className="text-[10px] text-muted-foreground">Name (ZH)</span>}
              <input
                value={g.name}
                onChange={(e) => {
                  const next = [...grades];
                  next[i] = { ...g, name: e.target.value };
                  setGrades(next);
                }}
                className={inputClass}
                disabled={isReadOnly}
              />
            </div>
            <div>
              {i === 0 && <span className="text-[10px] text-muted-foreground">Name (EN)</span>}
              <input
                value={g.name_en}
                onChange={(e) => {
                  const next = [...grades];
                  next[i] = { ...g, name_en: e.target.value };
                  setGrades(next);
                }}
                className={inputClass}
                disabled={isReadOnly}
              />
            </div>
            <div>
              {i === 0 && <span className="text-[10px] text-muted-foreground">Value</span>}
              <input
                value={g.value || ""}
                onChange={(e) => {
                  const next = [...grades];
                  next[i] = { ...g, value: e.target.value };
                  setGrades(next);
                }}
                className={inputClass}
                disabled={isReadOnly}
              />
            </div>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => deleteWithUndo(grades, i, setGrades, "Grade")}
                className="p-2 text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {!isReadOnly && (
          <button
            type="button"
            onClick={() =>
              setGrades([...grades, { name: "", name_en: "", value: "" }])
            }
            className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
          >
            <Plus className="h-3 w-3" /> Add Grade
          </button>
        )}
      </Section>

      {/* Section 7: Student Options */}
      <Section title="Student Options" onOpen={() => setPreviewStep(2)}>
        <div className="space-y-4">
          <div>
            <Label>Existing Student Options</Label>
            {existingStudentOptions.map((opt, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2 items-end">
                <div>
                  {i === 0 && <span className="text-[10px] text-muted-foreground">Name (ZH)</span>}
                  <input
                    value={opt.name}
                    onChange={(e) => {
                      const next = [...existingStudentOptions];
                      next[i] = { ...opt, name: e.target.value };
                      setExistingStudentOptions(next);
                    }}
                    className={inputClass}
                    disabled={isReadOnly}
                  />
                </div>
                <div>
                  {i === 0 && <span className="text-[10px] text-muted-foreground">Name (EN)</span>}
                  <input
                    value={opt.name_en}
                    onChange={(e) => {
                      const next = [...existingStudentOptions];
                      next[i] = { ...opt, name_en: e.target.value };
                      setExistingStudentOptions(next);
                    }}
                    className={inputClass}
                    disabled={isReadOnly}
                  />
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      deleteWithUndo(
                        existingStudentOptions, i,
                        setExistingStudentOptions, "Option"
                      )
                    }
                    className="p-2 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {!isReadOnly && (
              <button
                type="button"
                onClick={() =>
                  setExistingStudentOptions([
                    ...existingStudentOptions,
                    { name: "", name_en: "" },
                  ])
                }
                className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
              >
                <Plus className="h-3 w-3" /> Add Option
              </button>
            )}
          </div>

          <div>
            <Label>Center Options</Label>
            {centerOptions.map((opt, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2 items-end">
                <div>
                  {i === 0 && <span className="text-[10px] text-muted-foreground">Name (ZH)</span>}
                  <input
                    value={opt.name}
                    onChange={(e) => {
                      const next = [...centerOptions];
                      next[i] = { ...opt, name: e.target.value };
                      setCenterOptions(next);
                    }}
                    className={inputClass}
                    disabled={isReadOnly}
                  />
                </div>
                <div>
                  {i === 0 && <span className="text-[10px] text-muted-foreground">Name (EN)</span>}
                  <input
                    value={opt.name_en}
                    onChange={(e) => {
                      const next = [...centerOptions];
                      next[i] = { ...opt, name_en: e.target.value };
                      setCenterOptions(next);
                    }}
                    className={inputClass}
                    disabled={isReadOnly}
                  />
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      deleteWithUndo(centerOptions, i, setCenterOptions, "Center")
                    }
                    className="p-2 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {!isReadOnly && (
              <button
                type="button"
                onClick={() =>
                  setCenterOptions([...centerOptions, { name: "", name_en: "" }])
                }
                className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
              >
                <Plus className="h-3 w-3" /> Add Center
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* Section 8: Text Content — grouped by form step */}
      <Section title="Text Content (Bilingual)" onOpen={() => setPreviewStep(1)}>
        <p className="text-xs text-muted-foreground mb-3">
          Bilingual text used in the application form. Edit pairs (ZH / EN) below. Empty fields fall back to hardcoded defaults.
        </p>
        <div className="space-y-6">
          {TEXT_CONTENT_GROUPS.map(({ group, step, keys }) => (
            <div key={group}>
              <button
                type="button"
                onClick={() => setPreviewStep(step)}
                className="text-xs font-semibold text-primary/80 hover:text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5"
              >
                {group}
                <span className="text-[10px] font-normal normal-case text-muted-foreground">
                  — click to preview
                </span>
              </button>
              <div className="space-y-4">
                {keys.map(({ key, label, help }) => (
                  <div key={key} className="space-y-1.5">
                    <div>
                      <span className="text-xs font-medium text-foreground">{label}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{help}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>{label} (ZH)</Label>
                        <textarea
                          value={textContent[`${key}_zh`] || ""}
                          onChange={(e) =>
                            setTextContent({ ...textContent, [`${key}_zh`]: e.target.value })
                          }
                          className={`${inputClass} min-h-[60px]`}
                          disabled={isReadOnly}
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label>{label} (EN)</Label>
                        <textarea
                          value={textContent[`${key}_en`] || ""}
                          onChange={(e) =>
                            setTextContent({ ...textContent, [`${key}_en`]: e.target.value })
                          }
                          className={`${inputClass} min-h-[60px]`}
                          disabled={isReadOnly}
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

        </div>{/* end left column */}

        {/* Right column: preview */}
        <div className={`flex flex-col lg:sticky lg:top-0 lg:h-[calc(100vh-8rem)] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${showPreview ? "h-[70vh]" : "hidden lg:flex"}`}>
          <SummerConfigPreview
            config={assembledConfig}
            previewStep={previewStep}
            onStepChange={setPreviewStep}
          />
        </div>

      </div>{/* end grid */}

      {/* Discard changes confirmation */}
      <Modal
        isOpen={showDiscardDialog}
        onClose={() => setShowDiscardDialog(false)}
        title="Unsaved Changes"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowDiscardDialog(false)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Keep Editing
            </button>
            <button
              onClick={() => {
                setShowDiscardDialog(false);
                onCancel();
              }}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              Discard
            </button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          You have unsaved changes. Are you sure you want to leave?
        </p>
      </Modal>
    </div>
  );
}
