"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";

interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header with Hamburger - only visible on mobile */}
        <header className="flex md:hidden items-center h-14 px-4 border-b border-white/10 dark:border-white/5 bg-[rgba(255,255,255,0.8)] dark:bg-[rgba(17,17,17,0.8)] backdrop-blur-md">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-foreground/10 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2 ml-2">
            <img src="/logo.png" alt="CSM Pro" className="h-7 w-auto" />
            <span className="font-bold text-lg">CSM Pro</span>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
