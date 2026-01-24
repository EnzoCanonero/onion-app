import { useState, useEffect } from "react";
import { useVirtualClock } from "../contexts/VirtualClockContext";

function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function formatDateForInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeForInput(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

const SPEED_OPTIONS = [1, 10, 100, 1000];

export default function VirtualClockToolbox() {
  const {
    state,
    virtualNow,
    setVirtualTime,
    setSpeed,
    toggleRunning,
    resetToRealTime,
  } = useVirtualClock();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [dateInput, setDateInput] = useState(() => formatDateForInput(virtualNow));
  const [timeInput, setTimeInput] = useState(() => formatTimeForInput(virtualNow));

  // Update display every second
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync inputs when virtualNow changes externally (like reset)
  useEffect(() => {
    if (!state.isRunning || state.speed === 0) {
      // When paused, sync inputs to current virtual time
      setDateInput(formatDateForInput(virtualNow));
      setTimeInput(formatTimeForInput(virtualNow));
    }
  }, [virtualNow, state.isRunning, state.speed]);

  const handleApplyDateTime = () => {
    const [year, month, day] = dateInput.split("-").map(Number);
    const [hour, minute] = timeInput.split(":").map(Number);

    if (!year || !month || !day || hour === undefined || minute === undefined) return;

    const newDate = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (isNaN(newDate.getTime())) return;

    setVirtualTime(newDate);
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
  };

  const realNow = new Date();

  if (isCollapsed) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          backgroundColor: "#fff8e1",
          border: "2px solid #ff9800",
          borderRadius: 12,
          padding: "8px 12px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          zIndex: 9998,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
        onClick={() => setIsCollapsed(false)}
        title="Expand Virtual Clock"
      >
        <span style={{ fontSize: 16 }}>
          {state.isRunning ? "▶" : "⏸"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#e65100" }}>
          {formatDateTime(virtualNow)}
        </span>
        <span style={{ fontSize: 11, color: "#ff9800", fontWeight: 600 }}>
          {state.speed}x
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        backgroundColor: "#fff8e1",
        border: "2px solid #ff9800",
        borderRadius: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        zIndex: 9998,
        minWidth: 280,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: "1px solid #ffe0b2",
          backgroundColor: "#ff9800",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, color: "white", letterSpacing: 0.5 }}>
          VIRTUAL CLOCK
        </span>
        <button
          onClick={() => setIsCollapsed(true)}
          style={{
            background: "none",
            border: "none",
            color: "white",
            fontSize: 16,
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: 4,
          }}
          title="Collapse"
        >
          -
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: 14 }}>
        {/* Current virtual time display */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 14,
            padding: "10px 12px",
            backgroundColor: "white",
            borderRadius: 8,
            border: "1px solid #ffe0b2",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e65100", marginBottom: 4 }}>
            VIRTUAL NOW
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#333", fontFamily: "monospace" }}>
            {formatDateTime(virtualNow)}
          </div>
        </div>

        {/* Date/Time inputs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#666", display: "block", marginBottom: 4 }}>
              DATE
            </label>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 13,
                border: "1px solid #ddd",
                borderRadius: 6,
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#666", display: "block", marginBottom: 4 }}>
              TIME
            </label>
            <input
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 13,
                border: "1px solid #ddd",
                borderRadius: 6,
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Apply button */}
        <button
          onClick={handleApplyDateTime}
          style={{
            width: "100%",
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            backgroundColor: "#ff9800",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            marginBottom: 14,
          }}
        >
          Set Virtual Time
        </button>

        {/* Speed controls */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#666", marginBottom: 6 }}>
            SPEED
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {SPEED_OPTIONS.map((spd) => (
              <button
                key={spd}
                onClick={() => handleSpeedChange(spd)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 12,
                  fontWeight: 700,
                  backgroundColor: state.speed === spd && state.isRunning ? "#ff9800" : "white",
                  color: state.speed === spd && state.isRunning ? "white" : "#666",
                  border: `1px solid ${state.speed === spd && state.isRunning ? "#ff9800" : "#ddd"}`,
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Play/Pause and Reset */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={toggleRunning}
            style={{
              flex: 1,
              padding: "10px 12px",
              fontSize: 13,
              fontWeight: 700,
              backgroundColor: state.isRunning ? "#f5f5f5" : "#4caf50",
              color: state.isRunning ? "#666" : "white",
              border: `1px solid ${state.isRunning ? "#ddd" : "#4caf50"}`,
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {state.isRunning ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            onClick={resetToRealTime}
            style={{
              flex: 1,
              padding: "10px 12px",
              fontSize: 13,
              fontWeight: 700,
              backgroundColor: "white",
              color: "#666",
              border: "1px solid #ddd",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        </div>

        {/* Real time reference */}
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px solid #ffe0b2",
            fontSize: 10,
            color: "#888",
            textAlign: "center",
          }}
        >
          <div>Real time: {formatDateTime(realNow)}</div>
        </div>
      </div>
    </div>
  );
}
