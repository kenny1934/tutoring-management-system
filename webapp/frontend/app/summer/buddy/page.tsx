"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import {
  Lock,
  Plus,
  Users,
  Search,
  Copy,
  Check,
  Pencil,
  Trash2,
  ChevronDown,
  ArrowLeft,
  Link2,
  AlertTriangle,
  UserPlus,
  X,
} from "lucide-react";
import { buddyTrackerAPI } from "@/lib/api";
import type { BuddyMember, BuddyGroupMemberInfo, BuddyGroupLookup } from "@/types";

// ---- Constants ----

const CURRENT_YEAR = new Date().getFullYear();

const BRANCHES = ["MAC", "MCP", "MNT", "MTA", "MLT", "MTR", "MOT"] as const;

const BRANCH_INFO: Record<string, { district: string }> = {
  MAC: { district: "高士德" },
  MCP: { district: "水坑尾" },
  MNT: { district: "東方明珠" },
  MTA: { district: "氹仔美景I" },
  MLT: { district: "林茂塘" },
  MTR: { district: "氹仔美景II" },
  MOT: { district: "二龍喉" },
};

// ---- Helpers ----

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1200);
      }}
      className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function StatusBadge({ size }: { size: number }) {
  if (size >= 2) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">
        Paired
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold border border-red-300 text-red-600">
      Solo
    </span>
  );
}

