import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MeetingEntry, DailyReminderTemplate, DayLogEvent } from "../app/types";
import {
  loadState,
  saveState,
  getMonth,
  getOrCreateDay,
  ymFromDate,
  makeId,
  addSession,
  updateDay,
  updateSession,
  setDayTasks,
  setTaskOutcome,
  setDailyJournal,
  setShutdownNote,
  findLastWorkingDay,
  activateWorkingDay,
  closeDay,
  reopenDay,
  addMeeting,
  updateMeeting,
  deleteMeeting,
  getMeetingsForDate,
  toggleMeetingAttended,
  setDailyReminderTemplates,
  toggleReminderChecked,
  getMilestonesInMonth,
  getTemplatesForMilestone,
  getStandaloneTemplates,
  formatTime,
  appendDayEvent,
} from "../app/storage";
import { dayOfWeekFromDateISO, isTemplateScheduledForWeekday } from "../app/weekdays";
import { useDateNavigation } from "../contexts/DateNavigationContext";
import { APP_MAIN_COLOR } from "../app/theme";
import TaskSelectionModal from "../components/TaskSelectionModal";
import FocusTemplateCard from "../components/FocusTemplateCard";
import DailyTimeline from "../components/DailyTimeline";
import EmptyMonthPanel from "../components/EmptyMonthPanel";
import MeetingFormModal from "../components/MeetingFormModal";

