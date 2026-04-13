"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { X, Trash2 } from "lucide-react";
import { Driver, updateDriverProfile, softDeleteDriver } from "@/lib/driverService";

interface EditUserModalProps {
  driver: Driver;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

interface EditUserFields {
  role: "driver" | "safety" | "manager";
  is_active_driver: boolean;
}

export default function EditUserModal({
  driver,
  onClose,
  onSaved,
  onDeleted,
}: Readonly<EditUserModalProps>) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { register, handleSubmit } = useForm<EditUserFields>({
    defaultValues: {
      role: driver.role,
      is_active_driver: driver.is_active_driver,
    },
  });

  async function onSubmit(data: EditUserFields) {
    setSubmitting(true);
    setError(null);
    try {
      await updateDriverProfile(driver.id, {
        role: data.role,
        is_active_driver: data.is_active_driver,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await softDeleteDriver(driver.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove user.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">{driver.name}</h2>
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
            <label htmlFor="edit-role" className="text-sm font-medium text-gray-700">
              Account Type
            </label>
            <select
              id="edit-role"
              className="p-3 border rounded-xl w-full bg-white"
              {...register("role")}
            >
              <option value="driver">Driver</option>
              <option value="safety">Safety</option>
              <option value="manager">Manager</option>
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-5 h-5 rounded"
              {...register("is_active_driver")}
            />
            <div>
              <p className="text-sm font-medium text-gray-700">Active Driver</p>
              <p className="text-xs text-gray-500">
                Inactive drivers are excluded from compliance metrics.
              </p>
            </div>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </p>
          )}

          {/* Save + Delete side by side */}
          {confirmingDelete ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-red-600">
                Delete <strong>{driver.name}</strong>? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="btn-error-action rounded-xl flex-1"
                >
                  {deleting ? "Deleting…" : "Confirm Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="btn-action rounded-xl flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="submit"
                className="btn-primary-action rounded-xl flex-1"
                disabled={submitting}
              >
                {submitting ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="btn-error-action rounded-xl flex items-center justify-center gap-2 flex-1"
              >
                <Trash2 size={15} />
                Delete User
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
