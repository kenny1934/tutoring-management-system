"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  ChevronUp,
  Plus,
  Trash2,
  Save,
  Loader2,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import { SummerConfigPreview } from "./SummerConfigPreview";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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

const TIME_SLOT_PATTERN = /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/;

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

// Collapsible section component with status indicator
function Section({
  title,
  subtitle,
  status,
  defaultOpen = false,
  forceOpen,
  onOpen,
  children,
}: {
  title: string;
  subtitle?: string;
  status?: { filled: boolean; count?: string };
  defaultOpen?: boolean;
  forceOpen?: boolean;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  const isOpen = forceOpen || open;
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => {
          const willOpen = !isOpen;
          setOpen(willOpen);
          if (willOpen && onOpen) onOpen();
        }}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 text-sm font-semibold text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="flex items-center gap-2">
          {status && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${status.filled ? "bg-emerald-500" : "bg-amber-400"}`} />
          )}
          {title}
          {subtitle && (
            <span className="text-[10px] font-normal text-muted-foreground">{subtitle}</span>
          )}
          {status?.count && (
            <span className="text-[10px] font-normal text-muted-foreground">({status.count})</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && <div className="p-4 space-y-4">{children}</div>}
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

// Auto-expanding textarea
function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useCallback((el: HTMLTextAreaElement | null) => {
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  }, []);
  return (
    <textarea
      {...props}
      ref={ref}
      onInput={(e) => {
        const t = e.currentTarget;
        t.style.height = "auto";
        t.style.height = t.scrollHeight + "px";
        props.onInput?.(e);
      }}
    />
  );
}

// Inline time slot adder with native time pickers
function TimeSlotAdder({ lastSlot, onAdd }: { lastSlot?: string; onAdd: (slot: string) => void }) {
  const [show, setShow] = useState(false);

  // Auto-suggest defaults based on last slot
  const getDefaults = () => {
    if (lastSlot) {
      const match = lastSlot.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      if (match) {
        const endH = parseInt(match[3]);
        const endM = parseInt(match[4]);
        const startMin = endH * 60 + endM + 15;
        const newEndMin = startMin + 90;
        const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        return { start: fmt(startMin), end: fmt(newEndMin) };
      }
    }
    return { start: "10:00", end: "11:30" };
  };

  const defaults = getDefaults();
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);

  if (!show) {
    return (
      <button type="button" onClick={() => { const d = getDefaults(); setStart(d.start); setEnd(d.end); setShow(true); }} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:text-primary-hover border border-dashed border-primary/40 rounded-md hover:border-primary/60">
        <Plus className="h-3 w-3" /> Add
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="px-1.5 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-foreground" />
      <span className="text-xs text-muted-foreground">to</span>
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="px-1.5 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-foreground" />
      <button type="button" onClick={() => {
        if (start && end && start < end) {
          onAdd(`${start} - ${end}`);
          setShow(false);
        }
      }} className="p-1 text-primary hover:text-primary-hover"><Plus className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => setShow(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
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
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Field-level validation (shown on blur)
  const [validationErrors, setValidationErrors] = useState<Record<string, string | null>>({});
  // Sections to force open on validation error
  const [errorSections, setErrorSections] = useState<Set<string>>(new Set());
  const editorRef = useRef<HTMLDivElement>(null);

  // Assemble a live config object for the preview (also used for dirty tracking)
  const assembledConfig: SummerCourseFormConfig = useMemo(
    () => ({
      year,
      title,
      description: null,
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
      time_slots: [],
      existing_student_options: existingStudentOptions.length > 0 ? existingStudentOptions : null,
      center_options: centerOptions.length > 0 ? centerOptions : null,
      text_content: Object.keys(textContent).length > 0 ? textContent : null,
      banner_image_url: bannerImageUrl || null,
    }),
    [
      year, title, appOpenDate, appCloseDate,
      courseStartDate, courseEndDate, totalLessons, baseFee,
      registrationFee, discounts, locations, grades,
      existingStudentOptions, centerOptions, textContent, bannerImageUrl,
    ]
  );

  // Derive dirty state from assembledConfig + isActive
  const currentSnapshot = useMemo(
    () => JSON.stringify({ ...assembledConfig, isActive }),
    [assembledConfig, isActive]
  );
  const isDirty = initialSnapshot !== "" && currentSnapshot !== initialSnapshot;

  // Autosave draft key
  const draftKey = `summer-config-draft-${isNew ? "new" : configId}`;

  // Set initial snapshot once loading is done, then check for draft
  useEffect(() => {
    if (!loading && initialSnapshot === "") {
      setInitialSnapshot(currentSnapshot);

      // Check for saved draft
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const { snapshot, savedAt } = JSON.parse(saved);
          if (snapshot && snapshot !== currentSnapshot) {
            const ago = new Date(savedAt).toLocaleString();
            showToast(`Draft from ${ago} found`, "info", {
              label: "Restore",
              onClick: () => {
                const parsed = JSON.parse(snapshot);
                setYear(parsed.year);
                setTitle(parsed.title);
                setIsActive(parsed.isActive);
                setBannerImageUrl(parsed.banner_image_url || "");
                setAppOpenDate(parsed.application_open_date || "");
                setAppCloseDate(parsed.application_close_date || "");
                setCourseStartDate(parsed.course_start_date || "");
                setCourseEndDate(parsed.course_end_date || "");
                setTotalLessons(parsed.total_lessons);
                setBaseFee(parsed.pricing_config?.base_fee || 0);
                setRegistrationFee(parsed.pricing_config?.registration_fee || 0);
                setDiscounts(parsed.pricing_config?.discounts || []);
                setLocations(parsed.locations || []);
                setGrades(parsed.available_grades || []);
                setExistingStudentOptions(parsed.existing_student_options || []);
                setCenterOptions(parsed.center_options || []);
                setTextContent(parsed.text_content || {});
              },
            });
          } else {
            localStorage.removeItem(draftKey);
          }
        }
      } catch {
        // Ignore localStorage errors
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Periodic autosave when dirty
  useEffect(() => {
    if (!isDirty) return;
    const timer = setInterval(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          snapshot: currentSnapshot,
          savedAt: new Date().toISOString(),
        }));
      } catch {
        // Ignore quota errors
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [isDirty, currentSnapshot, draftKey]);

  // Load config data
  useEffect(() => {
    if (isNew || configId === null) return;
    (async () => {
      try {
        const config = await summerAPI.getConfig(configId);
        setYear(config.year);
        setTitle(config.title);
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
  const setValidation = (key: string, error: string | null) =>
    setValidationErrors((prev) => ({ ...prev, [key]: error }));

  const validateYear = () =>
    setValidation("year", year < 2020 || year > 2099 ? "Year must be between 2020 and 2099" : null);

  const validateDates = () => {
    let error: string | null = null;
    if (appOpenDate && appCloseDate && appCloseDate <= appOpenDate)
      error = "Close date must be after open date";
    if (courseStartDate && courseEndDate && courseEndDate <= courseStartDate)
      error = (error ? error + ". " : "") + "End date must be after start date";
    setValidation("dates", error);
  };

  const validateBaseFee = () =>
    setValidation("baseFee", baseFee <= 0 ? "Base fee should be greater than 0" : null);

  const validateLocationName = (locIdx: number) => {
    const loc = locations[locIdx];
    setValidation(
      `locationName_${locIdx}`,
      loc && !loc.name.trim() && !loc.name_en.trim() ? "Location name is required" : null
    );
  };

  const validateTimeSlot = (locIdx: number, day: string) => {
    const loc = locations[locIdx];
    const slots = loc?.time_slots?.[day] || [];
    const bad = slots.filter((s) => s && !TIME_SLOT_PATTERN.test(s));
    setValidation(
      `timeSlot_${locIdx}_${day}`,
      bad.length > 0 ? `Invalid format: ${bad.join(", ")}. Expected HH:MM - HH:MM` : null
    );
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

    // Run all validators and collect errors
    const errors: Record<string, string | null> = {};
    const sectionsWithErrors = new Set<string>();

    // Basic info
    if (!title.trim()) {
      errors.title = "Title is required";
      sectionsWithErrors.add("basic");
    }
    if (year < 2020 || year > 2099) {
      errors.year = "Year must be between 2020 and 2099";
      sectionsWithErrors.add("basic");
    }

    // Dates
    if (!appOpenDate || !appCloseDate || !courseStartDate || !courseEndDate) {
      errors.dates = "All dates are required";
      sectionsWithErrors.add("dates");
    } else {
      let dateError: string | null = null;
      if (appCloseDate <= appOpenDate) dateError = "Close date must be after open date";
      if (courseEndDate <= courseStartDate)
        dateError = (dateError ? dateError + ". " : "") + "End date must be after start date";
      if (dateError) {
        errors.dates = dateError;
        sectionsWithErrors.add("dates");
      }
    }

    // Pricing
    if (baseFee <= 0) {
      errors.baseFee = "Base fee should be greater than 0";
      sectionsWithErrors.add("pricing");
    }

    // Locations
    const expandLocs = new Set<number>();
    locations.forEach((loc, i) => {
      if (!loc.name.trim() && !loc.name_en.trim()) {
        errors[`locationName_${i}`] = "Location name is required";
        sectionsWithErrors.add("locations");
        expandLocs.add(i);
      }
      const days = loc.open_days || [];
      days.forEach((day) => {
        const slots = loc.time_slots?.[day] || [];
        const bad = slots.filter((s) => s && !TIME_SLOT_PATTERN.test(s));
        if (bad.length > 0) {
          errors[`timeSlot_${i}_${day}`] = `Invalid format: ${bad.join(", ")}`;
          sectionsWithErrors.add("locations");
          expandLocs.add(i);
        }
      });
    });

    // If there are errors, show them and scroll to first
    const errorKeys = Object.entries(errors).filter(([, v]) => v !== null);
    if (errorKeys.length > 0) {
      setValidationErrors(errors);
      setErrorSections(sectionsWithErrors);
      if (expandLocs.size > 0) {
        setExpandedLocations((prev) => new Set([...prev, ...expandLocs]));
      }
      showToast(`${errorKeys.length} validation issue${errorKeys.length > 1 ? "s" : ""} found`, "error");

      // Scroll to first error after sections open (double rAF ensures DOM update)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const firstErrorKey = errorKeys[0][0];
          const el = editorRef.current?.querySelector(`[data-field="${firstErrorKey}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });
      return;
    }

    // Clear any previous errors
    setValidationErrors({});
    setErrorSections(new Set());

    setSaving(true);
    const payload: Partial<SummerCourseConfig> = {
      year,
      title: title.trim(),
      description: null,
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
      time_slots: [],
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
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
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

  // Move array item up or down
  const moveItem = <T,>(items: T[], from: number, to: number, setter: (items: T[]) => void) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setter(next);
  };

  // Track which locations are expanded (by index)
  const [expandedLocations, setExpandedLocations] = useState<Set<number>>(new Set());
  const toggleLocation = (idx: number) => {
    setExpandedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const [previewStep, setPreviewStep] = useState(1);
  const [showPreview, setShowPreview] = useState(false);

  // Shared renderer for bilingual option lists (existingStudentOptions, centerOptions)
  const renderBilingualList = (
    label: string,
    items: SummerBilingualOption[],
    setItems: (items: SummerBilingualOption[]) => void,
    deleteLabel: string,
    addLabel: string,
  ) => (
    <div>
      <Label>{label}</Label>
      {items.map((opt, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 mb-2 items-end">
          {!isReadOnly && (
            <div className="flex flex-col gap-0.5">
              <button type="button" onClick={() => moveItem(items, i, i - 1, setItems)} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
              <button type="button" onClick={() => moveItem(items, i, i + 1, setItems)} disabled={i === items.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
            </div>
          )}
          <div>
            {i === 0 && <span className="text-[10px] text-muted-foreground">Name (ZH)</span>}
            <input
              value={opt.name}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...opt, name: e.target.value };
                setItems(next);
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
                const next = [...items];
                next[i] = { ...opt, name_en: e.target.value };
                setItems(next);
              }}
              className={inputClass}
              disabled={isReadOnly}
            />
          </div>
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => deleteWithUndo(items, i, setItems, deleteLabel)}
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
          onClick={() => setItems([...items, { name: "", name_en: "" }])}
          className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
        >
          <Plus className="h-3 w-3" /> {addLabel}
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div ref={editorRef} className="space-y-4">
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
          {errorSections.size > 0 && (
            <span className="text-xs text-red-600 dark:text-red-400 font-medium">
              ({Object.values(validationErrors).filter(Boolean).length} issue{Object.values(validationErrors).filter(Boolean).length !== 1 ? "s" : ""})
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
      <Section title="Basic Info & Banner" subtitle="Step 1" status={{ filled: !!title.trim() }} defaultOpen forceOpen={errorSections.has("basic")} onOpen={() => setPreviewStep(1)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="year">Year</Label>
            <input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value) || 0)}
              onBlur={validateYear}
              data-field="year"
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
            data-field="title"
            className={`${inputClass} ${validationErrors.title ? "border-red-300 dark:border-red-700" : ""}`}
            disabled={isReadOnly}
            placeholder="e.g. 2026 Summer Course"
          />
          <ValidationHint message={validationErrors.title ?? null} />
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
      <Section title="Dates & Schedule" subtitle="Step 1" status={{ filled: !!(appOpenDate && appCloseDate && courseStartDate && courseEndDate) }} forceOpen={errorSections.has("dates")} onOpen={() => setPreviewStep(1)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Application Open</Label>
            <input
              type="datetime-local"
              value={appOpenDate}
              onChange={(e) => setAppOpenDate(e.target.value)}
              onBlur={validateDates}
              data-field="dates"
              className={`${inputClass} ${validationErrors.dates ? "border-red-300 dark:border-red-700" : ""}`}
              disabled={isReadOnly}
            />
          </div>
          <div>
            <Label>Application Close</Label>
            <input
              type="datetime-local"
              value={appCloseDate}
              onChange={(e) => setAppCloseDate(e.target.value)}
              onBlur={validateDates}
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
              onBlur={validateDates}
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
              onBlur={validateDates}
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
      <Section title="Pricing & Discounts" subtitle="Step 1" status={{ filled: baseFee > 0 }} forceOpen={errorSections.has("pricing")} onOpen={() => setPreviewStep(1)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Base Fee ($)</Label>
            <input
              type="number"
              value={baseFee}
              onChange={(e) => setBaseFee(parseInt(e.target.value) || 0)}
              onBlur={validateBaseFee}
              data-field="baseFee"
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
          <div className="space-y-3">
          {discounts.map((d, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{d.code || `Discount ${i + 1}`}</span>
                {!isReadOnly && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveItem(discounts, i, i - 1, setDiscounts)} disabled={i === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => moveItem(discounts, i, i + 1, setDiscounts)} disabled={i === discounts.length - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                    <button type="button" onClick={() => deleteWithUndo(discounts, i, setDiscounts, "Discount")} className="p-1 text-red-500 hover:text-red-700"><Trash2 className="h-3 w-3" /></button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground">Code</span>
                  <input value={d.code} onChange={(e) => { const next = [...discounts]; next[i] = { ...d, code: e.target.value }; setDiscounts(next); }} className={inputClass} disabled={isReadOnly} placeholder="early_bird" />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Amount ($)</span>
                  <input type="number" value={d.amount} onChange={(e) => { const next = [...discounts]; next[i] = { ...d, amount: parseInt(e.target.value) || 0 }; setDiscounts(next); }} className={inputClass} disabled={isReadOnly} />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Name (ZH)</span>
                  <input value={d.name_zh} onChange={(e) => { const next = [...discounts]; next[i] = { ...d, name_zh: e.target.value }; setDiscounts(next); }} className={inputClass} disabled={isReadOnly} />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Name (EN)</span>
                  <input value={d.name_en} onChange={(e) => { const next = [...discounts]; next[i] = { ...d, name_en: e.target.value }; setDiscounts(next); }} className={inputClass} disabled={isReadOnly} />
                </div>
              </div>
              {/* Conditions */}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">Conditions</summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground">Early-bird deadline</span>
                    <input
                      type="date"
                      value={(d.conditions?.before_date as string) || ""}
                      onChange={(e) => {
                        const next = [...discounts];
                        const cond = { ...d.conditions };
                        if (e.target.value) cond.before_date = e.target.value; else delete cond.before_date;
                        next[i] = { ...d, conditions: cond };
                        setDiscounts(next);
                      }}
                      className={inputClass}
                      disabled={isReadOnly}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Min group size</span>
                    <input
                      type="number"
                      min={2}
                      value={(d.conditions?.min_group_size as number) || ""}
                      onChange={(e) => {
                        const next = [...discounts];
                        const cond = { ...d.conditions };
                        const val = parseInt(e.target.value);
                        if (val >= 2) cond.min_group_size = val; else delete cond.min_group_size;
                        next[i] = { ...d, conditions: cond };
                        setDiscounts(next);
                      }}
                      className={inputClass}
                      disabled={isReadOnly}
                      placeholder="e.g. 3"
                    />
                  </div>
                </div>
              </details>
            </div>
          ))}
          </div>
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

      {/* Section 4: Grades → Step 1 */}
      <Section title="Grades" subtitle="Step 1" status={{ filled: grades.length > 0, count: grades.length > 0 ? `${grades.length}` : undefined }} onOpen={() => setPreviewStep(1)}>
        {grades.map((g, i) => (
          <div key={i} className="grid grid-cols-[auto_1fr_1fr_100px_auto] gap-2 items-end">
            {!isReadOnly && (
              <div className="flex flex-col gap-0.5">
                <button type="button" onClick={() => moveItem(grades, i, i - 1, setGrades)} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                <button type="button" onClick={() => moveItem(grades, i, i + 1, setGrades)} disabled={i === grades.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
              </div>
            )}
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

      {/* Section 5: Student Options → Step 2 */}
      <Section title="Student Options" subtitle="Step 2" status={{ filled: existingStudentOptions.length > 0 || centerOptions.length > 0, count: (existingStudentOptions.length + centerOptions.length) > 0 ? `${existingStudentOptions.length + centerOptions.length}` : undefined }} onOpen={() => setPreviewStep(2)}>
        <div className="space-y-4">
          {renderBilingualList(
            "Existing Student Options",
            existingStudentOptions,
            setExistingStudentOptions,
            "Option",
            "Add Option",
          )}
          {renderBilingualList(
            "Center Options",
            centerOptions,
            setCenterOptions,
            "Center",
            "Add Center",
          )}
        </div>
      </Section>

      {/* Section 6: Locations → Step 3 */}
      <Section title="Locations & Time Slots" subtitle="Step 3" status={{ filled: locations.length > 0, count: locations.length > 0 ? `${locations.length}` : undefined }} forceOpen={errorSections.has("locations")} onOpen={() => setPreviewStep(3)}>
        {locations.map((loc, i) => {
          const locExpanded = expandedLocations.has(i);
          const locDisplayName = loc.name || loc.name_en || `Location ${i + 1}`;
          return (
          <div
            key={i}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            {/* Collapsible location header */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
              <button type="button" onClick={() => toggleLocation(i)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${locExpanded ? "rotate-180" : ""}`} />
                <span className="text-xs font-medium text-foreground truncate">{locDisplayName}</span>
                {!locExpanded && loc.open_days.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{loc.open_days.length} days</span>
                )}
              </button>
              {!isReadOnly && (
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => moveItem(locations, i, i - 1, setLocations)} disabled={i === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                  <button type="button" onClick={() => moveItem(locations, i, i + 1, setLocations)} disabled={i === locations.length - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                  <button type="button" onClick={() => deleteWithUndo(locations, i, setLocations, "Location")} className="p-1 text-red-500 hover:text-red-700"><Trash2 className="h-3 w-3" /></button>
                </div>
              )}
            </div>
            {locExpanded && (
            <div className="p-3 space-y-3">
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
                  onBlur={() => validateLocationName(i)}
                  data-field={`locationName_${i}`}
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
                  onBlur={() => validateLocationName(i)}
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
                            newTimeSlots[day] = [];
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
                        const firstSlots = loc.time_slots?.[firstDay] || [];
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
                  const slots = loc.time_slots?.[day] || [];
                  const slotKey = `timeSlot_${i}_${day}`;
                  return (
                  <div key={day} className="space-y-1">
                    <span className="text-xs text-muted-foreground">{day}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {slots.map((slot, si) => (
                        <span key={si} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 text-primary rounded-md">
                          {slot}
                          {!isReadOnly && (
                            <button type="button" onClick={() => {
                              const next = [...locations];
                              const newSlots = slots.filter((_, j) => j !== si);
                              const newTimeSlots = { ...(loc.time_slots || {}) };
                              newTimeSlots[day] = newSlots;
                              next[i] = { ...loc, time_slots: newTimeSlots };
                              setLocations(next);
                            }} className="hover:text-red-500"><X className="h-3 w-3" /></button>
                          )}
                        </span>
                      ))}
                      {!isReadOnly && (
                        <TimeSlotAdder
                          lastSlot={slots[slots.length - 1]}
                          onAdd={(slot) => {
                            const next = [...locations];
                            const newTimeSlots = { ...(loc.time_slots || {}) };
                            newTimeSlots[day] = [...slots, slot];
                            next[i] = { ...loc, time_slots: newTimeSlots };
                            setLocations(next);
                          }}
                        />
                      )}
                    </div>
                    <ValidationHint message={validationErrors[slotKey] ?? null} />
                  </div>
                  );
                })}
              </div>
            )}
          </div>
            )}
          </div>
          );
        })}
        {!isReadOnly && (
          <button
            type="button"
            onClick={() => {
              setLocations([
                ...locations,
                { name: "", name_en: "", address: "", open_days: [] },
              ]);
              setExpandedLocations((prev) => new Set(prev).add(locations.length));
            }}
            className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
          >
            <Plus className="h-3 w-3" /> Add Location
          </button>
        )}
      </Section>

      {/* Section 7: Text Content */}
      <Section title="Text Content (Bilingual)" subtitle="All steps" status={{ filled: Object.keys(textContent).length > 0 }} onOpen={() => setPreviewStep(1)}>
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
                        <AutoTextarea
                          value={textContent[`${key}_zh`] || ""}
                          onChange={(e) =>
                            setTextContent({ ...textContent, [`${key}_zh`]: e.target.value })
                          }
                          className={`${inputClass} min-h-[40px]`}
                          disabled={isReadOnly}
                        />
                      </div>
                      <div>
                        <Label>{label} (EN)</Label>
                        <AutoTextarea
                          value={textContent[`${key}_en`] || ""}
                          onChange={(e) =>
                            setTextContent({ ...textContent, [`${key}_en`]: e.target.value })
                          }
                          className={`${inputClass} min-h-[40px]`}
                          disabled={isReadOnly}
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
      <ConfirmDialog
        isOpen={showDiscardDialog}
        onCancel={() => setShowDiscardDialog(false)}
        onConfirm={() => {
          setShowDiscardDialog(false);
          try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
          onCancel();
        }}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to leave?"
        confirmText="Discard"
        cancelText="Keep Editing"
        variant="danger"
      />
    </div>
  );
}
