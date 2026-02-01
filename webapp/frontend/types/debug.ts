/**
 * TypeScript types for the Super Admin Debug Panel
 */

export interface DebugTable {
  name: string;
  display_name: string;
  row_count: number;
  priority: number;
  allow_hard_delete: boolean;
}

export interface DebugColumn {
  name: string;
  type: "integer" | "string" | "decimal" | "date" | "datetime" | "boolean" | "binary";
  nullable: boolean;
  readonly: boolean;
  primary_key: boolean;
  default?: string;
}

export interface DebugTableSchema {
  table_name: string;
  display_name: string;
  columns: DebugColumn[];
  primary_key: string;
  search_columns: string[];
}

export interface DebugRow {
  [key: string]: unknown;
}

export interface DebugQueryParams {
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  search?: string;
}

export interface PaginatedRows {
  rows: DebugRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface DebugAuditLog {
  id: number;
  admin_email: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  table_name: string;
  row_id?: number;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  changed_fields?: string[];
  ip_address?: string;
  created_at: string;
}

export interface PaginatedAuditLogs {
  logs: DebugAuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditLogQueryParams {
  limit?: number;
  offset?: number;
  table_name?: string;
  operation?: string;
  admin_email?: string;
}
