import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { DateISO, YM, MeetingEntry, MeetingEditScope } from "../app/types";
import {
  getTodayDate,
  ymFromDate,
  makeId,
  loadState,
  saveState,
  addMeetingWithRecurrence,
  updateMeeting,
  deleteMeeting,
  updateMeetingThisAndFuture,
  deleteMeetingThisAndFuture,
  setDailyJournal,
  formatDateDisplay,
} from "../app/storage";
import { checkDateAccess } from "../app/dateAccess";
import { getVirtualTimestamp } from "../contexts/VirtualClockContext";
import { APP_MAIN_COLOR } from "../app/theme";
import CalendarGrid from "./CalendarGrid";
import MeetingFormModal from "./MeetingFormModal";
import { exportMeetingsToICS, parseICSMeetings } from "../app/ics";

interface DatePickerModalProps {
  currentDate: DateISO;
  onSelectDate: (date: DateISO) => void;
  onClose: () => void;
}

export default function DatePickerModal({ currentDate, onSelectDate, onClose }: DatePickerModalProps) {
  const [viewMonth, setViewMonth] = useState<YM>(() => ymFromDate(currentDate));
  const [inspectedDate, setInspectedDate] = useState<DateISO | null>(null);
  const [activeTab, setActiveTab] = useState<"meetings" | "diary">("meetings");
  const [meetingFormDate, setMeetingFormDate] = useState<DateISO | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<MeetingEntry | undefined>();
  const [diaryDraft, setDiaryDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const calendarSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [calendarSurfaceHeight, setCalendarSurfaceHeight] = useState<number | null>(null);

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
  const journalEntriesByDate = useMemo(() => {
    const map: Record<DateISO, string> = {};
    Object.entries(state.days).forEach(([date, day]) => {
      const rawJournal = typeof day.dailyJournal === "string" ? day.dailyJournal : "";
      if (!rawJournal.trim()) return;
      map[date as DateISO] = rawJournal;
    });
    return map;
  }, [state.days]);
  const journalDatesInViewMonth = useMemo(() => {
    return Object.keys(journalEntriesByDate)
      .filter((date): date is DateISO => date.startsWith(`${viewMonth}-`))
      .sort();
  }, [journalEntriesByDate, viewMonth]);
  const journalDatesInViewMonthSet = useMemo(
    () => new Set<DateISO>(journalDatesInViewMonth),
    [journalDatesInViewMonth]
  );
  const inspectedDateAccess = useMemo(() => {
    if (!inspectedDate) return null;
    return checkDateAccess(state, inspectedDate);
  }, [state, inspectedDate]);
  const inspectedMeetings = useMemo(() => {
    if (!inspectedDate) return [] as MeetingEntry[];
    return meetingsByDate[inspectedDate] ?? [];
  }, [inspectedDate, meetingsByDate]);
  const inspectedDiary = inspectedDate ? journalEntriesByDate[inspectedDate] : undefined;
  const inspectedIsPastDate = Boolean(inspectedDate && inspectedDate < getTodayDate());
  const canEditDiary = Boolean(inspectedDate && inspectedIsPastDate);
  const diaryIsDirty = canEditDiary && diaryDraft !== (inspectedDiary ?? "");
  const canGoToInspectedDate = inspectedDateAccess?.allowed ?? false;
  const canManageMeetingsForInspectedDate = Boolean(
    inspectedDate &&
      inspectedDate >= getTodayDate() &&
      (inspectedDateAccess?.allowed ||
        (inspectedDateAccess && "meetingsAllowed" in inspectedDateAccess && inspectedDateAccess.meetingsAllowed))
  );
  const isInspectorOpen = Boolean(inspectedDate);

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

  const shiftDate = (date: DateISO, deltaDays: number): DateISO => {
    const [year, month, day] = date.split("-").map(Number);
    const next = new Date(year, month - 1, day + deltaDays);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, "0");
    const d = String(next.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}` as DateISO;
  };

  const handleDayClick = (date: DateISO, event: React.MouseEvent) => {
    void event;
    setInspectedDate(date);
    setActiveTab("meetings");
  };

  const handleGoToDate = () => {
    if (!inspectedDate || !canGoToInspectedDate) return;
    onSelectDate(inspectedDate);
    onClose();
  };

  const handleAddMeeting = () => {
    if (!inspectedDate || !canManageMeetingsForInspectedDate) return;
    setEditingMeeting(undefined);
    setMeetingFormDate(inspectedDate);
  };

  const handleMonthChange = (direction: "prev" | "next") => {
    const [year, month] = viewMonth.split("-").map(Number);
    const newDate = new Date(year, month - 1 + (direction === "next" ? 1 : -1), 1);
    const newMonth = String(newDate.getMonth() + 1).padStart(2, "0");
    setViewMonth(`${newDate.getFullYear()}-${newMonth}` as YM);
  };

  const handleShiftInspectedDate = (direction: "prev" | "next") => {
    if (!inspectedDate) return;
    const nextDate = shiftDate(inspectedDate, direction === "next" ? 1 : -1);
    setInspectedDate(nextDate);
    setViewMonth(ymFromDate(nextDate));
  };

  const closeMeetingForm = () => {
    setMeetingFormDate(null);
    setEditingMeeting(undefined);
  };

  const handleSaveDiary = () => {
    if (!inspectedDate || !canEditDiary) return;
    const nextState = setDailyJournal(loadState(), inspectedDate, diaryDraft.trim() || undefined);
    saveState(nextState);
    setStateTick((t) => t + 1);
  };

  const handleEditMeeting = (meeting: MeetingEntry) => {
    if (!canManageMeetingsForInspectedDate) return;
    setEditingMeeting(meeting);
    setMeetingFormDate(meeting.date);
  };

  const handleSaveMeeting = (
    meetingData: Omit<MeetingEntry, "id" | "createdAt">,
    scope: MeetingEditScope
  ) => {
    const state = loadState();
    const nextState = editingMeeting
      ? scope === "THIS_AND_FUTURE"
        ? updateMeetingThisAndFuture(state, editingMeeting.id, meetingData)
        : updateMeeting(state, editingMeeting.id, meetingData)
      : addMeetingWithRecurrence(state, {
          ...meetingData,
          id: makeId("meeting"),
          createdAt: getVirtualTimestamp(),
        });
    saveState(nextState);
    closeMeetingForm();
    setStateTick((t) => t + 1);
  };

  const handleDeleteMeeting = (scope: MeetingEditScope) => {
    if (!editingMeeting) return;
    const confirmed = confirm(
      scope === "THIS_AND_FUTURE"
        ? "Delete this meeting and all future occurrences?"
        : "Delete this meeting?"
    );
    if (!confirmed) return;

    const state = loadState();
    const nextState =
      scope === "THIS_AND_FUTURE"
        ? deleteMeetingThisAndFuture(state, editingMeeting.id)
        : deleteMeeting(state, editingMeeting.id);
    saveState(nextState);
    closeMeetingForm();
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

  useEffect(() => {
    const element = calendarSurfaceRef.current;
    if (!element) return;

    const updateHeight = () => {
      setCalendarSurfaceHeight(element.getBoundingClientRect().height);
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(element);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [viewMonth, inspectedDate]);

  useEffect(() => {
    setDiaryDraft(inspectedDiary ?? "");
  }, [inspectedDate, inspectedDiary]);

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
          minWidth: 720,
          maxWidth: 1060,
          width: "92%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#333" }}>Calendar</div>
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

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div ref={calendarSurfaceRef}>
              <CalendarGrid
                currentMonth={viewMonth}
                selectedDate={inspectedDate ?? currentDate}
                onDayClick={handleDayClick}
                onMonthChange={handleMonthChange}
                isDateRestricted={isDateRestricted}
                isDateMeetingsOnly={isDateMeetingsOnly}
                meetingsByDate={meetingsByDate}
                journalDates={journalDatesInViewMonthSet}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={handleImportClick}
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 800,
                    backgroundColor: "white",
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    cursor: "pointer",
                    color: "#444",
                  }}
                >
                  Import
                </button>
                <button
                  onClick={handleExport}
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 800,
                    backgroundColor: "white",
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    cursor: "pointer",
                    color: "#444",
                  }}
                >
                  Export
                </button>
              </div>
              <button
                onClick={handleToday}
                style={{
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

          {isInspectorOpen && inspectedDate ? (
            <div
              style={{
                flex: "1 1 340px",
                minWidth: 300,
                maxWidth: 380,
                width: "100%",
                borderRadius: 18,
                border: "2px solid #eee",
                backgroundColor: "rgba(255,255,255,0.94)",
                boxShadow: "0 12px 28px rgba(0,0,0,0.12)",
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                alignSelf: "flex-start",
                height: calendarSurfaceHeight ?? undefined,
                minHeight: calendarSurfaceHeight ?? undefined,
                maxHeight: calendarSurfaceHeight ?? undefined,
                overflow: "hidden",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 40px auto", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => handleShiftInspectedDate("prev")}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    backgroundColor: "white",
                    color: "#333",
                    fontSize: 20,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                  title="Previous day"
                >
                  ‹
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {formatDateDisplay(inspectedDate)}
                  </div>
                </div>
                <button
                  onClick={() => handleShiftInspectedDate("next")}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    backgroundColor: "white",
                    color: "#333",
                    fontSize: 20,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                  title="Next day"
                >
                  ›
                </button>
                <button
                  onClick={() => setInspectedDate(null)}
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
                  title="Close inspector"
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  padding: 4,
                  borderRadius: 14,
                  backgroundColor: "#f6f1e7",
                  border: "1px solid #ece3d3",
                }}
              >
                <button
                  onClick={() => setActiveTab("meetings")}
                  style={{
                    padding: "10px 12px",
                    fontSize: 12,
                    fontWeight: 800,
                    backgroundColor: activeTab === "meetings" ? "white" : "transparent",
                    color: activeTab === "meetings" ? APP_MAIN_COLOR : "#6b7280",
                    border: activeTab === "meetings" ? `1px solid ${APP_MAIN_COLOR}22` : "1px solid transparent",
                    borderRadius: 10,
                    cursor: "pointer",
                    boxShadow: activeTab === "meetings" ? "0 4px 10px rgba(0,0,0,0.05)" : "none",
                  }}
                >
                  Meetings
                </button>
                <button
                  onClick={() => setActiveTab("diary")}
                  style={{
                    padding: "10px 12px",
                    fontSize: 12,
                    fontWeight: 800,
                    backgroundColor: activeTab === "diary" ? "white" : "transparent",
                    color: activeTab === "diary" ? "#a16207" : "#6b7280",
                    border: activeTab === "diary" ? "1px solid rgba(161,98,7,0.16)" : "1px solid transparent",
                    borderRadius: 10,
                    cursor: "pointer",
                    boxShadow: activeTab === "diary" ? "0 4px 10px rgba(0,0,0,0.05)" : "none",
                  }}
                >
                  Diary
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "hidden",
                  borderRadius: 12,
                  backgroundColor: "rgba(255,255,255,0.82)",
                  border: "1px solid #ece7d6",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45)",
                }}
              >
                {activeTab === "meetings" ? (
                  <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid #eee" }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#333" }}>Meetings</div>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                      {inspectedMeetings.length > 0 ? (
                        inspectedMeetings.map((meeting) => (
                          <div
                            key={meeting.id}
                            style={{
                              position: "relative",
                              padding: "10px 12px 10px 18px",
                              borderRadius: 12,
                              backgroundColor: "white",
                              border: "1px solid #edf0f3",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                            }}
                          >
                            <div
                              aria-hidden
                              style={{
                                position: "absolute",
                                left: -6,
                                top: 16,
                                width: 10,
                                height: 10,
                                borderRadius: 999,
                                backgroundColor: "#ef4444",
                                boxShadow: "0 6px 16px rgba(0,0,0,0.10)",
                                border: "2px solid white",
                              }}
                            />
                            <div style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 12, alignItems: "start" }}>
                              <div style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>
                                {meeting.time}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: "#111827", fontWeight: 700, lineHeight: 1.4 }}>
                                  {meeting.title}
                                </div>
                                {meeting.link ? (
                                  <div style={{ marginTop: 4, fontSize: 11, color: "#2563eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {meeting.link}
                                  </div>
                                ) : null}
                              </div>
                              {canManageMeetingsForInspectedDate ? (
                                <button
                                  type="button"
                                  onClick={() => handleEditMeeting(meeting)}
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 10,
                                    border: "1px solid #e5e7eb",
                                    backgroundColor: "white",
                                    color: "#6b7280",
                                    fontSize: 14,
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                  title="Edit meeting"
                                >
                                  ✏️
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div
                          style={{
                            padding: 18,
                            borderRadius: 12,
                            backgroundColor: "#faf7ef",
                            border: "1px dashed #e7dcc5",
                            color: "#7c8796",
                            fontSize: 13,
                            lineHeight: 1.5,
                          }}
                        >
                          No meetings scheduled for this day.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid #eee" }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#333" }}>Diary</div>
                    </div>
                    {canEditDiary ? (
                      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 12, gap: 10 }}>
                        <textarea
                          value={diaryDraft}
                          onChange={(e) => setDiaryDraft(e.target.value)}
                          placeholder="Write here..."
                          style={{
                            flex: 1,
                            minHeight: 0,
                            width: "100%",
                            boxSizing: "border-box",
                            resize: "none",
                            padding: 14,
                            borderRadius: 12,
                            border: "1px solid #e7dcc5",
                            backgroundColor: "#fffdf8",
                            color: "#2f2a1f",
                            fontSize: 14,
                            lineHeight: 1.7,
                            fontFamily: "inherit",
                            outline: "none",
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleSaveDiary}
                          disabled={!diaryIsDirty}
                          style={{
                            alignSelf: "flex-end",
                            padding: "9px 14px",
                            fontSize: 12,
                            fontWeight: 800,
                            backgroundColor: diaryIsDirty ? APP_MAIN_COLOR : "#e5e7eb",
                            color: diaryIsDirty ? "white" : "#9ca3af",
                            border: "none",
                            borderRadius: 10,
                            cursor: diaryIsDirty ? "pointer" : "default",
                          }}
                        >
                          Save
                        </button>
                      </div>
                    ) : inspectedDiary ? (
                      <div
                        style={{
                          flex: 1,
                          minHeight: 0,
                          padding: 14,
                          overflowY: "auto",
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.7,
                          fontSize: 14,
                          color: "#2f2a1f",
                          fontStyle: "normal",
                        }}
                      >
                        {inspectedDiary}
                      </div>
                    ) : (
                      <div
                        style={{
                          flex: 1,
                          minHeight: 0,
                          padding: 12,
                          overflowY: "auto",
                        }}
                      >
                        <div
                          style={{
                            padding: 18,
                            borderRadius: 12,
                            backgroundColor: "#faf7ef",
                            border: "1px dashed #e7dcc5",
                            color: "#7c8796",
                            fontSize: 13,
                            lineHeight: 1.5,
                          }}
                        >
                          No diary entry
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={handleGoToDate}
                  disabled={!canGoToInspectedDate}
                  style={{
                    flex: 1,
                    minWidth: 132,
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 800,
                    backgroundColor: canGoToInspectedDate ? APP_MAIN_COLOR : "#e5e7eb",
                    color: canGoToInspectedDate ? "white" : "#9ca3af",
                    border: "none",
                    borderRadius: 12,
                    cursor: canGoToInspectedDate ? "pointer" : "not-allowed",
                    boxShadow: canGoToInspectedDate ? "0 10px 22px rgba(0,0,0,0.10)" : "none",
                  }}
                >
                  Go to date
                </button>
                <button
                  onClick={handleAddMeeting}
                  disabled={!canManageMeetingsForInspectedDate}
                  style={{
                    flex: 1,
                    minWidth: 132,
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 800,
                    backgroundColor: canManageMeetingsForInspectedDate ? "white" : "#f3f4f6",
                    color: canManageMeetingsForInspectedDate ? "#444" : "#9ca3af",
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    cursor: canManageMeetingsForInspectedDate ? "pointer" : "not-allowed",
                  }}
                >
                  ➕ Add meeting
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Meeting Form Modal */}
      {meetingFormDate && (
        <MeetingFormModal
          date={meetingFormDate}
          mode={editingMeeting ? "edit" : "create"}
          meeting={editingMeeting}
          onSave={handleSaveMeeting}
          onDelete={editingMeeting ? handleDeleteMeeting : undefined}
          onCancel={closeMeetingForm}
        />
      )}
    </>
  );
}
