"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { SignInPage } from "@/components/login/SignInPage";
import { usePageTitle } from "@/lib/hooks";

/** What shows while the app finds out whether someone is already signed in: the page's own colour and a quiet spinner. */
function Waiting() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-canvas">
      <div
        role="status"
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300"
      />
    </div>
  );
}

function LoginContent() {
  usePageTitle("Login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, login } = useAuth();

  // Someone who's already signed in goes straight on to the app.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) return <Waiting />;
  if (isAuthenticated) return null;
  return <SignInPage onSignIn={login} error={searchParams.get("error")} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Waiting />}>
      <LoginContent />
    </Suspense>
  );
}
