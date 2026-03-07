"use client";

import { useState, useEffect, useCallback } from "react";
import { usePageTitle } from "@/lib/hooks";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenCoursewareTrending } from "@/components/zen/courseware/ZenCoursewareTrending";
import { ZenCoursewareBrowse } from "@/components/zen/courseware/ZenCoursewareBrowse";
import { ZenCoursewareSearch } from "@/components/zen/courseware/ZenCoursewareSearch";
import { ZenCoursewarePreview, type PreviewFile } from "@/components/zen/courseware/ZenCoursewarePreview";
import { ZenCoursewareAssign } from "@/components/zen/courseware/ZenCoursewareAssign";

type CoursewareTab = "trending" | "browse" | "search";

const TABS: { key: CoursewareTab; label: string; shortcut: string }[] = [
  { key: "trending", label: "Trending", shortcut: "1" },
  { key: "browse", label: "Browse", shortcut: "2" },
  { key: "search", label: "Search", shortcut: "3" },
];

export default function ZenCoursewarePage() {
  usePageTitle("Courseware - Zen Mode");
  const { setDisableSectionCycling } = useZenKeyboardFocus();

  const [activeTab, setActiveTab] = useState<CoursewareTab>("trending");
  const [selectedFile, setSelectedFile] = useState<PreviewFile | null>(null);
  const [assignTarget, setAssignTarget] = useState<{
    path: string;
    title: string;
    pageStart?: number;
    pageEnd?: number;
  } | null>(null);

  // Disable global Tab section cycling
  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  const handleSelectFile = useCallback((file: PreviewFile) => {
    setSelectedFile((prev) => {
      // Revoke old blob URL to prevent memory leak
      if (prev?.blobUrl && prev.blobUrl !== file.blobUrl) {
        URL.revokeObjectURL(prev.blobUrl);
      }
      return file;
    });
  }, []);

  const handleAssignFile = useCallback((path: string, title: string) => {
    setAssignTarget({ path, title });
  }, []);

  // Page-level keyboard handler for tab switching and global actions
  useEffect(() => {
    // Don't handle keys when assign overlay is open (it has its own handler)
    if (assignTarget) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      // Tab switching: 1, 2, 3
      if (e.key === "1") {
        e.preventDefault();
        setActiveTab("trending");
        setZenStatus("Trending", "info");
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        setActiveTab("browse");
        setZenStatus("Browse", "info");
        return;
      }
      if (e.key === "3") {
        e.preventDefault();
        setActiveTab("search");
        setZenStatus("Search", "info");
        return;
      }

      // Assign shortcut (only when no tab-specific handler catches it)
      // Tab components handle 'a' themselves, so this is a fallback
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [assignTarget]);

  return (
    <div style={{ height: "calc(100vh - 150px)", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Header with tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid var(--zen-border)",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            textTransform: "uppercase",
            color: "var(--zen-fg)",
            textShadow: "var(--zen-glow)",
            margin: 0,
            marginRight: "12px",
          }}
        >
          COURSEWARE
        </h1>

        {/* Tab buttons */}
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "3px 10px",
              backgroundColor: activeTab === tab.key ? "var(--zen-accent)" : "transparent",
              color: activeTab === tab.key ? "var(--zen-bg)" : "var(--zen-fg)",
              border: "1px solid var(--zen-border)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
              textShadow: activeTab === tab.key ? "none" : "var(--zen-glow)",
            }}
          >
            [{tab.shortcut}]{tab.label}
          </button>
        ))}

        <span style={{ flex: 1 }} />

        {/* Selected file indicator */}
        {selectedFile && (
          <span
            style={{
              color: "var(--zen-dim)",
              fontSize: "10px",
              maxWidth: "200px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Preview: {selectedFile.title}
          </span>
        )}
      </div>

      {/* Split pane container */}
      <div
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Left pane — file list (active tab) */}
        <div
          style={{
            width: "45%",
            minWidth: "300px",
            borderRight: "1px solid var(--zen-border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {activeTab === "trending" && (
            <ZenCoursewareTrending
              isActive={activeTab === "trending" && !assignTarget}
              onSelectFile={handleSelectFile}
              onAssignFile={handleAssignFile}
            />
          )}
          {activeTab === "browse" && (
            <ZenCoursewareBrowse
              isActive={activeTab === "browse" && !assignTarget}
              onSelectFile={handleSelectFile}
              onAssignFile={handleAssignFile}
            />
          )}
          {activeTab === "search" && (
            <ZenCoursewareSearch
              isActive={activeTab === "search" && !assignTarget}
              onSelectFile={handleSelectFile}
              onAssignFile={handleAssignFile}
            />
          )}
        </div>

        {/* Right pane — PDF preview */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <ZenCoursewarePreview
            file={selectedFile}
            onPageSelect={(pageStart, pageEnd) => {
              if (selectedFile) {
                setAssignTarget({
                  path: selectedFile.path,
                  title: selectedFile.title,
                  pageStart,
                  pageEnd,
                });
              }
            }}
          />
        </div>
      </div>

      {/* Assignment overlay */}
      {assignTarget && (
        <ZenCoursewareAssign
          target={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => setAssignTarget(null)}
        />
      )}
    </div>
  );
}
