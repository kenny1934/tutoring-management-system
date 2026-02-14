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
      for (const file of Array.from(files)) {
        if (file.type.startsWith("image/")) {
          const result = await messagesAPI.uploadImage(file, tutorId);
          callbacks.onImage(result.url);
        } else if (acceptFiles && callbacks.onFile) {
          const result = await messagesAPI.uploadFile(file, tutorId);
          callbacks.onFile(result);
        }
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
