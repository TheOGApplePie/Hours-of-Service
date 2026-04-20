"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { format } from "date-fns";
import DailyLogsCanvas from "./DailyLogsCanvas";
import { MetricDriverDetail, MetricKind } from "@/types/dashboard";
import { RawStatus } from "@/types/rawStatus";
import { Status } from "@/types/dailyDocument";
import { Notification, NotificationType } from "@/types/notification";
import {
  getLatestNotification,
  canSendNotification,
  createNotification,
  resolveNotification,
} from "@/lib/notificationService";
import { fetchUserDetails } from "@/lib/driverService";
import { FirebaseEmailProvider } from "@/lib/email/FirebaseEmailProvider";
import { useAuth } from "@/contexts/AuthContext";

interface MetricModalProps {
  label: string;
  details: MetricDriverDetail[];
  kind: MetricKind;
  onClose: () => void;
}

const REMINDER_KINDS: MetricKind[] = ["offending", "missing"];

const KIND_TO_NOTIFICATION_TYPE: Partial<Record<MetricKind, NotificationType>> =
  {
    offending: "violation",
    missing: "missing_hos",
  };

/** Converts a RawStatus to a Status with mapped_time for the canvas. */
function toCanvasStatus(raw: RawStatus): Status {
  return {
    ...raw,
    mapped_time: `${String(raw.time_of_event.hour).padStart(2, "0")}:${String(raw.time_of_event.minute).padStart(2, "0")}`,
  };
}

/** Maps an MtoRule identifier to a human-readable label. */
function ruleLabel(rule: string): string {
  if (rule === "daily_driving") return "Daily driving limit";
  if (rule === "daily_on_duty") return "Daily on-duty limit";
  if (rule === "weekly_on_duty") return "Weekly on-duty limit";
  if (rule === "rest_15_day") return "15-day rest requirement";
  return rule;
}

// ── Smooth accordion ──────────────────────────────────────────────────────────

/**
 * Animates height from 0 to the content's measured height and back.
 * CSS cannot transition to `height: auto`, so we measure the real pixel
 * height via a ref and transition to that value instead.
 */
function AccordionBody({
  open,
  children,
}: Readonly<{ open: boolean; children: React.ReactNode }>) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (innerRef.current) {
      setHeight(open ? innerRef.current.scrollHeight : 0);
    }
  }, [open]);

  return (
    <div style={{ height, overflow: "hidden", transition: "height 0.3s ease" }}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

// ── Reminder button ───────────────────────────────────────────────────────────

function ReminderButton({
  detail,
  kind,
}: Readonly<{ detail: MetricDriverDetail; kind: MetricKind }>) {
  const { user, userRole } = useAuth();
  const notificationType = KIND_TO_NOTIFICATION_TYPE[kind];

  const [previousReminder, setPreviousReminder] = useState<Notification | null>(
    null,
  );
  const [senderName, setSenderName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!notificationType) return;
    getLatestNotification(detail.driverId, notificationType).then(
      async (latest) => {
        setPreviousReminder(latest);
        if (latest?.sent_by) {
          const senderDetails = await fetchUserDetails(latest.sent_by);
          setSenderName(senderDetails?.name ?? "Unknown");
        }
        setLoadingHistory(false);
      },
    );
  }, [detail.driverId, notificationType]);

  if (!notificationType || !user || loadingHistory) return null;

  async function handleSend() {
    if (sending || !user) return;
    await canSendNotification(detail.driverId, notificationType!);

    setSending(true);
    setSendFailed(false);

    const relatedDates =
      kind === "missing"
        ? (detail.missingDates ?? [])
        : detail.date
          ? [detail.date]
          : [];

    const violationSummary =
      detail.violations
        ?.map((v) => `${ruleLabel(v.rule)}: ${v.detail}`)
        .join("; ") ?? "driving hours violation";

    const message =
      kind === "offending"
        ? `Reminder: MTO violation on ${relatedDates.join(", ")} — ${violationSummary}. Please review your Hours of Service records.`
        : `Reminder: You have missing Hours of Service submissions for ${relatedDates.join(", ")}. Please submit them as soon as possible.`;

    // ── Send email ──────────────────────────────────────────────────────────
    let emailStatus: "sent" | "failed" = "sent";

    const driverDetails = await fetchUserDetails(detail.driverId);
    const driverEmail = driverDetails?.email;
    console.log(driverDetails)

    if (driverEmail) {
      try {
        const subject =
          kind === "offending"
            ? `Hours of Service Violation – ${detail.driverName}`
            : `Missing Hours of Service Submission – ${detail.driverName}`;
        await new FirebaseEmailProvider().sendEmail({
          to: driverEmail,
          subject,
          body: message,
          fromUserId: user.uid,
          fromEmail: user.email ?? undefined,
        });
      } catch {
        emailStatus = "failed";
      }
    } else {
      emailStatus = "failed";
    }

    // ── Record notification (always, regardless of delivery outcome) ────────
    await createNotification({
      driver_id: detail.driverId,
      type: notificationType!,
      message,
      sent_by: user.uid,
      related_dates: relatedDates,
      status: emailStatus,
      read: false,
    });

    const updated = await getLatestNotification(
      detail.driverId,
      notificationType!,
    );
    setPreviousReminder(updated);
    setSenderName(user.displayName ?? "You");
    setSending(false);
    if (emailStatus === "failed") {
      setSendFailed(true);
    } else {
      setSent(true);
    }
  }

  async function handleResolve() {
    if (!previousReminder) return;
    await resolveNotification(previousReminder.id);
    setResolved(true);
  }

  const hasPreviousReminder = !!previousReminder;

  function buttonLabel(
    isSending: boolean,
    isSent: boolean,
    isFailed: boolean,
    hasPrevious: boolean,
  ): string {
    if (isSending) return "Sending…";
    if (isSent) return "✓ Reminder sent";
    if (isFailed) return "Retry";
    if (hasPrevious) return "Send reminder again";
    return "Send reminder email";
  }
  const sentAtFormatted = previousReminder
    ? format(previousReminder.sent_at, "d MMM yyyy 'at' HH:mm")
    : null;

  return (
    <div className="flex flex-col gap-1 mt-2">
      {hasPreviousReminder && (
        <p className="text-xs text-gray-500">
          Reminder previously sent on{" "}
          <span className="font-semibold">{sentAtFormatted}</span> by{" "}
          <span className="font-semibold">{senderName}</span>
        </p>
      )}
      {kind === "offending" &&
        hasPreviousReminder &&
        !resolved &&
        (userRole === "manager" || userRole === "safety") && (
          <button className="btn-success self-start" onClick={handleResolve}>
            Mark as resolved
          </button>
        )}
      {resolved && (
        <p className="text-xs text-colour-success font-semibold">
          ✓ Marked as resolved
        </p>
      )}
      {sendFailed && (
        <p className="text-xs text-red-600 font-semibold">
          Email could not be delivered. The driver may not have an email address on file.
        </p>
      )}
      <button
        className="btn-error-action self-start"
        onClick={handleSend}
        disabled={sending}
      >
        {buttonLabel(sending, sent, sendFailed, hasPreviousReminder)}
      </button>
    </div>
  );
}

