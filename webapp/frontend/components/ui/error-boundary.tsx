"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component that catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the entire app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 text-center bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertTriangle className="h-8 w-8 text-red-500 mb-3" />
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
            Something went wrong
          </h3>
          <p className="text-xs text-red-600 dark:text-red-300 mb-3 max-w-xs">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className="text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Compact error boundary for inline use (e.g., within cards or list items)
 */
export function CompactErrorBoundary({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  return (
    <ErrorBoundary
      onReset={onReset}
      fallback={
        <div className="flex items-center gap-2 p-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          <span>Error loading content</span>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Full-page error boundary for wrapping app-level content.
 * Displays a centered error message with refresh option.
 */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      onReset={() => window.location.reload()}
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
          <div className="max-w-md text-center">
            <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-foreground mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <Button
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Page
            </Button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
