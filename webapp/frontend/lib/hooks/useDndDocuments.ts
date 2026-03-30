import { useState, useCallback } from "react";
import {
  useSensor,
  useSensors,
  useDraggable,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

export type DragData = {
  type: "document";
  docId: number;
  docTitle: string;
  selectedIds: number[];
};

export type DropData = {
  type: "folder";
  folderId: number | null;
  folderName: string;
};

interface UseDndDocumentsProps {
  selectedIds: Set<number>;
  onMoveToFolder: (docId: number, folderId: number | null) => void;
  onBulkMove: (folderId: number | null) => void;
  enabled?: boolean;
}

export function useDndDocuments({ selectedIds, onMoveToFolder, onBulkMove, enabled = true }: UseDndDocumentsProps) {
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (!enabled) return;
    const data = event.active.data.current as DragData | undefined;
    if (data?.type === "document") {
      setActiveDragData(data);
    }
  }, [enabled]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragData(null);
    if (!enabled || !event.over) return;

    const dragData = event.active.data.current as DragData | undefined;
    const dropData = event.over.data.current as DropData | undefined;
    if (!dragData || dragData.type !== "document" || !dropData || dropData.type !== "folder") return;

    if (dragData.selectedIds.length > 1) {
      onBulkMove(dropData.folderId);
    } else {
      onMoveToFolder(dragData.docId, dropData.folderId);
    }
  }, [enabled, onMoveToFolder, onBulkMove]);

  const handleDragCancel = useCallback(() => {
    setActiveDragData(null);
  }, []);

  return {
    sensors,
    activeDragData,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}

/** Shared draggable hook for document rows/cards. Multi-select aware. */
export function useDraggableDoc({ docId, docTitle, selectedIds, disabled, idPrefix = "doc" }: {
  docId: number; docTitle: string; selectedIds: Set<number>; disabled: boolean; idPrefix?: string;
}) {
  const isSelected = selectedIds.has(docId);
  const dragIds = isSelected && selectedIds.size > 1 ? Array.from(selectedIds) : [docId];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${idPrefix}-${docId}`,
    data: { type: "document", docId, docTitle: docTitle || "Untitled", selectedIds: dragIds } satisfies DragData,
    disabled,
  });
  const dragProps = disabled ? {} : { ...listeners, ...attributes };
  return { setNodeRef, dragProps, isDragging };
}
