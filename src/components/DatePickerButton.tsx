import type { DateISO } from "../app/types";
import { formatDateDisplay } from "../app/storage";
import { APP_MAIN_COLOR } from "../app/theme";

interface DatePickerButtonProps {
  currentDate: DateISO;
  onClick: () => void;
}

export default function DatePickerButton({ currentDate, onClick }: DatePickerButtonProps) {
  const paperBgColor = "#fbfaf7";
  const paperBgPattern =
    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)";

  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        border: "2px solid #eee",
        backgroundColor: paperBgColor,
        backgroundImage: paperBgPattern,
        backgroundSize: "24px 24px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: "#333",
      }}
      title="Click to change date"
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${APP_MAIN_COLOR}12`,
          border: `1px solid ${APP_MAIN_COLOR}55`,
          color: APP_MAIN_COLOR,
          fontSize: 18,
          flex: "0 0 auto",
        }}
        aria-hidden
      >
        📅
      </span>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "#666", letterSpacing: 0.4 }}>
          Calendar
        </div>
        <div style={{ fontSize: 15, fontWeight: 900, color: "#222" }}>
          {formatDateDisplay(currentDate)}
        </div>
      </div>
    </button>
  );
}
