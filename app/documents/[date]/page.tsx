"use client";

import { useEffect, useRef, useState } from "react";
import {
  redirect,
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  useFieldArray,
  useForm,
  SubmitHandler,
  FieldValues,
} from "react-hook-form";
import { Plus, Delete, Loader2 } from "lucide-react";
import DailyLogsCanvas from "@/app/components/DailyLogsCanvas";
import UnsavedChangesModal from "@/app/components/UnsavedChangesModal";
import UnauthorizedView from "@/app/components/UnauthorizedView";
import {
  fetchDocument,
  fetchMostRecentDocumentBefore,
  saveDocument,
} from "@/lib/hosService";
import { Status, DailyDocument } from "@/types/dailyDocument";
import { useAuth } from "@/contexts/AuthContext";

export default function DocumentView() {
  const searchParams = useSearchParams();
  const { date } = useParams<{ date: string }>();
  const { user, userRole, loading: authLoading } = useAuth();

  if (!date) redirect("/");

  const driverId = searchParams.get("driverId") ?? "";
  const driverName = searchParams.get("driverName") ?? null;

  const router = useRouter();

  // Back URL preserves the driverId/driverName so the listing page stays in context
  const backUrl = `/documents?${new URLSearchParams({
    ...(driverId ? { driverId } : {}),
    ...(driverName ? { driverName } : {}),
  }).toString()}`;

  const [driverStatuses, setDriverStatuses] = useState<Status[]>([]);
  const [offDutyMins, setOffDutyMins] = useState(0);
  const [onDutyNotDrivingMins, setOnDutyNotDrivingMins] = useState(0);
  const [onDutyDrivingMins, setOnDutyDrivingMins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingNavUrl, setPendingNavUrl] = useState<string | null>(null);

  type SaveState = "idle" | "saving" | "saved" | "failed";
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Ref used to guard against state updates after unmount
  const isMountedRef = useRef(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    subscribe,
    formState: { errors, isDirty },
    setError,
  } = useForm({ mode: "onChange" });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "statuses",
  });

  // Keep the canvas in sync with form values as the user edits statuses
  useEffect(() => {
    const unsubscribe = subscribe({
      name: "statuses",
      formState: { values: true },
      callback: ({ values }) => {
        const parsed = (values.statuses ?? []).map(
          (status: { mapped_time: string }) => ({
            ...status,
            time_of_event: {
              hour: +status.mapped_time.split(":")[0],
              minute: +status.mapped_time.split(":")[1],
            },
          }),
        );
        setDriverStatuses(parsed as Status[]);
      },
    });
    return unsubscribe;
  }, [subscribe]);

  // Recalculate duty duration totals whenever statuses change
  useEffect(() => {
    let offDuty = 0;
    let onDutyNotDriving = 0;
    let onDutyDriving = 0;

    driverStatuses.forEach((status, index) => {
      const currentMins =
        +status.time_of_event.hour * 60 + +status.time_of_event.minute;

      if (index === 0) {
        // Time before the first event is counted as off-duty
        offDuty += currentMins;
      } else {
        const prevStatus = driverStatuses[index - 1];
        const prevMins =
          +prevStatus.time_of_event.hour * 60 +
          +prevStatus.time_of_event.minute;
        const segmentMins = currentMins - prevMins;

        if (prevStatus.type === "off-duty") {
          offDuty += segmentMins;
        } else if (prevStatus.type === "on-duty-not-driving") {
          onDutyNotDriving += segmentMins;
        } else {
          onDutyDriving += segmentMins;
        }
      }
    });

    // Time after the last event is counted as off-duty
    if (driverStatuses.length > 0) {
      const lastStatus = driverStatuses[driverStatuses.length - 1];
      const lastMins =
        +lastStatus.time_of_event.hour * 60 + +lastStatus.time_of_event.minute;
      offDuty += 24 * 60 - lastMins;
    }

    setOffDutyMins(offDuty);
    setOnDutyNotDrivingMins(onDutyNotDriving);
    setOnDutyDrivingMins(onDutyDriving);
  }, [driverStatuses]);

  // Load the document on mount
  useEffect(() => {
    isMountedRef.current = true;
    setLoading(true);

    async function loadDocument() {
      try {
        setLoadError(null);
        const data = await fetchDocument(date, driverId);

        if (!isMountedRef.current) return;

        if (data?.statuses) {
          data.statuses = data.statuses.map((status) => ({
            ...status,
            mapped_time: `${String(status.time_of_event.hour).padStart(2, "0")}:${String(status.time_of_event.minute).padStart(2, "0")}`,
          }));
        }

        // If the document exists but has no parking location, or if no document
        // exists at all, prefill parking location from the most recent prior document.
        let prefillParkingLocation = "";
        if (!data?.parking_location) {
          const priorDoc = await fetchMostRecentDocumentBefore(driverId, date);
          prefillParkingLocation = priorDoc?.parking_location ?? "";
        }

        setDriverStatuses(data?.statuses ?? []);
        reset(
          data
            ? {
                ...data,
                parking_location:
                  data.parking_location || prefillParkingLocation,
              }
            : {
                id: "",
                driver_id: driverId,
                date_of_document: date,
                parking_location: prefillParkingLocation,
                comments: "",
                statuses: [],
              },
        );
      } catch (err) {
        if (!isMountedRef.current) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load document",
        );
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    }

    loadDocument();
    return () => {
      isMountedRef.current = false;
    };
  }, [date, driverId]);

  // Warn the browser if the user tries to close/refresh the tab with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function handleBack() {
    if (!isDirty) {
      router.push(backUrl);
      return;
    }
    // Show the unsaved changes modal instead of a native browser confirm
    setPendingNavUrl(backUrl);
  }

  // When the user edits the form after a successful save, revert the button to its default label
  useEffect(() => {
    if (isDirty && saveState === "saved") setSaveState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  function unveilToast() {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 5000);
  }
  async function onSubmit(formData: DailyDocument) {
    if (!formData.statuses || formData.statuses.length < 2) {
      setError("statuses", {
        type: "required",
        message: "You need to specify at least two statuses",
      });
      return;
    }

    // Convert mapped_time strings back to time_of_event objects before saving
    const preparedStatuses = formData.statuses.map((status: Status) => ({
      ...status,
      time_of_event: {
        hour: +status.mapped_time.split(":")[0],
        minute: +status.mapped_time.split(":")[1],
      },
    }));

    setSaveState("saving");
    try {
      await saveDocument({ ...formData, statuses: preparedStatuses });
      // Reset dirty state so the unsaved changes guard no longer triggers
      reset({ ...formData, statuses: preparedStatuses });
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    } finally {
      unveilToast();
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const documentDate = new Date(date + "T00:00:00"); // parse as local time
  const isFutureDate = documentDate > today;

  // Wait for auth to resolve before making any access decision
  if (authLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  // Drivers may only view their own data
  if (userRole === "driver" && user && driverId !== user.uid) {
    return <UnauthorizedView />;
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-red-600">{loadError}</p>
      </div>
    );
  }

  if (isFutureDate) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center py-3 gap-4">
              <button type="button" onClick={handleBack} className="btn-action">
                ← Back
              </button>
              <h2 className="flex-1 text-xl font-bold text-gray-800">
                {driverName && (
                  <span className="text-colour-success mr-2">
                    {driverName} —
                  </span>
                )}
                Driving logs for <b>{date}</b>
              </h2>
            </div>
            <p className="text-gray-500 mt-4">
              This date is in the future. Hours of Service records cannot be
              created or edited for dates that have not yet occurred.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {pendingNavUrl && (
        <UnsavedChangesModal
          onDiscard={() => {
            setPendingNavUrl(null);
            router.push(pendingNavUrl);
          }}
          onSaveAndLeave={() => {
            handleSubmit(async (data) => {
              await onSubmit(data as DailyDocument);
              router.push(pendingNavUrl);
            })();
          }}
        />
      )}

      {
        <div
          className={`${showToast ? "opacity-100" : "opacity-0"} transition-opacity duration-500 fixed top-6 right-6 z-50 p-5 rounded-xl shadow-lg text-white font-semibold text-lg ${
            saveState === "saved" ? "bg-colour-success" : "bg-colour-error"
          }`}
        >
          {saveState === "saved"
            ? "✓ Hours of Service updated"
            : "Save failed — please try again"}
        </div>
      }

      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 relative">
          {saveState === "saving" && (
            <div className="absolute inset-0 bg-white/60 rounded-lg flex items-center justify-center z-10">
              <Loader2 size={40} className="animate-spin text-colour-success" />
            </div>
          )}
          {/* Page header */}
          <div className="flex items-center py-3 gap-4 flex-wrap">
            <button
              type="button"
              onClick={handleBack}
              className="btn-action cursor-pointer"
            >
              ← Back
            </button>
            <h2 className="flex-1 text-xl font-bold text-gray-800">
              {driverName && (
                <span className="text-colour-success mr-2">{driverName} —</span>
              )}
              Driving logs for <b>{date}</b>
            </h2>
            <input
              type="text"
              placeholder="Enter parking location"
              className="border-b px-2 py-1"
              {...register("parking_location", { required: true })}
            />
            <label className="flex items-center gap-2">
              <span>Off today</span>
              <input
                type="checkbox"
                {...register("off-today")}
                onChange={(e) => {
                  if (e.target.checked) {
                    // Fill the day with a single off-duty block
                    replace([
                      {
                        mapped_time: "00:00",
                        type: "off-duty",
                        time_of_event: { hour: 0, minute: 0 },
                      },
                      {
                        mapped_time: "23:59",
                        type: "off-duty",
                        time_of_event: { hour: 23, minute: 59 },
                      },
                    ]);
                  }
                }}
              />
            </label>
          </div>

          {/* Hours of Service canvas and duration summary */}
          <div className="canvas-parent">
            <DailyLogsCanvas statuses={driverStatuses} />
            <div className="flex justify-between text-sm mt-2">
              <span>Off Duty: {formatDuration(offDutyMins)}</span>
              <span>
                On Duty Not Driving: {formatDuration(onDutyNotDrivingMins)}
              </span>
              <span>On Duty Driving: {formatDuration(onDutyDrivingMins)}</span>
              <span>Total: 24hrs</span>
            </div>
            <div className="mt-2">
              <label className="block text-sm text-gray-600 mb-1">
                Comments
              </label>
              <textarea
                {...register("comments")}
                className="w-full resize-none border rounded p-2"
              />
            </div>
          </div>

          {/* Status entries form */}
          <form onSubmit={handleSubmit(onSubmit as SubmitHandler<FieldValues>)}>
            <div className="flex items-center flex-wrap py-3 gap-2">
              {errors.statuses?.message && (
                <div className="w-full">
                  <span className="text-red-600">
                    {String(errors.statuses.message)}
                  </span>
                </div>
              )}

              {fields.map((field, index) => {
                // errors.statuses is a union type that doesn't expose numeric
                // indexing; cast once here rather than at every usage site.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const statusErr = (errors.statuses as any)?.[index];
                return (
                  <div
                    key={field.id}
                    className="flex p-2 gap-2 border rounded-2xl"
                  >
                    <div className="grid gap-1">
                      <label>
                        <span className="text-sm">Status:</span>
                        <select
                          className="p-2 ml-1"
                          {...register(`statuses.${index}.type`, {
                            required: "Please select the duty status",
                          })}
                        >
                          <option value="on-duty-driving">
                            On duty driving
                          </option>
                          <option value="on-duty-not-driving">
                            On duty not driving
                          </option>
                          <option value="off-duty">Off duty</option>
                        </select>
                      </label>
                      {statusErr?.type?.message && (
                        <span className="text-red-600 text-xs">
                          {String(statusErr.type.message)}
                        </span>
                      )}

                      <label>
                        <span className="text-sm">Time:</span>
                        <input
                          className="p-2 ml-1"
                          type="time"
                          {...register(`statuses.${index}.mapped_time`, {
                            required:
                              "Please enter the time of the duty status",
                          })}
                        />
                      </label>
                      {statusErr?.mapped_time?.message && (
                        <span className="text-red-600 text-xs">
                          {String(statusErr.mapped_time.message)}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn-error-action self-center p-2"
                      disabled={saveState === "saving"}
                      onClick={() => remove(index)}
                    >
                      <Delete />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                className="btn-primary-action p-2"
                disabled={saveState === "saving"}
                onClick={() =>
                  append({
                    type: "on-duty-driving",
                    mapped_time: `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`,
                    time_of_event: {
                      hour: new Date().getHours(),
                      minute: new Date().getMinutes(),
                    },
                  })
                }
              >
                <Plus /> Add Status
              </button>
            </div>

            <button
              type="submit"
              className={
                saveState === "failed" ? "btn-error-action" : "btn-success"
              }
              disabled={saveState === "saving"}
            >
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "✓ Saved"
                  : saveState === "failed"
                    ? "Save failed — retry?"
                    : "Save"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
function formatDuration(totalMins: number): string {
  return `${Math.floor(totalMins / 60)}hr(s) ${totalMins % 60}min(s)`;
}
