import { useState, useMemo, useCallback, useRef } from "react";
import type { DateISO, YM, MeetingEntry } from "../app/types";
import { getTodayDate, ymFromDate, makeId, loadState, saveState, addMeetingWithRecurrence } from "../app/storage";
import { checkDateAccess } from "../app/dateAccess";
import { getVirtualTimestamp } from "../contexts/VirtualClockContext";
import { APP_MAIN_COLOR } from "../app/theme";
import CalendarGrid from "./CalendarGrid";
import DateContextMenu from "./DateContextMenu";
import MeetingFormModal from "./MeetingFormModal";
import { exportMeetingsToICS, parseICSMeetings } from "../app/ics";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const paperBgColor = "#fbfaf7";
  const paperBgPattern =
    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)";

  // Load state for date access checks
  const [stateTick, setStateTick] = useState(0);
  const state = useMemo(() => loadState(), [stateTick]);

  const meetingsByDate = useMemo(() => {
    const map: Record<DateISO, MeetingEntry[]> = {};
    state.meetings.forEach((meeting) => {
      if (!map[meeting.date]) map[meeting.date] = [];
      map[meeting.date].push(meeting);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)));
    return map;
  }, [state.meetings]);

  // Callbacks for CalendarGrid to check date restrictions (uses virtual time in dev mode)
  const isDateRestricted = useCallback(
    (date: DateISO): boolean => {
      const access = checkDateAccess(state, date);
      // Fully restricted: can't go to date AND can't add meetings
      return !access.allowed && !("meetingsAllowed" in access && access.meetingsAllowed);
    },
    [state]
  );

  const isDateMeetingsOnly = useCallback(
    (date: DateISO): boolean => {
      const access = checkDateAccess(state, date);
      // Meetings only: can't go to date but can add meetings (future dates)
      return !access.allowed && "meetingsAllowed" in access && access.meetingsAllowed;
    },
    [state]
  );

  // Get access for context menu date
  const contextMenuAccess = useMemo(() => {
    if (!contextMenuDate) return null;
    return checkDateAccess(state, contextMenuDate);
  }, [state, contextMenuDate]);

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
      createdAt: getVirtualTimestamp(),
    };
    const nextState = addMeetingWithRecurrence(state, meeting);
    saveState(nextState);
    setShowMeetingForm(false);
    setShowContextMenu(false);
    setStateTick((t) => t + 1);
  };

  const handleExport = () => {
    const latest = loadState();
    const ics = exportMeetingsToICS(latest.meetings);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `onionops-meetings-${getTodayDate()}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    const parsed = parseICSMeetings(text);
    if (parsed.length === 0) {
      alert("No events found in the .ics file.");
      return;
    }
    let nextState = loadState();
    const createdAt = getVirtualTimestamp();
    parsed.forEach((meeting) => {
      const entry: MeetingEntry = {
        ...meeting,
        id: makeId("meeting"),
        createdAt,
      };
      nextState = addMeetingWithRecurrence(nextState, entry);
    });
    saveState(nextState);
    setStateTick((t) => t + 1);
    alert(`Imported ${parsed.length} meeting${parsed.length === 1 ? "" : "s"}.`);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
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
          padding: 28,
          borderRadius: 16,
          border: "2px solid #eee",
          boxShadow: "0 12px 34px rgba(0,0,0,0.18)",
          zIndex: 1001,
          minWidth: 640,
          maxWidth: 760,
          width: "92%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#333" }}>Calendar</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              Click a day to open options (go to date / add meeting)
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={handleImportClick}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 800,
                backgroundColor: "white",
                border: "1px solid #ddd",
                borderRadius: 10,
                cursor: "pointer",
                color: "#444",
              }}
            >
              Import
            </button>
            <button
              onClick={handleExport}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 800,
                backgroundColor: "white",
                border: "1px solid #ddd",
                borderRadius: 10,
                cursor: "pointer",
                color: "#444",
              }}
            >
              Export
            </button>
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".ics,text/calendar"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) {
                  handleImport(file).catch(() => {
                    alert("Failed to import the .ics file.");
                  });
                }
              }}
            />
          </div>
        </div>

        <CalendarGrid
          currentMonth={viewMonth}
          selectedDate={currentDate}
          onDayClick={handleDayClick}
          onMonthChange={handleMonthChange}
          isDateRestricted={isDateRestricted}
          isDateMeetingsOnly={isDateMeetingsOnly}
          meetingsByDate={meetingsByDate}
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
              border: `2px solid ${APP_MAIN_COLOR}`,
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
          canGoToDate={contextMenuAccess?.allowed ?? true}
          canAddMeeting={
            contextMenuAccess?.allowed ||
            (contextMenuAccess && "meetingsAllowed" in contextMenuAccess && contextMenuAccess.meetingsAllowed) ||
            false
          }
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
