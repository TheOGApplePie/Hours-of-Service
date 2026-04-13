"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

type Mode = "login" | "reset";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");

  // ── Login state ──
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // ── Password reset state ──
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const { signIn, sendPasswordReset } = useAuth();
  const router = useRouter();

  async function handleLogin() {
    try {
      const role = await signIn(email, password);
      router.push(role === "driver" ? "/documents" : "/dashboard");
    } catch (error) {
      alert(error);
    }
  }

  async function handleResetRequest() {
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setResetError(null);
    try {
      await sendPasswordReset(resetEmail.trim());
      setResetSent(true);
    } catch {
      setResetError("No account found with that email address.");
    } finally {
      setResetLoading(false);
    }
  }

  function handleBackToLogin() {
    setMode("login");
    setResetEmail("");
    setResetSent(false);
    setResetError(null);
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

        {mode === "login" ? (
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

            <button
              type="button"
              onClick={() => setMode("reset")}
              className="text-sm text-gray-500 hover:text-gray-700 w-full text-center"
            >
              Forgot password?
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {resetSent ? (
              <>
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  Password reset email sent. Check your inbox.
                </p>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="btn-primary-action w-full justify-center"
                >
                  Back to Sign In
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Enter your email address and we&apos;ll send you a link to
                  reset your password.
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    onKeyUp={(e) => e.key === "Enter" && handleResetRequest()}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": "var(--colour-primary-text)" } as React.CSSProperties}
                    placeholder="Enter your email"
                    autoFocus
                  />
                </div>

                {resetError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    {resetError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleResetRequest}
                  disabled={resetLoading || !resetEmail.trim()}
                  className="btn-primary-action w-full justify-center"
                >
                  {resetLoading ? "Sending…" : "Send Reset Email"}
                </button>

                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-sm text-gray-500 hover:text-gray-700 w-full text-center"
                >
                  Back to Sign In
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
