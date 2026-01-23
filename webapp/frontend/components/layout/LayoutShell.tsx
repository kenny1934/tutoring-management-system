"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, Search } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";

interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { open: openCommandPalette } = useCommandPalette();

  // Zen mode: render without any shell
  if (pathname?.startsWith("/zen")) {
    return <>{children}</>;
  }

  const isLoginPage = pathname === "/login";

  return (
    <div className="flex h-screen overflow-hidden">
      {!isLoginPage && (
        <Sidebar
          isMobileOpen={isMobileMenuOpen}
          onMobileClose={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header with Hamburger - only visible on mobile, hidden on login */}
        {!isLoginPage && (
        <header className="flex md:hidden items-center justify-between h-14 px-4 border-b border-white/10 dark:border-white/5 bg-[rgba(255,255,255,0.8)] dark:bg-[rgba(17,17,17,0.8)] backdrop-blur-md">
          {/* Left: Hamburger + Logo */}
          <div className="flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-foreground/10 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2 ml-2">
              <Image src="/logo.png" alt="CSM Pro" width={28} height={28} className="h-7 w-auto" priority />
              <span className="font-bold text-lg">CSM Pro</span>
            </div>
          </div>

          {/* Right: Search button */}
          <button
            onClick={openCommandPalette}
            className="p-2 -mr-2 rounded-lg hover:bg-foreground/10 transition-colors"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>
        </header>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
