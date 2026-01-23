"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, User, ChevronDown, Shield, Eye } from "lucide-react";
import { RoleSwitcher } from "./RoleSwitcher";

interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className = "" }: UserMenuProps) {
  const { user, isAdmin, logout } = useAuth();
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

  if (!user) return null;

  // Get initials for avatar
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          flex items-center gap-2
          px-3 py-2
          rounded-lg
          hover:bg-zinc-100 dark:hover:bg-zinc-800
          transition-colors
        "
      >
        {/* Avatar */}
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className="w-8 h-8 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="
              w-8 h-8
              rounded-full
              bg-amber-600
              flex items-center justify-center
              text-white text-sm font-medium
            "
          >
            {initials}
          </div>
        )}

        {/* Name and role */}
        <div className="hidden sm:block text-left">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {user.name}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            {isAdmin && <Shield className="w-3 h-3" />}
            {user.role}
          </div>
        </div>

        <ChevronDown
          className={`
            w-4 h-4 text-zinc-400
            transition-transform
            ${isOpen ? "rotate-180" : ""}
          `}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="
            absolute right-0 top-full mt-1
            w-72
            bg-white dark:bg-zinc-800
            border border-zinc-200 dark:border-zinc-700
            rounded-lg shadow-lg
            py-1
            z-50
          "
        >
          {/* User info section */}
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-3">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center text-white font-medium flex-shrink-0">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {user.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {user.email}
                </div>
              </div>
            </div>
            {user.default_location && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                Location: {user.default_location}
              </div>
            )}
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                // Could navigate to profile page
              }}
              className="
                w-full flex items-center gap-3 px-4 py-2
                text-sm text-zinc-700 dark:text-zinc-300
                hover:bg-zinc-100 dark:hover:bg-zinc-700
              "
            >
              <User className="w-4 h-4" />
              Profile
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="
                w-full flex items-center gap-3 px-4 py-2
                text-sm text-red-600 dark:text-red-400
                hover:bg-zinc-100 dark:hover:bg-zinc-700
              "
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