function BranchBadge({ branch, isSibling }: { branch: string; isSibling?: boolean }) {
  const isSecondary = branch === "Secondary";
  const bg = isSecondary
    ? "bg-purple-100 text-purple-700"
    : "bg-neutral-100 text-neutral-700";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${bg}`}>
        {branch}
      </span>
      {isSibling && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">
          Sibling
        </span>
      )}
    </span>
  );
}

// ---- Main Page ----

export default function BuddyTrackerPage() {
  const searchParams = useSearchParams();
  const branch = searchParams.get("branch")?.toUpperCase();

  // PIN state
  const [pinVerified, setPinVerified] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinChecking, setPinChecking] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const pinShakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Add student form
  const [showAddForm, setShowAddForm] = useState(true);
  const [formStudentId, setFormStudentId] = useState("");
  const [formNameEn, setFormNameEn] = useState("");
  const [formNameZh, setFormNameZh] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formBuddyCode, setFormBuddyCode] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const formSuccessTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Buddy code lookup
  const [lookupResult, setLookupResult] = useState<BuddyGroupLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [siblingConfirmed, setSiblingConfirmed] = useState(false);

  // Table state
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Data
  const validBranch = branch && BRANCHES.includes(branch as typeof BRANCHES[number]);
  const swrKey = validBranch && pinVerified ? `buddy-${branch}-${CURRENT_YEAR}` : null;
  const { data: members, isLoading } = useSWR(
    swrKey,
    () => buddyTrackerAPI.list(branch!, CURRENT_YEAR),
    { revalidateOnFocus: false }
  );

  // ---- PIN verification on mount ----
  useEffect(() => {
    if (!validBranch) return;
    const stored = sessionStorage.getItem("buddy_pin");
    if (!stored) {
      setPinVerified(false);
      return;
    }
    const timeout = setTimeout(() => {
      setPinVerified(false);
      sessionStorage.removeItem("buddy_pin");
    }, 5000);
    buddyTrackerAPI.verifyPin(branch!, stored)
      .then(() => { setPinVerified(true); clearTimeout(timeout); })
      .catch(() => {
        setPinVerified(false);
        sessionStorage.removeItem("buddy_pin");
        clearTimeout(timeout);
      });
    return () => clearTimeout(timeout);
  }, [branch, validBranch]);

  // ---- PIN submit ----
  const handlePinSubmit = useCallback(async () => {
    if (!branch || !pinInput.trim()) return;
    setPinChecking(true);
    setPinError(null);
    try {
      await buddyTrackerAPI.verifyPin(branch, pinInput.trim());
      sessionStorage.setItem("buddy_pin", pinInput.trim());
      setPinVerified(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid PIN";
      setPinError(msg.includes("429") || msg.includes("Too many") ? "Too many attempts. Try again later." : "Incorrect PIN");
      setPinShake(true);
      clearTimeout(pinShakeTimer.current);
      pinShakeTimer.current = setTimeout(() => setPinShake(false), 400);
    } finally {
      setPinChecking(false);
    }
  }, [branch, pinInput]);

  // ---- Buddy code lookup ----
  const handleLookup = useCallback(async () => {
    const code = formBuddyCode.trim().toUpperCase();
    if (!code || !branch) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    setSiblingConfirmed(false);
    try {
      const result = await buddyTrackerAPI.lookupGroup(code, branch);
      setLookupResult(result);
    } catch {
      setLookupError("Buddy code not found");
    } finally {
      setLookupLoading(false);
    }
  }, [formBuddyCode]);

  // ---- Check if lookup result has cross-branch members ----
  const hasCrossBranch = useMemo(() => {
    if (!lookupResult || !branch) return false;
    return lookupResult.members.some(
      (m) => m.branch !== branch && m.branch !== "Secondary"
    );
  }, [lookupResult, branch]);

  const hasAnyOtherBranch = useMemo(() => {
    if (!lookupResult || !branch) return false;
    return lookupResult.members.some((m) => m.branch !== branch);
  }, [lookupResult, branch]);

  // ---- Add student ----
  const handleAddStudent = useCallback(async () => {
    if (!branch || !formStudentId.trim() || !formNameEn.trim()) return;
    if (hasAnyOtherBranch && !siblingConfirmed) return;

    setFormSubmitting(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const result = await buddyTrackerAPI.create({
        student_id: formStudentId.trim(),
        student_name_en: formNameEn.trim(),
        student_name_zh: formNameZh.trim() || null,
        parent_phone: formPhone.trim() || null,
        source_branch: branch,
        year: CURRENT_YEAR,
        buddy_code: formBuddyCode.trim().toUpperCase() || null,
        is_sibling: hasAnyOtherBranch && siblingConfirmed,
      });
      // Clear form
      setFormStudentId("");
      setFormNameEn("");
      setFormNameZh("");
      setFormPhone("");
      setFormBuddyCode("");
      setLookupResult(null);
      setSiblingConfirmed(false);
      setFormSuccess(`Added — buddy code: ${result.buddy_code}`);
      clearTimeout(formSuccessTimer.current);
      formSuccessTimer.current = setTimeout(() => setFormSuccess(null), 5000);
      globalMutate(swrKey);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "message" in err) {
        const msg = (err as { message: string }).message;
        try {
          const parsed = JSON.parse(msg);
          if (parsed.code === "CROSS_BRANCH_SIBLING_REQUIRED") {
            setFormError("This group has members from another branch. Please confirm sibling relationship.");
            return;
          }
        } catch { /* not JSON */ }
        setFormError(msg);
      } else {
        setFormError("Failed to add student");
      }
    } finally {
      setFormSubmitting(false);
    }
  }, [branch, formStudentId, formNameEn, formNameZh, formPhone, formBuddyCode, hasAnyOtherBranch, siblingConfirmed, swrKey]);

  // ---- Edit / Delete ----
  const startEdit = useCallback((m: BuddyMember) => {
    setEditingId(m.id);
    setEditData({
      student_id: m.student_id,
      student_name_en: m.student_name_en,
      student_name_zh: m.student_name_zh || "",
      parent_phone: m.parent_phone || "",
    });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId || !branch) return;
    try {
      await buddyTrackerAPI.update(editingId, branch, {
        student_id: editData.student_id,
        student_name_en: editData.student_name_en,
        student_name_zh: editData.student_name_zh || null,
        parent_phone: editData.parent_phone || null,
      });
      setEditingId(null);
      globalMutate(swrKey);
    } catch {
      // Keep edit open on failure
    }
  }, [editingId, branch, editData, swrKey]);

  const handleDelete = useCallback(async (id: number) => {
    if (!branch) return;
    setDeletingId(id);
    try {
      await buddyTrackerAPI.delete(id, branch);
      setExpandedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      globalMutate(swrKey);
    } catch {
      // Ignore
    } finally {
      setDeletingId(null);
    }
  }, [branch, swrKey]);

  // ---- Deduplicate and group members for display ----
  // The API returns own-branch members + cross-branch siblings in the same groups.
  // Deduplicate by id and only show own-branch members as main rows.
  const ownMembers = useMemo(() => {
    if (!members || !branch) return [];
    const seen = new Set<number>();
    return members.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return m.source_branch === branch;
    });
  }, [members, branch]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return ownMembers;
    const q = searchQuery.toLowerCase();
    return ownMembers.filter(
      (m) =>
        m.student_id.toLowerCase().includes(q) ||
        m.student_name_en.toLowerCase().includes(q) ||
        (m.student_name_zh && m.student_name_zh.includes(q)) ||
        m.buddy_code.toLowerCase().includes(q) ||
        (m.parent_phone && m.parent_phone.includes(q))
    );
  }, [ownMembers, searchQuery]);

  // ---- Stats ----
  const stats = useMemo(() => {
    if (!ownMembers.length) return { total: 0, groups: 0, paired: 0, solo: 0 };
    const groupIds = new Set(ownMembers.map((m) => m.buddy_group_id));
    const paired = ownMembers.filter((m) => m.group_size >= 2).length;
    return {
      total: ownMembers.length,
      groups: groupIds.size,
      paired,
      solo: ownMembers.length - paired,
    };
  }, [ownMembers]);

  // ============================================
  // RENDER: Branch Selection
  // ============================================
  if (!validBranch) {
    return (
      <div className="max-w-lg mx-auto py-4 animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Buddy Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">Summer course buddy group registration</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {BRANCHES.map((b, i) => (
            <a
              key={b}
              href={`/summer/buddy?branch=${b}`}
              className="group flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200 animate-slide-up w-28"
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
              <span className="font-bold text-foreground text-sm">{b}</span>
              <span className="text-[10px] text-muted-foreground/70 leading-tight">{BRANCH_INFO[b]?.district}</span>
            </a>
          ))}
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: PIN Gate
  // ============================================
  if (!pinVerified) {
    return (
      <div className="max-w-sm mx-auto py-4 animate-fade-in">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-lock-pulse">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Buddy Tracker — {branch}</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter PIN to access</p>
        </div>

        <div className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value); setPinError(null); }}
            onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
            className={`w-full text-center text-lg tracking-widest border-2 rounded-xl px-4 py-3 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors ${
              pinError ? "border-red-400" : "border-border"
            } ${pinShake ? "animate-shake" : ""}`}
            placeholder="Enter PIN"
            autoFocus
          />
          {pinError && <p className="text-red-500 text-sm text-center">{pinError}</p>}
          <button
            onClick={handlePinSubmit}
            disabled={!pinInput.trim() || pinChecking}
            className="w-full py-3 rounded-xl font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pinChecking ? "Verifying..." : "Verify"}
          </button>
          <a
            href="/summer/buddy"
            className="block text-center text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 inline mr-1" />
            Change branch
          </a>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: Main Tracker View
  // ============================================
  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-primary text-primary-foreground">
            {branch}
          </span>
          <h1 className="text-lg font-bold text-foreground">Buddy Tracker</h1>
          <span className="text-xs text-muted-foreground">{CURRENT_YEAR}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{stats.total}</strong> students</span>
          <span><strong className="text-foreground">{stats.groups}</strong> groups</span>
          {stats.solo > 0 && (
            <span className="text-red-600"><strong>{stats.solo}</strong> solo</span>
          )}
          <a href="/summer/buddy" className="hover:text-primary transition-colors">
            Change branch
          </a>
        </div>
      </div>

      {/* Add Student Card */}
      <div className="border-2 border-border rounded-2xl bg-card overflow-hidden">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserPlus className="h-4 w-4 text-primary" />
            Add Student
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showAddForm ? "rotate-180" : ""}`} />
        </button>

        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${showAddForm ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
            <div className="px-5 pb-5 pt-2 space-y-4">
              {/* Student fields */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Student ID *</label>
                  <input
                    value={formStudentId}
                    onChange={(e) => setFormStudentId(e.target.value)}
                    className="w-full text-xs border-2 border-border rounded-lg px-2.5 py-2 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors"
                    placeholder="e.g. MAC1234"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">English Name *</label>
                  <input
                    value={formNameEn}
                    onChange={(e) => setFormNameEn(e.target.value)}
                    className="w-full text-xs border-2 border-border rounded-lg px-2.5 py-2 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Chinese Name</label>
                  <input
                    value={formNameZh}
                    onChange={(e) => setFormNameZh(e.target.value)}
                    className="w-full text-xs border-2 border-border rounded-lg px-2.5 py-2 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors"
                    placeholder="中文名"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Parent Phone</label>
                  <input
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    inputMode="tel"
                    className="w-full text-xs border-2 border-border rounded-lg px-2.5 py-2 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors"
                    placeholder="Phone number"
                  />
                </div>
              </div>

              {/* Buddy code */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Buddy Code</label>
                  <div className="flex gap-2">
                    <input
                      value={formBuddyCode}
                      onChange={(e) => {
                        setFormBuddyCode(e.target.value.toUpperCase());
                        setLookupResult(null);
                        setLookupError(null);
                        setSiblingConfirmed(false);
                      }}
                      className="flex-1 text-xs border-2 border-border rounded-lg px-2.5 py-2 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors font-mono tracking-wider"
                      placeholder="BG-XXXX or leave empty to generate"
                    />
                    {formBuddyCode.trim() && (
                      <button
                        onClick={handleLookup}
                        disabled={lookupLoading}
                        className="px-3 py-2 text-xs font-medium border-2 border-border rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-40"
                      >
                        {lookupLoading ? "..." : "Look Up"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Lookup result */}
              {lookupError && (
                <p className="text-xs text-red-600">{lookupError}</p>
              )}
              {lookupResult && (
                <div className="border-2 border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Link2 className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium">Group {lookupResult.buddy_code}</span>
                    <span className="text-muted-foreground">
                      {lookupResult.total_size} member{lookupResult.total_size !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {lookupResult.members.length > 0 && (
                    <div className="space-y-1">
                      {lookupResult.members.map((m) => (
                        <div key={`${m.source}-${m.id}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="text-foreground font-medium">{m.name}</span>
                          {m.student_id && <span className="font-mono text-[10px]">{m.student_id}</span>}
                          <BranchBadge branch={m.branch} isSibling={m.is_sibling} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cross-branch sibling warning */}
                  {hasAnyOtherBranch && (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                      <div className="flex items-start gap-2 text-xs text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>This group has members from another branch. Cross-branch groups are for siblings only.</span>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-amber-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={siblingConfirmed}
                          onChange={(e) => setSiblingConfirmed(e.target.checked)}
                          className="rounded border-amber-400 text-primary focus:ring-primary/30"
                        />
                        I confirm this student is a sibling of an existing member
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Form messages */}
              {formError && (
                <p className="text-xs text-red-600 flex items-center gap-1.5">
                  <X className="h-3.5 w-3.5" />{formError}
                </p>
              )}
              {formSuccess && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700">
                  <Check className="h-3.5 w-3.5" />
                  <span>{formSuccess}</span>
                </div>
              )}

              {/* Submit */}
              <div className="flex gap-2">
                <button
                  onClick={handleAddStudent}
                  disabled={formSubmitting || !formStudentId.trim() || !formNameEn.trim() || (hasAnyOtherBranch && !siblingConfirmed)}
                  className="px-4 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {formSubmitting ? "Adding..." : formBuddyCode.trim() ? "Add to Group" : "Add & Generate Code"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      {ownMembers.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, ID, phone, or code..."
            className="w-full text-xs border-2 border-border rounded-xl pl-9 pr-3 py-2.5 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>
      )}

      {/* Table (desktop) */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading...</div>
      ) : filteredMembers.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {searchQuery ? "No matches found" : "No entries yet. Add your first student above."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border-2 border-border rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Student ID</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Phone</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Buddy Code</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Group</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => {
                  const isExpanded = expandedIds.has(m.id);
                  const isEditing = editingId === m.id;
                  return (
                    <DesktopRow
                      key={m.id}
                      member={m}
                      isExpanded={isExpanded}
                      isEditing={isEditing}
                      editData={editData}
                      deletingId={deletingId}
                      onToggleExpand={() => setExpandedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                        return next;
                      })}
                      onStartEdit={() => startEdit(m)}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={saveEdit}
                      onEditChange={(field, value) => setEditData((prev) => ({ ...prev, [field]: value }))}
                      onDelete={() => handleDelete(m.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filteredMembers.map((m) => {
              const isExpanded = expandedIds.has(m.id);
              const isEditing = editingId === m.id;
              return (
                <MobileCard
                  key={m.id}
                  member={m}
                  isExpanded={isExpanded}
                  isEditing={isEditing}
                  editData={editData}
                  deletingId={deletingId}
                  onToggleExpand={() => setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                    return next;
                  })}
                  onStartEdit={() => startEdit(m)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={saveEdit}
                  onEditChange={(field, value) => setEditData((prev) => ({ ...prev, [field]: value }))}
                  onDelete={() => handleDelete(m.id)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Desktop Table Row ----

function DesktopRow({
  member: m,
  isExpanded,
  isEditing,
  editData,
  deletingId,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditChange,
  onDelete,
}: {
  member: BuddyMember;
  isExpanded: boolean;
  isEditing: boolean;
  editData: Record<string, string>;
  deletingId: number | null;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditChange: (field: string, value: string) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr
        className={`border-b border-border hover:bg-muted/30 transition-colors cursor-pointer ${
          m.group_size >= 2 ? "border-l-[3px] border-l-green-400" : "border-l-[3px] border-l-red-300"
        }`}
        onClick={onToggleExpand}
      >
        <td className="px-4 py-2.5 font-mono text-[11px]">{m.student_id}</td>
        <td className="px-4 py-2.5">
          <span className="font-medium">{m.student_name_en}</span>
          {m.student_name_zh && <span className="text-muted-foreground ml-1.5">{m.student_name_zh}</span>}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">{m.parent_phone || "—"}</td>
        <td className="px-4 py-2.5">
          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] tracking-wider">
            {m.buddy_code}
            <CopyButton text={m.buddy_code} />
          </span>
        </td>
        <td className="px-4 py-2.5 text-center">{m.group_size}</td>
        <td className="px-4 py-2.5 text-center"><StatusBadge size={m.group_size} /></td>
        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center gap-1">
            <button onClick={onStartEdit} className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              disabled={deletingId === m.id}
              className="p-1 rounded-lg text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-muted/30 border-b border-border px-4 py-3">
            {isEditing ? (
              <EditForm
                editData={editData}
                onChange={onEditChange}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
              />
            ) : (
              <GroupDetail members={m.group_members} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---- Mobile Card ----

function MobileCard({
  member: m,
  isExpanded,
  isEditing,
  editData,
  deletingId,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditChange,
  onDelete,
}: {
  member: BuddyMember;
  isExpanded: boolean;
  isEditing: boolean;
  editData: Record<string, string>;
  deletingId: number | null;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditChange: (field: string, value: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`border-2 rounded-xl transition-colors ${
      m.group_size >= 2 ? "border-l-[3px] border-l-green-400 border-border" : "border-l-[3px] border-l-red-300 border-border"
    } ${isExpanded ? "bg-muted/20" : "bg-card"}`}>
      <div className="p-3 space-y-1.5" onClick={onToggleExpand}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{m.student_name_en}</span>
            {m.student_name_zh && <span className="text-xs text-muted-foreground">{m.student_name_zh}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge size={m.group_size} />
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono text-[10px]">{m.student_id}</span>
          {m.parent_phone && <span>{m.parent_phone}</span>}
          <span className="inline-flex items-center gap-1 font-mono font-bold tracking-wider text-foreground">
            {m.buddy_code}
            <CopyButton text={m.buddy_code} />
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          {isEditing ? (
            <EditForm
              editData={editData}
              onChange={onEditChange}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            <>
              <GroupDetail members={m.group_members} />
              <div className="flex gap-2 pt-1">
                <button onClick={onStartEdit} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  onClick={onDelete}
                  disabled={deletingId === m.id}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-500 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Group Detail Panel ----

function GroupDetail({ members }: { members: BuddyGroupMemberInfo[] }) {
  if (members.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No other members in this group yet.</p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Other Group Members</p>
      {members.map((m) => (
        <div key={`${m.source}-${m.id}`} className="flex items-center gap-2 text-xs">
          <span className="font-medium text-foreground">{m.name}</span>
          {m.student_id && <span className="font-mono text-[10px] text-muted-foreground">{m.student_id}</span>}
          <BranchBadge branch={m.branch} isSibling={m.is_sibling} />
        </div>
      ))}
    </div>
  );
}

// ---- Inline Edit Form ----

function EditForm({
  editData,
  onChange,
  onSave,
  onCancel,
}: {
  editData: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const inputCls = "w-full text-xs border-2 border-border rounded-lg px-2.5 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Student ID</label>
          <input value={editData.student_id || ""} onChange={(e) => onChange("student_id", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">English Name</label>
          <input value={editData.student_name_en || ""} onChange={(e) => onChange("student_name_en", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Chinese Name</label>
          <input value={editData.student_name_zh || ""} onChange={(e) => onChange("student_name_zh", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Parent Phone</label>
          <input value={editData.parent_phone || ""} onChange={(e) => onChange("parent_phone", e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
          <Check className="h-3.5 w-3.5" /> Save
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium border-2 border-border rounded-lg hover:bg-muted transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
