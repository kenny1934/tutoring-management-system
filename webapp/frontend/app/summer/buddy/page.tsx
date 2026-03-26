"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import {
  Lock,
  Users,
  Search,
  Copy,
  Check,
  Pencil,
  Trash2,
  ChevronDown,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Link2,
  AlertTriangle,
  UserPlus,
  Phone,
  Share2,
  RefreshCw,
  LayoutList,
  LayoutGrid,
  Columns,
  ChevronsUpDown,
  Unlink as UnlinkIcon,
  Download,
  X,
} from "lucide-react";
import Image from "next/image";
import { buddyTrackerAPI } from "@/lib/api";
import type { BuddyMember, BuddyGroupMemberInfo, BuddyGroupLookup } from "@/types";
import { PROSPECT_BRANCHES } from "@/types";
import { BRANCH_INFO } from "@/lib/summer-utils";

// ---- Constants ----

const CURRENT_YEAR = new Date().getFullYear();
const MAX_GROUP_SIZE = 2;

const BRANCHES = PROSPECT_BRANCHES;

const LINK_HINT = "Link = pair with existing student \u00b7 Add partner = register a new student";
const SHARE_HINT = "Share this code with the student\u2019s family so their buddy can join using it.";

const inputCls = "w-full text-xs border-2 border-border rounded-lg px-2.5 py-2 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors";

const actionBtnCls = "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-primary/25 text-primary bg-primary/5 hover:bg-primary/15 hover:border-primary/40 transition-colors";

const actionBtnActiveCls = "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-primary text-primary-foreground bg-primary shadow-sm transition-colors";

async function shareOrCopy(code: string, name?: string, onCopy?: (c: string) => void) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: "Buddy Code", text: `Buddy code: ${code}${name ? ` (${name})` : ""}` });
      return;
    } catch { /* cancelled — fall through to copy */ }
  }
  navigator.clipboard.writeText(code);
  onCopy?.(code);
}


function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ---- Helpers ----

function codeHue(code: string): number {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = code.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

function CodePill({ code, onCopy, onClick }: { code: string; onCopy?: (code: string) => void; onClick?: () => void }) {
  const hue = codeHue(code);
  const [popped, setPopped] = useState(false);
  const popTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleCopy = useCallback((c: string) => {
    onCopy?.(c);
    setPopped(true);
    clearTimeout(popTimer.current);
    popTimer.current = setTimeout(() => setPopped(false), 300);
  }, [onCopy]);
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-bold text-[11px] tracking-wider rounded-full px-2.5 py-0.5 ${onClick ? "cursor-pointer hover:opacity-80" : ""} ${popped ? "animate-pill-pop" : ""}`}
      style={{ backgroundColor: `hsl(${hue} 40% 50% / 0.15)` }}
      onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(); handleCopy(code); } }}
    >
      {code}
      {onCopy && !onClick && <CopyButton text={code} onCopy={handleCopy} />}
    </span>
  );
}

function relativeTime(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 wk" : `${weeks} wk`;
}

function CopyButton({ text, onCopy, large }: { text: string; onCopy?: (code: string) => void; large?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        onCopy?.(text);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1200);
      }}
      className={`rounded-lg text-muted-foreground hover:text-primary transition-colors ${large ? "p-2" : "p-1"}`}
      title="Copy"
    >
      {copied ? <Check className={`${large ? "h-4 w-4" : "h-3.5 w-3.5"} text-green-600`} /> : <Copy className={`${large ? "h-4 w-4" : "h-3.5 w-3.5"}`} />}
    </button>
  );
}

function BranchBadge({ branch }: { branch: string }) {
  const info = BRANCH_INFO[branch];
  const bg = info?.badge
    ?? (branch === "MSA" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
    : branch === "MSB" ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
    : "bg-muted text-muted-foreground");
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${bg}`}>
      {branch}
    </span>
  );
}

function SiblingBadge() {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
      Sibling
    </span>
  );
}

function CrossBranchIndicator({ members, currentBranch }: { members: BuddyGroupMemberInfo[]; currentBranch: string }) {
  const otherBranches = [...new Set(members.filter(m => m.branch !== currentBranch).map(m => m.branch))];
  if (!otherBranches.length) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Link2 className="h-3 w-3 text-amber-500" />
      {otherBranches.map(b => <BranchBadge key={b} branch={b} />)}
    </span>
  );
}

// ---- Main Page ----

