import type { Document, DocumentCreate, DocumentUpdate } from "@/types";

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
  list(params?: { doc_type?: string; search?: string; include_archived?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.doc_type) qs.set("doc_type", params.doc_type);
    if (params?.search) qs.set("search", params.search);
    if (params?.include_archived) qs.set("include_archived", "true");
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
};
