import { useState } from "react";
import type { DateISO, YM, MeetingEntry } from "../app/types";
import { getTodayDate, ymFromDate, makeId, loadState, saveState, addMeeting } from "../app/storage";
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
          background: "white",
          padding: 30,
          borderRadius: 12,
          boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
          zIndex: 1001,
          minWidth: 400,
          maxWidth: 500,
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 20 }}>Select Date</h2>

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
              fontWeight: 600,
              background: "#f0f0f0",
              border: "1px solid #ddd",
              borderRadius: 6,
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
