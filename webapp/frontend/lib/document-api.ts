import type { Document, DocumentCreate, DocumentUpdate, DocumentFolder } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    const effectiveRole = sessionStorage.getItem("csm_impersonated_role");
    if (effectiveRole) headers["X-Effective-Role"] = effectiveRole;
  }
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    credentials: "include",
    headers: { ...headers, ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(typeof error.detail === "object" ? error.detail.message : error.detail);
  }
  return response.json();
}

export const documentsAPI = {
  list(params?: { doc_type?: string; search?: string; include_archived?: boolean; sort_by?: string; sort_order?: string; limit?: number; offset?: number; tag?: string; folder_id?: number }) {
    const qs = new URLSearchParams();
    if (params?.doc_type) qs.set("doc_type", params.doc_type);
    if (params?.search) qs.set("search", params.search);
    if (params?.include_archived) qs.set("include_archived", "true");
    if (params?.sort_by) qs.set("sort_by", params.sort_by);
    if (params?.sort_order) qs.set("sort_order", params.sort_order);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.tag) qs.set("tag", params.tag);
    if (params?.folder_id !== undefined) qs.set("folder_id", String(params.folder_id));
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

  async uploadImage(file: File): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (typeof window !== "undefined") {
      const effectiveRole = sessionStorage.getItem("csm_impersonated_role");
      if (effectiveRole) headers["X-Effective-Role"] = effectiveRole;
    }

    const response = await fetch(`${API_BASE_URL}/documents/upload-image`, {
      method: "POST",
      body: formData,
      credentials: "include",
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(error.detail || "Upload failed");
    }

    return response.json();
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
