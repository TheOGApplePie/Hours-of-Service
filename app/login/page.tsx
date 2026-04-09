"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  async function handleLogin() {
    try {
      const role = await signIn(email, password);
      router.push(role === "driver" ? "/documents" : "/dashboard");
    } catch (error) {
      alert(error);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--colour-warning)" }}
    >
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Clock
            className="w-16 h-16 mx-auto mb-4"
            style={{ color: "var(--colour-primary-text)" }}
          />
          <h1 className="text-3xl font-bold text-gray-800">Hours of Service</h1>
          <p className="text-gray-600 mt-2">Track your daily activities</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyUp={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": "var(--colour-primary-text)" } as React.CSSProperties}
              placeholder="Enter email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": "var(--colour-primary-text)" } as React.CSSProperties}
              placeholder="Enter password"
            />
            <button
              className="text-sm text-gray-500 hover:text-gray-700 mt-1 cursor-pointer"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"} password
            </button>
          </div>

          <button
            onClick={handleLogin}
            className="btn-primary-action w-full justify-center"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
