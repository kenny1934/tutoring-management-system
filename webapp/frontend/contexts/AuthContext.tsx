"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

/**
 * User object returned from the auth API
 */
export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  default_location: string | null;
  picture: string | null;
}

/**
 * Available roles for impersonation
 */
export const AVAILABLE_ROLES = ["Super Admin", "Admin", "Tutor"] as const;
export type Role = (typeof AVAILABLE_ROLES)[number];

/**
 * Auth context value
 */
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  /** The effective role (impersonated or actual) */
  effectiveRole: string | null;
  /** Whether currently impersonating a different role */
  isImpersonating: boolean;
  /** Set impersonated role (Super Admin only) */
  setImpersonatedRole: (role: Role | null) => void;
  login: () => void;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const IMPERSONATION_KEY = "csm_impersonated_role";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonatedRole, setImpersonatedRoleState] = useState<Role | null>(null);

  // Load impersonated role from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(IMPERSONATION_KEY);
    if (stored && AVAILABLE_ROLES.includes(stored as Role)) {
      setImpersonatedRoleState(stored as Role);
    }
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: "include", // Include cookies
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        // Not authenticated or token expired
        setUser(null);
        // Clear impersonation on auth failure
        setImpersonatedRoleState(null);
        sessionStorage.removeItem(IMPERSONATION_KEY);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(() => {
    // Redirect to backend OAuth endpoint
    window.location.href = `${API_BASE_URL}/auth/google/login`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      // Clear impersonation on logout
      setImpersonatedRoleState(null);
      sessionStorage.removeItem(IMPERSONATION_KEY);
      // Redirect to login page
      window.location.href = "/login";
    }
  }, []);

  // Set impersonated role (only Super Admins can do this)
  const setImpersonatedRole = useCallback((role: Role | null) => {
    if (user?.role !== "Super Admin") {
      console.warn("Only Super Admins can impersonate roles");
      return;
    }
    setImpersonatedRoleState(role);
    if (role) {
      sessionStorage.setItem(IMPERSONATION_KEY, role);
    } else {
      sessionStorage.removeItem(IMPERSONATION_KEY);
    }
  }, [user?.role]);

  const isAuthenticated = user !== null;
  const isSuperAdmin = user?.role === "Super Admin";

  // Effective role considers impersonation (Super Admins only)
  const effectiveRole = isSuperAdmin && impersonatedRole
    ? impersonatedRole
    : user?.role ?? null;

  const isImpersonating = isSuperAdmin && impersonatedRole !== null && impersonatedRole !== user?.role;

  // isAdmin check uses effective role
  const isAdmin = effectiveRole === "Admin" || effectiveRole === "Super Admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        isAdmin,
        isSuperAdmin,
        effectiveRole,
        isImpersonating,
        setImpersonatedRole,
        login,
        logout,
        refetch: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 *
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
