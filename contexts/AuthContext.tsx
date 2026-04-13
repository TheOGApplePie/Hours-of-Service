"use client";

import { authProvider } from "@/lib/firebase/index";
import { AuthUser } from "@/lib/repositories/IAuthProvider";
import { fetchUserDetails } from "@/lib/driverService";
import { createContext, useContext, useEffect, useState } from "react";

export type UserRole = "driver" | "safety" | "manager";

interface AuthContextType {
  user: AuthUser | null;
  userRole: UserRole | null;
  /** True while the initial auth state is being resolved. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<UserRole>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore auth state and role on page load / refresh
    const unsubscribe = authProvider.onAuthStateChanged(async (authUser) => {
      setUser(authUser);

      if (authUser) {
        const details = await fetchUserDetails(authUser.uid);
        setUserRole((details?.role as UserRole) ?? "driver");
      } else {
        setUserRole(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string): Promise<UserRole> => {
    const authUser = await authProvider.signIn(email, password);
    const details = await fetchUserDetails(authUser.uid);
    const role: UserRole = (details?.role as UserRole) ?? "driver";
    setUserRole(role);
    return role;
  };

  const signOut = async () => {
    await authProvider.signOut();
    setUserRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, userRole, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
