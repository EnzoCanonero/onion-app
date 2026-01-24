import type { DateISO } from "../app/types";

interface FutureDatePanelProps {
  date: DateISO;
}

/**
 * Panel shown when navigating to a future date (blocked in normal mode).
 */
export default function FutureDatePanel({ date }: FutureDatePanelProps) {
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
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔮</div>
      <p style={{ fontSize: 18, marginBottom: 12 }}>Future date</p>
      <p style={{ color: "#666", marginBottom: 8, fontSize: 14 }}>
        {formattedDate}
      </p>
      <p style={{ color: "#888", fontSize: 13 }}>
        This date is in the future. Come back when it's time!
      </p>
      <p style={{ color: "#aaa", fontSize: 12, marginTop: 16 }}>
        Tip: You can add meetings to future dates from the calendar.
      </p>
    </div>
  );
}
