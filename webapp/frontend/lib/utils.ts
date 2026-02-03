import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Maps known API error patterns to user-friendly messages.
 */
const ERROR_MESSAGE_MAP: Record<string, string> = {
  "Not authenticated": "Please log in to continue",
  "Invalid or expired token": "Your session has expired. Please log in again",
  "User not found": "Account not found. Please log in again",
  "Admin access required": "You don't have permission to perform this action",
  "Super Admin access required": "This action requires Super Admin privileges",
  "Failed to fetch": "Unable to connect to server. Please check your connection",
  "NetworkError": "Network error. Please check your internet connection",
  "Load failed": "Unable to load data. Please try again",
};

/**
 * Formats an error for user-friendly display.
 *
 * - Converts Error objects to their message
 * - Handles unknown error types gracefully
 * - Maps known error patterns to friendlier messages
 * - Strips technical details that users shouldn't see
 *
 * @param error - The error to format (Error, string, or unknown)
 * @param fallback - Fallback message if error can't be formatted
 * @returns A user-friendly error message
 */
export function formatError(error: unknown, fallback = "An unexpected error occurred"): string {
  // Handle null/undefined
  if (error == null) {
    return fallback;
  }

  // Extract message from Error objects
  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    message = (error as { message: string }).message;
  } else {
    return fallback;
  }

  // Empty message
  if (!message || message.trim() === "") {
    return fallback;
  }

  // Check for known error patterns and map to friendly messages
  for (const [pattern, friendlyMessage] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (message.includes(pattern)) {
      return friendlyMessage;
    }
  }

  // Strip common technical prefixes
  message = message
    .replace(/^Error:\s*/i, "")
    .replace(/^HTTP error!\s*status:\s*\d+\s*/i, "")
    .trim();

  // Capitalize first letter if lowercase
  if (message.length > 0 && message[0] === message[0].toLowerCase()) {
    message = message.charAt(0).toUpperCase() + message.slice(1);
  }

  return message || fallback;
}
