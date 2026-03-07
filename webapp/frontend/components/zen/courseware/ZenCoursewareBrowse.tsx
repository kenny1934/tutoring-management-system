"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getSavedFolders,
  addFolder,
  removeFolder,
  verifyPermission,
  type SavedFolder,
} from "@/lib/file-system";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import type { PreviewFile } from "./ZenCoursewarePreview";

interface BrowseNode {
  name: string;
  path: string;
  kind: "folder" | "file";
  handle?: FileSystemDirectoryHandle | FileSystemFileHandle;
}

interface ZenCoursewareBrowseProps {
  isActive: boolean;
  onSelectFile: (file: PreviewFile) => void;
  onAssignFile: (path: string, title: string) => void;
}

export function ZenCoursewareBrowse({
  isActive,
  onSelectFile,
  onAssignFile,
}: ZenCoursewareBrowseProps) {
  const [cursor, setCursor] = useState(0);
  const [savedFolders, setSavedFolders] = useState<SavedFolder[]>([]);
  const [browsePath, setBrowsePath] = useState<string[]>([]);
  const [browseContents, setBrowseContents] = useState<BrowseNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // Check File System Access API support
  useEffect(() => {
    if (typeof window !== "undefined" && !("showDirectoryPicker" in window)) {
      setIsSupported(false);
    }
  }, []);

  // Load saved folders on mount
  useEffect(() => {
    const loadFolders = async () => {
      const folders = await getSavedFolders();
      setSavedFolders(folders);
      // Show root folders as initial contents
      const nodes: BrowseNode[] = folders.map((f) => ({
        name: f.name,
        path: f.name,
        kind: "folder" as const,
        handle: f.handle,
      }));
      setBrowseContents(nodes);
    };
    loadFolders();
  }, []);

  // Auto-scroll
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursor]);

  const loadFolder = useCallback(
    async (handle: FileSystemDirectoryHandle, newPath: string[]) => {
      setIsLoading(true);
      setError(null);
      try {
        const hasPermission = await verifyPermission(handle);
        if (!hasPermission) {
          setError("Permission denied — click to re-grant access");
          setIsLoading(false);
          return;
        }

        const contents: BrowseNode[] = [];
        const basePath = newPath.join("\\");

        for await (const [name, entryHandle] of handle.entries()) {
          const isPdf = name.toLowerCase().endsWith(".pdf");
          const isFolder = entryHandle.kind === "directory";

          if (isFolder || isPdf) {
            contents.push({
              name,
              path: `${basePath}\\${name}`,
              kind: isFolder ? "folder" : "file",
              handle: entryHandle as FileSystemDirectoryHandle | FileSystemFileHandle,
            });
          }
        }

        contents.sort((a, b) => {
          if (a.kind === "folder" && b.kind !== "folder") return -1;
          if (a.kind !== "folder" && b.kind === "folder") return 1;
          return a.name.localeCompare(b.name);
        });

        setBrowseContents(contents);
        setBrowsePath(newPath);
        setCursor(0);
      } catch {
        setError("Failed to load folder");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const navigateInto = useCallback(
    async (node: BrowseNode) => {
      if (node.kind !== "folder" || !node.handle) return;
      const newPath = browsePath.length === 0 ? [node.name] : [...browsePath, node.name];
      await loadFolder(node.handle as FileSystemDirectoryHandle, newPath);
    },
    [browsePath, loadFolder]
  );

  const navigateUp = useCallback(async () => {
    if (browsePath.length === 0) return;

    if (browsePath.length === 1) {
      // Back to root folders
      const nodes: BrowseNode[] = savedFolders.map((f) => ({
        name: f.name,
        path: f.name,
        kind: "folder" as const,
        handle: f.handle,
      }));
      setBrowseContents(nodes);
      setBrowsePath([]);
      setCursor(0);
      return;
    }

    // Navigate to parent
    const parentPath = browsePath.slice(0, -1);
    const rootFolder = savedFolders.find((f) => f.name === parentPath[0]);
    if (!rootFolder?.handle) return;

    let currentDir = rootFolder.handle;
    for (let i = 1; i < parentPath.length; i++) {
      try {
        currentDir = await currentDir.getDirectoryHandle(parentPath[i]);
      } catch {
        setError("Cannot navigate to parent");
        return;
      }
    }

    await loadFolder(currentDir, parentPath);
  }, [browsePath, savedFolders, loadFolder]);

  const handlePreviewFile = useCallback(
    async (node: BrowseNode) => {
      if (node.kind !== "file" || !node.handle) return;
      try {
        const file = await (node.handle as FileSystemFileHandle).getFile();
        const url = URL.createObjectURL(file);
        onSelectFile({
          blobUrl: url,
          path: node.path,
          title: node.name,
        });
      } catch {
        setZenStatus("Failed to load file preview", "error");
      }
    },
    [onSelectFile]
  );

  const handleAddFolder = useCallback(async () => {
    const folder = await addFolder();
    if (folder) {
      setSavedFolders((prev) => [...prev, folder]);
      setBrowseContents((prev) => [
        ...prev,
        { name: folder.name, path: folder.name, kind: "folder", handle: folder.handle },
      ]);
      setZenStatus(`Folder added: ${folder.name}`, "success");
    }
  }, []);

  const handleRemoveFolder = useCallback(
    async (node: BrowseNode) => {
      const folder = savedFolders.find((f) => f.name === node.name);
      if (!folder) return;
      await removeFolder(folder.id);
      setSavedFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setBrowseContents((prev) => prev.filter((n) => n.name !== node.name));
      if (cursor >= browseContents.length - 1) {
        setCursor(Math.max(0, browseContents.length - 2));
      }
      setZenStatus(`Removed: ${node.name}`, "info");
    },
    [savedFolders, cursor, browseContents.length]
  );

  // Keyboard handler
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor((prev) => Math.min(prev + 1, browseContents.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          e.stopImmediatePropagation();
          const node = browseContents[cursor];
          if (node?.kind === "folder") {
            navigateInto(node);
          } else if (node?.kind === "file") {
            handlePreviewFile(node);
          }
          break;
        }
        case "Backspace":
        case "h":
          // h only for navigation when not in a text input
          if (e.key === "h" && browsePath.length === 0) break;
          e.preventDefault();
          e.stopImmediatePropagation();
          navigateUp();
          break;
        case "a": {
          e.preventDefault();
          e.stopImmediatePropagation();
          const node = browseContents[cursor];
          if (node?.kind === "file") {
            onAssignFile(node.path, node.name);
          }
          break;
        }
        case "n":
          // Add new folder (only at root)
          if (browsePath.length === 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleAddFolder();
          }
          break;
        case "x":
          // Remove folder (only at root)
          if (browsePath.length === 0 && browseContents[cursor]?.kind === "folder") {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleRemoveFolder(browseContents[cursor]);
          }
          break;
        case "g":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor(0);
          break;
        case "G":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor(Math.max(0, browseContents.length - 1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isActive, browseContents, cursor, browsePath, navigateInto, navigateUp, handlePreviewFile, onAssignFile, handleAddFolder, handleRemoveFolder]);

  if (!isSupported) {
    return (
      <div style={{ padding: "16px", color: "var(--zen-dim)", fontSize: "12px" }}>
        <div style={{ color: "var(--zen-warning)", marginBottom: "8px" }}>
          File System Access API not supported
        </div>
        <div>Use a Chromium browser (Chrome/Edge) for folder browsing, or use the Search tab.</div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Breadcrumb bar */}
      <div
        style={{
          padding: "6px 8px",
          borderBottom: "1px solid var(--zen-border)",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "11px",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "var(--zen-accent)", fontWeight: "bold" }}>BROWSE</span>
        <span style={{ color: "var(--zen-dim)", margin: "0 4px" }}>/</span>
        {browsePath.length === 0 ? (
          <span style={{ color: "var(--zen-dim)" }}>Root Folders</span>
        ) : (
          browsePath.map((segment, i) => (
            <span key={i}>
              <span style={{ color: i === browsePath.length - 1 ? "var(--zen-fg)" : "var(--zen-dim)" }}>
                {segment}
              </span>
              {i < browsePath.length - 1 && (
                <span style={{ color: "var(--zen-dim)", margin: "0 2px" }}>/</span>
              )}
            </span>
          ))
        )}
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
          {browseContents.length} items
        </span>
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: "8px",
            borderBottom: "1px solid var(--zen-border)",
            color: "var(--zen-error)",
            fontSize: "11px",
          }}
        >
          {error}
        </div>
      )}

      {/* File list */}
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {isLoading && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            Loading...
          </div>
        )}

        {!isLoading && browseContents.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            {browsePath.length === 0 ? (
              <>
                No folders added yet.{" "}
                <button
                  onClick={handleAddFolder}
                  style={{
                    color: "var(--zen-accent)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "12px",
                    textDecoration: "underline",
                  }}
                >
                  Add a folder
                </button>{" "}
                or press [n].
              </>
            ) : (
              "Empty folder"
            )}
          </div>
        )}

        {browseContents.map((node, index) => {
          const isSelected = index === cursor;
          return (
            <div
              key={node.name}
              data-selected={isSelected}
              onClick={() => {
                setCursor(index);
                if (node.kind === "folder") navigateInto(node);
                else handlePreviewFile(node);
              }}
              style={{
                display: "flex",
                padding: "3px 8px",
                fontSize: "11px",
                gap: "8px",
                cursor: "pointer",
                backgroundColor: isSelected ? "var(--zen-accent)" : "transparent",
                color: isSelected ? "var(--zen-bg)" : "var(--zen-fg)",
                borderLeft: isSelected ? "2px solid var(--zen-accent)" : "2px solid transparent",
              }}
            >
              <span
                style={{
                  width: "36px",
                  color: isSelected
                    ? "var(--zen-bg)"
                    : node.kind === "folder"
                    ? "var(--zen-accent)"
                    : "var(--zen-dim)",
                  fontWeight: "bold",
                  fontSize: "10px",
                }}
              >
                {node.kind === "folder" ? "[DIR]" : "[PDF]"}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {node.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "4px 8px",
          borderTop: "1px solid var(--zen-border)",
          fontSize: "10px",
          color: "var(--zen-dim)",
          flexShrink: 0,
        }}
      >
        j/k nav • Enter open • Backspace up • [a]ssign
        {browsePath.length === 0 && " • [n]ew folder • [x] remove"}
      </div>
    </div>
  );
}
