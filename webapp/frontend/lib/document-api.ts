import type { Document, DocumentCreate, DocumentUpdate, DocumentFolder, DocumentVersion, DocumentVersionDetail, ExtractedQuestion, ProcessQuestionResult, ProcessQuestionsResponse } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

function getEffectiveRoleHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const effectiveRole = sessionStorage.getItem("csm_impersonated_role");
    if (effectiveRole) headers["X-Effective-Role"] = effectiveRole;
  }
  return headers;
}

function parseErrorDetail(error: Record<string, unknown>, fallback: string): string {
  const detail = error.detail;
  if (typeof detail === "object" && detail && "message" in detail) return String((detail as { message: string }).message);
  if (typeof detail === "string") return detail;
  return fallback;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getEffectiveRoleHeaders(),
  };
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    credentials: "include",
    headers: { ...headers, ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(parseErrorDetail(error, "Unknown error"));
  }
  return response.json();
}

async function fetchFormData<T>(endpoint: string, formData: FormData, fallbackError = "Request failed"): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: getEffectiveRoleHeaders(),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: fallbackError }));
    throw new Error(parseErrorDetail(error, fallbackError));
  }
  return response.json();
}

export const documentsAPI = {
  list(params?: { doc_type?: string; search?: string; include_archived?: boolean; is_template?: boolean; sort_by?: string; sort_order?: string; limit?: number; offset?: number; tag?: string; folder_id?: number; my_docs?: boolean; ids?: string }) {
    const qs = new URLSearchParams();
    if (params?.doc_type) qs.set("doc_type", params.doc_type);
    if (params?.search) qs.set("search", params.search);
    if (params?.include_archived) qs.set("include_archived", "true");
    if (params?.is_template !== undefined) qs.set("is_template", String(params.is_template));
    if (params?.sort_by) qs.set("sort_by", params.sort_by);
    if (params?.sort_order) qs.set("sort_order", params.sort_order);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.tag) qs.set("tag", params.tag);
    if (params?.folder_id !== undefined) qs.set("folder_id", String(params.folder_id));
    if (params?.my_docs) qs.set("my_docs", "true");
    if (params?.ids) qs.set("ids", params.ids);
    const q = qs.toString();
    return fetchAPI<Document[]>(`/documents${q ? `?${q}` : ""}`);
  },

  get(id: number) {
    return fetchAPI<Document>(`/documents/${id}`);
  },

  create(data: DocumentCreate) {
    return fetchAPI<Document>("/documents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update(id: number, data: DocumentUpdate) {
    return fetchAPI<Document>(`/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete(id: number) {
    return fetchAPI<{ message: string }>(`/documents/${id}`, {
      method: "DELETE",
    });
  },

  permanentDelete(id: number) {
    return fetchAPI<{ message: string }>(`/documents/${id}/permanent`, {
      method: "DELETE",
    });
  },

  duplicate(id: number) {
    return fetchAPI<Document>(`/documents/${id}/duplicate`, { method: "POST" });
  },

  lock(id: number) {
    return fetchAPI<Document>(`/documents/${id}/lock`, { method: "POST" });
  },

  heartbeat(id: number) {
    return fetchAPI<{ lock_expires_at: string }>(`/documents/${id}/heartbeat`, { method: "POST" });
  },

  unlock(id: number) {
    return fetchAPI<{ message: string }>(`/documents/${id}/lock`, { method: "DELETE" });
  },

  listTags() {
    return fetchAPI<string[]>("/documents/tags");
  },

  async importWorksheet(file: File, options?: {
    removeHandwriting?: boolean;
    title?: string;
    folderId?: number;
    sourcePath?: string;
    templateId?: number;
  }): Promise<Document & { usage?: { input_tokens: number; output_tokens: number } }> {
    const formData = new FormData();
    formData.append("file", file);
    const qs = new URLSearchParams();
    if (options?.removeHandwriting !== undefined) qs.set("remove_handwriting", String(options.removeHandwriting));
    if (options?.title) qs.set("title", options.title);
    if (options?.folderId !== undefined) qs.set("folder_id", String(options.folderId));
    if (options?.sourcePath) qs.set("source_path", options.sourcePath);
    if (options?.templateId !== undefined) qs.set("template_id", String(options.templateId));
    const q = qs.toString();
    return fetchFormData<Document & { usage?: { input_tokens: number; output_tokens: number } }>(`/documents/import-worksheet${q ? `?${q}` : ""}`, formData, "Import failed");
  },

  async uploadImage(file: File): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append("file", file);
    return fetchFormData<{ url: string; filename: string }>("/documents/upload-image", formData, "Upload failed");
  },

  extractQuestions(docId: number) {
    return fetchAPI<{ questions: ExtractedQuestion[]; count: number }>(
      `/documents/${docId}/extract-questions`,
      { method: "POST" }
    );
  },

  processQuestions(docId: number, params: {
    actions: string[];
    question_indices?: number[];
  }) {
    return fetchAPI<ProcessQuestionsResponse>(
      `/documents/${docId}/process-questions`,
      { method: "POST", body: JSON.stringify(params) }
    );
  },

  applySolutions(docId: number, params: {
    results: ProcessQuestionResult[];
    replace_existing?: boolean;
  }) {
    return fetchAPI<Document>(
      `/documents/${docId}/apply-solutions`,
      { method: "POST", body: JSON.stringify(params) }
    );
  },

  createVariantDocument(docId: number, params: {
    results: ProcessQuestionResult[];
    title?: string;
    folder_id?: number | null;
    include_solutions?: boolean;
  }) {
    return fetchAPI<Document>(
      `/documents/${docId}/create-variant-document`,
      { method: "POST", body: JSON.stringify(params) }
    );
  },
};

export const foldersAPI = {
  list() {
    return fetchAPI<DocumentFolder[]>("/document-folders");
  },

  create(data: { name: string; parent_id?: number | null }) {
    return fetchAPI<DocumentFolder>("/document-folders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update(id: number, data: { name?: string; parent_id?: number | null }) {
    return fetchAPI<DocumentFolder>(`/document-folders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete(id: number) {
    return fetchAPI<{ message: string }>(`/document-folders/${id}`, {
      method: "DELETE",
    });
  },
};

export const versionsAPI = {
  list(docId: number, params?: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return fetchAPI<DocumentVersion[]>(`/documents/${docId}/versions${q ? `?${q}` : ""}`);
  },

  get(docId: number, verId: number) {
    return fetchAPI<DocumentVersionDetail>(`/documents/${docId}/versions/${verId}`);
  },

  createCheckpoint(docId: number, label?: string) {
    return fetchAPI<DocumentVersion>(`/documents/${docId}/versions`, {
      method: "POST",
      body: JSON.stringify({ label: label || null }),
    });
  },

  restore(docId: number, verId: number) {
    return fetchAPI<Document>(`/documents/${docId}/versions/${verId}/restore`, {
      method: "POST",
    });
  },

  delete(docId: number, verId: number) {
    return fetchAPI<{ message: string }>(`/documents/${docId}/versions/${verId}`, {
      method: "DELETE",
    });
  },
};
