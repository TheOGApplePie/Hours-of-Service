"use client";

interface UnsavedChangesModalProps {
  onSaveAndLeave: () => void;
  onDiscard: () => void;
}

/**
 * Modal shown when a user attempts to navigate away with unsaved form changes.
 * Offers two choices: save then leave, or discard and leave.
 */
export default function UnsavedChangesModal({
  onSaveAndLeave,
  onDiscard,
}: UnsavedChangesModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col gap-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-gray-800">Unsaved Changes</h2>
        <p className="text-gray-600">
          You have unsaved changes. Would you like to save before leaving?
        </p>
        <div className="flex gap-3 justify-end">
          <button className="btn-action" onClick={onDiscard}>
            Discard
          </button>
          <button className="btn-primary-action" onClick={onSaveAndLeave}>
            Save & Leave
          </button>
        </div>
      </div>
    </div>
  );
}
