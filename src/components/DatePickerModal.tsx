import { useState } from "react";
import type { DateISO } from "../app/types";
import { getTodayDate, isValidDateISO } from "../app/storage";

interface DatePickerModalProps {
  currentDate: DateISO;
  onSelectDate: (date: DateISO) => void;
  onClose: () => void;
}

export default function DatePickerModal({ currentDate, onSelectDate, onClose }: DatePickerModalProps) {
  const [selectedDate, setSelectedDate] = useState(currentDate);
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!isValidDateISO(selectedDate)) {
      setError("Invalid date format");
      return;
    }
    onSelectDate(selectedDate);
    onClose();
  };

  const handleToday = () => {
    const today = getTodayDate();
    setSelectedDate(today);
    onSelectDate(today);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 1000
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "white",
          padding: 30,
          borderRadius: 8,
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          zIndex: 1001,
          minWidth: 300
        }}
        onKeyDown={handleKeyDown}
      >
        <h2 style={{ marginTop: 0 }}>Select Date</h2>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value as DateISO);
            setError("");
          }}
          style={{
            width: "100%",
            padding: 10,
            fontSize: 16,
            border: "1px solid #ccc",
            borderRadius: 4,
            marginBottom: 10
          }}
          autoFocus
        />

        {error && <p style={{ color: "red", fontSize: 14 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={handleToday}
            style={{
              flex: 1,
              padding: 10,
              fontSize: 16,
              background: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer"
            }}
          >
            Today
          </button>
          <button
            onClick={handleSubmit}
            style={{
              flex: 1,
              padding: 10,
              fontSize: 16,
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer"
            }}
          >
            Go to Date
          </button>
        </div>
      </div>
    </>
  );
}