export default function DailyAgendaPage() {
  const { selectedDate } = useDateNavigation();  // From context
  const dateSafe = selectedDate;
  const ym = ymFromDate(dateSafe);
  const weekday = dayOfWeekFromDateISO(dateSafe);

  const [tick, setTick] = useState(0);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isEditingReminders, setIsEditingReminders] = useState(false);
  const [reminderDraft, setReminderDraft] = useState<DailyReminderTemplate[]>([]);
  const state = useMemo(() => loadState(), [tick]);

  const plan = getMonth(state, ym);
  const paperBgColor = "#fbfaf7";
  const paperBgPattern =
    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)";

  // Active month rule (v3): show empty panel if no plan exists
  if (!plan) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h2 style={{ margin: 0 }}>Daily</h2>
              <p style={{ margin: "8px 0 0", opacity: 0.7 }}>{dateSafe}</p>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: 24,
            border: "2px dashed #ddd",
            borderRadius: 12,
            backgroundColor: paperBgColor,
            backgroundImage: paperBgPattern,
            backgroundSize: "24px 24px",
          }}
        >
          <EmptyMonthPanel ym={ym} />
        </div>
      </div>
    );
  }

  const { state: withDay, day } = getOrCreateDay(state, dateSafe, ym);

  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const [leftColumnHeightPx, setLeftColumnHeightPx] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!day.isWorkingDay) {
      setLeftColumnHeightPx(undefined);
      return;
    }

    const el = leftColumnRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      if (!Number.isFinite(rect.height)) return;
      setLeftColumnHeightPx(Math.max(0, Math.round(rect.height)));
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [day.isWorkingDay, dateSafe]);

  // Persist newly created day entry (only once)
  if (withDay !== state) {
    saveState(withDay);
  }

  const mutate = (fn: (s: typeof withDay) => typeof withDay) => {
    const current = loadState();
    const next = fn(current);
    saveState(next);
    setTick((x) => x + 1);
  };

  const startSession = (templateId: string) => {
    mutate((s0) => {
      const plan0 = getMonth(s0, ym);
      if (!plan0) return s0;

      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      if (day0.activeSessionId) return withDay0;

      const sessionId = makeId("sess");
      const startedAt = new Date().toISOString();
      const session = {
        id: sessionId,
        date: dateSafe,
        ym,
        templateId,
        startedAt,
      };

      let next = addSession(withDay0, session);
      next = updateDay(next, { ...day0, activeSessionId: sessionId });

      const templateTitle = plan0.templates.find((t) => t.id === templateId)?.title ?? "Focus session";
      const event: DayLogEvent = {
        id: makeId("evt"),
        at: startedAt,
        kind: "FOCUS",
        text: `▶ Started: ${templateTitle}`,
      };
      next = appendDayEvent(next, dateSafe, event);
      return next;
    });
  };

  const endSession = () => {
    mutate((s0) => {
      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      if (!day0.activeSessionId) return withDay0;

      const session0 = withDay0.sessions.find((s) => s.id === day0.activeSessionId);
      if (!session0?.startedAt) return withDay0;

      const plan0 = getMonth(withDay0, ym);
      const endedAt = new Date().toISOString();
      const ms = Date.parse(endedAt) - Date.parse(session0.startedAt);
      const minutes = Math.max(0, Math.round(ms / 60000));

      let next = updateSession(withDay0, day0.activeSessionId, { endedAt, actualMinutes: minutes });
      next = updateDay(next, { ...day0, activeSessionId: undefined });

      const templateTitle = plan0?.templates.find((t) => t.id === session0.templateId)?.title ?? "Focus session";
      const event: DayLogEvent = {
        id: makeId("evt"),
        at: endedAt,
        kind: "FOCUS",
        text: `✓ Ended: ${templateTitle} (${minutes}m)`,
      };
      next = appendDayEvent(next, dateSafe, event);
      return next;
    });
  };

  const tasksById = useMemo(() => new Map(plan.tasks.map((t) => [t.id, t] as const)), [plan.tasks]);

  const completedMilestoneIds = useMemo(() => {
    return new Set(
      state.grandPlan?.milestones.filter((m) => m.status === "COMPLETED").map((m) => m.id) ?? []
    );
  }, [state.grandPlan]);

  const selectableTasks = useMemo(() => {
    return plan.tasks.filter((t) => !t.linkedMilestoneId || !completedMilestoneIds.has(t.linkedMilestoneId));
  }, [plan.tasks, completedMilestoneIds]);

  const selectableTaskIds = useMemo(() => new Set(selectableTasks.map((t) => t.id)), [selectableTasks]);

  // v2: Smart defaults - suggest YELLOW tasks as secondaries (shown in modal)
  const suggestedSecondaryIds = useMemo(() => {
    if (day.secondaryTaskIds.length > 0) return []; // Don't show suggestions if already has selections

    return selectableTasks
      .filter((t) => t.status === "YELLOW" && !t.parentId) // Top-level YELLOW tasks
      .slice(0, 3)
      .map((t) => t.id);
  }, [selectableTasks, day.secondaryTaskIds]);

  // v2: Working day activation
  const handleActivateDay = () => {
    mutate((s0) => {
      const next = activateWorkingDay(s0, dateSafe);
      const { day: nextDay } = getOrCreateDay(next, dateSafe, ym);
      if (!nextDay.startedAt) return next;
      const event: DayLogEvent = {
        id: makeId("evt"),
        at: nextDay.startedAt,
        kind: "SYSTEM",
        text: "Day started",
      };
      return appendDayEvent(next, dateSafe, event);
    });
    setShowActivateModal(false);
  };

  const sessionsForDate = useMemo(
    () => state.sessions.filter((s) => s.date === dateSafe),
    [state.sessions, dateSafe]
  );

  const activeTemplateId = useMemo(() => {
    if (!day.activeSessionId) return undefined;
    const session = state.sessions.find((s) => s.id === day.activeSessionId);
    return session?.templateId;
  }, [state.sessions, day.activeSessionId]);

  const scheduledTemplatesForTimeline = useMemo(() => {
    const milestonesById = new Map(state.grandPlan?.milestones.map((m) => [m.id, m] as const) ?? []);
    const categoriesById = new Map(state.grandPlan?.categories.map((c) => [c.id, c] as const) ?? []);

    return plan.templates
      .filter((t) => isTemplateScheduledForWeekday(t.daysOfWeek, weekday))
      .filter((t) => !t.isSuspended)
      .filter((t) => {
        const linked = typeof t.linkedMilestoneId === "string" ? t.linkedMilestoneId : null;
        return !linked || !completedMilestoneIds.has(linked);
      })
      .map((t) => {
        const linked = typeof t.linkedMilestoneId === "string" ? t.linkedMilestoneId : null;
        const milestone = linked ? milestonesById.get(linked) : undefined;
        const category = milestone ? categoriesById.get(milestone.categoryId) : undefined;
        const color = category?.color ?? (linked ? APP_MAIN_COLOR : "#607d8b");
        return {
          id: t.id,
          title: t.title,
          plannedStart: t.plannedStart,
          plannedEnd: t.plannedEnd,
          color,
        };
      });
  }, [plan.templates, state.grandPlan, weekday, completedMilestoneIds]);

  const eligibleFocusTemplates = useMemo(() => {
    return plan.templates.filter((t) => {
      const linked = typeof t.linkedMilestoneId === "string" ? t.linkedMilestoneId : null;
      if (linked && completedMilestoneIds.has(linked)) return false;
      if (t.isSuspended && t.id !== activeTemplateId) return false;
      return true;
    });
  }, [plan.templates, completedMilestoneIds, activeTemplateId]);

  const eligibleFocusTemplatesTodayCount = useMemo(() => {
    return eligibleFocusTemplates.filter((t) => isTemplateScheduledForWeekday(t.daysOfWeek, weekday)).length;
  }, [eligibleFocusTemplates, weekday]);

  const handleTaskSelectionConfirm = (primaryId: string | undefined, secondaryIds: string[]) => {
    mutate((s0) => {
      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);

      const safePrimaryId = primaryId && selectableTaskIds.has(primaryId) ? primaryId : undefined;
      const safeSecondaryIds = (secondaryIds ?? [])
        .filter((id) => selectableTaskIds.has(id))
        .filter((id) => id !== safePrimaryId);

      const prevPrimaryId = day0.primaryTaskId ?? undefined;
      const prevSet = new Set<string>([
        ...(day0.primaryTaskId ? [day0.primaryTaskId] : []),
        ...(day0.secondaryTaskIds ?? []),
      ]);
      const nextSet = new Set<string>([
        ...(safePrimaryId ? [safePrimaryId] : []),
        ...(safeSecondaryIds ?? []),
      ]);

      let next = setDayTasks(withDay0, dateSafe, safePrimaryId, safeSecondaryIds);

      const at = new Date().toISOString();
      if (safePrimaryId && safePrimaryId !== prevPrimaryId) {
        const title = tasksById.get(safePrimaryId)?.title ?? "Task";
        next = appendDayEvent(next, dateSafe, {
          id: makeId("evt"),
          at,
          kind: "TASK",
          text: `Primary set: ${title}`,
        });
      }

      const added = [...nextSet].filter((id) => !prevSet.has(id));
      for (const id of added) {
        if (id === safePrimaryId && safePrimaryId && safePrimaryId !== prevPrimaryId) continue;
        const title = tasksById.get(id)?.title ?? "Task";
        next = appendDayEvent(next, dateSafe, {
          id: makeId("evt"),
          at,
          kind: "TASK",
          text: `+ Added: ${title}`,
        });
      }

      return next;
    });
    setShowTaskModal(false);
  };

  // v2: Last working day info (not just previous day)
  const lastWorkingDay = useMemo(() => findLastWorkingDay(state, dateSafe, ym), [state, dateSafe, ym]);

  const setOutcome = (taskId: string, outcome: "COMPLETED" | "NOT_COMPLETED" | undefined) => {
    mutate((s0) => {
      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      const prev = day0.outcomeByTaskId?.[taskId];
      let next = setTaskOutcome(withDay0, dateSafe, taskId, outcome);
      if (outcome && prev !== outcome) {
        const title = tasksById.get(taskId)?.title ?? "Task";
        const text = outcome === "COMPLETED" ? `✓ Completed: ${title}` : `⏳ In progress: ${title}`;
        next = appendDayEvent(next, dateSafe, {
          id: makeId("evt"),
          at: new Date().toISOString(),
          kind: "TASK",
          text,
        });
      }
      return next;
    });
  };

  const updateJournal = (text: string) => {
    mutate((s0) => setDailyJournal(s0, dateSafe, text || undefined));
  };

  const updateShutdown = (text: string) => {
    mutate((s0) => setShutdownNote(s0, dateSafe, text || undefined));
  };

  // v4: Close/Reopen day handlers
  const handleCloseDay = () => {
    mutate((s0) => closeDay(s0, dateSafe));
    setShowCloseModal(false);
  };

  const handleReopenDay = () => {
    mutate((s0) => reopenDay(s0, dateSafe));
  };

  // v4: Meeting handlers
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<MeetingEntry | undefined>();

  const dayMeetings = useMemo(
    () => getMeetingsForDate(state.meetings, dateSafe),
    [state.meetings, dateSafe]
  );

  const handleSaveMeeting = (meetingData: Omit<MeetingEntry, "id" | "createdAt">) => {
    mutate((s0) => {
      if (editingMeeting) {
        return updateMeeting(s0, editingMeeting.id, meetingData);
      } else {
        const meeting: MeetingEntry = {
          ...meetingData,
          id: makeId("meeting"),
          createdAt: new Date().toISOString(),
        };
        return addMeeting(s0, meeting);
      }
    });
    setShowMeetingForm(false);
    setEditingMeeting(undefined);
  };

  const handleDeleteMeeting = (meetingId: string) => {
    if (confirm("Delete this meeting?")) {
      mutate((s0) => deleteMeeting(s0, meetingId));
    }
  };

  const handleToggleAttended = (meetingId: string) => {
    mutate((s0) => {
      const meeting0 = s0.meetings.find((m) => m.id === meetingId);
      const willBeAttended = !(meeting0?.attended ?? false);
      let next = toggleMeetingAttended(s0, meetingId);
      if (willBeAttended && meeting0) {
        next = appendDayEvent(next, dateSafe, {
          id: makeId("evt"),
          at: new Date().toISOString(),
          kind: "MEETING",
          text: `✓ Attended: ${meeting0.title}`,
        });
      }
      return next;
    });
  };

  // v4: If day is closed, show journal-style read-only view
  if (day.isClosed && day.isWorkingDay) {
    const startedAtTime = day.startedAt ? formatTime(day.startedAt) : "—";
    const endedAtTime = day.endedAt ? formatTime(day.endedAt) : "—";
    const endedAtDate = day.endedAt ? day.endedAt.slice(0, 10) : undefined;

    const completedTasks = [
      day.primaryTaskId ? { id: day.primaryTaskId, isPrimary: true } : null,
      ...day.secondaryTaskIds.map((id) => ({ id, isPrimary: false })),
    ]
      .filter((t): t is { id: string; isPrimary: boolean } => t !== null)
      .filter((t) => day.outcomeByTaskId[t.id] === "COMPLETED" || day.outcomeByTaskId[t.id] === "NOT_COMPLETED");

    const completedSessions = state.sessions.filter((s) => s.date === dateSafe && s.endedAt);

    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#fef9e7",
          padding: "32px 24px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", marginBottom: 8, fontSize: 28, color: "#5d4037" }}>
            Daily Report
          </h2>
          <p style={{ textAlign: "center", marginBottom: 32, opacity: 0.7, fontSize: 16 }}>
            {dateSafe}
          </p>

          <div
            style={{
              marginBottom: 28,
              padding: "12px 14px",
              backgroundColor: "rgba(255,255,255,0.9)",
              border: "1px solid #e0d7cf",
              borderRadius: 10,
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, color: "#5d4037" }}>
              <span style={{ fontWeight: 700 }}>Started:</span> {startedAtTime}
            </div>
            <div style={{ fontSize: 13, color: "#5d4037" }}>
              <span style={{ fontWeight: 700 }}>Ended:</span> {endedAtTime}
              {endedAtDate && endedAtDate !== dateSafe ? (
                <span style={{ marginLeft: 6, opacity: 0.75 }}>({endedAtDate})</span>
              ) : null}
            </div>
          </div>

          {/* Completed Tasks Section */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 20, marginBottom: 16, color: "#5d4037", borderBottom: "2px solid #d7ccc8", paddingBottom: 8 }}>
              Tasks Completed / In Progress
            </h3>
            {completedTasks.length === 0 ? (
              <p style={{ fontStyle: "italic", opacity: 0.6 }}>No tasks logged for this day</p>
            ) : (
              <ul style={{ listStyleType: "none", padding: 0, margin: 0 }}>
                {completedTasks.map((t) => {
                  const task = tasksById.get(t.id);
                  const outcome = day.outcomeByTaskId[t.id];
                  return (
                    <li
                      key={t.id}
                      style={{
                        marginBottom: 12,
                        padding: "8px 12px",
                        backgroundColor: outcome === "COMPLETED" ? "#e8f5e9" : "#fff3e0",
                        border: `1px solid ${outcome === "COMPLETED" ? "#4caf50" : "#ff9800"}`,
                        borderRadius: 4,
                      }}
                    >
                      <span style={{ fontWeight: t.isPrimary ? 700 : 500 }}>
                        {outcome === "COMPLETED" ? "✓" : "⏳"} {task?.title ?? "Unknown Task"}
                      </span>
                      {t.isPrimary && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "#f57c00", fontWeight: 600 }}>
                          [PRIMARY]
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Daily Journal Section */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 20, marginBottom: 16, color: "#5d4037", borderBottom: "2px solid #d7ccc8", paddingBottom: 8 }}>
              Daily Journal
            </h3>
            {day.dailyJournal ? (
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, fontSize: 15 }}>
                {day.dailyJournal}
              </div>
            ) : (
              <p style={{ fontStyle: "italic", opacity: 0.6 }}>No journal entry for this day</p>
            )}
          </div>

          {/* Shutdown Note Section */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 20, marginBottom: 16, color: "#5d4037", borderBottom: "2px solid #d7ccc8", paddingBottom: 8 }}>
              Shutdown Note
            </h3>
            {day.shutdownNote ? (
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, fontSize: 15 }}>
                {day.shutdownNote}
              </div>
            ) : (
              <p style={{ fontStyle: "italic", opacity: 0.6 }}>No shutdown note for this day</p>
            )}
          </div>

          {/* Meetings Section */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 20, marginBottom: 16, color: "#5d4037", borderBottom: "2px solid #d7ccc8", paddingBottom: 8 }}>
              Meetings
            </h3>
            {dayMeetings.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                {dayMeetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    style={{
                      padding: "8px 12px",
                      backgroundColor: meeting.attended ? "#e8f5e9" : "#fff3e0",
                      border: `1px solid ${meeting.attended ? "#4caf50" : "#ff9800"}`,
                      borderRadius: 4,
                      fontSize: 14,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>
                          {meeting.attended ? "✓" : "⏳"} {meeting.title}
                        </span>
                        <span style={{ marginLeft: 8, opacity: 0.7 }}>({meeting.time})</span>
                      </div>
                    </div>
                    {meeting.description && (
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8, whiteSpace: "pre-wrap" }}>
                        {meeting.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontStyle: "italic", opacity: 0.6 }}>No meetings scheduled for this day</p>
            )}
          </div>

          {/* Focus Sessions Summary */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 20, marginBottom: 16, color: "#5d4037", borderBottom: "2px solid #d7ccc8", paddingBottom: 8 }}>
              Focus Sessions
            </h3>
            {completedSessions.length > 0 ? (
              <>
                <div style={{ display: "grid", gap: 8 }}>
                  {completedSessions.map((session) => {
                    const template = plan?.templates.find((t) => t.id === session.templateId);
                    return (
                      <div
                        key={session.id}
                        style={{
                          padding: "8px 12px",
                          backgroundColor: "#e3f2fd",
                          border: "1px solid #90caf9",
                          borderRadius: 4,
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 14,
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{template?.title ?? "Unknown Session"}</span>
                        <span style={{ opacity: 0.8 }}>{session.actualMinutes} min</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600, color: "#5d4037" }}>
                  Total: {completedSessions.reduce((sum, s) => sum + (s.actualMinutes || 0), 0)} minutes
                </div>
              </>
            ) : (
              <p style={{ fontStyle: "italic", opacity: 0.6 }}>No focus sessions recorded for this day</p>
            )}
          </div>

          {/* Reopen Day Button */}
          <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: "1px solid #d7ccc8" }}>
            <button
              onClick={handleReopenDay}
              style={{
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            >
              🔓 Reopen Day for Editing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Daily</h2>
            <p style={{ margin: "8px 0 0", opacity: 0.7 }}>
              {dateSafe} · Plan your day, track focus sessions, and reflect on progress
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          border: "2px solid #eee",
          borderRadius: 12,
          padding: 20,
          backgroundColor: paperBgColor,
          backgroundImage: paperBgPattern,
          backgroundSize: "24px 24px",
          minHeight: 300,
        }}
      >
        {/* v2: Message from Last Working Day - Shutdown note */}
        <div
          style={{
            border: "2px solid #eee",
            borderLeft: `6px solid ${APP_MAIN_COLOR}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            backgroundColor: "rgba(255,255,255,0.92)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 12, color: "#333" }}>
            💌 Message from your yesterday self
          </h3>
          {lastWorkingDay?.shutdownNote ? (
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, marginBottom: 12 }}>
              {lastWorkingDay.shutdownNote}
            </div>
          ) : (
            <p style={{ fontStyle: "italic", color: "#666", marginBottom: 12 }}>
              Nothing pending from yesterday. Fresh start! Have a great day! 🌟
            </p>
          )}
          {lastWorkingDay && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
              From: {lastWorkingDay.date} (last working day)
            </div>
          )}
        </div>

        {/* v2: If day is not activated, show only activation button */}
        {!day.isWorkingDay ? (
          <div
            style={{
              textAlign: "center",
              padding: 48,
              border: "2px dashed #ddd",
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.92)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
          <p style={{ fontSize: 18, marginBottom: 24, opacity: 0.8 }}>
            Ready to start your working day?
          </p>
          <button
            onClick={() => setShowActivateModal(true)}
            style={{
              padding: "16px 32px",
              fontSize: 18,
              fontWeight: 600,
              backgroundColor: "#4caf50",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            }}
          >
            🚀 Start Working Day
          </button>

          {/* Activation Confirmation Modal */}
          {showActivateModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={() => setShowActivateModal(false)}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 400,
                  boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>⚠️ Activate Working Day</h3>
                <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
                  This will mark <strong>{dateSafe}</strong> as a working day. This action <strong>cannot be undone</strong>.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setShowActivateModal(false)}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      backgroundColor: "white",
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleActivateDay}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      backgroundColor: "#4caf50",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    ✓ Activate
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
	          {/* All sections below only show when day is activated */}
	
	          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
	            <div
	              ref={leftColumnRef}
	              style={{
	                flex: "3 1 620px",
	                minWidth: 380,
	                border: "2px solid #eee",
	                borderRadius: 12,
	                padding: 16,
	                backgroundColor: "rgba(255,255,255,0.92)",
	                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
	              }}
	            >
	          {/* v4: Daily Reminders Section */}
	          <div style={{ marginBottom: 24 }}>
	            <div
	              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <p style={{ fontSize: 15, lineHeight: 1.6, color: "#555", margin: 0 }}>
                Hey! Before diving in, just a quick reminder to:
              </p>

              {!isEditingReminders ? (
                <button
                  onClick={() => {
                    setReminderDraft(state.dailyReminderTemplates);
                    setIsEditingReminders(true);
                  }}
                  style={{
                    padding: "4px 8px",
                    fontSize: 14,
                    backgroundColor: "white",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    cursor: "pointer",
                    opacity: 0.9,
                  }}
                  title="Edit reminders"
                >
                  ✏️
                </button>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      setIsEditingReminders(false);
                      setReminderDraft([]);
                    }}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      backgroundColor: "white",
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const cleaned = reminderDraft
                        .map((r) => ({ ...r, text: r.text.trim() }))
                        .filter((r) => r.text.length > 0);
                      mutate((s0) => setDailyReminderTemplates(s0, cleaned));
                      setIsEditingReminders(false);
                      setReminderDraft([]);
                    }}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: "#4caf50",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>

            {!isEditingReminders ? (
              state.dailyReminderTemplates.length === 0 ? (
                <p style={{ fontSize: 13, color: "#999", fontStyle: "italic", margin: 0 }}>
                  No reminders set. Click ✏️ to add some.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginLeft: 8 }}>
                  {state.dailyReminderTemplates.map((reminder) => (
                    <label
                      key={reminder.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        fontSize: 15,
                      }}
                    >
	                      <input
	                        type="checkbox"
	                        checked={day.reminderCheckedById?.[reminder.id] ?? false}
	                        onChange={() => {
	                          mutate((s0) => {
	                            const { day: day0 } = getOrCreateDay(s0, dateSafe, ym);
	                            const wasChecked = day0.reminderCheckedById?.[reminder.id] ?? false;
	                            const willBeChecked = !wasChecked;
	                            let next = toggleReminderChecked(s0, dateSafe, reminder.id);
	                            if (willBeChecked) {
	                              next = appendDayEvent(next, dateSafe, {
	                                id: makeId("evt"),
	                                at: new Date().toISOString(),
	                                kind: "REMINDER",
	                                text: reminder.text,
	                              });
	                            }
	                            return next;
	                          });
	                        }}
	                        style={{
	                          width: 18,
	                          height: 18,
                          cursor: "pointer",
                        }}
                      />
                      <span>{reminder.text}</span>
                    </label>
                  ))}
                </div>
              )
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginLeft: 8 }}>
                {reminderDraft.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#999", fontStyle: "italic", margin: 0 }}>
                    No reminders yet. Add one below.
                  </p>
                ) : (
                  reminderDraft.map((reminder) => (
                    <div
                      key={reminder.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <input
                        type="text"
                        value={reminder.text}
                        onChange={(e) => {
                          const nextText = e.target.value;
                          setReminderDraft((prev) =>
                            prev.map((r) => (r.id === reminder.id ? { ...r, text: nextText } : r))
                          );
                        }}
                        placeholder="Reminder text…"
                        style={{
                          flex: 1,
                          padding: "8px 10px",
                          fontSize: 14,
                          border: "1px solid #ddd",
                          borderRadius: 8,
                        }}
                      />
                      <button
                        onClick={() => {
                          setReminderDraft((prev) => prev.filter((r) => r.id !== reminder.id));
                        }}
                        style={{
                          padding: "6px 10px",
                          fontSize: 12,
                          backgroundColor: "white",
                          color: "#d9534f",
                          border: "1px solid #ddd",
                          borderRadius: 8,
                          cursor: "pointer",
                        }}
                        title="Delete reminder"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}

                <button
                  onClick={() => {
                    setReminderDraft((prev) => [...prev, { id: makeId("rem"), text: "" }]);
                  }}
                  style={{
                    alignSelf: "flex-start",
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: "white",
                    color: "#666",
                    border: "2px dashed #ccc",
                    borderRadius: 8,
                    cursor: "pointer",
                    marginTop: 4,
                  }}
                >
                  + Add Reminder
                </button>
              </div>
            )}
          </div>

          <h3>🎯 Daily Tasks</h3>

          {/* v2: Task Selection Modal */}
          {showTaskModal && (
            <TaskSelectionModal
              tasks={selectableTasks}
              currentPrimaryId={day.primaryTaskId}
              currentSecondaryIds={day.secondaryTaskIds}
              onConfirm={handleTaskSelectionConfirm}
              onCancel={() => setShowTaskModal(false)}
              suggestedSecondaryIds={suggestedSecondaryIds}
            />
          )}

          {/* Selected Tasks Display */}
          {!day.primaryTaskId ? (
            <div style={{ textAlign: "center", padding: 32, border: "2px dashed #ddd", borderRadius: 8 }}>
              <p style={{ opacity: 0.6, marginBottom: 16 }}>No tasks selected for today</p>
              <button
                onClick={() => setShowTaskModal(true)}
                style={{
                  padding: "12px 24px",
                  fontSize: 16,
                  fontWeight: 600,
                  backgroundColor: "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                📝 Choose Daily Tasks
              </button>
            </div>
          ) : (
            <div>
	              {/* Primary Task - Gold Rectangle */}
	              <div
	            style={{
	              border: "2px solid #eee",
	              borderLeft: `6px solid ${APP_MAIN_COLOR}`,
	              borderRadius: 12,
	              padding: 16,
	              marginBottom: 16,
	              backgroundColor: "#fff8e1",
	              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
	            }}
	          >
            <div style={{ marginBottom: 12 }}>
	              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
	                {tasksById.get(day.primaryTaskId)?.title ?? "Unknown"}
	              </div>
	            </div>

            {/* Outcome Buttons for Primary */}
            {day.primaryTaskId && (() => {
              const task = tasksById.get(day.primaryTaskId);
              const isGreen = task?.status === "GREEN";
              const isYellow = task?.status === "YELLOW";
              return (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#666" }}>
                    Update status:
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setOutcome(day.primaryTaskId!, "COMPLETED")}
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        fontWeight: 600,
                        backgroundColor: isGreen ? "#4caf50" : "white",
                        color: isGreen ? "white" : "#4caf50",
                        border: `2px solid #4caf50`,
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      ✓ Completed
                    </button>
                    <button
                      onClick={() => setOutcome(day.primaryTaskId!, "NOT_COMPLETED")}
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        fontWeight: 600,
                        backgroundColor: isYellow ? "#ff9800" : "white",
                        color: isYellow ? "white" : "#ff9800",
                        border: `2px solid #ff9800`,
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      ⏳ Work in Progress
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Secondary Tasks */}
          {day.secondaryTaskIds.length > 0 && (
            <div style={{ marginBottom: 16 }}>
	              <div style={{ display: "grid", gap: 8 }}>
                {day.secondaryTaskIds.map((id) => {
                  const task = tasksById.get(id);
                  if (!task) return null;
                  return (
                    <div
	                      key={id}
	                      style={{
	                        border: "2px solid #eee",
	                        borderLeft: `6px solid ${APP_MAIN_COLOR}`,
	                        borderRadius: 12,
	                        padding: 16,
	                        backgroundColor: "rgba(255,255,255,0.92)",
	                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
	                      }}
	                    >
	                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
	                        <div style={{ fontWeight: 500 }}>{task.title}</div>
	                      </div>

                      {/* Outcome Buttons */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setOutcome(id, "COMPLETED")}
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: task.status === "GREEN" ? "#4caf50" : "white",
                            color: task.status === "GREEN" ? "white" : "#4caf50",
                            border: `1.5px solid #4caf50`,
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          ✓ Completed
                        </button>
                        <button
                          onClick={() => setOutcome(id, "NOT_COMPLETED")}
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: task.status === "YELLOW" ? "#ff9800" : "white",
                            color: task.status === "YELLOW" ? "white" : "#ff9800",
                            border: `1.5px solid #ff9800`,
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          ⏳ In Progress
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edit Tasks Button */}
          <button
            onClick={() => setShowTaskModal(true)}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: "white",
              border: "1px solid #ddd",
              borderRadius: 6,
              cursor: "pointer",
              marginBottom: 16,
            }}
          >
            ✏️ Edit Task Selection
          </button>
            </div>
          )}

          {/* v4: Meetings Section */}
          <h3 style={{ marginTop: 32 }}>📅 Meetings</h3>
          <div style={{ marginBottom: 24 }}>
	            {dayMeetings.length === 0 ? (
	              <div
	                style={{
	                  textAlign: "center",
	                  padding: 24,
	                  border: "2px dashed #ddd",
	                  borderRadius: 8,
	                  backgroundColor: "rgba(255,255,255,0.92)",
	                }}
	              >
	                <p style={{ opacity: 0.6, marginBottom: 12 }}>No meetings scheduled</p>
		                <button
		                  onClick={() => setShowMeetingForm(true)}
		                  style={{
		                    padding: "8px 16px",
		                    fontSize: 14,
		                    fontWeight: 600,
		                    backgroundColor: "white",
		                    color: "#666",
		                    border: "2px dashed #ccc",
		                    borderRadius: 8,
		                    cursor: "pointer",
		                  }}
		                >
		                  + Add Meeting
	                </button>
	              </div>
            ) : (
              <>
                <div style={{ display: "grid", gap: 12 }}>
                  {dayMeetings.map((meeting) => (
		                    <div
		                      key={meeting.id}
		                      style={{
		                        border: "2px solid #eee",
				                        borderLeft: `6px solid ${APP_MAIN_COLOR}`,
			                        borderRadius: 12,
			                        padding: 16,
			                        backgroundColor: "rgba(255,255,255,0.92)",
			                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
		                      }}
		                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ flex: 1 }}>
		                          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
		                            {meeting.title}
		                          </div>
		                          <div style={{ fontSize: 14, color: "#333", opacity: 0.8, fontWeight: 600 }}>
		                            🕒 {meeting.time}
		                          </div>
		                          <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                cursor: "pointer",
                                fontSize: 13,
                                color: "#555",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={meeting.attended || false}
                                onChange={() => handleToggleAttended(meeting.id)}
                                style={{
                                  marginRight: 6,
                                  cursor: "pointer",
                                  width: 16,
                                  height: 16,
                                }}
                              />
                              Attended
                            </label>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => {
                              setEditingMeeting(meeting);
                              setShowMeetingForm(true);
                            }}
		                            style={{
		                              padding: "4px 10px",
		                              fontSize: 12,
		                              backgroundColor: "white",
		                              border: "1px solid #ddd",
		                              borderRadius: 4,
		                              cursor: "pointer",
		                              opacity: 0.9,
		                            }}
		                          >
		                            ✏️ Edit
		                          </button>
                          <button
                            onClick={() => handleDeleteMeeting(meeting.id)}
                            style={{
                              padding: "4px 10px",
                              fontSize: 12,
                              backgroundColor: "white",
                              border: "1px solid #f44336",
                              color: "#f44336",
                              borderRadius: 4,
                              cursor: "pointer",
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {meeting.link && (
                        <div style={{ marginBottom: 8 }}>
                          <a
                            href={meeting.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#1976d2",
                              fontSize: 13,
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            🔗 Join Meeting
                          </a>
                        </div>
                      )}

                      {meeting.description && (
                        <div
		                          style={{
		                            fontSize: 13,
		                            color: "#555",
		                            whiteSpace: "pre-wrap",
		                            marginTop: 8,
		                            paddingTop: 8,
		                            borderTop: "1px solid #eee",
		                          }}
		                        >
		                          {meeting.description}
		                        </div>
		                      )}
                    </div>
                  ))}
                </div>

		                <button
		                  onClick={() => setShowMeetingForm(true)}
		                  style={{
		                    padding: "8px 16px",
		                    fontSize: 14,
		                    fontWeight: 600,
		                    backgroundColor: "white",
		                    color: "#666",
		                    border: "2px dashed #ccc",
		                    borderRadius: 8,
		                    cursor: "pointer",
		                    marginTop: 12,
		                  }}
		                >
	                  + Add Another Meeting
	                </button>
              </>
            )}
          </div>

          {/* Meeting Form Modal */}
          {showMeetingForm && (
            <MeetingFormModal
              date={dateSafe}
              meeting={editingMeeting}
              onSave={handleSaveMeeting}
              onCancel={() => {
                setShowMeetingForm(false);
                setEditingMeeting(undefined);
              }}
            />
          )}

          {/* v6.3: Focus Sessions - Grouped by milestone */}
          {plan.templates.length === 0 ? (
            <>
              <h3 style={{ marginTop: 32 }}>⏱️ Focus Sessions</h3>
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 13, color: "#999", fontStyle: "italic" }}>
                  No focus templates defined. Add templates in Month Setup.
                </p>
              </div>
            </>
          ) : eligibleFocusTemplates.length === 0 ? null : (
            <>
              <h3 style={{ marginTop: 32 }}>⏱️ Focus Sessions</h3>
              <div style={{ marginBottom: 24 }}>
                {/* Sessions grouped by milestone */}
                {getMilestonesInMonth(state, ym)
                  .filter((milestone) => milestone.status !== "COMPLETED")
                  .map((milestone) => {
                    const category = state.grandPlan?.categories.find((c) => c.id === milestone.categoryId);
                    const milestoneTemplates = getTemplatesForMilestone(state, ym, milestone.id).filter((t) =>
                      isTemplateScheduledForWeekday(t.daysOfWeek, weekday)
                    );
	                    const visibleMilestoneTemplates = milestoneTemplates.filter(
	                      (t) => !t.isSuspended || t.id === activeTemplateId
	                    );
	                    if (visibleMilestoneTemplates.length === 0) return null;
	                    const categoryColor = category?.color ?? APP_MAIN_COLOR;
	                    return (
	                      <div key={milestone.id} style={{ marginBottom: 16 }}>
	                        {visibleMilestoneTemplates.map((template) => (
	                          <FocusTemplateCard
	                            key={template.id}
	                            template={template}
	                            accentColor={categoryColor}
	                            milestoneTitle={milestone.title}
	                            activeSessionId={day.activeSessionId}
	                            completedSessions={sessionsForDate}
	                            onStartSession={startSession}
	                            onEndSession={endSession}
	                          />
                        ))}
                      </div>
                    );
                  })}

                {/* Standalone templates */}
                {(() => {
                  const standaloneTemplates = getStandaloneTemplates(state, ym).filter((t) =>
                    isTemplateScheduledForWeekday(t.daysOfWeek, weekday)
                  );
                  const visibleStandaloneTemplates = standaloneTemplates.filter(
                    (t) => !t.isSuspended || t.id === activeTemplateId
                  );
                  if (visibleStandaloneTemplates.length === 0) return null;
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#607d8b",
                          marginBottom: 8,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            backgroundColor: "#607d8b",
                            display: "inline-block",
                          }}
                        />
                        Standalone Sessions
                      </div>
                      {visibleStandaloneTemplates.map((template) => (
                        <FocusTemplateCard
                          key={template.id}
                          template={template}
                          activeSessionId={day.activeSessionId}
                          completedSessions={sessionsForDate}
                          onStartSession={startSession}
                          onEndSession={endSession}
                        />
                      ))}
                    </div>
                  );
                })()}

                {/* Show message if eligible templates exist, but none are scheduled for today */}
                {eligibleFocusTemplatesTodayCount === 0 && (
                  <p style={{ fontSize: 13, color: "#999", fontStyle: "italic" }}>
                    No focus templates scheduled for today. Edit templates in Month Setup to assign weekdays.
                  </p>
                )}
              </div>
            </>
          )}

            </div>
            <div style={{ flex: "2 1 420px", minWidth: 320 }}>
              <DailyTimeline
                date={dateSafe}
                meetings={dayMeetings}
                scheduledTemplates={scheduledTemplatesForTimeline}
                sessions={sessionsForDate}
                matchHeightPx={leftColumnHeightPx}
              />
            </div>
          </div>

	          <div
	            style={{
	              marginTop: 24,
	              border: "2px solid #eee",
	              borderRadius: 12,
	              padding: 16,
	              backgroundColor: "rgba(255,255,255,0.92)",
	              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
	            }}
	          >
	            {/* v2: Daily Journal - Persistent notes */}
	            <h3 style={{ marginTop: 0 }}>📝 Daily Journal</h3>
	            <textarea
	              rows={12}
	              placeholder="Daily notes, thoughts, observations..."
	              value={day.dailyJournal ?? ""}
	              onChange={(e) => updateJournal(e.target.value)}
	              style={{
	                padding: 10,
	                fontSize: 14,
	                lineHeight: 1.6,
	                width: "100%",
	                boxSizing: "border-box",
	                border: "1px solid #ddd",
	                borderRadius: 10,
	                backgroundColor: "white",
	              }}
	            />

            {/* v2: Shutdown Note - Full shutdown summary */}
            <h3 style={{ marginTop: 24 }}>🔒 Shutdown Note</h3>
            <p style={{ fontSize: 13, color: "#666", marginTop: 0 }}>
              Complete shutdown summary (shown next working day)
            </p>
	            <textarea
	              rows={4}
	              placeholder="Full shutdown summary, reflections, detailed notes..."
	              value={day.shutdownNote ?? ""}
	              onChange={(e) => updateShutdown(e.target.value)}
	              style={{
	                padding: 10,
	                fontSize: 14,
	                lineHeight: 1.6,
	                width: "100%",
	                boxSizing: "border-box",
	                border: "1px solid #ddd",
	                borderRadius: 10,
	                backgroundColor: "white",
	              }}
	            />

          {/* v4: Close Day Button */}
          <div style={{ marginTop: 28, textAlign: "center" }}>
            <button
              onClick={() => setShowCloseModal(true)}
              style={{
                padding: "16px 32px",
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: APP_MAIN_COLOR,
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
              }}
            >
              🔒 Close Day
            </button>
            <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
              Mark the day as complete and lock it for viewing
            </p>
          </div>

          {/* Close Day Confirmation Modal */}
          {showCloseModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={() => setShowCloseModal(false)}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 400,
                  boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>🔒 Close Working Day</h3>
                <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
                  This will close <strong>{dateSafe}</strong> and convert the page into a read-only journal view.
                  Any active sessions will be ended. You can reopen the day later if you need to make changes.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setShowCloseModal(false)}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      backgroundColor: "white",
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCloseDay}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      backgroundColor: APP_MAIN_COLOR,
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    ✓ Close Day
                  </button>
                </div>
              </div>
            </div>
          )}

	          </div>
	        </>
	      )}
      </div>
    </div>
  );
}
