"use client";

import { useEffect, useRef } from "react";
import { Status } from "@/types/dailyDocument";

const CANVAS_HEIGHT = 300;
const CANVAS_BACKGROUND = "#f8f9fa";

const STATUS_LABELS = ["Off Duty", "On Duty Driving", "On Duty Not Driving"];

/** Maps a duty status type to its Y position on the canvas. */
function getStatusY(type: string, canvasHeight: number): number {
  if (type === "off-duty") return canvasHeight / 4;
  if (type === "on-duty-driving") return canvasHeight / 2;
  return (canvasHeight / 4) * 3;
}

/** Returns the stroke colour for a given duty status type. */
function getStatusColour(type: string): string {
  if (type === "off-duty") return "red";
  if (type === "on-duty-not-driving") return "gold";
  return "green";
}

function drawGrid(ctx: CanvasRenderingContext2D): void {
  const hourWidth = Math.floor(ctx.canvas.width / 24);
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1;

  for (let hour = 1; hour < 24; hour++) {
    const x = hour * hourWidth;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ctx.canvas.height - 30);
    ctx.stroke();
  }

  for (let row = 1; row < 4; row++) {
    const y = Math.floor((ctx.canvas.height / 4) * row);
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(ctx.canvas.width, y);
    ctx.stroke();
  }
}

function drawAxisLabels(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#000000";
  ctx.font = "0.75rem sans-serif";
  const hourWidth = Math.floor(ctx.canvas.width / 24);

  for (let hour = 1; hour < 24; hour++) {
    ctx.fillText(
      String(hour).padStart(2, "0") + ":00",
      hour * hourWidth - 15,
      ctx.canvas.height - 20,
    );
  }

  for (let row = 1; row < 4; row++) {
    const y = Math.floor((ctx.canvas.height / 4) * row);
    ctx.fillText(STATUS_LABELS[row - 1], 10, y);
  }
}

function drawStatusLines(ctx: CanvasRenderingContext2D, statuses: Status[]): void {
  const sorted = [...statuses].sort((a, b) =>
    a.time_of_event.hour !== b.time_of_event.hour
      ? a.time_of_event.hour - b.time_of_event.hour
      : a.time_of_event.minute - b.time_of_event.minute,
  );

  const hourWidth = Math.floor(ctx.canvas.width / 24);
  ctx.lineWidth = 3;

  const toX = (s: Status) =>
    (s.time_of_event.hour + s.time_of_event.minute / 60) * hourWidth;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const currentX = toX(current);
    const currentY = getStatusY(current.type, ctx.canvas.height);
    const offDutyY = ctx.canvas.height / 4;

    // Lead-in line from midnight to the first status
    if (i === 0) {
      ctx.strokeStyle = "red";
      ctx.beginPath();
      ctx.moveTo(0, offDutyY);
      ctx.lineTo(currentX, offDutyY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(currentX, offDutyY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
    }

    // Horizontal segment from previous status to this one, then vertical drop
    if (i > 0) {
      const previous = sorted[i - 1];
      const previousX = toX(previous);
      const previousY = getStatusY(previous.type, ctx.canvas.height);

      ctx.strokeStyle = getStatusColour(previous.type);
      ctx.beginPath();
      ctx.moveTo(previousX, previousY);
      ctx.lineTo(currentX, previousY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(currentX, previousY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
    }

    // Trail-out line from the last status to midnight
    if (i === sorted.length - 1) {
      ctx.strokeStyle = "red";
      ctx.beginPath();
      ctx.moveTo(currentX, currentY);
      ctx.lineTo(currentX, offDutyY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(currentX, offDutyY);
      ctx.lineTo(ctx.canvas.width, offDutyY);
      ctx.stroke();
    }

    // Event dot
    ctx.beginPath();
    ctx.ellipse(currentX, currentY, 5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function DailyLogsCanvas({
  statuses,
}: Readonly<{ statuses: Status[] }>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.height = CANVAS_HEIGHT;
    canvas.width =
      document.getElementsByClassName("canvas-parent").item(0)?.clientWidth ?? 600;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = CANVAS_BACKGROUND;
    ctx.strokeStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid(ctx);
    drawAxisLabels(ctx);
    drawStatusLines(ctx, statuses);
  }, [statuses]);

  return <canvas ref={canvasRef} />;
}
