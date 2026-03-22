import type { DateISO } from "../app/types";

interface PastUnactivatedDayPanelProps {
  date: DateISO;
  onOpenForEditing?: () => void;
}

/**
 * Panel shown when navigating to a past date that was never activated as a working day.
 */
export default function PastUnactivatedDayPanel({ date, onOpenForEditing }: PastUnactivatedDayPanelProps) {
  const formattedDate = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        backgroundColor: "white",
        borderRadius: 16,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <p style={{ fontSize: 18, marginBottom: 12 }}>Nothing to see here</p>
      <p style={{ color: "#666", marginBottom: 8, fontSize: 14 }}>
        {formattedDate}
      </p>
      <p style={{ color: "#888", fontSize: 13 }}>
        This day was not activated as a working day. ✨
      </p>
      {onOpenForEditing ? (
        <button
          type="button"
          onClick={onOpenForEditing}
          style={{
            marginTop: 18,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 800,
            backgroundColor: "#673ab7",
            color: "white",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
          }}
        >
          Open for Editing
        </button>
      ) : null}
    </div>
  );
}
