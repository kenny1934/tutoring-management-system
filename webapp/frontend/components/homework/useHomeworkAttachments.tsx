"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, FileText, Loader2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { homeworkAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import type { HomeworkCompletion, HomeworkFile } from "@/types";

// Only fetched once a tutor actually opens a photo.
const ImageLightbox = dynamic(() => import("@/components/inbox/ImageLightbox"), { ssr: false });

// No capture attribute on purpose: it would force the camera and make a PDF
// unpickable. Mobile still offers Take Photo in its own sheet.
const ACCEPTED_FILES = "image/*,application/pdf";

function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Remove"
      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gray-700 text-white flex items-center justify-center opacity-0 group-hover/file:opacity-100 focus:opacity-100 transition-opacity"
    >
      <X className="h-2.5 w-2.5" />
    </button>
  );
}

/**
 * What the student handed in: photos and PDFs against one homework item.
 *
 * A hook rather than a component because its two pieces land in different
 * places: the camera sits in the row's button cluster, the thumbnails below it.
 * Splitting it out of the marking row keeps the lightbox out of surfaces that
 * only mark.
 */
export function useHomeworkAttachments({
  sessionId,
  sessionExerciseId,
  files,
  readOnly,
  onChanged,
}: {
  sessionId: number;
  sessionExerciseId: number;
  files: HomeworkFile[];
  readOnly?: boolean;
  onChanged: (updated: HomeworkCompletion) => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const photos = files.filter((f) => f.file_type === "image");

  const run = useCallback(
    async (call: () => Promise<HomeworkCompletion>, failure: string) => {
      setBusy(true);
      try {
        onChanged(await call());
      } catch (err) {
        showToast(err instanceof Error ? err.message : failure, "error");
      } finally {
        setBusy(false);
      }
    },
    [onChanged, showToast]
  );

  const handlePick = (chosen: File | undefined) => {
    if (!chosen) return;
    void run(
      () => homeworkAPI.uploadFile(sessionId, sessionExerciseId, chosen),
      "Could not attach that file"
    ).finally(() => {
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  return {
    /** The camera control, for the row's button cluster. */
    control: !readOnly && (
      <>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          title="Photograph what was handed in, or attach a PDF"
          className={cn(
            "p-1 rounded transition-colors",
            files.length
              ? "text-blue-600 dark:text-blue-400"
              : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",
            busy && "cursor-not-allowed opacity-60"
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILES}
          className="hidden"
          onChange={(e) => handlePick(e.target.files?.[0])}
        />
      </>
    ),

    /** The thumbnail strip, for below the controls. */
    previews: files.length > 0 && (
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {files.map((file) => (
          <div key={file.id} className="relative group/file">
            {file.file_type === "image" ? (
              <button
                type="button"
                onClick={() => setLightboxIndex(photos.findIndex((p) => p.id === file.id))}
                className="block h-12 w-12 rounded border border-gray-200 dark:border-gray-700 overflow-hidden hover:opacity-80 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={file.file_path}
                  alt={file.file_name || "Handed in"}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
            ) : (
              <a
                href={file.file_path}
                target="_blank"
                rel="noopener noreferrer"
                title={file.file_name || "Open PDF"}
                className="flex items-center gap-1 h-12 px-2 rounded border border-gray-200 dark:border-gray-700 text-[10px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors max-w-[8rem]"
              >
                <FileText className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                <span className="truncate">{file.file_name || "PDF"}</span>
              </a>
            )}
            {!readOnly && (
              <RemoveButton
                disabled={busy}
                onClick={() =>
                  void run(
                    () => homeworkAPI.deleteFile(sessionId, sessionExerciseId, file.id),
                    "Could not remove that file"
                  )
                }
              />
            )}
          </div>
        ))}

        {lightboxIndex !== null && photos.length > 0 && (
          <ImageLightbox
            images={photos.map((p) => p.file_path)}
            currentIndex={Math.max(0, Math.min(lightboxIndex, photos.length - 1))}
            onClose={() => setLightboxIndex(null)}
            onChangeIndex={setLightboxIndex}
          />
        )}
      </div>
    ),
  };
}
