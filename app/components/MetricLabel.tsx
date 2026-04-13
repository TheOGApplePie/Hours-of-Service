"use client";

interface MetricLabelProps {
  label: string;
}

/** Plain text label paired with a MetricCard. Clicking opens the detail modal when an onClick is provided. */
export default function MetricLabel({ label }: Readonly<MetricLabelProps>) {
  return (
    <div className={`flex items-center justify-center p-4`}>
      <span className="metric-label text-gray-500 text-center hover:text-gray-800 transition-colors">
        {label}
      </span>
    </div>
  );
}
