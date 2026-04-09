"use client";

interface MetricCardProps {
  value: string;
  sub?: string;
  /** Extra detail lines rendered below value — used for earliest/latest cards. */
  lines?: string[];
  /** Number of offenders — drives the colour class. */
  count: number;
  onClick?: () => void;
}

function metricColourClass(count: number): string {
  if (count > 10) return "metric-alarm";
  if (count >= 1) return "metric-warning";
  return "metric-good";
}

/** Coloured square card showing the metric value. Clicking opens the detail modal. */
export default function MetricCard({
  value,
  sub,
  lines,
  count,
  onClick,
}: MetricCardProps) {
  return (
    <div
      className={`metric-card ${metricColourClass(count)} ${
        onClick ? "cursor-pointer" : ""
      }`}
      onClick={onClick}
    >
      <span className="metric-value">{value}</span>
      {sub && <span className="metric-sub">{sub}</span>}
      {lines?.map((line, i) => (
        <span key={i} className="metric-sub">{line}</span>
      ))}
    </div>
  );
}
