"use client";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

export default function Header() {
  const { signOut } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      alert(error);
    }
  }

  return (
    <div className="flex justify-between items-center p-4 border-b border-gray-200">
      <h1 className="text-3xl font-bold text-gray-800">Hours of Service</h1>
      <button className="btn-error-action" onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
}
