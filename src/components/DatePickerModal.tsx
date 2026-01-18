import { useState } from "react";
import type { DateISO, YM, MeetingEntry } from "../app/types";
import { getTodayDate, ymFromDate, makeId, loadState, saveState, addMeeting } from "../app/storage";
import { APP_MAIN_COLOR } from "../app/theme";
import CalendarGrid from "./CalendarGrid";
import DateContextMenu from "./DateContextMenu";
import MeetingFormModal from "./MeetingFormModal";

interface DatePickerModalProps {
  currentDate: DateISO;
  onSelectDate: (date: DateISO) => void;
  onClose: () => void;
}

export default function DatePickerModal({ currentDate, onSelectDate, onClose }: DatePickerModalProps) {
  const [viewMonth, setViewMonth] = useState<YM>(() => ymFromDate(currentDate));
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuDate, setContextMenuDate] = useState<DateISO | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [showMeetingForm, setShowMeetingForm] = useState(false);

  const paperBgColor = "#fbfaf7";
  const paperBgPattern =
    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)";

  const handleDayClick = (date: DateISO, event: React.MouseEvent) => {
    setContextMenuDate(date);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
    setShowContextMenu(true);
  };

  const handleGoToDate = () => {
    if (contextMenuDate) {
      onSelectDate(contextMenuDate);
      onClose();
    }
  };

  const handleAddMeeting = () => {
    setShowContextMenu(false);
    setShowMeetingForm(true);
  };

  const handleMonthChange = (direction: "prev" | "next") => {
    const [year, month] = viewMonth.split("-").map(Number);
    const newDate = new Date(year, month - 1 + (direction === "next" ? 1 : -1), 1);
    const newMonth = String(newDate.getMonth() + 1).padStart(2, "0");
    setViewMonth(`${newDate.getFullYear()}-${newMonth}` as YM);
  };

  const handleSaveMeeting = (meetingData: Omit<MeetingEntry, "id" | "createdAt">) => {
    const state = loadState();
    const meeting: MeetingEntry = {
      ...meetingData,
      id: makeId("meeting"),
      createdAt: new Date().toISOString(),
    };
    const nextState = addMeeting(state, meeting);
    saveState(nextState);
    setShowMeetingForm(false);
    setShowContextMenu(false);
  };

  const handleToday = () => {
    const today = getTodayDate();
    onSelectDate(today);
    onClose();
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
          zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: paperBgColor,
          backgroundImage: paperBgPattern,
          backgroundSize: "24px 24px",
          padding: 24,
          borderRadius: 14,
          border: "2px solid #eee",
          boxShadow: "0 12px 34px rgba(0,0,0,0.18)",
          zIndex: 1001,
          minWidth: 420,
          maxWidth: 520,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#333" }}>Calendar</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              Click a day to open options (go to date / add meeting)
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "6px 10px",
              fontSize: 14,
              fontWeight: 900,
              backgroundColor: "white",
              border: "1px solid #ddd",
              borderRadius: 10,
              cursor: "pointer",
              color: "#666",
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        <CalendarGrid
          currentMonth={viewMonth}
          selectedDate={currentDate}
          onDayClick={handleDayClick}
          onMonthChange={handleMonthChange}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={handleToday}
            style={{
              flex: 1,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 800,
              backgroundColor: "white",
              color: APP_MAIN_COLOR,
              border: `2px dashed ${APP_MAIN_COLOR}`,
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            📅 Today
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {showContextMenu && contextMenuDate && (
        <DateContextMenu
          date={contextMenuDate}
          position={contextMenuPosition}
          onGoToDate={handleGoToDate}
          onAddMeeting={handleAddMeeting}
          onClose={() => setShowContextMenu(false)}
        />
      )}

      {/* Meeting Form Modal */}
      {showMeetingForm && contextMenuDate && (
        <MeetingFormModal
          date={contextMenuDate}
          onSave={handleSaveMeeting}
          onCancel={() => setShowMeetingForm(false)}
        />
      )}
    </>
  );
}
