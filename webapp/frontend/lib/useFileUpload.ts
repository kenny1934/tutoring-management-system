import { useState, useRef, useCallback } from "react";
import { messagesAPI } from "@/lib/api";

interface FileAttachment {
  url: string;
  filename: string;
  content_type: string;
}

interface UseFileUploadOptions {
  tutorId: number;
  /** Whether to accept non-image files. Default: false (images only) */
  acceptFiles?: boolean;
  onError?: (error: unknown) => void;
}

export function useFileUpload({ tutorId, acceptFiles = false, onError }: UseFileUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (
    files: FileList | null,
    callbacks: {
      onImage: (url: string) => void;
      onFile?: (file: FileAttachment) => void;
    }
  ) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const results = await Promise.all(Array.from(files).map(async (file) => {
        if (file.type.startsWith("image/")) {
          const result = await messagesAPI.uploadImage(file, tutorId);
          return { type: "image" as const, url: result.url };
        } else if (acceptFiles) {
          const result = await messagesAPI.uploadFile(file, tutorId);
          return { type: "file" as const, file: result };
        }
        return null;
      }));
      for (const r of results) {
        if (!r) continue;
        if (r.type === "image") callbacks.onImage(r.url);
        else if (r.type === "file" && callbacks.onFile) callbacks.onFile(r.file);
      }
    } catch (error) {
      if (onError) onError(error);
      else console.error("File upload failed:", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [tutorId, acceptFiles, onError]);

  return { uploadFiles, isUploading, fileInputRef };
}
