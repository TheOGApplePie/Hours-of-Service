"use client";

import app from "@/lib/firebase";
import { fetchUserDetails } from "@/lib/driverService";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  getAuth,
  User,
  onAuthStateChanged,
} from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";

export type UserRole = "driver" | "safety" | "manager";

interface AuthContextType {
  user: User | null;
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
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const auth = getAuth(app);

  useEffect(() => {
    // Restore auth state and role on page load / refresh
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Re-fetch the role so it survives page refreshes
        const details = await fetchUserDetails(firebaseUser.uid);
        setUserRole((details?.role as UserRole) ?? "driver");
      } else {
        setUserRole(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string): Promise<UserRole> => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const details = await fetchUserDetails(credential.user.uid);
    const role: UserRole = (details?.role as UserRole) ?? "driver";
    setUserRole(role);
    return role;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
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
