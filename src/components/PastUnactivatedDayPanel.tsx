import type { DateISO } from "../app/types";

interface PastUnactivatedDayPanelProps {
  date: DateISO;
}

/**
 * Panel shown when navigating to a past date that was never activated as a working day.
 */
export default function PastUnactivatedDayPanel({ date }: PastUnactivatedDayPanelProps) {
  const formattedDate = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      style={{
        padding: 48,
        textAlign: "center",
        border: "2px dashed #ddd",
        borderRadius: 12,
        backgroundColor: "#fafafa",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <p style={{ fontSize: 18, marginBottom: 12 }}>Nothing to see here</p>
      <p style={{ color: "#666", marginBottom: 8, fontSize: 14 }}>
        {formattedDate}
      </p>
      <p style={{ color: "#888", fontSize: 13 }}>
        This day was not activated as a working day.
      </p>
    </div>
  );
}
