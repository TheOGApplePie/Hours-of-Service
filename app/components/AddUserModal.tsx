"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import { createDriverProfile } from "@/lib/driverService";

interface AddUserModalProps {
  managerLocation: string | undefined;
  onClose: () => void;
  onCreated: () => void;
}

interface AddUserFields {
  name: string;
  email: string;
  role: "driver" | "safety" | "manager";
}

export default function AddUserModal({
  managerLocation,
  onClose,
  onCreated,
}: Readonly<AddUserModalProps>) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddUserFields>({ defaultValues: { role: "driver" } });

  async function onSubmit(data: AddUserFields) {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email.trim() }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Failed to create user.");
        return;
      }

      const uid: string = json.uid;
      const today = new Date().toISOString().split("T")[0];

      await createDriverProfile(uid, {
        name: data.name.trim(),
        role: data.role,
        is_active_driver: true,
        hire_date: today,
        organization_location: managerLocation ?? "",
      });

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Add User</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 cursor-pointer"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="add-name" className="text-sm font-medium text-gray-700">
              Full Name
            </label>
            <input
              id="add-name"
              type="text"
              placeholder="Jane Smith"
              className="p-3 border rounded-xl w-full"
              {...register("name", { required: "Name is required." })}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="add-email" className="text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="add-email"
              type="email"
              placeholder="jane@example.com"
              className="p-3 border rounded-xl w-full"
              {...register("email", {
                required: "Email is required.",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Enter a valid email address.",
                },
              })}
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="add-role" className="text-sm font-medium text-gray-700">
              Account Type
            </label>
            <select
              id="add-role"
              className="p-3 border rounded-xl w-full bg-white"
              {...register("role")}
            >
              <option value="driver">Driver</option>
              <option value="safety">Safety</option>
              <option value="manager">Manager</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </p>
          )}

          <p className="text-xs text-gray-500">
            A password reset email will be sent so the new user can set their own
            password.
          </p>

          <button
            type="submit"
            className="btn-primary-action rounded-xl"
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create User"}
          </button>
        </form>
      </div>
    </div>
  );
}
