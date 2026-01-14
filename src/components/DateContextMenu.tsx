import { useEffect } from "react";
import type { DateISO } from "../app/types";
import { formatDateDisplay } from "../app/storage";

interface DateContextMenuProps {
  date: DateISO;
  position: { x: number; y: number };
  onGoToDate: () => void;
  onAddMeeting: () => void;
  onClose: () => void;
}

export default function DateContextMenu({
  date,
  position,
  onGoToDate,
  onAddMeeting,
  onClose,
}: DateContextMenuProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Adjust position if menu would overflow viewport
  const menuWidth = 200;
  const menuHeight = 120;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let adjustedX = position.x;
  let adjustedY = position.y;

  if (position.x + menuWidth > viewportWidth) {
    adjustedX = viewportWidth - menuWidth - 10;
  }

  if (position.y + menuHeight > viewportHeight) {
    adjustedY = viewportHeight - menuHeight - 10;
  }

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
          backgroundColor: "transparent",
          zIndex: 2000,
        }}
      />

      {/* Context Menu */}
      <div
        style={{
          position: "fixed",
          top: adjustedY,
          left: adjustedX,
          backgroundColor: "white",
          border: "1px solid #ddd",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          zIndex: 2001,
          minWidth: menuWidth,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e0e0e0",
            fontSize: 13,
            fontWeight: 600,
            color: "#666",
          }}
        >
          {formatDateDisplay(date)}
        </div>

        {/* Menu Options */}
        <div>
          <button
            onClick={onGoToDate}
            style={{
              width: "100%",
              padding: "12px 16px",
              textAlign: "left",
              backgroundColor: "white",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              borderBottom: "1px solid #f0f0f0",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f5f5f5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "white";
            }}
          >
            📅 Go to date
          </button>

          <button
            onClick={onAddMeeting}
            style={{
              width: "100%",
              padding: "12px 16px",
              textAlign: "left",
              backgroundColor: "white",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f5f5f5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "white";
            }}
          >
            ➕ Add meeting
          </button>
        </div>
      </div>
    </>
  );
}
