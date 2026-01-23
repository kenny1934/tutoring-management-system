"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { AlertCircle } from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { Pushpin } from "@/components/ui/stationery-accents";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, login } = useAuth();
  const error = searchParams.get("error");

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

  const errorMessages: Record<string, string> = {
    unauthorized: "Your account is not authorised to access this system. Please contact an administrator.",
    no_email: "Could not retrieve your email from Google. Please try again.",
    oauth_failed: "Authentication failed. Please try again.",
  };

  const errorMessage = error ? errorMessages[error] || "An error occurred." : null;

  if (isLoading) {
    return (
      <DeskSurface>
        <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8">
          <div className="w-full flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  // Exact same structure as settings page
  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8">
        {/* Header - same pattern as settings */}
        <div className="w-full flex justify-center pt-8 sm:pt-16">
          <div className="flex items-center gap-3 mb-3">
            <Image
              src="/logo.png"
              alt="CSM Pro"
              width={56}
              height={56}
              className="h-14 w-auto drop-shadow-md"
              priority
            />
            <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-md">
              CSM Pro
            </h1>
          </div>
        </div>

        <div className="w-full text-center mb-4">
          <p className="text-sm text-white/80">
            Class Session Manager for Productive Resource Orchestration
          </p>
        </div>

        {/* Login Card - centred with margin auto like settings content */}
        <div className="w-full mx-auto" style={{ maxWidth: '28rem' }}>
          <div className="w-full relative bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl p-6 sm:p-8 paper-texture">
            <Pushpin variant="red" size="md" className="absolute -top-4 -right-2 rotate-12" />

            <p className="font-handwriting text-3xl sm:text-4xl text-amber-700 dark:text-amber-500 text-center mb-2">
              Welcome back!
            </p>

            <h2 className="text-base sm:text-lg font-medium text-[#6b5a4a] dark:text-[#a89a8a] text-center mb-6">
              Sign in to continue to your dashboard
            </h2>

            {errorMessage && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
              </div>
            )}

            <button
              onClick={login}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white dark:bg-[#3d3428] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-xl text-[#2a2219] dark:text-white font-medium hover:border-amber-400 dark:hover:border-amber-600 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <GoogleIcon className="w-5 h-5" />
              <span>Sign in with Google</span>
            </button>

            <p className="mt-6 text-xs text-[#8b7a6a] dark:text-[#7a6a5a] text-center leading-relaxed">
              Only authorised tutors can sign in. Contact your administrator if you need access.
            </p>
          </div>

          <p className="mt-6 sm:mt-8 text-xs text-white/60 text-center">
            &copy; {new Date().getFullYear()} CSM Pro. All rights reserved.
          </p>
        </div>
      </PageTransition>
    </DeskSurface>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <DeskSurface>
          <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8">
            <div className="w-full flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
            </div>
          </PageTransition>
        </DeskSurface>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
