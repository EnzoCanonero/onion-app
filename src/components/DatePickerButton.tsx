import type { DateISO } from "../app/types";
import { formatDateDisplay } from "../app/storage";

interface DatePickerButtonProps {
  currentDate: DateISO;
  onClick: () => void;
}

export default function DatePickerButton({ currentDate, onClick }: DatePickerButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        fontSize: 24,
        fontWeight: "bold",
        cursor: "pointer",
        padding: 0,
        margin: 0,
        color: "#007bff",
        display: "flex",
        alignItems: "center",
        gap: 8
      }}
      title="Click to change date"
    >
      <span style={{ fontSize: 20 }}>📅</span>
      {formatDateDisplay(currentDate)}
    </button>
  );
}
