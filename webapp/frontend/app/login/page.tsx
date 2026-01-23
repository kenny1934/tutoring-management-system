"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { AlertCircle, Sparkles } from "lucide-react";
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

// Aurora beam component for dynamic light effect
function AuroraBeam({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <div
      className={`absolute rounded-full blur-3xl ${className}`}
      style={{
        animation: "aurora-drift 15s ease-in-out infinite",
        animationDelay: `${delay}s`,
      }}
    />
  );
}

// Floating particle component
function FloatingParticle({ style }: { style: React.CSSProperties }) {
  return (
    <div
      className="absolute w-1 h-1 bg-amber-400/60 dark:bg-amber-300/40 rounded-full"
      style={{
        ...style,
        animation: "particle-float 8s ease-in-out infinite",
      }}
    />
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

  // Generate particle positions
  const particles = Array.from({ length: 20 }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 8}s`,
    opacity: 0.3 + Math.random() * 0.4,
  }));

  if (isLoading) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-[#fef9f3] dark:bg-[#1a1410]">
        <div className="relative z-10 h-full w-full flex flex-col items-center justify-center p-4">
          <div className="relative">
            <div className="absolute inset-0 bg-amber-400/30 rounded-full blur-xl animate-pulse" />
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-amber-200 border-t-amber-600" />
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Layer 1: Base gradient with animated color shift */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background: "linear-gradient(135deg, #fef9f3 0%, #f5e6d3 25%, #fef3e2 50%, #f8eed8 75%, #fef9f3 100%)",
          backgroundSize: "400% 400%",
          animation: "warm-gradient 20s ease infinite",
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background: "linear-gradient(135deg, #1a1410 0%, #2d2618 25%, #1f1a14 50%, #2a2218 75%, #1a1410 100%)",
          backgroundSize: "400% 400%",
          animation: "warm-gradient 20s ease infinite",
        }}
      />

      {/* Layer 2: Aurora beams - dynamic flowing light */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <AuroraBeam
          className="w-[600px] h-[600px] -top-[200px] -left-[200px] bg-gradient-to-br from-amber-300/40 via-orange-300/30 to-transparent dark:from-amber-500/20 dark:via-orange-500/15"
          delay={0}
        />
        <AuroraBeam
          className="w-[500px] h-[500px] -bottom-[150px] -right-[150px] bg-gradient-to-tl from-orange-400/35 via-amber-300/25 to-transparent dark:from-orange-600/15 dark:via-amber-500/10"
          delay={5}
        />
        <AuroraBeam
          className="w-[400px] h-[400px] top-[30%] -right-[100px] bg-gradient-to-l from-yellow-300/30 via-amber-200/20 to-transparent dark:from-yellow-500/10 dark:via-amber-400/5"
          delay={10}
        />
        <AuroraBeam
          className="w-[350px] h-[350px] bottom-[20%] left-[5%] bg-gradient-to-tr from-amber-400/25 via-yellow-300/15 to-transparent dark:from-amber-600/10 dark:via-yellow-500/5"
          delay={7}
        />
      </div>

      {/* Layer 3: Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {particles.map((particle, i) => (
          <FloatingParticle key={i} style={particle} />
        ))}
      </div>

      {/* Layer 4: Wood grain texture (subtle) */}
      <div className="absolute inset-0 wood-grain-texture opacity-30 dark:opacity-15 pointer-events-none" />

      {/* Layer 5: Lamp lighting effect - warm desk lamp glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 100% 60% at 15% 10%, rgba(255,220,150,0.25) 0%, transparent 50%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none hidden dark:block"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 15% 10%, rgba(255,180,100,0.08) 0%, transparent 40%)",
        }}
      />

      {/* Layer 6: Noise texture overlay for premium feel */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Layer 7: Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 85% 75% at center, transparent 50%, rgba(0,0,0,0.08) 100%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none hidden dark:block"
        style={{
          background: "radial-gradient(ellipse 80% 70% at center, transparent 40%, rgba(0,0,0,0.4) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 h-full w-full flex flex-col items-center justify-center p-4">
        {/* Logo section with enhanced glow */}
        <div
          className="mb-8 text-center"
          style={{
            animation: "fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            opacity: 0,
          }}
        >
          <div className="relative inline-block mb-4">
            {/* Multi-layer logo glow */}
            <div className="absolute -inset-8 bg-amber-400/20 dark:bg-amber-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "3s" }} />
            <div className="absolute -inset-4 bg-amber-300/30 dark:bg-amber-400/15 rounded-full blur-xl" />
            <Image
              src="/logo.png"
              alt="CSM Pro"
              width={72}
              height={72}
              className="relative h-18 w-auto drop-shadow-xl"
              style={{ height: "4.5rem" }}
              priority
            />
          </div>
          <h1
            className="text-4xl sm:text-5xl font-bold drop-shadow-sm"
            style={{
              background: "linear-gradient(135deg, #2a2219 0%, #5a4a3a 50%, #2a2219 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            <span className="dark:hidden">CSM Pro</span>
          </h1>
          <h1
            className="hidden dark:block text-4xl sm:text-5xl font-bold drop-shadow-sm"
            style={{
              background: "linear-gradient(135deg, #fef9f3 0%, #d4a574 50%, #fef9f3 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            CSM Pro
          </h1>
          <p className="text-sm text-[#6b5a4a] dark:text-[#a89a8a] mt-2 tracking-wide">
            Class Session Manager for Productive Resource Orchestration
          </p>
        </div>

        {/* Premium glassmorphism card */}
        <div
          className="w-full relative"
          style={{
            maxWidth: "26rem",
            animation: "scale-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards",
            opacity: 0,
          }}
        >
          {/* Animated gradient border */}
          <div
            className="absolute -inset-[1px] rounded-3xl opacity-60 dark:opacity-40"
            style={{
              background: "linear-gradient(135deg, #e8d4b8, #d4a574, #f5e6d3, #cd853f, #e8d4b8)",
              backgroundSize: "300% 300%",
              animation: "border-shimmer 8s linear infinite",
            }}
          />

          {/* Card inner */}
          <div
            className="
              relative
              backdrop-blur-2xl
              bg-[rgba(255,252,247,0.75)] dark:bg-[rgba(45,38,24,0.75)]
              rounded-3xl p-6 sm:p-8
              paper-texture
              login-card
            "
            style={{
              transform: "rotate(-0.3deg)",
            }}
          >
            {/* Inner highlight */}
            <div
              className="absolute inset-0 rounded-3xl pointer-events-none"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%, rgba(0,0,0,0.02) 100%)",
              }}
            />

            {/* Pushpin accent (desktop only) */}
            <Pushpin variant="red" size="md" className="absolute -top-3 -right-2 rotate-12 hidden md:block" />

            {/* Decorative sparkle */}
            <Sparkles className="absolute top-4 left-4 w-4 h-4 text-amber-400/50 dark:text-amber-300/30" />

            {/* Handwriting welcome with enhanced styling */}
            <p
              className="font-handwriting text-4xl sm:text-5xl text-amber-700 dark:text-amber-500 text-center mb-3 relative"
              style={{
                animation: "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards",
                opacity: 0,
                textShadow: "0 2px 10px rgba(217,119,6,0.15)",
              }}
            >
              Welcome back!
            </p>

            <h2
              className="text-base sm:text-lg font-medium text-[#6b5a4a] dark:text-[#a89a8a] text-center mb-8"
              style={{
                animation: "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.25s forwards",
                opacity: 0,
              }}
            >
              Sign in to continue to your dashboard
            </h2>

            {/* Error message */}
            {errorMessage && (
              <div
                className="mb-6 p-4 bg-red-50/90 dark:bg-red-900/40 border border-red-200/80 dark:border-red-700/50 rounded-2xl flex items-start gap-3 backdrop-blur-sm"
                style={{
                  animation: "fade-up 0.4s ease-out forwards",
                }}
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
              </div>
            )}

            {/* Premium Google sign-in button */}
            <div
              style={{
                animation: "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards",
                opacity: 0,
              }}
            >
              <button
                onClick={login}
                disabled={isLoading}
                className="
                  w-full relative flex items-center justify-center gap-3
                  px-6 py-4
                  bg-white dark:bg-[#3d3428]
                  border-2 border-[#e8d4b8] dark:border-[#6b5a4a]
                  rounded-2xl
                  text-[#2a2219] dark:text-white
                  font-semibold
                  hover:border-amber-400 dark:hover:border-amber-500
                  hover:-translate-y-1
                  focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-transparent
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-300
                  group
                  overflow-hidden
                  login-button
                "
              >
                {/* Button shimmer effect */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
                    animation: "button-shimmer 2s ease-in-out infinite",
                  }}
                />
                <GoogleIcon className="w-5 h-5 relative z-10 group-hover:scale-110 transition-transform duration-300" />
                <span className="relative z-10">Sign in with Google</span>
              </button>
            </div>

            <p
              className="mt-6 text-xs text-[#8b7a6a] dark:text-[#7a6a5a] text-center leading-relaxed"
              style={{
                animation: "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.35s forwards",
                opacity: 0,
              }}
            >
              Only authorised tutors can sign in. Contact your administrator if you need access.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p
          className="mt-10 text-xs text-[#8b7a6a]/50 dark:text-[#a89a8a]/50 tracking-wide"
          style={{
            animation: "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.45s forwards",
            opacity: 0,
          }}
        >
          &copy; {new Date().getFullYear()} CSM Pro. All rights reserved.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 overflow-hidden bg-[#fef9f3] dark:bg-[#1a1410]">
          <div className="relative z-10 h-full w-full flex flex-col items-center justify-center p-4">
            <div className="relative">
              <div className="absolute inset-0 bg-amber-400/30 rounded-full blur-xl animate-pulse" />
              <div className="animate-spin rounded-full h-12 w-12 border-2 border-amber-200 border-t-amber-600" />
            </div>
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
