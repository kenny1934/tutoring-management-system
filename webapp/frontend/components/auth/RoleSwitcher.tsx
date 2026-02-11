"use client";

import { useAuth, AVAILABLE_ROLES, Role, ImpersonatedTutor } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { Eye, EyeOff, ChevronDown, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { tutorsAPI } from "@/lib/api";

interface Tutor {
  id: number;
  tutor_name: string;
  default_location?: string;
}

interface RoleSwitcherProps {
  className?: string;
}

/**
 * Role switcher for Super Admins to test the app as different roles.
 * Only visible to Super Admin users.
 */
export function RoleSwitcher({ className = "" }: RoleSwitcherProps) {
  const { user, isSuperAdmin, effectiveRole, isImpersonating, impersonatedTutor, setImpersonatedRole, setImpersonatedTutor } = useAuth();
  const { setSelectedLocation } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loadingTutors, setLoadingTutors] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch tutors when menu opens and role is Tutor
  useEffect(() => {
    if (isOpen && effectiveRole === "Tutor" && tutors.length === 0 && !loadingTutors) {
      setLoadingTutors(true);
      tutorsAPI.getAll()
        .then((data) => {
          setTutors(data.map(t => ({
            id: t.id,
            tutor_name: t.tutor_name,
            default_location: t.default_location
          })));
        })
        .catch(() => { /* non-critical */ })
        .finally(() => setLoadingTutors(false));
    }
  }, [isOpen, effectiveRole, tutors.length, loadingTutors]);

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
    // Guest role: lock location to the Super Admin's default_location
    if (role === "Guest" && user?.default_location) {
      setSelectedLocation(user.default_location);
    }
    // Don't close if selecting Tutor - let user pick specific tutor
    if (role !== "Tutor") {
      setIsOpen(false);
    }
  };

  const handleTutorSelect = (tutor: Tutor) => {
    setImpersonatedTutor({ id: tutor.id, name: tutor.tutor_name });
    // Switch to tutor's location so dashboard shows correct data
    if (tutor.default_location) {
      setSelectedLocation(tutor.default_location);
    }
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      {/* Impersonation indicator banner */}
      {isImpersonating && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 text-center py-1 text-xs font-medium">
          <Eye className="inline-block w-3 h-3 mr-1" />
          Viewing as {effectiveRole}
          {impersonatedTutor && ` (${impersonatedTutor.name})`}
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
            : "bg-[#f5ede3] dark:bg-[#3d3628] text-[#5d4a3a] dark:text-[#d4c4b0] hover:bg-[#ebe0d0] dark:hover:bg-[#4d4638] border border-[#e8d4b8] dark:border-[#6b5a4a]"
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
          {isImpersonating
            ? impersonatedTutor
              ? `As ${impersonatedTutor.name}`
              : `As ${effectiveRole}`
            : "View As"}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="
            absolute right-0 top-full mt-1
            w-52
            bg-[#fef9f3] dark:bg-[#2d2618]
            border border-[#e8d4b8] dark:border-[#6b5a4a]
            rounded-lg shadow-lg
            py-1
            z-50
          "
        >
          <div className="px-3 py-2 text-xs text-[#8b7355] dark:text-[#a89880] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            Test as different role
          </div>

          {/* Reset option */}
          <button
            onClick={() => handleRoleSelect(null)}
            className={`
              w-full flex items-center gap-2 px-3 py-2 text-sm
              ${!isImpersonating
                ? "bg-[#a0704b]/10 text-[#a0704b] dark:text-[#cd853f]"
                : "text-[#5d4a3a] dark:text-[#d4c4b0] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
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
                    : "text-[#5d4a3a] dark:text-[#d4c4b0] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                  }
                `}
              >
                <span className="w-4 text-center">
                  {isSelected && !impersonatedTutor && "✓"}
                </span>
                <span>{role}</span>
              </button>
            );
          })}

          {/* Tutor selection (when impersonating as Tutor) */}
          {effectiveRole === "Tutor" && (
            <>
              <div className="px-3 py-2 text-xs text-[#8b7355] dark:text-[#a89880] border-t border-[#e8d4b8] dark:border-[#6b5a4a] mt-1">
                <User className="inline-block w-3 h-3 mr-1" />
                Select tutor to impersonate
              </div>
              {loadingTutors ? (
                <div className="px-3 py-2 text-sm text-[#8b7355] dark:text-[#a89880]">
                  Loading tutors...
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {/* Tutor list */}
                  {tutors.map((tutor) => {
                    const isSelected = impersonatedTutor?.id === tutor.id;
                    return (
                      <button
                        key={tutor.id}
                        onClick={() => handleTutorSelect(tutor)}
                        className={`
                          w-full flex items-center gap-2 px-3 py-2 text-sm
                          ${isSelected
                            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                            : "text-[#5d4a3a] dark:text-[#d4c4b0] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                          }
                        `}
                      >
                        <span className="w-4 text-center">
                          {isSelected && "✓"}
                        </span>
                        <span className="truncate">{tutor.tutor_name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
