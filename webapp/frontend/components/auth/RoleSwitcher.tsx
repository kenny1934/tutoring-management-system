"use client";

import { useAuth, AVAILABLE_ROLES, Role } from "@/contexts/AuthContext";
import { Eye, EyeOff, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface RoleSwitcherProps {
  className?: string;
}

/**
 * Role switcher for Super Admins to test the app as different roles.
 * Only visible to Super Admin users.
 */
export function RoleSwitcher({ className = "" }: RoleSwitcherProps) {
  const { user, isSuperAdmin, effectiveRole, isImpersonating, setImpersonatedRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Only show for Super Admins
  if (!isSuperAdmin) return null;

  const handleRoleSelect = (role: Role | null) => {
    setImpersonatedRole(role);
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      {/* Impersonation indicator banner */}
      {isImpersonating && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 text-center py-1 text-xs font-medium">
          <Eye className="inline-block w-3 h-3 mr-1" />
          Viewing as {effectiveRole}
          <button
            onClick={() => setImpersonatedRole(null)}
            className="ml-2 underline hover:no-underline"
          >
            Exit
          </button>
        </div>
      )}

      {/* Role switcher button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
          transition-colors
          ${isImpersonating
            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          }
        `}
        title="Switch role for testing"
      >
        {isImpersonating ? (
          <Eye className="w-3.5 h-3.5" />
        ) : (
          <EyeOff className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">
          {isImpersonating ? `As ${effectiveRole}` : "View As"}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="
            absolute right-0 top-full mt-1
            w-48
            bg-white dark:bg-zinc-800
            border border-zinc-200 dark:border-zinc-700
            rounded-lg shadow-lg
            py-1
            z-50
          "
        >
          <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
            Test as different role
          </div>

          {/* Reset option */}
          <button
            onClick={() => handleRoleSelect(null)}
            className={`
              w-full flex items-center gap-2 px-3 py-2 text-sm
              ${!isImpersonating
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              }
            `}
          >
            <span className="w-4 text-center">
              {!isImpersonating && "✓"}
            </span>
            <span>My Role ({user?.role})</span>
          </button>

          {/* Role options */}
          {AVAILABLE_ROLES.map((role) => {
            // Don't show user's actual role as an option
            if (role === user?.role) return null;

            const isSelected = effectiveRole === role;

            return (
              <button
                key={role}
                onClick={() => handleRoleSelect(role)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm
                  ${isSelected
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  }
                `}
              >
                <span className="w-4 text-center">
                  {isSelected && "✓"}
                </span>
                <span>{role}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
