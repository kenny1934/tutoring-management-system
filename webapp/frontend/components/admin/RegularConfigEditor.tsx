"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { regularAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import type {
  RegularCourseConfig,
  RegularCourseFormConfig,
  RegularCourseIntro,
  SummerCourseIntroText,
  RegularLocation,
  RegularBilingualOption,
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
  X,
} from "lucide-react";
import { Reorder } from "framer-motion";
import {
  toDateInput,
  toDatetimeInput,
  ALL_DAYS,
  TIME_SLOT_PATTERN,
  genId,
  stampIds,
  type WithId,
  reorderByIds,
  Section,
  Label,
  editorInputClass as inputClass,
  BilingualTextField,
  ValidationHint,
  ImagePreview,
  AutoTextarea,
  ReorderableItem,
  DragHandle,
  TimeSlotAdder,
} from "./config-editor-kit";
import { RegularConfigPreview } from "./RegularConfigPreview";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface RegularConfigEditorProps {
  configId: number | null;
  isNew: boolean;
  isReadOnly: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

// Only the keys the regular application form actually reads. The 4-step
// wizard is: 1 Student, 2 Background, 3 Schedule, 4 Contact & Confirm.
const TEXT_CONTENT_GROUPS = [
  {
    group: "Step 1: Student Info",
    step: 1,
    keys: [
      { key: "title", label: "Form Title", help: "Displayed at the top of the form" },
      { key: "intro", label: "Intro Notice", help: "Notice shown right before the form fields" },
      { key: "target_grades", label: "Target Grades", help: "Eligible grades shown in the course facts strip" },
      { key: "schedule_format", label: "Schedule Format", help: "Lesson frequency and length (e.g. Weekly · 90 min)" },
      { key: "start_note", label: "Start Note", help: "Start fact cell, e.g. 9月1日當週開課" },
    ],
  },
  {
    group: "Step 2: Background",
    step: 2,
    keys: [
      { key: "existing_student_question", label: "Existing Student Question", help: "Main question about MathConcept enrolment" },
    ],
  },
  {
    group: "Step 4: Contact & Confirm",
    step: 4,
    keys: [
      { key: "disclaimer", label: "Disclaimer", help: "Scheduling note shown before the confirmation checkbox" },
      { key: "success_message", label: "Success Message", help: "Thank you message after submission" },
    ],
  },
];

export function RegularConfigEditor({
  configId,
  isNew,
  isReadOnly,
  onSaved,
  onCancel,
}: RegularConfigEditorProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Form state — mirrors RegularCourseConfig fields
  const [year, setYear] = useState(new Date().getFullYear());
  const [title, setTitle] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [appOpenDate, setAppOpenDate] = useState("");
  const [appCloseDate, setAppCloseDate] = useState("");
  const [courseStartDate, setCourseStartDate] = useState("");
  const [locations, setLocations] = useState<WithId<RegularLocation>[]>([]);
  const [grades, setGrades] = useState<WithId<RegularBilingualOption>[]>([]);
  const [existingStudentOptions, setExistingStudentOptions] = useState<
    WithId<RegularBilingualOption>[]
  >([]);
  const [centerOptions, setCenterOptions] = useState<WithId<RegularBilingualOption>[]>(
    []
  );
  const [langStreamOptions, setLangStreamOptions] = useState<WithId<RegularBilingualOption>[]>([]);
  const [textContent, setTextContent] = useState<Record<string, string>>({});
  const [courseIntro, setCourseIntro] = useState<RegularCourseIntro | null>(null);

  // Drop the intro to null when every field is empty, so save payload / dirty
  // tracking stay clean. Memoized so the `assembledConfig` memo stabilizes.
  const normalizedCourseIntro = useMemo<RegularCourseIntro | null>(() => {
    if (!courseIntro) return null;
    const hasText = (t?: SummerCourseIntroText | null) =>
      !!(t && (t.zh.trim() || t.en.trim()));
    const any =
      hasText(courseIntro.headline) ||
      hasText(courseIntro.philosophy) ||
      !!courseIntro.pillars?.some(hasText);
    return any ? courseIntro : null;
  }, [courseIntro]);
  const hasCourseIntro = normalizedCourseIntro !== null;

  const updateIntroHeadline = useCallback((field: "zh" | "en", value: string) => {
    setCourseIntro((prev) => ({
      ...prev,
      headline: {
        zh: field === "zh" ? value : prev?.headline?.zh || "",
        en: field === "en" ? value : prev?.headline?.en || "",
      },
    }));
  }, []);
  const updateIntroPhilosophy = useCallback((field: "zh" | "en", value: string) => {
    setCourseIntro((prev) => ({
      ...prev,
      philosophy: {
        zh: field === "zh" ? value : prev?.philosophy?.zh || "",
        en: field === "en" ? value : prev?.philosophy?.en || "",
      },
    }));
  }, []);
  const updateIntroPillar = useCallback((idx: number, field: "zh" | "en", value: string) => {
    setCourseIntro((prev) => {
      const next = [...(prev?.pillars || [])];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, pillars: next };
    });
  }, []);
  const addIntroPillar = useCallback(() => {
    setCourseIntro((prev) => ({
      ...prev,
      pillars: [...(prev?.pillars || []), { zh: "", en: "" }],
    }));
  }, []);
  const removeIntroPillar = useCallback((idx: number) => {
    setCourseIntro((prev) => ({
      ...prev,
      pillars: (prev?.pillars || []).filter((_, j) => j !== idx),
    }));
  }, []);

  // Dirty state tracking
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Field-level validation (shown on blur)
  const [validationErrors, setValidationErrors] = useState<Record<string, string | null>>({});
  // Sections to force open on validation error
  const [errorSections, setErrorSections] = useState<Set<string>>(new Set());
  const editorRef = useRef<HTMLDivElement>(null);

  // Assemble a live config object for the preview (also used for dirty tracking)
  const assembledConfig: RegularCourseFormConfig = useMemo(
    () => ({
      year,
      title,
      description: description || null,
      application_open_date: appOpenDate || "",
      application_close_date: appCloseDate || "",
      course_start_date: courseStartDate || "",
      locations,
      available_grades: grades,
      time_slots: [],
      existing_student_options: existingStudentOptions.length > 0 ? existingStudentOptions : null,
      center_options: centerOptions.length > 0 ? centerOptions : null,
      lang_stream_options: langStreamOptions.length > 0 ? langStreamOptions : null,
      text_content: Object.keys(textContent).length > 0 ? textContent : null,
      course_intro: normalizedCourseIntro,
      banner_image_url: bannerImageUrl || null,
    }),
    [
      year, title, description, appOpenDate, appCloseDate, courseStartDate,
      locations, grades, existingStudentOptions, centerOptions,
      langStreamOptions, textContent, normalizedCourseIntro, bannerImageUrl,
    ]
  );

  // Derive dirty state from assembledConfig + isActive
  const currentSnapshot = useMemo(
    () => JSON.stringify({ ...assembledConfig, isActive }),
    [assembledConfig, isActive]
  );
  const isDirty = initialSnapshot !== "" && currentSnapshot !== initialSnapshot;

  // Autosave draft key
  const draftKey = `regular-config-draft-${isNew ? "new" : configId}`;

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
                setDescription(parsed.description || "");
                setAppOpenDate(parsed.application_open_date || "");
                setAppCloseDate(parsed.application_close_date || "");
                setCourseStartDate(parsed.course_start_date || "");
                setLocations(stampIds(parsed.locations || [], "l"));
                setGrades(stampIds(parsed.available_grades || [], "g"));
                setExistingStudentOptions(stampIds(parsed.existing_student_options || [], "o"));
                setCenterOptions(stampIds(parsed.center_options || [], "c"));
                setLangStreamOptions(stampIds(parsed.lang_stream_options || [], "ls"));
                setTextContent(parsed.text_content || {});
                setCourseIntro(parsed.course_intro || null);
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
        const config = await regularAPI.getConfig(configId);
        setYear(config.year);
        setTitle(config.title);
        setIsActive(config.is_active);
        setBannerImageUrl(config.banner_image_url || "");
        setDescription(config.description || "");
        setAppOpenDate(toDatetimeInput(config.application_open_date));
        setAppCloseDate(toDatetimeInput(config.application_close_date));
        setCourseStartDate(toDateInput(config.course_start_date));
        setLocations(stampIds(config.locations, "l"));
        setGrades(stampIds(config.available_grades, "g"));
        setExistingStudentOptions(stampIds(config.existing_student_options || [], "o"));
        setCenterOptions(stampIds(config.center_options || [], "c"));
        setLangStreamOptions(stampIds(config.lang_stream_options || [], "ls"));
        setTextContent(config.text_content || {});
        setCourseIntro(config.course_intro || null);
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
    setValidation(
      "dates",
      appOpenDate && appCloseDate && appCloseDate <= appOpenDate
        ? "Close date must be after open date"
        : null
    );
  };

  const validateLocationName = (locIdx: number) => {
    const loc = locations[locIdx];
    setValidation(
      `locationName_${locIdx}`,
      loc && !loc.name.trim() && !loc.name_en.trim() ? "Location name is required" : null
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
    if (!appOpenDate || !appCloseDate || !courseStartDate) {
      errors.dates = "All dates are required";
      sectionsWithErrors.add("dates");
    } else if (appCloseDate <= appOpenDate) {
      errors.dates = "Close date must be after open date";
      sectionsWithErrors.add("dates");
    }

    // Locations
    const expandLocs = new Set<string>();
    locations.forEach((loc, i) => {
      if (!loc.name.trim() && !loc.name_en.trim()) {
        errors[`locationName_${i}`] = "Location name is required";
        sectionsWithErrors.add("locations");
        expandLocs.add(loc._id);
      }
      const days = loc.open_days || [];
      days.forEach((day) => {
        const slots = loc.time_slots?.[day] || [];
        const bad = slots.filter((s) => s && !TIME_SLOT_PATTERN.test(s));
        if (bad.length > 0) {
          errors[`timeSlot_${i}_${day}`] = `Invalid format: ${bad.join(", ")}`;
          sectionsWithErrors.add("locations");
          expandLocs.add(loc._id);
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
    const payload: Partial<RegularCourseConfig> = {
      year,
      title: title.trim(),
      description: description.trim() || null,
      is_active: isActive,
      banner_image_url: bannerImageUrl.trim() || null,
      application_open_date: appOpenDate,
      application_close_date: appCloseDate,
      course_start_date: courseStartDate,
      locations,
      available_grades: grades,
      time_slots: [],
      existing_student_options: existingStudentOptions.length > 0 ? existingStudentOptions : null,
      center_options: centerOptions.length > 0 ? centerOptions : null,
      lang_stream_options: langStreamOptions.length > 0 ? langStreamOptions : null,
      text_content: Object.keys(textContent).length > 0 ? textContent : null,
      course_intro: normalizedCourseIntro,
    };

    try {
      if (isNew) {
        await regularAPI.createConfig(payload);
        showToast("Config created", "success");
      } else {
        await regularAPI.updateConfig(configId!, payload);
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
    setter: (valOrFn: T[] | ((prev: T[]) => T[])) => void,
    label: string
  ) => {
    const removed = items[index];
    setter(items.filter((_, j) => j !== index));
    showToast(`${label} deleted`, "info", {
      label: "Undo",
      onClick: () => {
        setter((current: T[]) => {
          const restored = [...current];
          restored.splice(index, 0, removed);
          return restored;
        });
      },
    });
  };

  // Track which locations are expanded (by stable _id)
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
  const toggleLocation = (id: string) => {
    setExpandedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [expandedStudentOptions, setExpandedStudentOptions] = useState<Set<string>>(new Set());
  const toggleStudentOption = (id: string) => {
    setExpandedStudentOptions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Pre-compute center grouping per student option (avoids O(N*M) in render loop)
  const centerGrouping = useMemo(() => {
    const centerIdxMap = new Map(centerOptions.map((c, i) => [c._id, i]));
    return existingStudentOptions.map(opt => {
      const isNone = opt.name_en.toLowerCase() === "none" || opt.name.includes("皆非");
      if (isNone) return { isNone: true as const, optionCenters: [] as WithId<RegularBilingualOption>[], groupFlatIndices: [] as number[], usesPrefix: false };
      const prefixMatched = opt.name_en
        ? centerOptions.filter(c => c.name_en.startsWith(opt.name_en))
        : [];
      let optionCenters: WithId<RegularBilingualOption>[];
      if (prefixMatched.length > 0) {
        optionCenters = prefixMatched;
      } else {
        const allPrefixed = new Set(
          existingStudentOptions.filter(o => o.name_en)
            .flatMap(o => centerOptions.filter(c => c.name_en.startsWith(o.name_en)))
            .map(c => c._id)
        );
        optionCenters = centerOptions.filter(c => !allPrefixed.has(c._id));
      }
      return {
        isNone: false as const,
        optionCenters,
        groupFlatIndices: optionCenters.map(c => centerIdxMap.get(c._id) ?? -1),
        usesPrefix: prefixMatched.length > 0,
      };
    });
  }, [existingStudentOptions, centerOptions]);

  const [previewStep, setPreviewStep] = useState(1);
  const [showPreview, setShowPreview] = useState(false);

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
            placeholder="e.g. 2026 Regular Course"
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
            placeholder="/regular/banner.jpg"
          />
          <ImagePreview url={bannerImageUrl} className="w-48 h-16" />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <AutoTextarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} min-h-[40px]`}
            disabled={isReadOnly}
            placeholder="Internal note about this config (not shown on the form)"
          />
        </div>
      </Section>

      {/* Section 2: Dates */}
      <Section title="Dates" subtitle="Step 1" status={{ filled: !!(appOpenDate && appCloseDate && courseStartDate) }} forceOpen={errorSections.has("dates")} onOpen={() => setPreviewStep(1)}>
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
        </div>
        <ValidationHint message={validationErrors.dates ?? null} />
      </Section>

      {/* Section 3: Grades → Step 1 */}
      <Section title="Grades" subtitle="Step 1" status={{ filled: grades.length > 0, count: grades.length > 0 ? `${grades.length}` : undefined }} onOpen={() => setPreviewStep(1)}>
        <Reorder.Group axis="y" values={grades.map(g => g._id)} onReorder={(newOrder) => setGrades(reorderByIds(grades, newOrder))} className="space-y-0">
        {grades.map((g, i) => (
          <ReorderableItem key={g._id} value={g._id} disabled={isReadOnly}>
          {(dragControls) => (
          <div className="grid grid-cols-[auto_1fr_1fr_100px_auto_auto] gap-2 items-end">
            <DragHandle controls={dragControls} />
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
            <div title="Hide from the public application form; admins can still pick it">
              {i === 0 && <span className="text-[10px] text-muted-foreground whitespace-nowrap">Admin only</span>}
              <div className="flex items-center justify-center h-9">
                <input
                  type="checkbox"
                  checked={!!g.admin_only}
                  onChange={(e) => {
                    const next = [...grades];
                    next[i] = { ...g, admin_only: e.target.checked };
                    setGrades(next);
                  }}
                  className="rounded"
                  disabled={isReadOnly}
                  aria-label="Admin only"
                />
              </div>
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
          )}
          </ReorderableItem>
        ))}
        </Reorder.Group>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() =>
              setGrades([...grades, { _id: genId("g"), name: "", name_en: "", value: "" }])
            }
            className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
          >
            <Plus className="h-3 w-3" /> Add Grade
          </button>
        )}
      </Section>

      {/* Section 4: Language Stream Options → Step 1 */}
      <Section title="Language Stream Options" subtitle="Step 1" status={{ filled: langStreamOptions.length > 0, count: langStreamOptions.length > 0 ? `${langStreamOptions.length}` : undefined }} onOpen={() => setPreviewStep(1)}>
        <Label>Language of Instruction</Label>
        <p className="text-[10px] text-muted-foreground mb-2">Options shown on the public form. Leave empty to hide the question.</p>
        <Reorder.Group axis="y" values={langStreamOptions.map(o => o._id)} onReorder={(newOrder) => setLangStreamOptions(reorderByIds(langStreamOptions, newOrder))} className="space-y-0">
        {langStreamOptions.map((o, i) => (
          <ReorderableItem key={o._id} value={o._id} disabled={isReadOnly}>
          {(dragControls) => (
          <div className="grid grid-cols-[auto_1fr_1fr_100px_auto] gap-2 items-end">
            <DragHandle controls={dragControls} />
            <div>
              {i === 0 && <span className="text-[10px] text-muted-foreground">Name (ZH)</span>}
              <input
                value={o.name}
                onChange={(e) => {
                  const next = [...langStreamOptions];
                  next[i] = { ...o, name: e.target.value };
                  setLangStreamOptions(next);
                }}
                className={inputClass}
                disabled={isReadOnly}
              />
            </div>
            <div>
              {i === 0 && <span className="text-[10px] text-muted-foreground">Name (EN)</span>}
              <input
                value={o.name_en}
                onChange={(e) => {
                  const next = [...langStreamOptions];
                  next[i] = { ...o, name_en: e.target.value };
                  setLangStreamOptions(next);
                }}
                className={inputClass}
                disabled={isReadOnly}
              />
            </div>
            <div>
              {i === 0 && <span className="text-[10px] text-muted-foreground">Value</span>}
              <input
                value={o.value || ""}
                onChange={(e) => {
                  const next = [...langStreamOptions];
                  next[i] = { ...o, value: e.target.value };
                  setLangStreamOptions(next);
                }}
                className={inputClass}
                disabled={isReadOnly}
              />
            </div>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => deleteWithUndo(langStreamOptions, i, setLangStreamOptions, "Language Stream")}
                className="p-2 text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          )}
          </ReorderableItem>
        ))}
        </Reorder.Group>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() =>
              setLangStreamOptions([...langStreamOptions, { _id: genId("ls"), name: "", name_en: "", value: "" }])
            }
            className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
          >
            <Plus className="h-3 w-3" /> Add Language Stream
          </button>
        )}
      </Section>

      {/* Section 5: Student Options → Step 2 */}
      <Section title="Student Options" subtitle="Step 2" status={{ filled: existingStudentOptions.length > 0 || centerOptions.length > 0, count: (existingStudentOptions.length + centerOptions.length) > 0 ? `${existingStudentOptions.length + centerOptions.length}` : undefined }} onOpen={() => setPreviewStep(2)}>
        <Label>Existing Student Options & Centers</Label>
        <p className="text-[10px] text-muted-foreground mb-2">Each student type shows its associated centers below. Centers are matched by name prefix.</p>
        <Reorder.Group axis="y" values={existingStudentOptions.map(o => o._id)} onReorder={(newOrder) => {
          setExistingStudentOptions(reorderByIds(existingStudentOptions, newOrder));
        }} className="space-y-2">
          {existingStudentOptions.map((opt, oi) => {
            const { isNone, optionCenters, groupFlatIndices, usesPrefix } = centerGrouping[oi] || { isNone: false, optionCenters: [], groupFlatIndices: [], usesPrefix: false };
            const optExpanded = expandedStudentOptions.has(opt._id);
            return (
              <ReorderableItem key={opt._id} value={opt._id} disabled={isReadOnly}>
              {(dragControls) => (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {/* Student option row */}
                <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 px-3 py-2 items-center bg-gray-50 dark:bg-gray-800/50">
                  <DragHandle controls={dragControls} />
                  <div>
                    {oi === 0 && <span className="text-[10px] text-muted-foreground">Name (ZH)</span>}
                    <input
                      value={opt.name}
                      onChange={(e) => {
                        const next = [...existingStudentOptions];
                        next[oi] = { ...opt, name: e.target.value };
                        setExistingStudentOptions(next);
                      }}
                      className={inputClass}
                      disabled={isReadOnly}
                    />
                  </div>
                  <div>
                    {oi === 0 && <span className="text-[10px] text-muted-foreground">Name (EN)</span>}
                    <input
                      value={opt.name_en}
                      onChange={(e) => {
                        const next = [...existingStudentOptions];
                        next[oi] = { ...opt, name_en: e.target.value };
                        setExistingStudentOptions(next);
                      }}
                      className={inputClass}
                      disabled={isReadOnly}
                    />
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => deleteWithUndo(existingStudentOptions, oi, setExistingStudentOptions, "Option")}
                      className="p-2 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {/* Nested centers */}
                {isNone ? (
                  <div className="ml-4 border-l-2 border-primary/20 px-3 py-2">
                    <span className="text-[10px] text-muted-foreground italic">No centers (students not enrolled)</span>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={() => toggleStudentOption(opt._id)} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${optExpanded ? "rotate-180" : ""}`} />
                      <span className="text-[10px] text-muted-foreground font-medium">Centers</span>
                      <span className="text-[10px] text-muted-foreground">({optionCenters.length})</span>
                    </button>
                    {optExpanded && (
                    <div className="ml-4 border-l-2 border-primary/20 px-3 py-2">
                      {optionCenters.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground italic">No centers yet</p>
                      ) : (
                        <Reorder.Group axis="y" values={optionCenters.map(c => c._id)} onReorder={(newKeys) => {
                          const reordered = reorderByIds(optionCenters, newKeys);
                          setCenterOptions((current) => {
                            const newFlat = [...current];
                            groupFlatIndices.forEach((flatPos, idx) => { newFlat[flatPos] = reordered[idx]; });
                            return newFlat;
                          });
                        }} className="space-y-0">
                        {optionCenters.map((center, ci) => {
                          const flatIdx = groupFlatIndices[ci];
                          return (
                            <ReorderableItem key={center._id} value={center._id} disabled={isReadOnly}>
                            {(centerDragControls) => (
                            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 mt-1.5 items-center">
                              <DragHandle controls={centerDragControls} />
                              <input
                                value={center.name}
                                onChange={(e) => {
                                  const next = [...centerOptions];
                                  next[flatIdx] = { ...center, name: e.target.value };
                                  setCenterOptions(next);
                                }}
                                className={inputClass}
                                disabled={isReadOnly}
                                placeholder="Name (ZH)"
                              />
                              <input
                                value={center.name_en}
                                onChange={(e) => {
                                  const next = [...centerOptions];
                                  next[flatIdx] = { ...center, name_en: e.target.value };
                                  setCenterOptions(next);
                                }}
                                className={inputClass}
                                disabled={isReadOnly}
                                placeholder="Name (EN)"
                              />
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => deleteWithUndo(centerOptions, flatIdx, setCenterOptions, "Center")}
                                  className="p-2 text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            )}
                            </ReorderableItem>
                          );
                        })}
                        </Reorder.Group>
                      )}
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            const insertAt = groupFlatIndices.length > 0
                              ? groupFlatIndices[groupFlatIndices.length - 1] + 1
                              : centerOptions.length;
                            const next = [...centerOptions];
                            const name_en = usesPrefix ? `${opt.name_en} ()` : "";
                            next.splice(insertAt, 0, { _id: genId("c"), name: "", name_en });
                            setCenterOptions(next);
                          }}
                          className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
                        >
                          <Plus className="h-3 w-3" /> Add Center
                        </button>
                      )}
                    </div>
                    )}
                  </>
                )}
              </div>
              )}
              </ReorderableItem>
            );
          })}
        </Reorder.Group>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() => setExistingStudentOptions([...existingStudentOptions, { _id: genId("o"), name: "", name_en: "" }])}
            className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
          >
            <Plus className="h-3 w-3" /> Add Student Option
          </button>
        )}
      </Section>

      {/* Section 6: Locations → Step 3 */}
      <Section title="Locations & Time Slots" subtitle="Step 3" status={{ filled: locations.length > 0, count: locations.length > 0 ? `${locations.length}` : undefined }} forceOpen={errorSections.has("locations")} onOpen={() => setPreviewStep(3)}>
        <Reorder.Group axis="y" values={locations.map(l => l._id)} onReorder={(newOrder) => {
          setLocations(reorderByIds(locations, newOrder));
        }} className="space-y-3">
        {locations.map((loc, i) => {
          const locExpanded = expandedLocations.has(loc._id);
          const locDisplayName = loc.name || loc.name_en || `Location ${i + 1}`;
          return (
          <ReorderableItem key={loc._id} value={loc._id} disabled={isReadOnly}>
          {(dragControls) => (
          <div
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            {/* Collapsible location header */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
              <button type="button" onClick={() => toggleLocation(loc._id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${locExpanded ? "rotate-180" : ""}`} />
                <span className="text-xs font-medium text-foreground truncate">{locDisplayName}</span>
                {!locExpanded && loc.open_days.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{loc.open_days.length} days</span>
                )}
              </button>
              {!isReadOnly && (
                <div className="flex items-center gap-1 shrink-0">
                  <DragHandle controls={dragControls} />
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
          )}
          </ReorderableItem>
          );
        })}
        </Reorder.Group>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() => {
              const newId = genId("l");
              setLocations([
                ...locations,
                { _id: newId, name: "", name_en: "", address: "", open_days: [] },
              ]);
              setExpandedLocations((prev) => new Set(prev).add(newId));
            }}
            className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 mt-2"
          >
            <Plus className="h-3 w-3" /> Add Location
          </button>
        )}
      </Section>

      {/* Section: About this course (pitch block on Step 1) */}
      <Section
        title="About this course"
        subtitle="Pitch block on Step 1"
        status={{ filled: hasCourseIntro }}
        onOpen={() => setPreviewStep(1)}
      >
        <p className="text-xs text-muted-foreground mb-3">
          Surfaces the course pitch (hero line, pillars, philosophy) on Step 1. Leave every field empty to hide the block entirely.
        </p>
        <div className="space-y-5">
          <div>
            <div className="text-xs font-semibold text-primary/80 uppercase tracking-wider mb-2">Hero line</div>
            <BilingualTextField
              label="Headline"
              zhValue={courseIntro?.headline?.zh || ""}
              enValue={courseIntro?.headline?.en || ""}
              onChangeZh={(v) => updateIntroHeadline("zh", v)}
              onChangeEn={(v) => updateIntroHeadline("en", v)}
              placeholderZh="每週一堂，穩步向前"
              placeholderEn="One Lesson a Week, Steady Progress All Year"
              disabled={isReadOnly}
              multiline
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-primary/80 uppercase tracking-wider">Pillars</div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={addIntroPillar}
                  className="text-xs text-primary hover:text-primary-hover flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add pillar
                </button>
              )}
            </div>
            <div className="space-y-2">
              {(courseIntro?.pillars || []).map((pillar, idx) => {
                const onlyOneSide = !!(pillar.zh.trim()) !== !!(pillar.en.trim());
                return (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={pillar.zh}
                        onChange={(e) => updateIntroPillar(idx, "zh", e.target.value)}
                        placeholder="緊貼學校進度"
                        className={`${inputClass} ${onlyOneSide && !pillar.zh.trim() ? "border-amber-300" : ""}`}
                        disabled={isReadOnly}
                      />
                      <input
                        type="text"
                        value={pillar.en}
                        onChange={(e) => updateIntroPillar(idx, "en", e.target.value)}
                        placeholder="Aligned with school progress"
                        className={`${inputClass} ${onlyOneSide && !pillar.en.trim() ? "border-amber-300" : ""}`}
                        disabled={isReadOnly}
                      />
                    </div>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => removeIntroPillar(idx)}
                        className="p-2 text-muted-foreground hover:text-red-600"
                        aria-label="Remove pillar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
              {(courseIntro?.pillars || []).length === 0 && (
                <p className="text-xs text-muted-foreground italic">No pillars added yet.</p>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-primary/80 uppercase tracking-wider mb-2">Philosophy paragraph</div>
            <BilingualTextField
              label="Philosophy"
              zhValue={courseIntro?.philosophy?.zh || ""}
              enValue={courseIntro?.philosophy?.en || ""}
              onChangeZh={(v) => updateIntroPhilosophy("zh", v)}
              onChangeEn={(v) => updateIntroPhilosophy("en", v)}
              placeholderZh="中學數學課題抽象，題型多元，理解比死記更重要，思維比計算更關鍵⋯"
              placeholderEn="Secondary maths is abstract and varied..."
              disabled={isReadOnly}
              multiline
              minHeight="80px"
            />
          </div>
        </div>
      </Section>

      {/* Section 8: Text Content */}
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
                  (click to preview)
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
                {/* Contact-by date is a plain date, not a ZH/EN pair. It feeds
                    the Step 4 disclaimer while the date is still upcoming. */}
                {step === 4 && (
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-xs font-medium text-foreground">Contact By Date</span>
                      <span className="text-[10px] text-muted-foreground ml-2">Families are contacted on or before this date. Shown in the disclaimer while the date is upcoming.</span>
                    </div>
                    <div className="max-w-xs">
                      <input
                        type="date"
                        value={textContent.contact_by_date || ""}
                        onChange={(e) => {
                          const next = { ...textContent };
                          if (e.target.value) next.contact_by_date = e.target.value;
                          else delete next.contact_by_date;
                          setTextContent(next);
                        }}
                        className={inputClass}
                        disabled={isReadOnly}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

        </div>{/* end left column */}

        {/* Right column: preview */}
        <div className={`flex flex-col lg:sticky lg:top-0 lg:h-[calc(100vh-8rem)] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${showPreview ? "h-[70vh]" : "hidden lg:flex"}`}>
          <RegularConfigPreview
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