export default function BuddyTrackerPage() {
  const searchParams = useSearchParams();
  const branch = searchParams.get("branch")?.toUpperCase();

  // Subdomain detection for clean URLs
  const [isBuddySubdomain, setIsBuddySubdomain] = useState(false);
  useEffect(() => {
    setIsBuddySubdomain(window.location.hostname.startsWith("buddy."));
  }, []);
  const buddyBasePath = isBuddySubdomain ? "/" : "/summer/buddy";

  // PIN state
  const [pinVerified, setPinVerified] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinChecking, setPinChecking] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const pinShakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Add student drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const closeDrawer = useCallback(() => {
    setDrawerClosing(true);
    clearTimeout(drawerCloseTimer.current);
    drawerCloseTimer.current = setTimeout(() => { setDrawerClosing(false); setDrawerOpen(false); }, 200);
  }, []);
  const [formStudentId, setFormStudentId] = useState("");
  const [formNameEn, setFormNameEn] = useState("");
  const [formNameZh, setFormNameZh] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formBuddyCode, setFormBuddyCode] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formTouched, setFormTouched] = useState(false);

  // Buddy code lookup
  const [lookupResult, setLookupResult] = useState<BuddyGroupLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [siblingConfirmed, setSiblingConfirmed] = useState(false);

  // Table state
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [linkCode, setLinkCode] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSiblingNeeded, setLinkSiblingNeeded] = useState(false);
  const [linkSiblingConfirmed, setLinkSiblingConfirmed] = useState(false);
  const [linkTargetCode, setLinkTargetCode] = useState<string | null>(null);
  const [linkLookup, setLinkLookup] = useState<BuddyGroupLookup | null>(null);
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<number | null>(null);
  const confirmUnlinkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const confirmDeleteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [editError, setEditError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "groups" | "board">("list");
  const [filterTab, setFilterTab] = useState<"all" | "solo" | "complete" | "cross-branch">("all");
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const copyToastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [recentlyAddedId, setRecentlyAddedId] = useState<number | null>(null);
  const recentlyAddedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const drawerCloseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const studentIdRef = useRef<HTMLInputElement>(null);

  const handleCopyToast = useCallback((code: string) => {
    setCopyToast(code);
    navigator.vibrate?.(50);
    clearTimeout(copyToastTimer.current);
    copyToastTimer.current = setTimeout(() => setCopyToast(null), 2000);
  }, []);

  const prefillBuddyCode = useCallback((code: string) => {
    setFormBuddyCode(code.startsWith("BG-") ? code.slice(3) : code);
    setDrawerOpen(true);
  }, []);

  // Sort
  type SortField = "student_id" | "student_name_en" | "buddy_code" | "group_size" | "created_at" | null;
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Data
  const validBranch = branch && BRANCHES.includes(branch as typeof BRANCHES[number]);
  const swrKey = validBranch && pinVerified ? `buddy-${branch}-${CURRENT_YEAR}` : null;
  const { data: members, isLoading, error } = useSWR(
    swrKey,
    () => buddyTrackerAPI.list(branch!, CURRENT_YEAR),
    { revalidateOnFocus: false, onSuccess: () => setLastUpdated(new Date()) }
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(pinShakeTimer.current);
      clearTimeout(drawerCloseTimer.current);
      clearTimeout(copyToastTimer.current);
      clearTimeout(confirmUnlinkTimer.current);
      clearTimeout(confirmDeleteTimer.current);
      clearTimeout(recentlyAddedTimer.current);
    };
  }, []);

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
    const suffix = formBuddyCode.trim().toUpperCase();
    if (!suffix || !branch) return;
    const code = `BG-${suffix}`;
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
  }, [formBuddyCode, branch]);

  const hasAnyOtherBranch = useMemo(() => {
    if (!lookupResult || !branch) return false;
    return lookupResult.members.some((m) => m.branch !== branch);
  }, [lookupResult, branch]);

  const isGroupFull = useMemo(() =>
    lookupResult != null && lookupResult.total_size >= MAX_GROUP_SIZE,
    [lookupResult]
  );

  // ---- Add student ----
  const handleAddStudent = useCallback(async () => {
    if (!branch || !formStudentId.trim() || !formNameEn.trim()) return;
    if (isGroupFull) return;
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
        buddy_code: formBuddyCode.trim() ? `BG-${formBuddyCode.trim().toUpperCase()}` : null,
        is_sibling: hasAnyOtherBranch && siblingConfirmed,
      });
      // Clear form — keep buddy code if joining existing group for consecutive adds
      const wasJoining = !!formBuddyCode.trim();
      setFormStudentId("");
      setFormNameEn("");
      setFormNameZh("");
      setFormPhone("");
      setFormTouched(false);
      if (!wasJoining) setFormBuddyCode("");
      if (wasJoining) {
        try {
          const updated = await buddyTrackerAPI.lookupGroup(`BG-${formBuddyCode.trim().toUpperCase()}`, branch);
          setLookupResult(updated);
        } catch { setLookupResult(null); }
      } else {
        setLookupResult(null);
      }
      setSiblingConfirmed(false);
      setFormSuccess(result.buddy_code);
      setRecentlyAddedId(result.id);
      setTimeout(() => studentIdRef.current?.focus(), 100);
      clearTimeout(recentlyAddedTimer.current);
      recentlyAddedTimer.current = setTimeout(() => setRecentlyAddedId(null), 3000);
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
  }, [branch, formStudentId, formNameEn, formNameZh, formPhone, formBuddyCode, isGroupFull, hasAnyOtherBranch, siblingConfirmed, swrKey]);

  // ---- Edit / Delete ----
  const startEdit = useCallback((m: BuddyMember) => {
    setEditingId(m.id);
    setEditError(null);
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
      setEditError(null);
      globalMutate(swrKey);
    } catch {
      setEditError("Failed to save changes");
    }
  }, [editingId, branch, editData, swrKey]);

  // Reset link state when switching targets
  useEffect(() => {
    setLinkCode(""); setLinkError(null); setLinkSiblingNeeded(false);
    setLinkSiblingConfirmed(false); setLinkTargetCode(null); setLinkLookup(null);
  }, [linkingId]);

  const handleLink = useCallback(async (memberId: number, targetCode: string, isSibling = false) => {
    if (!branch) return;
    setLinkError(null);
    try {
      await buddyTrackerAPI.linkMember(memberId, branch, targetCode, isSibling);
      setLinkingId(null);
      handleCopyToast(`Linked to ${targetCode}`);
      globalMutate(swrKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      try {
        const parsed = JSON.parse(msg);
        if (parsed.code === "CROSS_BRANCH_SIBLING_REQUIRED") {
          setLinkSiblingNeeded(true);
          setLinkTargetCode(targetCode);
          setLinkError("Cross-branch group — confirm sibling to proceed.");
          return;
        }
      } catch { /* not JSON */ }
      setLinkError(msg || "Failed to link");
    }
  }, [branch, swrKey, handleCopyToast]);

  const handleUnlink = useCallback(async (memberId: number) => {
    if (!branch) return;
    try {
      await buddyTrackerAPI.unlinkMember(memberId, branch);
      setConfirmUnlinkId(null);
      handleCopyToast("Unlinked — now solo");
      globalMutate(swrKey);
    } catch {
      handleCopyToast("Failed to unlink");
    }
  }, [branch, swrKey, handleCopyToast]);

  const requestDelete = useCallback((id: number) => {
    setConfirmDeleteId(id);
    clearTimeout(confirmDeleteTimer.current);
    confirmDeleteTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000);
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!branch) return;
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      await buddyTrackerAPI.delete(id, branch);
      navigator.vibrate?.(100);
      setExpandedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      globalMutate(swrKey);
    } catch {
      handleCopyToast("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }, [branch, swrKey, handleCopyToast]);

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
    let list = ownMembers;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.student_id.toLowerCase().includes(q) ||
          m.student_name_en.toLowerCase().includes(q) ||
          (m.student_name_zh && m.student_name_zh.includes(q)) ||
          m.buddy_code.toLowerCase().includes(q) ||
          (m.parent_phone && m.parent_phone.includes(q))
      );
    }
    if (sortField) {
      list = [...list].sort((a, b) => {
        const av = a[sortField] ?? "";
        const bv = b[sortField] ?? "";
        const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [ownMembers, searchQuery, sortField, sortDir]);

  const toggleSort = useCallback((field: NonNullable<SortField>) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }, [sortField, sortDir]);

  // Apply filter tab
  const displayMembers = useMemo(() => {
    if (filterTab === "solo") return filteredMembers.filter(m => m.group_size < 2);
    if (filterTab === "complete") return filteredMembers.filter(m => m.group_size >= 2);
    if (filterTab === "cross-branch") return filteredMembers.filter(m =>
      m.is_sibling || m.group_members.some(gm => gm.branch !== branch)
    );
    return filteredMembers;
  }, [filteredMembers, filterTab, branch]);

  // Grouped view data
  const groupedData = useMemo(() => {
    if (viewMode !== "groups") return [];
    const map = new Map<number, { code: string; size: number; own: BuddyMember[]; others: BuddyGroupMemberInfo[]; oldestCreated: string }>();
    for (const m of displayMembers) {
      if (!map.has(m.buddy_group_id)) {
        map.set(m.buddy_group_id, { code: m.buddy_code, size: m.group_size, own: [], others: m.group_members, oldestCreated: m.created_at });
      }
      const g = map.get(m.buddy_group_id)!;
      g.own.push(m);
      if (m.created_at < g.oldestCreated) g.oldestCreated = m.created_at;
    }
    // Filter others to exclude members already shown in own
    for (const g of map.values()) {
      const ownIds = new Set(g.own.map((m) => m.id));
      g.others = g.others.filter((m) => !(m.source === "primary" && ownIds.has(m.id)));
    }
    // Solo groups first (oldest first = most urgent), then complete (newest first)
    return Array.from(map.values()).sort((a, b) => {
      if (a.size < 2 && b.size >= 2) return -1;
      if (a.size >= 2 && b.size < 2) return 1;
      if (a.size < 2 && b.size < 2) return a.oldestCreated.localeCompare(b.oldestCreated); // oldest first
      return b.oldestCreated.localeCompare(a.oldestCreated); // newest first for complete
    });
  }, [displayMembers, viewMode]);

  // ---- Stats ----
  // Board view: split into solo and paired
  const boardSolo = useMemo(() =>
    displayMembers.filter(m => m.group_size < 2).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [displayMembers]
  );
  const boardPaired = useMemo(() => {
    const displayIds = new Set(displayMembers.map(m => m.id));
    const map = new Map<number, { code: string; members: BuddyMember[]; others: BuddyGroupMemberInfo[] }>();
    for (const m of displayMembers.filter(m => m.group_size >= 2)) {
      if (!map.has(m.buddy_group_id)) {
        const others = m.group_members.filter(gm => !(gm.source === "primary" && displayIds.has(gm.id)));
        map.set(m.buddy_group_id, { code: m.buddy_code, members: [], others });
      }
      map.get(m.buddy_group_id)!.members.push(m);
    }
    return Array.from(map.values()).sort((a, b) => b.members[0].created_at.localeCompare(a.members[0].created_at));
  }, [displayMembers]);

  const stats = useMemo(() => {
    if (!ownMembers.length) return { total: 0, groups: 0, paired: 0, solo: 0, crossBranch: 0 };
    const groupIds = new Set(ownMembers.map((m) => m.buddy_group_id));
    const paired = ownMembers.filter((m) => m.group_size >= 2).length;
    const crossBranch = ownMembers.filter((m) =>
      m.is_sibling || m.group_members.some(gm => gm.branch !== branch)
    ).length;
    return {
      total: ownMembers.length,
      groups: groupIds.size,
      paired,
      solo: ownMembers.length - paired,
      crossBranch,
    };
  }, [ownMembers, branch]);

  // Duplicate student ID detection
  const existingStudentIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of ownMembers) map.set(m.student_id.toLowerCase(), m.buddy_code);
    return map;
  }, [ownMembers]);
  const duplicateWarning = formStudentId.trim()
    ? existingStudentIds.get(formStudentId.trim().toLowerCase()) ?? null
    : null;

  // ============================================
  // ---- Link Picker (shared across all views) ----
  const isCodeMode = linkCode.startsWith("BG-");
  const linkSearchResults = useMemo(() => {
    if (!linkCode.trim() || isCodeMode) return [];
    const q = linkCode.toLowerCase();
    return ownMembers
      .filter(m => m.id !== linkingId && (
        m.student_id.toLowerCase().includes(q) ||
        m.student_name_en.toLowerCase().includes(q) ||
        (m.student_name_zh && m.student_name_zh.includes(q))
      ))
      .sort((a, b) => (a.group_size >= 2 ? 1 : 0) - (b.group_size >= 2 ? 1 : 0))
      .slice(0, 5);
  }, [linkCode, isCodeMode, ownMembers, linkingId]);

  const renderLinkPicker = (memberId: number) => (
    <div className="p-2.5 border-2 border-border rounded-xl space-y-2">
      <div className="flex gap-2">
        <input value={linkCode} onChange={(e) => { setLinkCode(e.target.value.toUpperCase()); setLinkTargetCode(null); setLinkError(null); setLinkSiblingNeeded(false); setLinkLookup(null); }}
          className={`flex-1 text-xs border-2 border-border rounded-lg px-2.5 py-2 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors ${isCodeMode ? "font-mono tracking-wider" : ""}`}
          placeholder="Find existing student or enter buddy code"
          autoFocus />
        {isCodeMode && linkCode.trim().length >= 6 && !linkLookup && (
          <button onClick={async () => {
            try {
              const result = await buddyTrackerAPI.lookupGroup(linkCode.trim(), branch!);
              setLinkLookup(result);
            } catch { setLinkError("Code not found"); }
          }}
            className="px-3 py-2 text-xs font-medium border-2 border-primary/30 text-primary rounded-lg hover:bg-primary/5 transition-colors shrink-0">
            Look Up
          </button>
        )}
      </div>
      {/* Code lookup preview */}
      {linkLookup && (
        <div className="border-2 border-border rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <Link2 className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">Group {linkLookup.buddy_code}</span>
            <span className="text-muted-foreground">{linkLookup.total_size} member{linkLookup.total_size !== 1 ? "s" : ""}</span>
          </div>
          {linkLookup.members.map(m => (
            <div key={`${m.source}-${m.id}`} className="flex items-center gap-2 text-xs text-muted-foreground pl-5">
              {m.branch !== branch && <BranchBadge branch={m.branch} />}
              {m.student_id && <span className="font-mono text-[10px]">{m.student_id}</span>}
              <span className="font-medium text-foreground">{m.name}</span>
              {m.phone && <span className="text-muted-foreground">{m.phone}</span>}
              {m.is_sibling && <SiblingBadge />}
            </div>
          ))}
          {linkLookup.total_size >= MAX_GROUP_SIZE ? (
            <p className="mt-1 py-1.5 text-xs font-medium text-center text-red-600 bg-red-500/10 rounded-lg">Group is full (max {MAX_GROUP_SIZE})</p>
          ) : (
            <button onClick={() => handleLink(memberId, linkLookup.buddy_code, linkSiblingConfirmed)}
              className="w-full mt-1 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
              Link to this group
            </button>
          )}
        </div>
      )}
      {/* Search results */}
      {linkSearchResults.length > 0 && (
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {linkSearchResults.map(s => {
            const isFull = s.group_size >= MAX_GROUP_SIZE;
            return (
              <button key={s.id} disabled={isFull}
                onClick={() => linkTargetCode === s.buddy_code ? handleLink(memberId, s.buddy_code) : setLinkTargetCode(s.buddy_code)}
                className={`w-full text-left text-xs px-2.5 py-2 rounded-lg transition-all flex items-center gap-2 ${isFull ? "opacity-50 cursor-not-allowed" : linkTargetCode === s.buddy_code ? "bg-primary/10 ring-2 ring-primary/30 scale-[1.01]" : "hover:bg-muted/50"}`}>
                <span className="font-mono text-[10px] text-muted-foreground">{s.student_id}</span>
                <span className="font-medium">{s.student_name_en}</span>
                <CodePill code={s.buddy_code} />
                {isFull ? (
                  <span className="ml-auto text-[10px] font-medium text-red-500">Full</span>
                ) : linkTargetCode === s.buddy_code ? (
                  <span className="ml-auto text-[10px] font-bold text-primary bg-primary/15 px-2 py-0.5 rounded-full">Tap to link</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      {linkCode.trim() && !isCodeMode && linkSearchResults.length === 0 && (
        <p className="text-[10px] text-muted-foreground">No matches. Enter a BG-XXXX code to link directly.</p>
      )}
      {/* Sibling confirmation */}
      {linkSiblingNeeded && (
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1.5">
          <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0" /> Cross-branch group — only siblings (same family) can be grouped across branches.
          </p>
          <label className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300 cursor-pointer">
            <input type="checkbox" checked={linkSiblingConfirmed} onChange={(e) => setLinkSiblingConfirmed(e.target.checked)}
              className="rounded border-amber-400 text-primary focus:ring-primary/30" />
            I confirm this is a sibling
          </label>
          {linkSiblingConfirmed && linkTargetCode && (
            <button onClick={() => handleLink(memberId, linkTargetCode, true)}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
              Confirm Link
            </button>
          )}
        </div>
      )}
      {linkError && !linkSiblingNeeded && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <X className="h-3 w-3" /> {linkError}
        </p>
      )}
    </div>
  );

  // RENDER: Branch Selection
  // ============================================
  if (!validBranch) {
    return (
      <div className="max-w-lg mx-auto py-4 animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Summer Buddy Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage buddy groups for summer courses</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {BRANCHES.map((b, i) => (
            <a
              key={b}
              href={`${buddyBasePath}?branch=${b}`}
              className="group flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200 animate-slide-up w-28"
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${BRANCH_INFO[b]?.dot} opacity-80 group-hover:opacity-100 transition-opacity`} />
              <span className="font-bold text-foreground text-sm">{b}</span>
              <span className="text-xs text-muted-foreground/70 leading-tight">{BRANCH_INFO[b]?.district}</span>
            </a>
          ))}
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: PIN Gate — branded full-screen
  // ============================================
  if (!pinVerified) {
    const branchDot = BRANCH_INFO[branch!]?.dot ?? "bg-primary";
    const branchDistrict = BRANCH_INFO[branch!]?.district ?? "";
    return (
      <div className="min-h-[60vh] flex items-center justify-center animate-fade-in -mt-8">
        <div className={`absolute inset-0 ${branchDot} opacity-[0.03] pointer-events-none`} />
        <div className="relative max-w-sm w-full mx-4 bg-card border-2 border-border rounded-2xl shadow-xl overflow-hidden">
          <div className="p-8 text-center space-y-5">
            <Image
              src="/summer/buddy/icon.png"
              alt="MathConcept"
              width={48}
              height={48}
              className="h-14 w-14 mx-auto rounded-2xl"
            />
            {branchDistrict && (
              <div>
                <div className="text-2xl font-bold text-foreground">{branchDistrict}</div>
                <span className={`inline-block mt-1 text-xs font-bold px-2.5 py-0.5 rounded-full text-white ${branchDot}`}>
                  {branch}
                </span>
              </div>
            )}
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">Staff Access</div>
            <div className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setPinError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
                className={`w-full text-center text-lg tracking-widest border-2 rounded-xl px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors ${
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
            </div>
          </div>
          <div className="border-t border-border py-3 text-center">
            <a href={buddyBasePath} className="text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="h-3.5 w-3.5 inline mr-1" />
              Change branch
            </a>
          </div>
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
          <a href={buddyBasePath} className={`text-xs font-bold px-2.5 py-1 rounded-lg text-white hover:opacity-80 transition-opacity ${BRANCH_INFO[branch!]?.dot ?? "bg-primary"}`} title="Change branch">
            {branch}
          </a>
          <h1 className="text-lg font-bold text-foreground">Summer Buddy Tracker</h1>
          <span className="text-xs text-muted-foreground">{CURRENT_YEAR}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button
            onClick={() => globalMutate(swrKey)}
            className="p-1 rounded-lg hover:bg-muted transition-colors"
            title={lastUpdated ? `Updated ${Math.round((Date.now() - lastUpdated.getTime()) / 60000)}m ago` : "Refresh"}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          {ownMembers.length > 0 && (
            <button
              onClick={() => {
                const header = "Student ID,English Name,Chinese Name,Parent Phone,Buddy Code,Group Size,Status,Created";
                const rows = displayMembers.map(m =>
                  [m.student_id, m.student_name_en, m.student_name_zh || "", m.parent_phone || "", m.buddy_code, m.group_size, m.group_size >= 2 ? "Paired" : "Solo", m.created_at.split("T")[0]]
                    .map(v => `"${String(v).replace(/"/g, '""')}"`)
                    .join(","));
                const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                Object.assign(document.createElement("a"), { href: url, download: `buddy-tracker-${branch}-${CURRENT_YEAR}${filterTab !== "all" ? `-${filterTab}` : ""}.csv` }).click();
                URL.revokeObjectURL(url);
              }}
              className="p-1 rounded-lg hover:bg-muted transition-colors flex items-center gap-1"
              title="Export CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-[10px]">CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Cards */}
      {ownMembers.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {/* All Students */}
          <button
            onClick={() => setFilterTab("all")}
            className={`border-2 rounded-xl p-3 text-center transition-all duration-200 cursor-pointer ${
              filterTab === "all" || filterTab === "cross-branch"
                ? "border-primary ring-2 ring-primary/30 shadow-md scale-[1.02]"
                : "border-border hover:border-primary/40 hover:shadow-sm hover:-translate-y-0.5"
            }`}
          >
            <Users className={`h-4 w-4 mx-auto mb-1 transition-colors ${filterTab === "all" || filterTab === "cross-branch" ? "text-primary" : "text-muted-foreground"}`} />
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <div className="text-[10px] font-medium text-muted-foreground">All Students</div>
            {stats.crossBranch > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setFilterTab(filterTab === "cross-branch" ? "all" : "cross-branch"); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setFilterTab(filterTab === "cross-branch" ? "all" : "cross-branch"); } }}
                className={`inline-block mt-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                  filterTab === "cross-branch" ? "bg-amber-500 text-white shadow-md shadow-amber-500/30 ring-2 ring-amber-400/50 scale-105" : "bg-amber-500/15 text-amber-600 hover:bg-amber-500/30"
                }`}
              >
                {stats.crossBranch} cross-branch
              </span>
            )}
          </button>

          {/* Paired */}
          <button
            onClick={() => setFilterTab(filterTab === "complete" ? "all" : "complete")}
            className={`border-2 rounded-xl p-3 text-center transition-all duration-200 cursor-pointer ${
              filterTab === "complete"
                ? "border-green-500 ring-2 ring-green-500/30 shadow-md scale-[1.02] bg-green-500/5"
                : "border-border hover:border-green-500/40 hover:shadow-sm hover:-translate-y-0.5"
            }`}
          >
            <Check className={`h-4 w-4 mx-auto mb-1 transition-colors ${filterTab === "complete" ? "text-green-600 dark:text-green-400" : "text-green-600/50 dark:text-green-400/50"}`} />
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.paired}</div>
            <div className="text-[10px] font-medium text-muted-foreground">Paired</div>
          </button>

          {/* Needs Partner */}
          <button
            onClick={() => setFilterTab(filterTab === "solo" ? "all" : "solo")}
            className={`border-2 rounded-xl p-3 text-center transition-all duration-200 cursor-pointer ${
              filterTab === "solo"
                ? "border-red-500 ring-2 ring-red-500/30 shadow-md scale-[1.02] bg-red-500/5"
                : stats.solo > 0
                  ? "border-red-500/30 bg-red-500/5 hover:border-red-500/50 hover:shadow-sm hover:-translate-y-0.5 animate-buddy-glow"
                  : "border-green-500/30 bg-green-500/5 hover:border-green-500/50 hover:shadow-sm hover:-translate-y-0.5 animate-buddy-celebrate"
            }`}
          >
            {stats.solo > 0 ? (
              <AlertTriangle className={`h-4 w-4 mx-auto mb-1 transition-colors ${filterTab === "solo" ? "text-red-600 dark:text-red-400" : "text-red-500/70 dark:text-red-400/70"}`} />
            ) : (
              <Check className="h-4 w-4 mx-auto mb-1 text-green-500" />
            )}
            <div className={`text-2xl font-bold ${stats.solo > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
              {stats.solo === 0 && stats.total > 0 ? "✓" : stats.solo}
            </div>
            <div className="text-[10px] font-medium text-muted-foreground">Needs Partner</div>
          </button>
        </div>
      )}

      {/* Progress bar */}
      {ownMembers.length > 0 && stats.total > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{stats.paired} of {stats.total} paired</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round((stats.paired / stats.total) * 100)}%` }} />
          </div>
          <span className="font-medium text-foreground">{Math.round((stats.paired / stats.total) * 100)}%</span>
        </div>
      )}

      {/* FAB — Add Student */}
      {typeof document !== "undefined" && createPortal(
      <div className="buddy-theme">
      <button
        onClick={() => drawerOpen ? closeDrawer() : setDrawerOpen(true)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center ${
          drawerOpen ? "bg-muted text-muted-foreground rotate-90" : "bg-primary text-primary-foreground hover:bg-primary/90 rotate-0"
        }`}
        title={drawerOpen ? "Close" : "Add Student"}
      >
        {drawerOpen ? <X className="h-6 w-6" /> : <UserPlus className="h-6 w-6" />}
      </button>
      </div>,
      document.body
      )}

      {/* Drawer — Add Student Form */}
      {(drawerOpen || drawerClosing) && typeof document !== "undefined" && createPortal(
        <div className="buddy-theme">
        <div className={`fixed inset-0 z-40 bg-black/40 ${drawerClosing ? "animate-backdrop-out" : "animate-backdrop-in"}`} onClick={() => { if (!formSuccess) closeDrawer(); }} />
        <div className="fixed right-2 sm:right-3 bottom-[88px] z-40 w-[calc(100%-1rem)] sm:w-[420px]">
          <div className={`max-h-[calc(100vh-160px)] overflow-y-auto bg-card rounded-2xl shadow-2xl ${drawerClosing ? "animate-drawer-out" : "animate-drawer-in"}`}>
            <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserPlus className="h-4 w-4 text-primary" />
                Add Student
                <BranchBadge branch={branch!} />
              </span>
              <button onClick={closeDrawer} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Student fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Student ID <span className="text-red-500">*</span></label>
                  <input
                    ref={studentIdRef}
                    value={formStudentId}
                    onChange={(e) => { setFormStudentId(e.target.value); setFormSuccess(null); }}
                    className={`${inputCls} ${formTouched && !formStudentId.trim() ? "border-red-400" : ""}`}
                    placeholder="e.g. 1234"
                  />
                  {formTouched && !formStudentId.trim() && (
                    <p className="text-[10px] text-red-500 mt-0.5">Required</p>
                  )}
                  {duplicateWarning && (
                    <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Already in group {duplicateWarning}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">English Name <span className="text-red-500">*</span></label>
                  <input
                    value={formNameEn}
                    onChange={(e) => { setFormNameEn(e.target.value); setFormSuccess(null); }}
                    className={`${inputCls} ${formTouched && !formNameEn.trim() ? "border-red-400" : ""}`}
                    placeholder="Full name"
                  />
                  {formTouched && !formNameEn.trim() && (
                    <p className="text-[10px] text-red-500 mt-0.5">Required</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Chinese Name</label>
                  <input
                    value={formNameZh}
                    onChange={(e) => { setFormNameZh(e.target.value); setFormSuccess(null); }}
                    className={inputCls}
                    placeholder="中文名"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Parent Phone</label>
                  <input
                    value={formPhone}
                    onChange={(e) => { setFormPhone(e.target.value); setFormSuccess(null); }}
                    inputMode="tel"
                    className={inputCls}
                    placeholder="Phone number"
                  />
                </div>
              </div>

              {/* Buddy code */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Buddy Code</label>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center border-2 border-border rounded-lg bg-card focus-within:ring-1 focus-within:ring-primary/30 focus-within:border-primary transition-colors">
                      <span className="pl-2.5 text-xs font-mono tracking-wider text-muted-foreground select-none">BG-</span>
                      <input
                        value={formBuddyCode}
                        onChange={(e) => {
                          const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
                          setFormBuddyCode(v); setLookupResult(null); setLookupError(null); setSiblingConfirmed(false);
                        }}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData("text").trim().toUpperCase();
                          if (pasted.startsWith("BG-")) {
                            e.preventDefault();
                            const v = pasted.slice(3).replace(/[^A-Z0-9]/g, "").slice(0, 4);
                            setFormBuddyCode(v); setLookupResult(null); setLookupError(null); setSiblingConfirmed(false);
                          }
                        }}
                        className="flex-1 text-xs bg-transparent border-0 px-0.5 py-2 font-mono tracking-wider"
                        style={{ outline: "none", boxShadow: "none" }}
                        placeholder="XXXX"
                        maxLength={4}
                      />
                    </div>
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
                  <p className="text-[10px] text-muted-foreground mt-0.5">Leave blank to create a new group.</p>
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
                          {m.branch !== branch && <BranchBadge branch={m.branch} />}
                          {m.student_id && <span className="font-mono text-[10px] text-muted-foreground">{m.student_id}</span>}
                          <span className="text-foreground font-medium">{m.name}</span>
                          {m.is_sibling && <SiblingBadge />}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Group full or cross-branch sibling warning */}
                  {isGroupFull ? (
                    <p className="mt-1 py-1.5 text-xs font-medium text-center text-red-600 bg-red-500/10 rounded-lg">Group is full (max {MAX_GROUP_SIZE})</p>
                  ) : hasAnyOtherBranch ? (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                      <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>This group has members from another branch. Only siblings (same family) can be grouped across branches.</span>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={siblingConfirmed}
                          onChange={(e) => setSiblingConfirmed(e.target.checked)}
                          className="rounded border-amber-400 text-primary focus:ring-primary/30"
                        />
                        I confirm this student is a sibling of an existing member
                      </label>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Form messages */}
              {formError && (
                <p className="text-xs text-red-600 flex items-center gap-1.5">
                  <X className="h-3.5 w-3.5" />{formError}
                </p>
              )}
              {formSuccess && (
                <div className="border-2 border-dashed border-green-300 rounded-2xl p-4 flex items-center gap-4 relative animate-drawer-in">
                  <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                    <Check className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-muted-foreground mb-0.5">Buddy Code</div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xl tracking-widest text-foreground">{formSuccess}</span>
                      <CopyButton text={formSuccess} onCopy={handleCopyToast} large />
                      <button onClick={() => shareOrCopy(formSuccess, undefined, handleCopyToast)} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary transition-colors" title="Share code">
                        <Share2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{SHARE_HINT}</p>
                  </div>
                  <button onClick={() => setFormSuccess(null)} className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Submit */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!formStudentId.trim() || !formNameEn.trim()) { setFormTouched(true); return; }
                    handleAddStudent();
                  }}
                  disabled={formSubmitting || isGroupFull || (hasAnyOtherBranch && !siblingConfirmed)}
                  className="px-4 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {formSubmitting ? "Adding..." : formBuddyCode.trim() ? "Add to Group" : "Add & Generate Code"}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>,
        document.body
      )}

      {/* Search + view toggle */}
      {ownMembers.length > 0 && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm -mx-4 px-4 sm:-mx-8 sm:px-8 py-3 border-b border-border">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, ID, phone, or code..."
                className="w-full text-xs border-2 border-border rounded-xl pl-9 pr-3 py-2.5 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
            {filterTab === "solo" && stats.solo > 0 && (
              <button
                onClick={() => {
                  const soloMembers = displayMembers.filter(m => m.group_size < 2);
                  const message = `Summer buddy codes:\n${soloMembers.map(m => `• ${m.buddy_code} (${m.student_name_en})`).join("\n")}`;
                  navigator.clipboard.writeText(message);
                  handleCopyToast(`${soloMembers.length} codes`);
                }}
                className="px-3 py-2 text-xs font-medium border-2 border-border rounded-xl hover:border-primary/40 hover:text-foreground transition-colors text-muted-foreground shrink-0"
                title="Copy all solo codes for sharing with families to find partners"
              >
                <Copy className="h-3.5 w-3.5 inline mr-1" />
                <span className="hidden sm:inline">Copy codes</span>
              </button>
            )}
            <div className="flex border-2 border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={`px-2 py-2 transition-colors flex items-center gap-1 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                title="List view"
              >
                <LayoutList className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-[10px] font-medium">List</span>
              </button>
              <button
                onClick={() => setViewMode("groups")}
                className={`px-2 py-2 transition-colors flex items-center gap-1 ${viewMode === "groups" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                title="Group view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-[10px] font-medium">Groups</span>
              </button>
              <button
                onClick={() => setViewMode("board")}
                className={`px-2 py-2 transition-colors flex items-center gap-1 ${viewMode === "board" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                title="Board view"
              >
                <Columns className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-[10px] font-medium">Board</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table (desktop) */}
      {error ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load buddy data</p>
          <button onClick={() => globalMutate(swrKey)} className="mt-2 text-xs text-primary hover:underline">Retry</button>
        </div>
      ) : isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin text-muted-foreground/50" />
          Loading buddy data...
        </div>
      ) : displayMembers.length === 0 ? (
        <div className="text-center py-12">
          {filterTab === "solo" ? (
            <>
              <Check className="h-10 w-10 mx-auto mb-3 text-green-400" />
              <p className="text-sm font-medium text-green-600 dark:text-green-400">All students are paired!</p>
            </>
          ) : filterTab === "complete" ? (
            <>
              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No paired groups yet</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Link students or add partners to create buddy pairs</p>
            </>
          ) : (
            <>
              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "No matches found" : "No entries yet. Tap the + button to add your first student."}
              </p>
            </>
          )}
        </div>
      ) : viewMode === "board" ? (
        /* Board view — Solo left, Paired right */
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-4">
          {/* Solo column */}
          <div className="space-y-3 bg-red-500/5 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Needs Partner ({boardSolo.length})
            </div>
            {boardSolo.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                <Check className="h-6 w-6 mx-auto mb-2 text-green-500" />
                All paired!
              </div>
            ) : boardSolo.map(m => {
              const waitDays = daysAgo(m.created_at);
              return (
              <div key={m.id} className={`border-2 border-l-[3px] border-l-red-300 border-border rounded-xl p-3 space-y-2.5 ${recentlyAddedId === m.id ? "bg-green-500/20 animate-fade-in" : "bg-card"}`}>
                {/* Status bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <CodePill code={m.buddy_code} onCopy={handleCopyToast} />
                  <GroupRing size={m.group_size} />
                  <CrossBranchIndicator members={m.group_members} currentBranch={m.source_branch} />
                  {waitDays >= 1 && (
                    <span className={`text-[10px] ${waitDays >= 3 ? "text-red-500 font-medium" : "text-amber-500"}`} title="Waiting for partner">
                      {relativeTime(m.created_at)}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(m)} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <DeleteActions id={m.id} deletingId={deletingId} confirmDeleteId={confirmDeleteId}
                      onRequest={() => requestDelete(m.id)} onConfirm={() => handleDelete(m.id)} onCancel={() => setConfirmDeleteId(null)} />
                  </div>
                </div>
                {/* Student info */}
                {editingId === m.id ? (
                  <EditForm editData={editData} editError={editError} onChange={(f, v) => setEditData(prev => ({ ...prev, [f]: v }))} onSave={saveEdit} onCancel={() => { setEditingId(null); setEditError(null); }} />
                ) : (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] text-muted-foreground">{m.student_id}</span>
                        <span className="font-medium text-sm">{m.student_name_en}</span>
                        {m.student_name_zh && <span className="text-xs text-muted-foreground">{m.student_name_zh}</span>}
                        {m.is_sibling && <SiblingBadge />}
                      </div>
                      {m.parent_phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{m.parent_phone}</span>
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => setLinkingId(linkingId === m.id ? null : m.id)} className={linkingId === m.id ? actionBtnActiveCls : actionBtnCls} title={linkingId === m.id ? "Close link search" : "Pair with an existing student"}>
                        <Link2 className="h-3 w-3" /> {linkingId === m.id ? "Close" : "Link"}
                      </button>
                      <button onClick={() => prefillBuddyCode(m.buddy_code)} className={actionBtnCls} title="Register a new student into this group">
                        <UserPlus className="h-3 w-3" /> Add partner
                      </button>
                    </div>
                    {linkingId === m.id && <div className="mt-2">{renderLinkPicker(m.id)}</div>}
                  </>
                )}
              </div>
              );
            })}
          </div>

          {/* Paired column */}
          <div className="space-y-3 bg-green-500/5 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-green-600 dark:text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Paired ({boardPaired.length})
            </div>
            {boardPaired.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">No paired groups yet</div>
            ) : boardPaired.map(g => (
              <div key={g.code} className="border-2 border-l-[3px] border-l-green-400 border-border rounded-xl p-3 bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <CodePill code={g.code} onCopy={handleCopyToast} />
                  <GroupRing size={g.members.length + g.others.length} />
                  <CrossBranchIndicator members={g.others} currentBranch={branch!} />
                </div>
                <div className="space-y-2">
                  {g.members.map(m => (
                    <div key={m.id}>
                      {editingId === m.id ? (
                        <EditForm editData={editData} editError={editError} onChange={(f, v) => setEditData(prev => ({ ...prev, [f]: v }))} onSave={saveEdit} onCancel={() => { setEditingId(null); setEditError(null); }} />
                      ) : (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono text-[10px] text-muted-foreground">{m.student_id}</span>
                            <span className="font-medium">{m.student_name_en}</span>
                            {m.student_name_zh && <span className="text-muted-foreground">{m.student_name_zh}</span>}
                            {m.is_sibling && <SiblingBadge />}
                            <div className="ml-auto flex items-center gap-1 shrink-0">
                              <UnlinkActions id={m.id} confirmUnlinkId={confirmUnlinkId}
                                onRequest={() => { setConfirmUnlinkId(m.id); clearTimeout(confirmUnlinkTimer.current); confirmUnlinkTimer.current = setTimeout(() => setConfirmUnlinkId(null), 3000); }}
                                onConfirm={() => handleUnlink(m.id)} onCancel={() => setConfirmUnlinkId(null)} />
                              <button onClick={() => startEdit(m)} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <DeleteActions id={m.id} deletingId={deletingId} confirmDeleteId={confirmDeleteId}
                                onRequest={() => requestDelete(m.id)} onConfirm={() => handleDelete(m.id)} onCancel={() => setConfirmDeleteId(null)} />
                            </div>
                          </div>
                          {m.parent_phone && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <span>{m.parent_phone}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {g.others.map(m => (
                    <div key={`${m.source}-${m.id}`} className="py-2 space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <BranchBadge branch={m.branch} />
                        {m.student_id && <span className="font-mono text-[10px] text-muted-foreground">{m.student_id}</span>}
                        <span className="font-medium">{m.name}</span>
                        {m.is_sibling && <SiblingBadge />}
                      </div>
                      {m.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{m.phone}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : viewMode === "groups" ? (
        /* Grouped view */
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {groupedData.length} group{groupedData.length !== 1 ? "s" : ""}
            {" · "}{groupedData.filter(g => g.size >= 2).length} paired
            {" · "}{groupedData.filter(g => g.size < 2).length} needs partner
          </p>
          {groupedData.map((g) => {
            const isSolo = g.size < 2;
            const waitDays = daysAgo(g.oldestCreated);
            const soloMember = isSolo ? g.own[0] : null;
            return (
              <div
                key={g.code}
                className={`border-2 rounded-2xl overflow-hidden ${
                  isSolo ? `border-l-[3px] border-l-red-300 border-border ${waitDays >= 5 ? "animate-buddy-pulse" : ""}` : "border-l-[3px] border-l-green-400 border-border"
                }`}
              >
                {isSolo && soloMember ? (
                  /* Solo card — structured layout */
                  <div className="px-4 py-3 space-y-3">
                    {/* Status bar */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <CodePill code={g.code} onCopy={handleCopyToast} />
                      <GroupRing size={g.size} />
                      {g.others.length > 0 && <CrossBranchIndicator members={g.others} currentBranch={branch!} />}
                      {waitDays >= 1 && (
                        <span className={`text-[10px] ${waitDays >= 3 ? "text-red-500 font-medium" : "text-amber-500"}`} title="Days waiting for a partner">
                          Waiting {waitDays} {waitDays === 1 ? "day" : "days"} for partner
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(soloMember)} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <DeleteActions id={soloMember.id} deletingId={deletingId} confirmDeleteId={confirmDeleteId}
                          onRequest={() => requestDelete(soloMember.id)} onConfirm={() => handleDelete(soloMember.id)} onCancel={() => setConfirmDeleteId(null)} />
                      </div>
                    </div>
                    {/* Student info */}
                    {editingId === soloMember.id ? (
                      <EditForm editData={editData} editError={editError} onChange={(f, v) => setEditData(prev => ({ ...prev, [f]: v }))} onSave={saveEdit} onCancel={() => { setEditingId(null); setEditError(null); }} />
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[10px] text-muted-foreground">{soloMember.student_id}</span>
                          <span className="font-medium text-sm">{soloMember.student_name_en}</span>
                          {soloMember.student_name_zh && <span className="text-xs text-muted-foreground">{soloMember.student_name_zh}</span>}
                          {soloMember.is_sibling && <SiblingBadge />}
                        </div>
                        {soloMember.parent_phone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{soloMember.parent_phone}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={(e) => { e.stopPropagation(); setLinkingId(linkingId === soloMember.id ? null : soloMember.id); }}
                        className={linkingId === soloMember.id
                          ? "px-3 py-1.5 text-[11px] font-medium border-2 border-primary bg-primary text-primary-foreground rounded-lg shadow-sm transition-colors"
                          : "px-3 py-1.5 text-[11px] font-medium border-2 border-primary/30 text-primary rounded-lg hover:bg-primary/5 transition-colors"}
                        title={linkingId === soloMember.id ? "Close link search" : "Pair with an existing student"}
                      >
                        <Link2 className="h-3 w-3 inline mr-1" />{linkingId === soloMember.id ? "Close" : "Link"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); prefillBuddyCode(g.code); }}
                        className="px-3 py-1.5 text-[11px] font-medium border-2 border-primary/30 text-primary rounded-lg hover:bg-primary/5 transition-colors"
                        title="Register a new student into this group"
                      >
                        <UserPlus className="h-3 w-3 inline mr-1" />Add partner
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70">{SHARE_HINT}</p>
                    {linkingId === soloMember.id && (
                      <div className="pt-2 border-t border-border">
                        {renderLinkPicker(soloMember.id)}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Paired card — header + member rows */
                  <>
                    <div className="px-4 py-3 flex items-center gap-3 min-w-0 flex-wrap bg-green-500/10">
                      <CodePill code={g.code} onCopy={handleCopyToast} />
                      <GroupRing size={g.size} />
                      {g.others.length > 0 && <CrossBranchIndicator members={g.others} currentBranch={branch!} />}
                    </div>
                    <div className="divide-y divide-border relative">
                      {g.own.length + g.others.length > 1 && (
                        <div className="absolute left-3 top-3 bottom-3 w-px bg-green-400/50" />
                      )}
                      {g.own.map((m) => (
                        <div key={m.id} className={`px-4 py-2.5 text-xs relative ${recentlyAddedId === m.id ? "bg-green-500/20 animate-fade-in" : ""}`}>
                          <span className="absolute left-2 top-3 w-2 h-2 rounded-full bg-green-300" />
                          {editingId === m.id ? (
                            <EditForm editData={editData} editError={editError} onChange={(f, v) => setEditData(prev => ({ ...prev, [f]: v }))} onSave={saveEdit} onCancel={() => { setEditingId(null); setEditError(null); }} />
                          ) : (
                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                              <span className="font-mono text-[10px] text-muted-foreground w-16 shrink-0">{m.student_id}</span>
                              <span className="font-medium">{m.student_name_en}</span>
                              {m.student_name_zh && <span className="text-muted-foreground">{m.student_name_zh}</span>}
                              {m.is_sibling && <SiblingBadge />}
                              {m.parent_phone && <span className="text-muted-foreground">{m.parent_phone}</span>}
                              <div className="ml-auto flex items-center gap-1 shrink-0">
                                <UnlinkActions id={m.id} confirmUnlinkId={confirmUnlinkId}
                                  onRequest={() => { setConfirmUnlinkId(m.id); clearTimeout(confirmUnlinkTimer.current); confirmUnlinkTimer.current = setTimeout(() => setConfirmUnlinkId(null), 3000); }}
                                  onConfirm={() => handleUnlink(m.id)} onCancel={() => setConfirmUnlinkId(null)} />
                                <button onClick={() => startEdit(m)} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <DeleteActions id={m.id} deletingId={deletingId} confirmDeleteId={confirmDeleteId}
                                  onRequest={() => requestDelete(m.id)} onConfirm={() => handleDelete(m.id)} onCancel={() => setConfirmDeleteId(null)} />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {g.others.map((m) => (
                        <div key={`${m.source}-${m.id}`} className="px-4 py-2.5 flex items-center gap-2 sm:gap-3 flex-wrap text-xs bg-muted/20 relative">
                          <span className="absolute left-2 top-3 w-2 h-2 rounded-full bg-green-300" />
                          <BranchBadge branch={m.branch} />
                          {m.student_id && <span className="font-mono text-[10px] text-muted-foreground">{m.student_id}</span>}
                          <span className="font-medium">{m.name}</span>
                          {m.phone && <span className="text-muted-foreground">{m.phone}</span>}
                          {m.is_sibling && <SiblingBadge />}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border-2 border-border rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <SortHeader field="student_id" label="Student ID" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <SortHeader field="student_name_en" label="Name" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Phone</th>
                  <SortHeader field="buddy_code" label="Buddy Code" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <SortHeader field="group_size" label="Group" current={sortField} dir={sortDir} onSort={toggleSort} center />
                  <SortHeader field="created_at" label="Added" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">
                    <button onClick={() => {
                      if (expandedIds.size > 0) setExpandedIds(new Set());
                      else setExpandedIds(new Set(displayMembers.map(m => m.id)));
                    }} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title={expandedIds.size > 0 ? "Collapse all" : "Expand all"}>
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayMembers.map((m) => {
                  const isExpanded = expandedIds.has(m.id);
                  const isEditing = editingId === m.id;
                  return (
                    <Fragment key={m.id}>
                    <DesktopRow
                      member={m}
                      isExpanded={isExpanded}
                      isEditing={isEditing}
                      editData={editData}
                      editError={editError}
                      deletingId={deletingId}
                      confirmDeleteId={confirmDeleteId}
                      recentlyAddedId={recentlyAddedId}
                      onCopyToast={handleCopyToast}
                      onToggleExpand={() => {
                        setExpandedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.id)) { next.delete(m.id); setLinkingId(null); } else next.add(m.id);
                          return next;
                        });
                      }}
                      onStartEdit={() => { startEdit(m); setExpandedIds(prev => new Set(prev).add(m.id)); }}
                      onCancelEdit={() => { setEditingId(null); setEditError(null); }}
                      onSaveEdit={saveEdit}
                      onEditChange={(field, value) => setEditData((prev) => ({ ...prev, [field]: value }))}
                      onRequestDelete={() => requestDelete(m.id)}
                      onConfirmDelete={() => handleDelete(m.id)}
                      onCancelDelete={() => setConfirmDeleteId(null)}
                      onAddPartner={() => prefillBuddyCode(m.buddy_code)}
                      onLink={() => setLinkingId(linkingId === m.id ? null : m.id)}
                      isLinking={linkingId === m.id}
                      onRequestUnlink={() => { setConfirmUnlinkId(m.id); clearTimeout(confirmUnlinkTimer.current); confirmUnlinkTimer.current = setTimeout(() => setConfirmUnlinkId(null), 3000); }}
                      onConfirmUnlink={() => handleUnlink(m.id)}
                      confirmUnlinkId={confirmUnlinkId}
                      onCancelUnlink={() => setConfirmUnlinkId(null)}
                    />
                    {linkingId === m.id && (
                      <tr><td colSpan={7} className="bg-muted/30 border-b border-border px-4 py-3">{renderLinkPicker(m.id)}</td></tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {displayMembers.map((m) => {
              const isExpanded = expandedIds.has(m.id);
              const isEditing = editingId === m.id;
              return (
                <MobileCard
                  key={m.id}
                  member={m}
                  isExpanded={isExpanded}
                  isEditing={isEditing}
                  editData={editData}
                  editError={editError}
                  deletingId={deletingId}
                  confirmDeleteId={confirmDeleteId}
                  recentlyAddedId={recentlyAddedId}
                  onCopyToast={handleCopyToast}
                  onToggleExpand={() => setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                    return next;
                  })}
                  onStartEdit={() => { startEdit(m); setExpandedIds(prev => new Set(prev).add(m.id)); }}
                  onCancelEdit={() => { setEditingId(null); setEditError(null); }}
                  onSaveEdit={saveEdit}
                  onEditChange={(field, value) => setEditData((prev) => ({ ...prev, [field]: value }))}
                  onRequestDelete={() => requestDelete(m.id)}
                  onConfirmDelete={() => handleDelete(m.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onAddPartner={() => prefillBuddyCode(m.buddy_code)}
                  onLink={() => setLinkingId(linkingId === m.id ? null : m.id)}
                  isLinking={linkingId === m.id}
                  linkPicker={linkingId === m.id ? renderLinkPicker(m.id) : undefined}
                  onRequestUnlink={() => { setConfirmUnlinkId(m.id); clearTimeout(confirmUnlinkTimer.current); confirmUnlinkTimer.current = setTimeout(() => setConfirmUnlinkId(null), 3000); }}
                  onConfirmUnlink={() => handleUnlink(m.id)}
                  confirmUnlinkId={confirmUnlinkId}
                  onCancelUnlink={() => setConfirmUnlinkId(null)}
                />
              );
            })}
          </div>
        </>
      )}

      {/* Copy toast */}
      {copyToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div className="bg-foreground text-background px-4 py-2 rounded-xl shadow-lg text-xs font-medium flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-green-400" />
            <span className={copyToast.startsWith("BG-") ? "font-mono tracking-wider" : ""}>{copyToast}</span>{copyToast.startsWith("BG-") || copyToast.endsWith("codes") ? " copied" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Sort Header ----

type RowSortField = "student_id" | "student_name_en" | "buddy_code" | "group_size" | "created_at";

function SortHeader({ field, label, current, dir, onSort, center }: {
  field: RowSortField; label: string;
  current: RowSortField | null; dir: "asc" | "desc";
  onSort: (f: RowSortField) => void; center?: boolean;
}) {
  const active = current === field;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`${center ? "text-center" : "text-left"} px-4 py-2.5`}>
      <button onClick={() => onSort(field)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        {label}
        <Icon className={`h-3 w-3 ${active ? "text-foreground" : "opacity-50"}`} />
      </button>
    </th>
  );
}

// ---- Group Size Badge (merged Group + Status) ----

function GroupRing({ size }: { size: number }) {
  const complete = size >= 2;
  const r = 9, cx = 12, cy = 12;
  const c = 2 * Math.PI * r;
  const filled = c * Math.min(size / 2, 1);
  return (
    <svg width="24" height="24" className="shrink-0 inline-block align-middle">
      <title>{complete ? "Complete group" : `${size} of 2 — needs partner`}</title>
      {!complete && (
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="2.5" stroke="var(--color-border)" />
      )}
      {!complete && (
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="2.5"
          stroke="#ef4444" strokeDasharray={`${filled} ${c}`}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          className="animate-ring-draw" />
      )}
      {complete && (
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="2.5"
          stroke="#22c55e" strokeDasharray={`${c} ${c}`}
          className="animate-ring-draw" />
      )}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        className={`text-[9px] font-bold ${complete ? "fill-green-600" : "fill-red-500"}`}>
        {complete ? "✓" : size}
      </text>
    </svg>
  );
}

// ---- Delete Actions ----

function DeleteActions({ id, deletingId, confirmDeleteId, onRequest, onConfirm, onCancel }: {
  id: number; deletingId: number | null; confirmDeleteId: number | null;
  onRequest: () => void; onConfirm: () => void; onCancel: () => void;
}) {
  if (confirmDeleteId === id) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <button onClick={onConfirm} disabled={deletingId === id} className="font-medium text-red-600 hover:text-red-500 disabled:opacity-40">
          {deletingId === id ? "..." : "Delete?"}
        </button>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">Cancel</button>
      </span>
    );
  }
  return (
    <button onClick={onRequest} className="p-2 rounded-lg text-muted-foreground hover:text-red-600 transition-colors">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function UnlinkActions({ id, confirmUnlinkId, onRequest, onConfirm, onCancel, label }: {
  id: number; confirmUnlinkId: number | null;
  onRequest: () => void; onConfirm: () => void; onCancel: () => void;
  label?: boolean;
}) {
  if (confirmUnlinkId === id) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <button onClick={onConfirm} className="font-medium text-amber-600">Unlink? (becomes solo)</button>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">Cancel</button>
      </span>
    );
  }
  return label ? (
    <button onClick={onRequest} className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-500 transition-colors">
      <UnlinkIcon className="h-3 w-3" /> Unlink
    </button>
  ) : (
    <button onClick={onRequest} className="p-2 rounded-lg text-muted-foreground hover:text-amber-600 transition-colors" title="Unlink from group">
      <UnlinkIcon className="h-3.5 w-3.5" />
    </button>
  );
}

// ---- Desktop Table Row ----

function DesktopRow({
  member: m, isExpanded, isEditing, editData, editError,
  deletingId, confirmDeleteId, recentlyAddedId, onCopyToast,
  onToggleExpand, onStartEdit, onCancelEdit, onSaveEdit, onEditChange,
  onRequestDelete, onConfirmDelete, onCancelDelete, onAddPartner, onLink, isLinking,
  onRequestUnlink, onConfirmUnlink, confirmUnlinkId, onCancelUnlink,
}: {
  member: BuddyMember; isExpanded: boolean; isEditing: boolean;
  editData: Record<string, string>; editError: string | null;
  deletingId: number | null; confirmDeleteId: number | null;
  recentlyAddedId: number | null;
  onCopyToast: (code: string) => void;
  onToggleExpand: () => void; onStartEdit: () => void; onCancelEdit: () => void;
  onSaveEdit: () => void; onEditChange: (field: string, value: string) => void;
  onRequestDelete: () => void; onConfirmDelete: () => void; onCancelDelete: () => void;
  onAddPartner: () => void;
  onLink?: () => void; isLinking?: boolean;
  onRequestUnlink?: () => void; onConfirmUnlink?: () => void; confirmUnlinkId?: number | null; onCancelUnlink?: () => void;
}) {
  const waitDays = daysAgo(m.created_at);
  const isSolo = m.group_size < 2;
  const isRecent = recentlyAddedId === m.id;
  return (
    <>
      <tr
        className={`border-b border-border hover:bg-muted/20 transition-colors cursor-pointer ${
          isSolo ? `border-l-[3px] border-l-red-300 ${waitDays >= 5 ? "animate-buddy-pulse" : ""}` : "border-l-[3px] border-l-green-400"
        } ${isRecent ? "bg-green-500/20 animate-fade-in" : ""}`}
        style={!isRecent ? { backgroundColor: `hsl(${codeHue(m.buddy_code)}, 40%, 50%, 0.09)` } : undefined}
        onClick={onToggleExpand}
      >
        <td className="px-4 py-2.5 font-mono text-[10px]">{m.student_id}</td>
        <td className="px-4 py-2.5">
          <span className="font-medium">{m.student_name_en}</span>
          {m.student_name_zh && <span className="text-muted-foreground ml-1.5">{m.student_name_zh}</span>}
          {m.is_sibling && <SiblingBadge />}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">{m.parent_phone || "—"}</td>
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-1.5 flex-wrap">
            <CodePill code={m.buddy_code} onClick={() => { navigator.clipboard.writeText(m.buddy_code); onCopyToast(m.buddy_code); }} />
            <CrossBranchIndicator members={m.group_members} currentBranch={m.source_branch} />
          </span>
        </td>
        <td className="px-4 py-2.5 text-center"><GroupRing size={m.group_size} /></td>
        <td className={`px-4 py-2.5 text-[10px] ${isSolo && waitDays >= 3 ? "text-red-500 font-medium" : isSolo && waitDays >= 1 ? "text-amber-500" : "text-muted-foreground"}`} title={isSolo ? "Waiting for partner" : undefined}>
          {relativeTime(m.created_at)}
        </td>
        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center gap-1">
            {isSolo && (
              <button onClick={onAddPartner} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors" title="Add partner">
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            )}
            {!isSolo && onRequestUnlink && onConfirmUnlink && onCancelUnlink && (
              <UnlinkActions id={m.id} confirmUnlinkId={confirmUnlinkId ?? null}
                onRequest={onRequestUnlink} onConfirm={onConfirmUnlink} onCancel={onCancelUnlink} />
            )}
            <button onClick={onStartEdit} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <DeleteActions id={m.id} deletingId={deletingId} confirmDeleteId={confirmDeleteId}
              onRequest={onRequestDelete} onConfirm={onConfirmDelete} onCancel={onCancelDelete} />
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-muted/30 border-b border-border px-4 py-3">
            {isEditing ? (
              <EditForm editData={editData} editError={editError} onChange={onEditChange} onSave={onSaveEdit} onCancel={onCancelEdit} />
            ) : (
              <div className="space-y-2">
                <GroupDetail members={m.group_members} currentBranch={m.source_branch} />
                {isSolo && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <button onClick={onLink} className={isLinking ? actionBtnActiveCls : actionBtnCls} title={isLinking ? "Close link search" : "Pair with an existing student"}>
                        <Link2 className="h-3 w-3" /> {isLinking ? "Close" : "Link"}
                      </button>
                      <button onClick={onAddPartner} className={actionBtnCls}>
                        <UserPlus className="h-3 w-3" /> Add partner
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{LINK_HINT}</p>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---- Mobile Card ----

function MobileCard({
  member: m, isExpanded, isEditing, editData, editError,
  deletingId, confirmDeleteId, recentlyAddedId, onCopyToast,
  onToggleExpand, onStartEdit, onCancelEdit, onSaveEdit, onEditChange,
  onRequestDelete, onConfirmDelete, onCancelDelete, onAddPartner, onLink, isLinking, linkPicker,
  onRequestUnlink, onConfirmUnlink, confirmUnlinkId, onCancelUnlink,
}: {
  member: BuddyMember; isExpanded: boolean; isEditing: boolean;
  editData: Record<string, string>; editError: string | null;
  deletingId: number | null; confirmDeleteId: number | null;
  recentlyAddedId: number | null;
  onCopyToast?: (code: string) => void;
  onToggleExpand: () => void; onStartEdit: () => void; onCancelEdit: () => void;
  onSaveEdit: () => void; onEditChange: (field: string, value: string) => void;
  onRequestDelete: () => void; onConfirmDelete: () => void; onCancelDelete: () => void;
  onAddPartner: () => void;
  onLink?: () => void; isLinking?: boolean;
  linkPicker?: React.ReactNode;
  onRequestUnlink?: () => void; onConfirmUnlink?: () => void; confirmUnlinkId?: number | null; onCancelUnlink?: () => void;
}) {
  const isSolo = m.group_size < 2;
  const isRecent = recentlyAddedId === m.id;
  const waitDays = daysAgo(m.created_at);
  const copyCodeBtn = isSolo ? (
    <button
      onClick={() => shareOrCopy(m.buddy_code, m.student_name_en, onCopyToast)}
      className="w-full py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
    >
      Share Code
    </button>
  ) : null;
  return (
    <div className={`border-2 rounded-xl transition-colors ${
      isSolo ? `border-l-[3px] border-l-red-300 border-border ${waitDays >= 5 ? "animate-buddy-pulse" : ""}` : "border-l-[3px] border-l-green-400 border-border"
    } ${isRecent ? "bg-green-500/20 animate-fade-in" : isExpanded ? "bg-muted/20" : "bg-card"}`}>
      <div className="p-3 space-y-1.5" onClick={onToggleExpand}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{m.student_name_en}</span>
            {m.student_name_zh && <span className="text-xs text-muted-foreground">{m.student_name_zh}</span>}
            {m.is_sibling && <SiblingBadge />}
          </div>
          <div className="flex items-center gap-1.5">
            <GroupRing size={m.group_size} />
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="font-mono text-[10px]">{m.student_id}</span>
          {m.parent_phone && <span>{m.parent_phone}</span>}
          <CodePill code={m.buddy_code} onClick={() => { navigator.clipboard.writeText(m.buddy_code); onCopyToast?.(m.buddy_code); }} />
          <CrossBranchIndicator members={m.group_members} currentBranch={m.source_branch} />
          {isSolo && waitDays >= 1 && (
            <span className={`text-[10px] ${waitDays >= 3 ? "text-red-500 font-medium" : "text-amber-500"}`} title="Waiting for partner">
              {relativeTime(m.created_at)}
            </span>
          )}
        </div>
      </div>
      {isSolo && !isExpanded && (
        <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
          {copyCodeBtn}
          <p className="text-[10px] text-muted-foreground mt-1 text-center">Send this code to the student&apos;s family</p>
        </div>
      )}
      {isExpanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          {isEditing ? (
            <EditForm editData={editData} editError={editError} onChange={onEditChange} onSave={onSaveEdit} onCancel={onCancelEdit} />
          ) : (
            <>
              <GroupDetail members={m.group_members} currentBranch={m.source_branch} />
              <div className="flex gap-2 pt-1 flex-wrap">
                {isSolo && (
                  <>
                    <button onClick={onLink} className={isLinking ? actionBtnActiveCls : actionBtnCls} title={isLinking ? "Close link search" : "Pair with an existing student"}>
                      <Link2 className="h-3 w-3" /> {isLinking ? "Close" : "Link"}
                    </button>
                    <button onClick={onAddPartner} className={actionBtnCls}>
                      <UserPlus className="h-3 w-3" /> Add partner
                    </button>
                  </>
                )}
                {!isSolo && onRequestUnlink && onConfirmUnlink && onCancelUnlink && (
                  <UnlinkActions id={m.id} confirmUnlinkId={confirmUnlinkId ?? null}
                    onRequest={onRequestUnlink} onConfirm={onConfirmUnlink} onCancel={onCancelUnlink} label />
                )}
                <button onClick={onStartEdit} className={actionBtnCls}>
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <DeleteActions id={m.id} deletingId={deletingId} confirmDeleteId={confirmDeleteId}
                  onRequest={onRequestDelete} onConfirm={onConfirmDelete} onCancel={onCancelDelete} />
              </div>
              {isSolo && <p className="text-[10px] text-muted-foreground -mt-1">{LINK_HINT}</p>}
              {copyCodeBtn}
              {linkPicker}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Group Detail Panel ----

function GroupDetail({ members, currentBranch }: { members: BuddyGroupMemberInfo[]; currentBranch: string }) {
  if (members.length === 0) {
    return <p className="text-xs text-muted-foreground">No other members in this group yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Other Group Members</p>
      {members.map((m) => (
        <div key={`${m.source}-${m.id}`} className="flex items-center gap-2 text-xs">
          {m.branch !== currentBranch && <BranchBadge branch={m.branch} />}
          {m.student_id && <span className="font-mono text-[10px] text-muted-foreground">{m.student_id}</span>}
          <span className="font-medium text-foreground">{m.name}</span>
          {m.phone && <span className="text-muted-foreground">{m.phone}</span>}
          {m.is_sibling && <SiblingBadge />}
        </div>
      ))}
    </div>
  );
}

// ---- Inline Edit Form ----

function EditForm({
  editData, editError, onChange, onSave, onCancel,
}: {
  editData: Record<string, string>; editError: string | null;
  onChange: (field: string, value: string) => void;
  onSave: () => void; onCancel: () => void;
}) {
  const inputSmall = "w-full text-xs border-2 border-border rounded-lg px-2.5 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Student ID</label>
          <input value={editData.student_id || ""} onChange={(e) => onChange("student_id", e.target.value)} className={inputSmall} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">English Name</label>
          <input value={editData.student_name_en || ""} onChange={(e) => onChange("student_name_en", e.target.value)} className={inputSmall} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Chinese Name</label>
          <input value={editData.student_name_zh || ""} onChange={(e) => onChange("student_name_zh", e.target.value)} className={inputSmall} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Parent Phone</label>
          <input value={editData.parent_phone || ""} onChange={(e) => onChange("parent_phone", e.target.value)} className={inputSmall} />
        </div>
      </div>
      {editError && (
        <p className="text-xs text-red-600 flex items-center gap-1.5">
          <X className="h-3.5 w-3.5" />{editError}
        </p>
      )}
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
