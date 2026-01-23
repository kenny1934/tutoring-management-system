"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { extensionRequestsAPI } from "@/lib/api";
import { ExtensionRequestReviewModal } from "./ExtensionRequestReviewModal";
import { cn } from "@/lib/utils";
import {
  Clock,
  Calendar,
  User,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronRight,
  Loader2,
  RefreshCw,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExtensionRequest, ExtensionRequestDetail, ExtensionRequestStatus } from "@/types";

interface ExtensionRequestsListProps {
  adminTutorId: number;
}

export function ExtensionRequestsList({
  adminTutorId,
}: ExtensionRequestsListProps) {
  const [statusFilter, setStatusFilter] = useState<ExtensionRequestStatus | "all">("Pending");
  const [selectedRequest, setSelectedRequest] = useState<ExtensionRequestDetail | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Fetch extension requests
  const {
    data: requests,
    error,
    isLoading,
    mutate,
  } = useSWR(
    ["extension-requests", statusFilter],
    () =>
      extensionRequestsAPI.getAll({
        status: statusFilter === "all" ? undefined : statusFilter,
        include_resolved: statusFilter === "all",
        limit: 100,
      }),
    { refreshInterval: 30000 } // Refresh every 30 seconds
  );

  const handleViewRequest = async (request: ExtensionRequest) => {
    setIsLoadingDetail(true);
    try {
      const detail = await extensionRequestsAPI.getById(request.id);
      setSelectedRequest(detail);
      setIsModalOpen(true);
    } catch (error) {
      console.error("Failed to load request details:", error);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedRequest(null);
  };

  const handleRequestResolved = () => {
    mutate(); // Refresh the list
  };

  const getStatusIcon = (status: ExtensionRequestStatus) => {
    switch (status) {
      case "Pending":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "Approved":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "Rejected":
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusStyle = (status: ExtensionRequestStatus) => {
    switch (status) {
      case "Pending":
        return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300";
      case "Approved":
        return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
      case "Rejected":
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
    }
  };

  const pendingCount = requests?.filter((r) => r.request_status === "Pending").length || 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Extension Requests
          </h2>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-1", isLoading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400" />
        <div className="flex gap-1">
          {(["Pending", "Approved", "Rejected", "all"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                statusFilter === status
                  ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          Failed to load extension requests. Please try again.
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && requests?.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No {statusFilter !== "all" ? statusFilter.toLowerCase() : ""} extension requests</p>
        </div>
      )}

      {/* Requests List */}
      {!isLoading && !error && requests && requests.length > 0 && (
        <div className="space-y-2">
          {requests.map((request) => (
            <div
              key={request.id}
              className={cn(
                "p-4 rounded-lg border transition-colors cursor-pointer",
                "bg-white dark:bg-gray-900",
                "border-gray-200 dark:border-gray-700",
                "hover:border-amber-300 dark:hover:border-amber-700",
                isLoadingDetail && "opacity-50 pointer-events-none"
              )}
              onClick={() => handleViewRequest(request)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {request.student_name}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full",
                        getStatusStyle(request.request_status)
                      )}
                    >
                      {getStatusIcon(request.request_status)}
                      {request.request_status}
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span className="font-medium">
                      {request.requested_extension_weeks} week
                      {request.requested_extension_weeks > 1 ? "s" : ""}
                    </span>{" "}
                    extension requested by {request.tutor_name}
                  </div>

                  <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                    {request.reason}
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {request.original_session_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Session: {request.original_session_date}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Requested{" "}
                      {new Date(request.requested_at).toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </div>

              {/* Approved/Rejected Info */}
              {request.request_status !== "Pending" && request.reviewed_at && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                  {request.request_status === "Approved"
                    ? `Approved: ${request.extension_granted_weeks} weeks granted`
                    : "Rejected"}{" "}
                  by {request.reviewed_by} on{" "}
                  {new Date(request.reviewed_at).toLocaleDateString()}
                  {request.review_notes && (
                    <span className="ml-2 text-gray-400">
                      "{request.review_notes}"
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {selectedRequest && (
        <ExtensionRequestReviewModal
          request={selectedRequest}
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onApproved={handleRequestResolved}
          onRejected={handleRequestResolved}
          adminTutorId={adminTutorId}
        />
      )}
    </div>
  );
}
