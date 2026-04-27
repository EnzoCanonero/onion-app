import { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import type { MeetingEntry, DailyReminderTemplate, DayLogEvent, DateISO, YM, FocusTemplate, TaskNode, MeetingEditScope } from "../app/types";
import {
  loadState,
  saveState,
  getMonth,
  getAllTasks,
  getTaskById,
  getTasksForMonth,
  getOrCreateDay,
  ymFromDate,
  makeId,
  addSession,
  updateDay,
  updateSession,
  setDayTasks,
  setTaskOutcome,
  updateTask,
  setDailyJournal,
  setShutdownNote,
  findLastWorkingDay,
  activateWorkingDay,
  closeDay,
  autoCloseDay,
  reopenDay,
  addMeetingWithRecurrence,
  updateMeeting,
  deleteMeeting,
  updateMeetingThisAndFuture,
  deleteMeetingThisAndFuture,
  getMeetingsForDate,
  toggleMeetingAttended,
  setMeetingSkipped,
  setDailyReminderTemplates,
  toggleReminderChecked,
  getMilestonesInMonth,
  setFocusTemplateMilestoneForDay,
  setFocusTemplateOverrideForDay,
  clearFocusTemplateOverrideForDay,
  toggleFocusTemplateSkippedForDay,
  formatTime,
  appendDayEvent,
  upsertDayEvent,
  removeDayEvent,
  buildDayHistory,
  getFrozenTaskIds,
  getDeleteLockedTaskIds,
  getTitleLockedTaskIds,
  getTodayDate,
  addSubtask,
  deleteTask,
  getSubtasksForTask,
} from "../app/storage";
import { checkDateAccess } from "../app/dateAccess";
import { dayOfWeekFromDateISO, isTemplateScheduledForWeekday } from "../app/weekdays";
import { useDateNavigation } from "../contexts/DateNavigationContext";
import { getVirtualTimestamp } from "../contexts/VirtualClockContext";
import { APP_MAIN_COLOR, REPORT_THEME } from "../app/theme";
import { compareTaskGroupMeta, getCategoryMeta, getTaskGroupMeta } from "../app/reporting";
import TaskSelectionModal from "../components/TaskSelectionModal";
import PrimaryTaskSwitchModal from "../components/PrimaryTaskSwitchModal";
import AddSecondaryTasksModal from "../components/AddSecondaryTasksModal";
import FocusTemplateCard from "../components/FocusTemplateCard";
import DailyTimeline from "../components/DailyTimeline";
import EmptyMonthPanel from "../components/EmptyMonthPanel";
import MeetingFormModal from "../components/MeetingFormModal";
import PastUnactivatedDayPanel from "../components/PastUnactivatedDayPanel";
import PastUnactivatedMonthPanel from "../components/PastUnactivatedMonthPanel";
import TaskDetailModal from "../components/TaskDetailModal";
import DailyTaskCard from "../components/DailyTaskCard";
import type { TaskSubtaskItem } from "../components/TaskSubtasksSection";
import FutureDatePanel from "../components/FutureDatePanel";
import { ReportCard } from "../components/ReportCharts";
import { getShortUserName, getUserName } from "../app/userProfile";

type DailyAgendaPageProps = {
  tutorialMode?: boolean;
  onTutorialTick?: () => void;
  onWizardStateChange?: (info: {
    open: boolean;
    wizardStep: number;
    primarySelected: boolean;
    meetingCount: number;
    focusSessionCount: number;
  }) => void;
};

export default function DailyAgendaPage(props: DailyAgendaPageProps = {}) {
  const { tutorialMode, onTutorialTick, onWizardStateChange } = props;
  const { selectedDate } = useDateNavigation(); // From context
  const dateSafe = selectedDate;
  const ym = ymFromDate(dateSafe);

  const state = loadState();
  const plan = getMonth(state, ym);
  const paperBgColor = "#fbfaf7";
  const paperBgPattern =
    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)";

  const dateAccess = checkDateAccess(state, dateSafe);

  // Header component for blocked states
  const BlockedHeader = () => (
    <div style={{ marginBottom: 24, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
        <div />
        <div style={{ textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#111", letterSpacing: 0.2 }}>
            Daily
          </h2>
          <div
            style={{
              margin: "10px auto 0",
              width: 56,
              height: 4,
              borderRadius: 999,
            backgroundColor: APP_MAIN_COLOR,
            opacity: 0.9,
          }}
          />
        </div>
        <div />
      </div>
    </div>
  );

  // Check if this is a past date
  const today = getTodayDate();
  const isPastDate = dateSafe < today;

  // If date is not allowed (future), show blocked panel
  if (!dateAccess.allowed) {
    if (dateAccess.reason === "future") {
      return (
        <div>
          <BlockedHeader />
          <FutureDatePanel date={dateSafe} />
        </div>
      );
    }
  }

  if (!plan) {
    if (isPastDate) {
      return (
        <div>
          <BlockedHeader />
          <PastUnactivatedMonthPanel ym={ym} />
        </div>
      );
    }
    return (
      <div>
        <BlockedHeader />
        <EmptyMonthPanel date={dateSafe} />
      </div>
    );
  }

  return (
    <DailyAgendaPageContent
      dateSafe={dateSafe}
      ym={ym}
      tutorialMode={tutorialMode}
      onTutorialTick={onTutorialTick}
      onWizardStateChange={onWizardStateChange}
    />
  );
}

function DailyAgendaPageContent({
  dateSafe,
  ym,
  tutorialMode,
  onTutorialTick,
  onWizardStateChange,
}: {
  dateSafe: DateISO;
  ym: YM;
  tutorialMode?: boolean;
  onTutorialTick?: () => void;
  onWizardStateChange?: (info: {
    open: boolean;
    wizardStep: number;
    primarySelected: boolean;
    meetingCount: number;
    focusSessionCount: number;
  }) => void;
}) {
  const weekday = dayOfWeekFromDateISO(dateSafe);
  const shortName = getShortUserName(getUserName());

  const [tick, setTick] = useState(0);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAddSecondaryModal, setShowAddSecondaryModal] = useState(false);
  const [showPrimarySwitchModal, setShowPrimarySwitchModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [editingTaskNotes, setEditingTaskNotes] = useState("");
  const [editingTaskError, setEditingTaskError] = useState<string | null>(null);
  const [hideCompletedTasks, setHideCompletedTasks] = useState(false);
  const [showStartWizard, setShowStartWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [wizardTaskDraft, setWizardTaskDraft] = useState<{
    primaryId?: string;
    secondaryIds: string[];
  }>({ primaryId: undefined, secondaryIds: [] });
  const wizardTaskDraftRef = useRef(wizardTaskDraft);
  const prevShowStartWizardRef = useRef(false);
  const [isEditingReminders, setIsEditingReminders] = useState(false);
  const [reminderDraft, setReminderDraft] = useState<DailyReminderTemplate[]>([]);
  const rawState = useMemo(() => loadState(), [tick]);
  const paperBgColor = "#fbfaf7";
  const paperBgPattern =
    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)";

  // Check if this is a past date
  const today = getTodayDate();
  const isPastDate = dateSafe < today;

  const { state: withDay, day: initialDay } = getOrCreateDay(rawState, dateSafe, ym);
  const shouldAutoClose =
    isPastDate &&
    !initialDay.isClosed &&
    (initialDay.isWorkingDay === true || !!initialDay.activeSessionId);
  const state = shouldAutoClose ? autoCloseDay(withDay, dateSafe) : withDay;
  const { day } = getOrCreateDay(state, dateSafe, ym);
  const plan = getMonth(state, ym)!;

  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const [leftColumnHeightPx, setLeftColumnHeightPx] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!day.isWorkingDay || day.isClosed) {
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
  }, [day.isWorkingDay, day.isClosed, dateSafe]);

  // Persist newly created day entry (only once)
  if (withDay !== rawState && !shouldAutoClose) {
    saveState(withDay);
  }

  useEffect(() => {
    if (!shouldAutoClose) return;
    const current = loadState();
    const next = autoCloseDay(current, dateSafe);
    saveState(next);
    setTick((x) => x + 1);
  }, [shouldAutoClose, dateSafe]);

  useEffect(() => {
    if (!editingTaskId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTaskEditor();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingTaskId]);

  useEffect(() => {
    closeTaskEditor();
    setShowAddSecondaryModal(false);
    setShowPrimarySwitchModal(false);
  }, [dateSafe]);

  const mutate = (fn: (s: typeof withDay) => typeof withDay) => {
    const current = loadState();
    const next = fn(current);
    saveState(next);
    setTick((x) => x + 1);
    onTutorialTick?.();
  };

  const startSession = (templateId: string) => {
    mutate((s0) => {
      const plan0 = getMonth(s0, ym);
      if (!plan0) return s0;

      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      if (day0.activeSessionId) return withDay0;

      const sessionId = makeId("sess");
      const startedAt = getVirtualTimestamp();
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
      const endedAt = getVirtualTimestamp();
      const ms = Date.parse(endedAt) - Date.parse(session0.startedAt);
      const minutes = Math.max(0, Math.round(ms / 60000));

      let next = updateSession(withDay0, day0.activeSessionId, { endedAt, actualMinutes: minutes });
      next = updateDay(next, { ...day0, activeSessionId: undefined });

      const templateTitle = plan0?.templates.find((t) => t.id === session0.templateId)?.title ?? "Focus session";
      const event: DayLogEvent = {
        id: makeId("evt"),
        at: endedAt,
        kind: "FOCUS",
        text: `■ Ended: ${templateTitle} (${minutes}m)`,
      };
      next = appendDayEvent(next, dateSafe, event);
      return next;
    });
  };

  const allTasks = useMemo(() => getAllTasks(state), [state]);
  const monthTasks = useMemo(() => getTasksForMonth(state, ym), [state, ym]);
  const tasksById = useMemo(() => new Map(allTasks.map((t) => [t.id, t] as const)), [allTasks]);
  const frozenTaskIds = useMemo(() => getFrozenTaskIds(state), [state]);
  const deleteLockedTaskIds = useMemo(() => getDeleteLockedTaskIds(state), [state]);
  const titleLockedTaskIds = useMemo(() => getTitleLockedTaskIds(state), [state]);

  const canToggleTaskStatus = (task: TaskNode, outcome: "COMPLETED" | "NOT_COMPLETED") => {
    if (frozenTaskIds.has(task.id)) return false;
    const nextStatus =
      outcome === "COMPLETED"
        ? task.status === "GREEN" ? "NONE" : "GREEN"
        : task.status === "YELLOW" ? "NONE" : "YELLOW";
    const parentTask = task.parentId ? allTasks.find((candidate) => candidate.id === task.parentId) : undefined;
    if (parentTask?.status === "GREEN" && nextStatus !== "GREEN") return false;
    const subtasks = allTasks.filter((candidate) => candidate.parentId === task.id);
    if (subtasks.length > 0) {
      if (nextStatus === "GREEN" && subtasks.some((subtask) => subtask.status !== "GREEN")) return false;
      if (
        nextStatus === "YELLOW" &&
        !subtasks.some((subtask) => subtask.status === "YELLOW" || subtask.status === "GREEN")
      ) {
        return false;
      }
    }
    return true;
  };

  const completedMilestoneIds = useMemo(() => {
    return new Set(
      state.grandPlan?.milestones.filter((m) => m.status === "COMPLETED").map((m) => m.id) ?? []
    );
  }, [state.grandPlan]);

  const selectableTasks = useMemo(() => {
    return monthTasks.filter(
      (t) =>
        !t.parentId && // Only top-level tasks are selectable
        (t.status !== "GREEN" || day.outcomeByTaskId[t.id] === "COMPLETED") &&
        (!t.linkedMilestoneId || !completedMilestoneIds.has(t.linkedMilestoneId))
    );
  }, [monthTasks, completedMilestoneIds, day.outcomeByTaskId]);

  const selectableTaskIds = useMemo(() => new Set(selectableTasks.map((t) => t.id)), [selectableTasks]);
  const primarySwitchTasks = useMemo(() => {
    return day.secondaryTaskIds
      .map((taskId) => tasksById.get(taskId))
      .filter((task): task is TaskNode => Boolean(task))
      .filter((task) => !frozenTaskIds.has(task.id) && task.status !== "GREEN");
  }, [day.secondaryTaskIds, tasksById, frozenTaskIds]);
  const canSwitchPrimaryTask = primarySwitchTasks.length > 0;
  const addableSecondaryTasks = useMemo(() => {
    const selectedIds = new Set<string>([
      ...(day.primaryTaskId ? [day.primaryTaskId] : []),
      ...day.secondaryTaskIds,
    ]);
    return selectableTasks.filter((task) => !selectedIds.has(task.id));
  }, [day.primaryTaskId, day.secondaryTaskIds, selectableTasks]);

  // Tasks completed on this specific day (for green styling in selection modal)
  const completedTodayIds = useMemo(() => {
    return new Set(
      Object.entries(day.outcomeByTaskId)
        .filter(([, outcome]) => outcome === "COMPLETED")
        .map(([taskId]) => taskId)
    );
  }, [day.outcomeByTaskId]);

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
    setShowStartWizard(true);
    setWizardStep(0);
  };

  useEffect(() => {
    const justOpened = showStartWizard && !prevShowStartWizardRef.current;
    prevShowStartWizardRef.current = showStartWizard;
    if (!justOpened) return;
    const nextDraft = {
      primaryId: day.primaryTaskId,
      secondaryIds: [...day.secondaryTaskIds],
    };
    wizardTaskDraftRef.current = nextDraft;
    setWizardTaskDraft(nextDraft);
  }, [showStartWizard, day.primaryTaskId, day.secondaryTaskIds]);

  useEffect(() => {
    wizardTaskDraftRef.current = wizardTaskDraft;
  }, [wizardTaskDraft]);

  const sessionsForDate = useMemo(
    () => state.sessions.filter((s) => s.date === dateSafe),
    [state.sessions, dateSafe]
  );

  const activeTemplateId = useMemo(() => {
    if (!day.activeSessionId) return undefined;
    const session = state.sessions.find((s) => s.id === day.activeSessionId);
    return session?.templateId;
  }, [state.sessions, day.activeSessionId]);

  const focusOverridesById = day.focusTemplateOverridesById ?? {};
  const skippedFocusTemplateIds = useMemo(
    () => new Set(day.skippedFocusTemplateIds ?? []),
    [day.skippedFocusTemplateIds]
  );

  const scheduledTemplatesForTimeline = useMemo(() => {
    const milestonesById = new Map(state.grandPlan?.milestones.map((m) => [m.id, m] as const) ?? []);
    const categoriesById = new Map(state.grandPlan?.categories.map((c) => [c.id, c] as const) ?? []);
    const focusMilestoneByTemplateId = day.focusMilestoneByTemplateId ?? {};

    return plan.templates
      .filter((t) => isTemplateScheduledForWeekday(t.daysOfWeek, weekday))
      .filter((t) => !t.isSuspended)
      .filter((t) => !skippedFocusTemplateIds.has(t.id))
      .map((t) => {
        const override = focusOverridesById[t.id];
        const milestoneId = focusMilestoneByTemplateId[t.id];
        const milestone = milestoneId ? milestonesById.get(milestoneId) : undefined;
        const category = milestone ? categoriesById.get(milestone.categoryId) : undefined;
        const color = category?.color ?? APP_MAIN_COLOR;
        return {
          id: t.id,
          title: t.title,
          plannedStart: override?.plannedStart ?? t.plannedStart,
          plannedEnd: override?.plannedEnd ?? t.plannedEnd,
          color,
        };
      });
  }, [
    plan.templates,
    state.grandPlan,
    weekday,
    day.focusMilestoneByTemplateId,
    focusOverridesById,
    skippedFocusTemplateIds,
  ]);

  const eligibleFocusTemplates = useMemo(() => {
    return plan.templates.filter((t) => {
      if (t.isSuspended && t.id !== activeTemplateId) return false;
      return true;
    });
  }, [plan.templates, activeTemplateId]);

  const focusTemplatesForToday = useMemo(
    () => eligibleFocusTemplates.filter((t) => isTemplateScheduledForWeekday(t.daysOfWeek, weekday)),
    [eligibleFocusTemplates, weekday]
  );
  const eligibleFocusTemplatesTodayCount = focusTemplatesForToday.length;

  const focusMilestoneOptions = useMemo(() => {
    return getMilestonesInMonth(state, ym).map((m) => ({
      id: m.id,
      title: m.title,
      disabled: m.status === "COMPLETED",
    }));
  }, [state, ym]);

  const primaryTask = day.primaryTaskId ? tasksById.get(day.primaryTaskId) : undefined;
  const showPrimaryTask = Boolean(day.primaryTaskId) && (!hideCompletedTasks || primaryTask?.status !== "GREEN");
  const visibleSecondaryTaskIds = useMemo(() => {
    return day.secondaryTaskIds.filter((id) => {
      const task = tasksById.get(id);
      if (!task) return false;
      if (!hideCompletedTasks) return true;
      return task.status !== "GREEN";
    });
  }, [day.secondaryTaskIds, tasksById, hideCompletedTasks]);
  const visibleTaskGroups = useMemo(() => {
    const primaryGroupKey = primaryTask ? getTaskGroupMeta(state.grandPlan, primaryTask).groupKey : null;
    const selectedItems: Array<{
      taskId: string;
      task: TaskNode;
      role: "primary" | "secondary";
      selectionIndex: number;
    }> = [];

    if (showPrimaryTask && day.primaryTaskId && primaryTask) {
      selectedItems.push({
        taskId: day.primaryTaskId,
        task: primaryTask,
        role: "primary",
        selectionIndex: -1,
      });
    }

    visibleSecondaryTaskIds.forEach((taskId, index) => {
      const task = tasksById.get(taskId);
      if (!task) return;
      selectedItems.push({
        taskId,
        task,
        role: "secondary",
        selectionIndex: index,
      });
    });

    const groupsByKey = new Map<string, {
      meta: ReturnType<typeof getTaskGroupMeta>;
      items: typeof selectedItems;
    }>();

    for (const item of selectedItems) {
      const meta = getTaskGroupMeta(state.grandPlan, item.task);
      const existing = groupsByKey.get(meta.groupKey);
      if (existing) {
        existing.items.push(item);
        continue;
      }
      groupsByKey.set(meta.groupKey, { meta, items: [item] });
    }

    return Array.from(groupsByKey.values())
      .map((group) => ({
        ...group,
        items: group.items.slice().sort((a, b) => {
          if (a.role !== b.role) return a.role === "primary" ? -1 : 1;
          return a.selectionIndex - b.selectionIndex;
        }),
      }))
      .sort((a, b) => {
        const aIsPrimaryGroup = a.meta.groupKey === primaryGroupKey;
        const bIsPrimaryGroup = b.meta.groupKey === primaryGroupKey;
        if (aIsPrimaryGroup !== bIsPrimaryGroup) return aIsPrimaryGroup ? -1 : 1;
        return compareTaskGroupMeta(a.meta, b.meta);
      });
  }, [day.primaryTaskId, primaryTask, showPrimaryTask, state.grandPlan, tasksById, visibleSecondaryTaskIds]);
  const editingTask = editingTaskId ? tasksById.get(editingTaskId) : undefined;
  const editingTaskAccentColor = getCategoryMeta(state.grandPlan, editingTask?.linkedMilestoneId).color || APP_MAIN_COLOR;
  const editingTaskReadOnly = editingTaskId ? frozenTaskIds.has(editingTaskId) : false;
  const editingTaskTitleReadOnly = editingTaskId ? titleLockedTaskIds.has(editingTaskId) : false;
  const editingTaskLocksSubtasks = editingTask?.status === "GREEN";

  const wizardSteps = ["Tasks", "Meetings", "Focus Sessions"] as const;
  const wizardStepTitle = wizardSteps[wizardStep] ?? wizardSteps[0];
  const lastWizardStep = wizardSteps.length - 1;
  const hasSelectableTasks = selectableTasks.length > 0;
  const canAdvanceWizard =
    !tutorialMode || wizardStep !== 0 || !hasSelectableTasks || !!wizardTaskDraft.primaryId;
  const canStartWizardDay = !tutorialMode || wizardStep >= lastWizardStep;
  const nextDisabled = wizardStep >= lastWizardStep || !canAdvanceWizard;

  const handleTaskSelectionConfirm = (primaryId: string | undefined, secondaryIds: string[]) => {
    mutate((s0) => {
      const { state: withDay0 } = getOrCreateDay(s0, dateSafe, ym);

      const safePrimaryId = primaryId && selectableTaskIds.has(primaryId) ? primaryId : undefined;
      const safeSecondaryIds = (secondaryIds ?? [])
        .filter((id) => selectableTaskIds.has(id))
        .filter((id) => id !== safePrimaryId);

      return setDayTasks(withDay0, dateSafe, safePrimaryId, safeSecondaryIds);
    });
    setShowTaskModal(false);
  };

  const handleAddSecondaryTasksConfirm = (secondaryIds: string[]) => {
    mutate((s0) => {
      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      const nextSecondaryIds = Array.from(
        new Set([...(day0.secondaryTaskIds ?? []), ...secondaryIds.filter((id) => id !== day0.primaryTaskId)])
      );
      return setDayTasks(withDay0, dateSafe, day0.primaryTaskId, nextSecondaryIds);
    });
    setShowAddSecondaryModal(false);
  };

  const handleChangePrimaryTaskConfirm = (primaryId: string | undefined) => {
    mutate((s0) => {
      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      if (!primaryId || day0.primaryTaskId === primaryId || !day0.secondaryTaskIds.includes(primaryId)) return withDay0;
      const nextSecondaryIds = [day0.primaryTaskId, ...day0.secondaryTaskIds.filter((id) => id !== primaryId)].filter(
        (id): id is string => Boolean(id)
      );
      return setDayTasks(withDay0, dateSafe, primaryId, nextSecondaryIds);
    });
    setShowPrimarySwitchModal(false);
  };

  const handleRemoveTaskFromSelection = (taskId: string) => {
    mutate((s0) => {
      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      if (day0.primaryTaskId === taskId) {
        const remainingSecondaryIds = day0.secondaryTaskIds.filter((id) => id !== taskId);
        const [nextPrimaryId, ...nextSecondaryIds] = remainingSecondaryIds;
        return setDayTasks(withDay0, dateSafe, nextPrimaryId, nextSecondaryIds);
      }
      return setDayTasks(
        withDay0,
        dateSafe,
        day0.primaryTaskId,
        day0.secondaryTaskIds.filter((id) => id !== taskId)
      );
    });
  };

  const openTaskEditor = (task: TaskNode) => {
    if (frozenTaskIds.has(task.id)) return;
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingTaskNotes(task.notes ?? "");
    setEditingTaskError(null);
  };

  const closeTaskEditor = () => {
    setEditingTaskId(null);
    setEditingTaskTitle("");
    setEditingTaskNotes("");
    setEditingTaskError(null);
  };

  const saveTaskEditor = () => {
    if (!editingTaskId) return;
    const nextTitle = editingTaskTitle.trim();
    if (!nextTitle) {
      setEditingTaskError("Title is required.");
      return;
    }
    const nextNotes = editingTaskNotes.trim();
    mutate((s0) =>
      updateTask(s0, editingTaskId, {
        title: nextTitle,
        notes: nextNotes || undefined,
      })
    );
    closeTaskEditor();
  };

  const closeStartWizard = () => {
    setShowStartWizard(false);
    setWizardStep(0);
  };

  const updateWizardTaskDraft = (primaryId: string | undefined, secondaryIds: string[]) => {
    const current = wizardTaskDraftRef.current;
    const sameSecondary =
      current.secondaryIds.length === secondaryIds.length &&
      current.secondaryIds.every((id, index) => id === secondaryIds[index]);
    if (current.primaryId === primaryId && sameSecondary) return;
    const nextDraft = { primaryId, secondaryIds };
    wizardTaskDraftRef.current = nextDraft;
    setWizardTaskDraft(nextDraft);
  };

  const applyWizardTaskDraft = () => {
    mutate((s0) => {
      const { state: withDay0 } = getOrCreateDay(s0, dateSafe, ym);
      const draft = wizardTaskDraftRef.current;
      const primaryId = draft.primaryId;
      const safePrimaryId = primaryId && selectableTaskIds.has(primaryId) ? primaryId : undefined;
      const safeSecondaryIds = (draft.secondaryIds ?? [])
        .filter((id) => selectableTaskIds.has(id))
        .filter((id) => id !== safePrimaryId);
      return setDayTasks(withDay0, dateSafe, safePrimaryId, safeSecondaryIds);
    });
  };

  const handleWizardStartDay = () => {
    if (tutorialMode && wizardStep < lastWizardStep) return;
    applyWizardTaskDraft();
    closeStartWizard();
  };

  // v2: Last working day info (not just previous day)
  const lastWorkingDay = useMemo(() => findLastWorkingDay(state, dateSafe, ym), [state, dateSafe, ym]);

  const getTaskCompletionEventInfo = (stateForLookup: typeof state, taskId: string) => {
    const task = getTaskById(stateForLookup, taskId) ?? tasksById.get(taskId);
    const title = task?.title ?? "Task";
    const parentTask = task?.parentId
      ? (getTaskById(stateForLookup, task.parentId) ?? tasksById.get(task.parentId))
      : undefined;
    const isSubtask = Boolean(task?.parentId);
    return {
      eventId: isSubtask ? `subtask:completed:${taskId}` : `task:completed:${taskId}`,
      legacyEventId: isSubtask ? `task:completed:${taskId}` : undefined,
      kind: (isSubtask ? "SUBTASK" : "TASK") as DayLogEvent["kind"],
      text: isSubtask
        ? `✓ Completed subtask: ${(parentTask?.title ?? "Parent task")} → ${title}`
        : `✓ Completed task: ${title}`,
    };
  };

  const setOutcome = (taskId: string, outcome: "COMPLETED" | "NOT_COMPLETED" | undefined) => {
    mutate((s0) => {
      let next = setTaskOutcome(s0, dateSafe, taskId, outcome);
      const eventInfo = getTaskCompletionEventInfo(next, taskId);
      const { day: nextDay } = getOrCreateDay(next, dateSafe, ym);
      const finalOutcome = nextDay.outcomeByTaskId?.[taskId];
      if (finalOutcome === "COMPLETED") {
        if (eventInfo.legacyEventId) {
          next = removeDayEvent(next, dateSafe, eventInfo.legacyEventId);
        }
        next = upsertDayEvent(next, dateSafe, {
          id: eventInfo.eventId,
          at: getVirtualTimestamp(),
          kind: eventInfo.kind,
          text: eventInfo.text,
        });
      } else {
        next = removeDayEvent(next, dateSafe, eventInfo.eventId);
        if (eventInfo.legacyEventId) {
          next = removeDayEvent(next, dateSafe, eventInfo.legacyEventId);
        }
      }
      return next;
    });
  };

  const buildTaskSubtaskItems = (parentTaskId: string): TaskSubtaskItem[] => {
    return getSubtasksForTask(state, parentTaskId).map((subtask) => {
      const canDeleteSubtask = !frozenTaskIds.has(subtask.id) && !deleteLockedTaskIds.has(subtask.id);
      return {
        id: subtask.id,
        title: subtask.title,
        status: subtask.status,
        showActionCluster: true,
        canToggleCompleted: canToggleTaskStatus(subtask, "COMPLETED"),
        canToggleInProgress: canToggleTaskStatus(subtask, "NOT_COMPLETED"),
        canDelete: canDeleteSubtask,
        onToggleCompleted: () => setOutcome(subtask.id, "COMPLETED"),
        onToggleInProgress: () => setOutcome(subtask.id, "NOT_COMPLETED"),
        onDelete: () => {
          if (!window.confirm(`Delete subtask "${subtask.title}"?`)) return;
          mutate((s) => deleteTask(s, subtask.id));
        },
      };
    });
  };

  const editingTaskSubtasks = editingTaskId
    ? buildTaskSubtaskItems(editingTaskId)
    : [];
  const canAddEditingSubtask = Boolean(editingTaskId && !editingTaskReadOnly && !editingTaskLocksSubtasks);

  const handleToggleReminder = (reminder: DailyReminderTemplate) => {
    mutate((s0) => {
      const { day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      const wasChecked = day0.reminderCheckedById?.[reminder.id] ?? false;
      const willBeChecked = !wasChecked;
      let next = toggleReminderChecked(s0, dateSafe, reminder.id);
      if (willBeChecked) {
        next = upsertDayEvent(next, dateSafe, {
          id: `reminder:checked:${reminder.id}`,
          at: getVirtualTimestamp(),
          kind: "REMINDER",
          text: reminder.text,
        });
      } else {
        next = removeDayEvent(next, dateSafe, `reminder:checked:${reminder.id}`);
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
  const timelineMeetings = useMemo(() => dayMeetings.filter((m) => !m.skipped), [dayMeetings]);

  useEffect(() => {
    if (!onWizardStateChange) return;
    onWizardStateChange({
      open: showStartWizard,
      wizardStep,
      primarySelected: !!wizardTaskDraft.primaryId,
      meetingCount: dayMeetings.length,
      focusSessionCount: focusTemplatesForToday.length,
    });
  }, [
    showStartWizard,
    wizardStep,
    wizardTaskDraft.primaryId,
    dayMeetings.length,
    focusTemplatesForToday.length,
    onWizardStateChange,
  ]);

  const handleSaveMeeting = (
    meetingData: Omit<MeetingEntry, "id" | "createdAt">,
    scope: MeetingEditScope
  ) => {
    mutate((s0) => {
      if (editingMeeting) {
        return scope === "THIS_AND_FUTURE"
          ? updateMeetingThisAndFuture(s0, editingMeeting.id, meetingData)
          : updateMeeting(s0, editingMeeting.id, meetingData);
      } else {
        const meeting: MeetingEntry = {
          ...meetingData,
          id: makeId("meeting"),
          createdAt: getVirtualTimestamp(),
        };
        return addMeetingWithRecurrence(s0, meeting);
      }
    });
    setShowMeetingForm(false);
    setEditingMeeting(undefined);
  };

  const handleDeleteMeeting = (meetingId: string, scope: MeetingEditScope = "THIS_EVENT") => {
    const confirmed = confirm(
      scope === "THIS_AND_FUTURE"
        ? "Delete this meeting and all future occurrences?"
        : "Delete this meeting?"
    );
    if (!confirmed) return false;

    mutate((s0) =>
      scope === "THIS_AND_FUTURE"
        ? deleteMeetingThisAndFuture(s0, meetingId)
        : deleteMeeting(s0, meetingId)
    );
    return true;
  };

  const handleOpenCreateMeeting = () => {
    setEditingMeeting(undefined);
    setShowMeetingForm(true);
  };

  const handleToggleAttended = (meetingId: string) => {
    mutate((s0) => {
      const meeting0 = s0.meetings.find((m) => m.id === meetingId);
      if (meeting0?.skipped) return s0;
      const willBeAttended = !(meeting0?.attended ?? false);
      let next = toggleMeetingAttended(s0, meetingId);
      if (willBeAttended && meeting0) {
        next = upsertDayEvent(next, dateSafe, {
          id: `meeting:attended:${meetingId}`,
          at: getVirtualTimestamp(),
          kind: "MEETING",
          text: `✓ Attended: ${meeting0.title}`,
        });
      } else {
        next = removeDayEvent(next, dateSafe, `meeting:attended:${meetingId}`);
      }
      return next;
    });
  };

  const handleToggleMeetingSkipped = (meetingId: string) => {
    mutate((s0) => {
      const meeting0 = s0.meetings.find((m) => m.id === meetingId);
      if (!meeting0) return s0;
      return setMeetingSkipped(s0, meetingId, !meeting0.skipped);
    });
  };

  const renderMeetingCard = (meeting: MeetingEntry, showAttendance: boolean) => {
    const isSkipped = !!meeting.skipped;
    return (
      <div
        key={meeting.id}
        style={{
          border: "2px solid #eee",
          borderLeft: `6px solid ${isSkipped ? "#e5e7eb" : APP_MAIN_COLOR}`,
          borderRadius: 12,
          padding: 16,
          backgroundColor: isSkipped ? "#f8fafc" : "rgba(255,255,255,0.92)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          opacity: isSkipped ? 0.75 : 1,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{meeting.title}</div>
            <div style={{ fontSize: 14, color: "#333", opacity: 0.8, fontWeight: 600 }}>🕒 {meeting.time}</div>
            {showAttendance ? (
              <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
                {isSkipped ? (
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>Skipped</div>
                ) : (
                  <button
                    onClick={() => handleToggleAttended(meeting.id)}
                    style={{
                      padding: "6px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: meeting.attended ? "#4caf50" : "white",
                      color: meeting.attended ? "white" : "#4caf50",
                      border: "2px solid #4caf50",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    ✓ Attended
                  </button>
                )}
              </div>
            ) : isSkipped ? (
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>Skipped</div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handleToggleMeetingSkipped(meeting.id)}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 800,
                backgroundColor: isSkipped ? "#e5e7eb" : "white",
                color: isSkipped ? "#6b7280" : "#b45309",
                border: "1px solid #ddd",
                borderRadius: 10,
                cursor: "pointer",
              }}
              title={isSkipped ? "Unskip meeting" : "Skip meeting"}
            >
              {isSkipped ? "Unskip" : "Skip"}
            </button>
            <button
              onClick={() => {
                setEditingMeeting(meeting);
                setShowMeetingForm(true);
              }}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 800,
                backgroundColor: "white",
                border: "1px solid #ddd",
                borderRadius: 10,
                cursor: "pointer",
                opacity: 0.9,
              }}
              title="Edit meeting"
            >
              ✏️
            </button>
            <button
              onClick={() => handleDeleteMeeting(meeting.id)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                border: "1px solid #fecaca",
                backgroundColor: "white",
                color: "#ef4444",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Delete meeting"
            >
              ✕
            </button>
          </div>
        </div>

        {meeting.link && (
          <div style={{ marginBottom: 8 }}>
            <button
              onClick={() => {
                window.electronAPI!.openExternal(meeting.link!);
              }}
              style={{
                color: "#1976d2",
                fontSize: 13,
                textDecoration: "none",
                fontWeight: 500,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              🔗 Join Meeting
            </button>
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
    );
  };

  const renderFocusTemplateCard = (template: FocusTemplate, showSessionControls: boolean) => {
    const override = focusOverridesById[template.id];
    const displayTemplate = override
      ? { ...template, plannedStart: override.plannedStart, plannedEnd: override.plannedEnd }
      : template;
    const isSkipped = skippedFocusTemplateIds.has(template.id);
    const hasOverride = !!override;
    const milestoneId = day.focusMilestoneByTemplateId?.[template.id];
    const milestone = milestoneId ? state.grandPlan?.milestones.find((m) => m.id === milestoneId) : undefined;
    const categoryColor = milestone
      ? state.grandPlan?.categories.find((c) => c.id === milestone.categoryId)?.color
      : undefined;
    const accentColor = categoryColor ?? APP_MAIN_COLOR;

    return (
      <FocusTemplateCard
        key={template.id}
        template={displayTemplate}
        accentColor={accentColor}
        milestoneTitle={milestone?.title}
        milestoneOptions={focusMilestoneOptions.length > 0 ? focusMilestoneOptions : undefined}
        selectedMilestoneId={milestoneId}
        onChangeMilestoneId={(nextMilestoneId) =>
          mutate((s0) => setFocusTemplateMilestoneForDay(s0, dateSafe, template.id, nextMilestoneId))
        }
        activeSessionId={day.activeSessionId}
        completedSessions={sessionsForDate}
        onStartSession={showSessionControls ? startSession : undefined}
        onEndSession={showSessionControls ? endSession : undefined}
        onEditCompletedSession={(sessionId, startedAt, endedAt) =>
          mutate((s0) => {
            const ms = Date.parse(endedAt) - Date.parse(startedAt);
            if (!Number.isFinite(ms) || ms <= 0) return s0;
            const actualMinutes = Math.max(0, Math.round(ms / 60000));
            return updateSession(s0, sessionId, {
              startedAt,
              endedAt,
              actualMinutes,
            });
          })
        }
        isSkipped={isSkipped}
        onToggleSkipped={() => mutate((s0) => toggleFocusTemplateSkippedForDay(s0, dateSafe, template.id))}
        onReschedule={(nextOverride) =>
          mutate((s0) => setFocusTemplateOverrideForDay(s0, dateSafe, template.id, nextOverride))
        }
        onClearReschedule={() => mutate((s0) => clearFocusTemplateOverrideForDay(s0, dateSafe, template.id))}
        hasOverride={hasOverride}
      />
    );
  };

  // v4: If day is closed, show journal-style read-only view
  if (day.isClosed && day.isWorkingDay) {
    const startedAtTime = day.startedAt ? formatTime(day.startedAt) : "—";
    const endedAtTime = day.endedAt ? formatTime(day.endedAt) : "—";
    const endedAtDate = day.endedAt ? day.endedAt.slice(0, 10) : undefined;
    const closeStatusLabel = day.autoClosed ? "Auto-closed" : "Closed manually";

    const activeTaskReports = [
      day.primaryTaskId ? { id: day.primaryTaskId, isPrimary: true } : null,
      ...day.secondaryTaskIds.map((id) => ({ id, isPrimary: false })),
    ]
      .filter((t): t is { id: string; isPrimary: boolean } => t !== null)
      .map((t) => {
        const task = tasksById.get(t.id) ?? getTaskById(state, t.id);
        if (!task) return null;
        const subtasks = getSubtasksForTask(state, t.id).map((subtask) => ({
          id: subtask.id,
          title: subtask.title,
          outcome: day.outcomeByTaskId[subtask.id],
        })).filter((subtask) => subtask.outcome === "COMPLETED");
        return {
          id: t.id,
          isPrimary: t.isPrimary,
          title: task.title,
          linkedMilestoneId: task.linkedMilestoneId,
          outcome:
            day.outcomeByTaskId[t.id] === "COMPLETED" || day.outcomeByTaskId[t.id] === "NOT_COMPLETED"
              ? day.outcomeByTaskId[t.id]
              : undefined,
          subtasks,
        };
      })
      .filter(
        (
          report
        ): report is {
          id: string;
          isPrimary: boolean;
          title: string;
          linkedMilestoneId?: string;
          outcome: "COMPLETED" | "NOT_COMPLETED" | undefined;
          subtasks: { id: string; title: string; outcome: "COMPLETED" | "NOT_COMPLETED" | undefined }[];
        } => report !== null
      );

    const completedSessions = state.sessions.filter((s) => s.date === dateSafe && s.endedAt);
    const logEvents = buildDayHistory(state, dateSafe, plan);

    const kindToColor: Record<string, string> = {
      SYSTEM: REPORT_THEME.textMuted,
      REMINDER: APP_MAIN_COLOR,
      TASK: "#16a34a",
      SUBTASK: "#0f766e",
      MEETING: APP_MAIN_COLOR,
      FOCUS: "#b45309",
    };

    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: REPORT_THEME.pageBg,
          padding: "32px 24px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 1020, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: REPORT_THEME.textMuted, letterSpacing: 0.3, textTransform: "uppercase" }}>
                Daily Report
              </div>
              <div style={{ marginTop: 6, fontSize: 30, fontWeight: 900, color: REPORT_THEME.textPrimary, letterSpacing: 0.2 }}>
                {dateSafe}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: REPORT_THEME.textSecondary }}>
                {startedAtTime} — {endedAtTime}
                {day.endedAt ? (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: "2px 8px",
                      borderRadius: 999,
                      backgroundColor: day.autoClosed ? "#fef3c7" : "#ede9fe",
                      color: day.autoClosed ? "#92400e" : "#5b21b6",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 0.2,
                    }}
                  >
                    {closeStatusLabel}
                  </span>
                ) : null}
                {endedAtDate && endedAtDate !== dateSafe ? (
                  <span style={{ marginLeft: 8, color: REPORT_THEME.textMuted }}>(ended {endedAtDate})</span>
                ) : null}
              </div>
            </div>

            {!isPastDate ? (
              <button
                onClick={handleReopenDay}
                style={{
                  padding: "12px 18px",
                  fontSize: 14,
                  fontWeight: 900,
                  backgroundColor: APP_MAIN_COLOR,
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  cursor: "pointer",
                  boxShadow: "0 12px 26px rgba(0,0,0,0.14)",
                }}
              >
                Reopen for Editing
              </button>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginBottom: 16 }}>
            <ReportCard title="Tasks">
              {activeTaskReports.length === 0 ? (
                <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No tasks logged</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {activeTaskReports.map((taskReport) => {
                    const categoryColor = getCategoryMeta(state.grandPlan, taskReport.linkedMilestoneId).color;
                    const getStatusUi = (outcome: "COMPLETED" | "NOT_COMPLETED" | undefined) => {
                      if (outcome === "COMPLETED") {
                        return {
                          label: "Completed",
                          color: "#16a34a",
                          background: "#ecfdf5",
                        };
                      }
                      if (outcome === "NOT_COMPLETED") {
                        return {
                          label: "Work in progress",
                          color: "#d97706",
                          background: "#fffbeb",
                        };
                      }
                      return null;
                    };
                    const taskStatusUi = getStatusUi(taskReport.outcome);
                    return (
                      <div
                        key={taskReport.id}
                        style={{
                          padding: "12px 14px",
                          backgroundColor: taskReport.isPrimary ? "#fff8e1" : "white",
                          border: `1px solid ${REPORT_THEME.borderLight}`,
                          borderLeft: `4px solid ${categoryColor}`,
                          borderRadius: 12,
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            gap: 12,
                            alignItems: "start",
                          }}
                        >
                          <div
                            style={{
                              minWidth: 0,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 900,
                                color: REPORT_THEME.textPrimary,
                                wordBreak: "break-word",
                              }}
                            >
                              {taskReport.title}
                            </div>
                          </div>
                          {taskStatusUi ? (
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                backgroundColor: taskStatusUi.background,
                                fontSize: 12,
                                fontWeight: 900,
                                color: taskStatusUi.color,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {taskStatusUi.label}
                            </span>
                          ) : null}
                        </div>

                        {taskReport.subtasks.length > 0 ? (
                          <div
                            style={{
                              display: "grid",
                              gap: 6,
                              paddingTop: 8,
                              borderTop: `1px solid ${REPORT_THEME.borderLight}`,
                            }}
                          >
                            {taskReport.subtasks.map((subtask) => {
                              const subtaskStatusUi = getStatusUi(subtask.outcome);
                              return (
                                <div
                                  key={subtask.id}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "minmax(0, 1fr) auto",
                                    gap: 12,
                                    alignItems: "center",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: REPORT_THEME.textPrimary,
                                      minWidth: 0,
                                      wordBreak: "break-word",
                                      paddingLeft: 10,
                                    }}
                                  >
                                    ↳ {subtask.title}
                                  </div>
                                  {subtaskStatusUi ? (
                                    <span
                                      style={{
                                        padding: "3px 8px",
                                        borderRadius: 999,
                                        backgroundColor: subtaskStatusUi.background,
                                        fontSize: 11,
                                        fontWeight: 800,
                                        color: subtaskStatusUi.color,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {subtaskStatusUi.label}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </ReportCard>

            <ReportCard title="Focus Sessions">
              {completedSessions.length === 0 ? (
                <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No focus sessions</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {completedSessions.map((s) => {
                    const template = plan.templates.find((t) => t.id === s.templateId);
                    const minutes = s.actualMinutes ?? 0;
                    const milestoneId = day.focusMilestoneByTemplateId?.[s.templateId] ?? template?.linkedMilestoneId;
                    const sessionColor = getCategoryMeta(state.grandPlan, milestoneId).color;
                    return (
                      <div
                        key={s.id}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: `1px solid ${REPORT_THEME.borderLight}`,
                          borderLeft: `4px solid ${sessionColor}`,
                          backgroundColor: "white",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "baseline",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 900, color: REPORT_THEME.textPrimary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {template?.title ?? "Focus session"}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: REPORT_THEME.textSecondary, whiteSpace: "nowrap" }}>
                          {minutes}m
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ReportCard>

            <ReportCard title="Meetings">
              {dayMeetings.length === 0 ? (
                <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No meetings</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {dayMeetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${REPORT_THEME.borderLight}`,
                        backgroundColor: "white",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: REPORT_THEME.textPrimary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {meeting.title}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: REPORT_THEME.textMuted, whiteSpace: "nowrap" }}>
                          {meeting.time}
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <div style={{ fontSize: 12, color: REPORT_THEME.textSecondary }}>
                          {meeting.attended ? "Attended" : "Not attended"}
                        </div>
                        <div
                          aria-hidden
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            backgroundColor: meeting.attended ? "#16a34a" : "#f59e0b",
                          }}
                        />
                      </div>
                      {meeting.description ? (
                        <div style={{ fontSize: 13, color: REPORT_THEME.textSecondary, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                          {meeting.description}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </ReportCard>
          </div>

          <ReportCard title="Log">
            {logEvents.length === 0 ? (
              <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No log events recorded</div>
            ) : (
              <div
                style={{
                  position: "relative",
                  paddingLeft: 18,
                  borderLeft: `2px solid ${REPORT_THEME.borderLight}`,
                }}
              >
                {logEvents.map((e) => {
                  const dotColor = kindToColor[e.kind] ?? REPORT_THEME.textMuted;
                  return (
                    <div key={e.id} style={{ position: "relative", padding: "8px 0 8px 12px" }}>
                      <div
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: -8,
                          top: 16,
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          backgroundColor: dotColor,
                          boxShadow: "0 6px 16px rgba(0,0,0,0.10)",
                          border: "2px solid white",
                        }}
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "74px 1fr", gap: 12, alignItems: "baseline" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: REPORT_THEME.textMuted }}>
                          {formatTime(e.at)}
                        </div>
                        <div style={{ fontSize: 13, color: REPORT_THEME.textPrimary, lineHeight: 1.6 }}>
                          {e.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ReportCard>

          <ReportCard
            title="Daily Diary"
            style={{
              marginTop: 16,
              minHeight: 220,
              backgroundColor: "#fff7dd",
              borderColor: "#f1e2b5",
            }}
          >
            {day.dailyJournal ? (
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75, fontSize: 14, color: REPORT_THEME.textPrimary }}>
                {day.dailyJournal}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No journal entry</div>
            )}
          </ReportCard>

          <ReportCard title="Shutdown Note" style={{ marginTop: 16 }}>
            {day.shutdownNote ? (
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75, fontSize: 14, color: REPORT_THEME.textPrimary }}>
                {day.shutdownNote}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No shutdown note</div>
            )}
          </ReportCard>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
          <div />
          <div style={{ textAlign: "center" }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#111", letterSpacing: 0.2 }}>
              Daily
            </h2>
            <div
              style={{
                margin: "10px auto 0",
                width: 56,
                height: 4,
                borderRadius: 999,
                backgroundColor: APP_MAIN_COLOR,
                opacity: 0.9,
              }}
            />
          </div>
          <div />
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
            💌 {shortName ? `Message from yesterday's ${shortName}` : "Message from your yesterday self"}
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

        {/* v2: If day is not activated */}
        {!day.isWorkingDay ? (
          isPastDate ? (
            /* Past date without activation → nothing to see */
            <PastUnactivatedDayPanel date={dateSafe} />
          ) : (
            /* Current date → show activation button */
            <div
              style={{
                textAlign: "center",
                padding: 40,
                backgroundColor: "white",
                borderRadius: 16,
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>☀️</div>
              <p style={{ fontSize: 18, marginBottom: 12 }}>
                Ready to start your working day? ☀️
              </p>
              <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
                Activate today to start tracking your focus sessions and tasks. ✨
              </p>
              <button
                data-tutorial-target="start-day"
                onClick={handleActivateDay}
                style={{
                  padding: "12px 24px",
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
                ☀️ Start Working Day
              </button>
            </div>
          )
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
                <div style={{ display: "grid", gap: 10 }}>
                  {state.dailyReminderTemplates.map((reminder) => (
                    <button
                      key={reminder.id}
                      type="button"
                      role="checkbox"
                      aria-checked={day.reminderCheckedById?.[reminder.id] ?? false}
                      onClick={() => handleToggleReminder(reminder)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        padding: "12px 14px",
                        textAlign: "left",
                        backgroundColor: day.reminderCheckedById?.[reminder.id] ?? false ? "#f4efff" : "rgba(255,255,255,0.96)",
                        border: `1.5px solid ${
                          day.reminderCheckedById?.[reminder.id] ?? false ? `${APP_MAIN_COLOR}55` : "#e5e7eb"
                        }`,
                        borderRadius: 12,
                        boxShadow:
                          day.reminderCheckedById?.[reminder.id] ?? false
                            ? "0 8px 18px rgba(103,58,183,0.10)"
                            : "0 2px 8px rgba(15,23,42,0.04)",
                        cursor: "pointer",
                        fontSize: 15,
                        transition: "background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
                      }}
                    >
                      <div
                        aria-hidden="true"
                        style={{
                          width: 22,
                          height: 22,
                          flexShrink: 0,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: day.reminderCheckedById?.[reminder.id] ?? false ? APP_MAIN_COLOR : "white",
                          border: `2px solid ${
                            day.reminderCheckedById?.[reminder.id] ?? false ? APP_MAIN_COLOR : "#cbd5e1"
                          }`,
                          color: "white",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        ✓
                      </div>
                      <span
                        style={{
                          flex: 1,
                          fontWeight: day.reminderCheckedById?.[reminder.id] ?? false ? 600 : 500,
                          color: day.reminderCheckedById?.[reminder.id] ?? false ? "#312e81" : "#334155",
                          textDecoration: day.reminderCheckedById?.[reminder.id] ?? false ? "line-through" : "none",
                          textDecorationColor: `${APP_MAIN_COLOR}55`,
                          textDecorationThickness: 2,
                          lineHeight: 1.45,
                        }}
                      >
                        {reminder.text}
                      </span>
                    </button>
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
                    border: "1px solid #e2e8f0",
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

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0 }} data-tutorial-target="daily-plan-review">Daily Tasks</h3>
            {day.primaryTaskId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setHideCompletedTasks((v) => !v)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    backgroundColor: hideCompletedTasks ? "#eef2ff" : "white",
                    color: hideCompletedTasks ? "#3730a3" : "#444",
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    cursor: "pointer",
                    opacity: 0.95,
                  }}
                  title={hideCompletedTasks ? "Show completed tasks" : "Hide completed tasks"}
                >
                  {hideCompletedTasks ? "Show Completed" : "Hide Completed"}
                </button>
                <button
                  onClick={() => setShowAddSecondaryModal(true)}
                  disabled={addableSecondaryTasks.length === 0}
                  style={{
                    padding: "4px 8px",
                    fontSize: 14,
                    backgroundColor: addableSecondaryTasks.length > 0 ? "white" : "#f3f4f6",
                    color: addableSecondaryTasks.length > 0 ? "#444" : "#9ca3af",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    cursor: addableSecondaryTasks.length > 0 ? "pointer" : "default",
                    opacity: 0.9,
                  }}
                  title="Add secondary task"
                >
                  +
                </button>
              </div>
            ) : null}
          </div>

          {/* v2: Task Selection Modal */}
          {showTaskModal && (
            <TaskSelectionModal
              tasks={selectableTasks}
              grandPlan={state.grandPlan}
              currentPrimaryId={day.primaryTaskId}
              currentSecondaryIds={day.secondaryTaskIds}
              onConfirm={handleTaskSelectionConfirm}
              onCancel={() => setShowTaskModal(false)}
              suggestedSecondaryIds={suggestedSecondaryIds}
              completedTodayIds={completedTodayIds}
            />
          )}

          {showPrimarySwitchModal && day.primaryTaskId && (
            <PrimaryTaskSwitchModal
              tasks={primarySwitchTasks}
              currentPrimaryTitle={primaryTask?.title ?? "Primary task"}
              onConfirm={handleChangePrimaryTaskConfirm}
              onCancel={() => setShowPrimarySwitchModal(false)}
            />
          )}

          {showAddSecondaryModal && day.primaryTaskId && (
            <AddSecondaryTasksModal
              tasks={addableSecondaryTasks}
              grandPlan={state.grandPlan}
              currentPrimaryTitle={primaryTask?.title ?? "Primary task"}
              onConfirm={handleAddSecondaryTasksConfirm}
              onCancel={() => setShowAddSecondaryModal(false)}
            />
          )}

          {editingTaskId && (
            <TaskDetailModal
              accentColor={editingTaskAccentColor}
              titleValue={editingTaskTitle}
              notesValue={editingTaskNotes}
              readOnly={editingTaskReadOnly}
              titleReadOnly={editingTaskTitleReadOnly}
              errorMessage={editingTaskError}
              onTitleChange={setEditingTaskTitle}
              onNotesChange={setEditingTaskNotes}
              onClose={closeTaskEditor}
              onSave={saveTaskEditor}
              subtasks={editingTaskSubtasks}
              canAddSubtask={canAddEditingSubtask}
              onAddSubtask={(title) => {
                if (!editingTaskId) return;
                mutate((s) => addSubtask(s, editingTaskId, title).state);
              }}
              autoFocusTitle
            />
          )}

          {/* Selected Tasks Display */}
          {!day.primaryTaskId ? (
            <div style={{ textAlign: "center", padding: 32, backgroundColor: "white", borderRadius: 16 }}>
              <p style={{ opacity: 0.6, marginBottom: 16 }}>No tasks selected for today. ✨</p>
              <button
                onClick={() => setShowTaskModal(true)}
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 800,
                  backgroundColor: APP_MAIN_COLOR,
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
                }}
              >
                Choose daily tasks
              </button>
            </div>
          ) : (
            <div>
              {visibleTaskGroups.length > 0 && (
                <div style={{ display: "grid", gap: 14, marginBottom: 16 }}>
                  {visibleTaskGroups.map((group, groupIndex) => (
                    <div
                      key={group.meta.groupKey}
                      style={{
                        borderTop: groupIndex === 0 ? "none" : "1px solid #e7ebf1",
                        paddingTop: groupIndex === 0 ? 0 : 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                          marginBottom: 10,
                          paddingLeft: 2,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: group.meta.categoryColor,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: "#94a3b8",
                            letterSpacing: 0.3,
                            textTransform: "uppercase",
                          }}
                        >
                          {group.meta.categoryTitle}
                        </span>
                        {!group.meta.isStandalone ? (
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
                            {group.meta.milestoneTitle}
                          </span>
                        ) : null}
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        {group.items.map((item) => {
                          const accentColor = getCategoryMeta(state.grandPlan, item.task.linkedMilestoneId).color;
                          const isPrimary = item.role === "primary";
                          const isTaskFrozen = frozenTaskIds.has(item.taskId);
                          const canSetCompleted = canToggleTaskStatus(item.task, "COMPLETED");
                          const canSetInProgress = canToggleTaskStatus(item.task, "NOT_COMPLETED");
                          const taskSubtasks = buildTaskSubtaskItems(item.taskId).filter(
                            (subtask) => !hideCompletedTasks || subtask.status !== "GREEN"
                          );
                          const canAddTaskSubtask = !isTaskFrozen && item.task.status !== "GREEN";
                          return (
                            <DailyTaskCard
                              key={item.taskId}
                              task={item.task}
                              accentColor={accentColor}
                              isPrimary={isPrimary}
                              frozen={isTaskFrozen}
                              canSetCompleted={canSetCompleted}
                              canSetInProgress={canSetInProgress}
                              canSwitchPrimaryTask={isPrimary ? canSwitchPrimaryTask : false}
                              onOpen={!isTaskFrozen ? () => openTaskEditor(item.task) : undefined}
                              onToggleCompleted={() => setOutcome(item.taskId, "COMPLETED")}
                              onToggleInProgress={() => setOutcome(item.taskId, "NOT_COMPLETED")}
                              onSwitchPrimary={
                                isPrimary
                                  ? () => {
                                      if (!canSwitchPrimaryTask) return;
                                      setShowPrimarySwitchModal(true);
                                    }
                                  : undefined
                              }
                              onRemoveFromSelection={
                                !isPrimary ? () => handleRemoveTaskFromSelection(item.taskId) : undefined
                              }
                              subtasks={taskSubtasks}
                              canAddSubtask={canAddTaskSubtask}
                              onAddSubtask={(title) => mutate((s) => addSubtask(s, item.taskId, title).state)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {hideCompletedTasks && !showPrimaryTask && visibleSecondaryTaskIds.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: 20,
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    color: "#6b7280",
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  All selected tasks are completed. Toggle "Show Completed" to view them.
                </div>
              ) : null}

            </div>
          )}

          {/* v4: Meetings Section */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 32,
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>📅 Meetings</h3>
            {dayMeetings.length > 0 ? (
              <button
                onClick={handleOpenCreateMeeting}
                style={{
                  padding: "4px 8px",
                  fontSize: 14,
                  backgroundColor: "white",
                  color: "#444",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  cursor: "pointer",
                  opacity: 0.9,
                }}
                title="Add another meeting"
              >
                +
              </button>
            ) : null}
          </div>
          <div style={{ marginBottom: 24 }}>
            {dayMeetings.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: 28,
                  backgroundColor: "white",
                  borderRadius: 16,
                }}
              >
                <p style={{ opacity: 0.6, marginBottom: 12 }}>No meetings scheduled. ✨</p>
                <button
                  onClick={handleOpenCreateMeeting}
		                  style={{
		                    padding: "10px 14px",
		                    fontSize: 13,
		                    fontWeight: 800,
		                    backgroundColor: APP_MAIN_COLOR,
		                    color: "white",
		                    border: "none",
		                    borderRadius: 10,
		                    cursor: "pointer",
                        whiteSpace: "nowrap",
                        boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
		                  }}
		                >
		                  + Add meeting
	                </button>
	              </div>
            ) : (
              <>
                <div style={{ display: "grid", gap: 12 }}>
                  {dayMeetings.map((meeting) => renderMeetingCard(meeting, true))}
                </div>
              </>
            )}
          </div>

          {/* Meeting Form Modal */}
          {showMeetingForm && (
            <MeetingFormModal
              date={dateSafe}
              mode={editingMeeting ? "edit" : "create"}
              meeting={editingMeeting}
              onSave={handleSaveMeeting}
              onDelete={
                editingMeeting
                  ? (scope) => {
                      const didDelete = handleDeleteMeeting(editingMeeting.id, scope);
                      if (!didDelete) return;
                      setShowMeetingForm(false);
                      setEditingMeeting(undefined);
                    }
                  : undefined
              }
              onCancel={() => {
                setShowMeetingForm(false);
                setEditingMeeting(undefined);
              }}
            />
          )}

          {/* Focus Sessions */}
          {plan.templates.length === 0 ? (
            <>
              <h3 style={{ marginTop: 32 }}>Focus Sessions</h3>
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 13, color: "#999", fontStyle: "italic" }}>
                  No focus templates defined. Add templates in Month Setup.
                </p>
              </div>
            </>
          ) : eligibleFocusTemplates.length === 0 ? null : (
            <>
              <h3 style={{ marginTop: 32 }}>Focus Sessions</h3>
              <div style={{ marginBottom: 24 }}>
                {eligibleFocusTemplatesTodayCount === 0 ? (
                  <p style={{ fontSize: 13, color: "#999", fontStyle: "italic" }}>
                    No focus templates scheduled for today. Edit templates in Month Setup to assign weekdays.
                  </p>
                ) : (
                  focusTemplatesForToday.map((template) => renderFocusTemplateCard(template, !isPastDate))
                )}
              </div>
            </>
          )}

            </div>
            <div style={{ flex: "2 1 420px", minWidth: 320 }}>
              <DailyTimeline
                date={dateSafe}
                meetings={timelineMeetings}
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

          {!tutorialMode && (
            <>
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
                      Any active sessions will be ended. You can reopen it again today if you still need to make changes.
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
            </>
          )}

          {showStartWizard && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(17, 24, 39, 0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2200,
                padding: 20,
              }}
              onClick={tutorialMode ? undefined : closeStartWizard}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 980,
                  backgroundColor: "white",
                  borderRadius: 18,
                  border: "1px solid #eee",
                  boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
                  overflow: wizardStep === 0 ? "visible" : "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    padding: "18px 22px",
                    borderBottom: "1px solid #eee",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#6b7280", letterSpacing: 0.4 }}>
                      Day setup
                    </div>
                    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: "#111" }}>{wizardStepTitle}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        backgroundColor: "#f3f4f6",
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#6b7280",
                      }}
                    >
                      {wizardStep + 1} / {wizardSteps.length}
                    </div>
                    {!tutorialMode && (
                      <button
                        onClick={closeStartWizard}
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
                    )}
                  </div>
                </div>

                <div
                  style={{
                    padding: 22,
                    maxHeight: wizardStep === 0 ? "none" : "70vh",
                    overflowY: wizardStep === 0 ? "visible" : "auto",
                  }}
                >
                  {wizardStep === 0 ? (
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <TaskSelectionModal
                        tasks={selectableTasks}
                        grandPlan={state.grandPlan}
                        currentPrimaryId={wizardTaskDraft.primaryId}
                        currentSecondaryIds={wizardTaskDraft.secondaryIds}
                        onConfirm={handleTaskSelectionConfirm}
                        onCancel={() => undefined}
                        suggestedSecondaryIds={suggestedSecondaryIds}
                        completedTodayIds={completedTodayIds}
                        variant="inline"
                        showHeader={false}
                        showFooter={false}
                        surface="none"
                        onDraftChange={updateWizardTaskDraft}
                        primaryButtonTutorialTarget="wizard-primary-task"
                      />
                    </div>
                  ) : wizardStep === 1 ? (
                    <div>
                      {dayMeetings.length === 0 ? (
                        <div
                          style={{
                            textAlign: "center",
                            padding: 24,
                          }}
                        >
                          <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
                          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
                            No meetings scheduled yet.
                          </div>
                          <button
                            data-tutorial-target="wizard-meeting-add"
                            onClick={handleOpenCreateMeeting}
                            style={{
                              padding: "10px 16px",
                              fontSize: 13,
                              fontWeight: 800,
                              backgroundColor: APP_MAIN_COLOR,
                              color: "white",
                              border: "none",
                              borderRadius: 10,
                              cursor: "pointer",
                              boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
                            }}
                          >
                            + Add meeting
                          </button>
                        </div>
                      ) : (
                        <>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              marginBottom: 12,
                            }}
                          >
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>Meetings</div>
                            <button
                              data-tutorial-target="wizard-meeting-add"
                              onClick={handleOpenCreateMeeting}
                              style={{
                                padding: "4px 8px",
                                fontSize: 14,
                                backgroundColor: "white",
                                color: "#444",
                                border: "1px solid #ddd",
                                borderRadius: 6,
                                cursor: "pointer",
                                opacity: 0.9,
                              }}
                              title="Add another meeting"
                            >
                              +
                            </button>
                          </div>
                          <div style={{ display: "grid", gap: 12 }}>
                            {dayMeetings.map((meeting) => renderMeetingCard(meeting, false))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div>
                      {focusTemplatesForToday.length === 0 ? (
                        <div
                          style={{
                            textAlign: "center",
                            padding: 24,
                          }}
                        >
                          <div style={{ fontSize: 32, marginBottom: 10 }}>🎯</div>
                          <div style={{ fontSize: 14, color: "#6b7280" }}>
                            No focus sessions scheduled for today.
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gap: 12 }}>
                          {focusTemplatesForToday.map((template) => renderFocusTemplateCard(template, false))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: "14px 22px",
                    borderTop: "1px solid #eee",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: "#fafafa",
                  }}
                >
                  <button
                    onClick={() => setWizardStep((prev) => Math.max(0, prev - 1))}
                    disabled={wizardStep === 0}
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 800,
                      backgroundColor: "white",
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      cursor: wizardStep === 0 ? "not-allowed" : "pointer",
                      color: "#555",
                      opacity: wizardStep === 0 ? 0.5 : 1,
                    }}
                  >
                    ← Previous
                  </button>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      data-tutorial-target="wizard-start-day"
                      onClick={handleWizardStartDay}
                      disabled={!canStartWizardDay}
                      style={{
                        padding: "8px 16px",
                        fontSize: 13,
                        fontWeight: 900,
                        backgroundColor: APP_MAIN_COLOR,
                        color: "white",
                        border: "none",
                        borderRadius: 10,
                        cursor: canStartWizardDay ? "pointer" : "not-allowed",
                        boxShadow: "0 10px 22px rgba(0,0,0,0.12)",
                        opacity: canStartWizardDay ? 1 : 0.5,
                      }}
                    >
                      ✓ Start Day
                    </button>
                    <button
                      data-tutorial-target="wizard-next"
                      onClick={() => setWizardStep((prev) => Math.min(wizardSteps.length - 1, prev + 1))}
                      disabled={nextDisabled}
                      style={{
                        padding: "8px 14px",
                        fontSize: 13,
                        fontWeight: 800,
                        backgroundColor: "white",
                        border: "1px solid #ddd",
                        borderRadius: 10,
                        cursor: nextDisabled ? "not-allowed" : "pointer",
                        color: "#555",
                        opacity: nextDisabled ? 0.5 : 1,
                      }}
                    >
                      Next →
                    </button>
                  </div>
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
