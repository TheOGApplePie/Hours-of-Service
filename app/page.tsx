"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

/** Root route — redirects to the appropriate page based on auth state and role. */
export default function RootRedirect() {
  const { user, userRole, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    router.replace(userRole === "driver" ? "/documents" : "/dashboard");
  }, [user, userRole, loading, router]);

  return null;
}
