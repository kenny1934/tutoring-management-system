"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
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
 * Impersonated tutor info (for tutor-specific impersonation)
 */
export interface ImpersonatedTutor {
  id: number;
  name: string;
}

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
  /** The impersonated tutor (when impersonating as a specific tutor) */
  impersonatedTutor: ImpersonatedTutor | null;
  /** Set impersonated role (Super Admin only) */
  setImpersonatedRole: (role: Role | null) => void;
  /** Set impersonated tutor (Super Admin only, when role is "Tutor") */
  setImpersonatedTutor: (tutor: ImpersonatedTutor | null) => void;
  login: () => void;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const IMPERSONATION_KEY = "csm_impersonated_role";
const IMPERSONATED_TUTOR_KEY = "csm_impersonated_tutor";

// Token refresh configuration
const TOKEN_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // Refresh every 30 minutes
const TOKEN_REFRESH_BEFORE_EXPIRY_MS = 30 * 60 * 1000; // Refresh when <30 min left

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonatedRole, setImpersonatedRoleState] = useState<Role | null>(null);
  const [impersonatedTutor, setImpersonatedTutorState] = useState<ImpersonatedTutor | null>(null);

  // Ref to track refresh timer
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Proactive token refresh function
  const refreshAuthToken = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }, []);

  // Set up proactive refresh timer when user is authenticated
  useEffect(() => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    // Only set up timer if user is authenticated
    if (user) {
      // Refresh periodically
      refreshTimerRef.current = setInterval(() => {
        refreshAuthToken();
      }, TOKEN_REFRESH_INTERVAL_MS);

      // Also refresh on visibility change (when user returns to tab)
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible" && user) {
          refreshAuthToken();
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        if (refreshTimerRef.current) {
          clearInterval(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }
  }, [user, refreshAuthToken]);

  // Load impersonated role and tutor from sessionStorage on mount
  useEffect(() => {
    const storedRole = sessionStorage.getItem(IMPERSONATION_KEY);
    if (storedRole && AVAILABLE_ROLES.includes(storedRole as Role)) {
      setImpersonatedRoleState(storedRole as Role);
    }

    const storedTutor = sessionStorage.getItem(IMPERSONATED_TUTOR_KEY);
    if (storedTutor) {
      try {
        const tutor = JSON.parse(storedTutor) as ImpersonatedTutor;
        if (tutor.id && tutor.name) {
          setImpersonatedTutorState(tutor);
        }
      } catch {
        sessionStorage.removeItem(IMPERSONATED_TUTOR_KEY);
      }
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
        setImpersonatedTutorState(null);
        sessionStorage.removeItem(IMPERSONATION_KEY);
        sessionStorage.removeItem(IMPERSONATED_TUTOR_KEY);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(() => {
    // Redirect to backend OAuth endpoint, passing current origin so we redirect back to the right domain
    window.location.href = `${API_BASE_URL}/auth/google/login?redirect_origin=${encodeURIComponent(window.location.origin)}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      // Logout error ignored
    } finally {
      setUser(null);
      // Clear impersonation on logout
      setImpersonatedRoleState(null);
      setImpersonatedTutorState(null);
      sessionStorage.removeItem(IMPERSONATION_KEY);
      sessionStorage.removeItem(IMPERSONATED_TUTOR_KEY);
      // Redirect to login page
      window.location.href = "/login";
    }
  }, []);

  // Set impersonated role (only Super Admins can do this)
  const setImpersonatedRole = useCallback((role: Role | null) => {
    if (user?.role !== "Super Admin") {
      return;
    }
    setImpersonatedRoleState(role);
    // Clear impersonated tutor when role changes
    setImpersonatedTutorState(null);
    sessionStorage.removeItem(IMPERSONATED_TUTOR_KEY);
    if (role) {
      sessionStorage.setItem(IMPERSONATION_KEY, role);
    } else {
      sessionStorage.removeItem(IMPERSONATION_KEY);
    }
  }, [user?.role]);

  // Set impersonated tutor (only Super Admins can do this, when impersonating as Tutor)
  const setImpersonatedTutor = useCallback((tutor: ImpersonatedTutor | null) => {
    if (user?.role !== "Super Admin") {
      return;
    }
    setImpersonatedTutorState(tutor);
    if (tutor) {
      sessionStorage.setItem(IMPERSONATED_TUTOR_KEY, JSON.stringify(tutor));
    } else {
      sessionStorage.removeItem(IMPERSONATED_TUTOR_KEY);
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
        impersonatedTutor,
        setImpersonatedRole,
        setImpersonatedTutor,
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