// ── Driver subline ────────────────────────────────────────────────────────────

function DriverSubline({
  detail,
  kind,
}: Readonly<{ detail: MetricDriverDetail; kind: MetricKind }>) {
  if (kind === "earliest" || kind === "latest") {
    return (
      <span className="block text-xs text-gray-500">
        {detail.date} at {detail.time}
      </span>
    );
  }
  if (kind === "offending") {
    const rules =
      detail.violations?.map((v) => ruleLabel(v.rule)).join(", ") ?? "";
    return <span className="block text-xs text-gray-500">{rules}</span>;
  }
  if (kind === "missing") {
    return (
      <span className="block text-xs text-gray-500">
        {detail.missingDates?.length} missing day(s)
      </span>
    );
  }
  return null;
}

// ── Driver detail body ────────────────────────────────────────────────────────

function DriverDetailBody({
  detail,
  kind,
}: Readonly<{ detail: MetricDriverDetail; kind: MetricKind }>) {
  return (
    <div className="flex flex-col gap-3 pt-3 pb-1">
      {kind === "offending" && detail.violations && (
        <div className="flex flex-col gap-2">
          {detail.violations.map((v, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 shrink-0">
                {ruleLabel(v.rule)}
              </span>
              <span className="text-sm text-gray-700">{v.detail}</span>
            </div>
          ))}
        </div>
      )}

      {kind === "missing" && detail.missingDates && (
        <div>
          <p className="text-sm font-semibold text-gray-600 mb-1">
            Missing submissions:
          </p>
          <ul className="flex flex-wrap gap-2">
            {detail.missingDates.map((d) => (
              <li
                key={d}
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: "rgba(230,194,0,0.2)",
                  color: "#713f12",
                }}
              >
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.statuses.length > 0 &&
        kind !== "earliest" &&
        kind !== "latest" && (
          <div className="canvas-parent">
            <p className="text-sm font-semibold text-gray-600 mb-1">
              Hours of Service — {detail.date}
            </p>
            <DailyLogsCanvas statuses={detail.statuses.map(toCanvasStatus)} />
          </div>
        )}

      {REMINDER_KINDS.includes(kind) && (
        <ReminderButton detail={detail} kind={kind} />
      )}
    </div>
  );
}

// ── Single driver view ────────────────────────────────────────────────────────

function SingleDriverDetail({
  detail,
  kind,
}: Readonly<{ detail: MetricDriverDetail; kind: MetricKind }>) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-xl font-bold text-gray-800">{detail.driverName}</p>
        <DriverSubline detail={detail} kind={kind} />
      </div>
      <DriverDetailBody detail={detail} kind={kind} />
    </div>
  );
}

// ── Accordion row (multi-driver list) ─────────────────────────────────────────

function AccordionDriverRow({
  detail,
  kind,
}: Readonly<{ detail: MetricDriverDetail; kind: MetricKind }>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between text-left cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div>
          <span className="font-bold text-gray-800">{detail.driverName}</span>
          <DriverSubline detail={detail} kind={kind} />
        </div>
        <ChevronDown
          size={20}
          className="text-gray-400 shrink-0 transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      <AccordionBody open={open}>
        <DriverDetailBody detail={detail} kind={kind} />
      </AccordionBody>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function MetricModal({
  label,
  details,
  kind,
  onClose,
}: Readonly<MetricModalProps>) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">{label}</h2>
          <button
            onClick={onClose}
            className="btn-action px-3 py-1 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {details.length === 0 && (
          <p className="text-gray-500 text-sm">No data to display.</p>
        )}

        {details.length === 1 && (
          <SingleDriverDetail detail={details[0]} kind={kind} />
        )}

        {details.length > 1 && (
          <div className="flex flex-col gap-2">
            {details.map((detail) => (
              <AccordionDriverRow
                key={detail.driverId + detail.date}
                detail={detail}
                kind={kind}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
