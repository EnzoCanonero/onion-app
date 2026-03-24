
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DateISO, MonthPlan, YM, TaskNode, MilestoneNode, MilestoneStatus, FocusTemplate, Weekday, Category } from "../app/types";
import {
  loadState,
  saveState,
  getMonth,
  upsertMonth,
  makeId,
  closeMonth,
  autoCloseMonth,
  reopenMonth,
  isMonthInGrandPlanPeriod,
  addStandaloneTask,
  addTaskWithMilestone,
  getAllTasks,
  getMilestonesInMonth,
  getStandaloneTasks,
  getTasksForMilestone,
  getTasksForMonth,
  getFrozenTaskIds,
  getTaskBoardForScope,
  getTaskLinksForScope,
  updateTaskBoardForScope,
  updateTaskLinksForScope,
  deleteTask,
  updateTask,
  applyTaskStatus,
  updateMilestone,
  getCurrentYM,
} from "../app/storage";
import { checkMonthAccess } from "../app/dateAccess";
import {
  MON_FRI,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
  dayOfWeekFromDateISO,
  formatWeekdays,
  isTemplateScheduledForWeekday,
  sortWeekdays,
} from "../app/weekdays";
import { useDateNavigation } from "../contexts/DateNavigationContext";
import { getVirtualTimestamp } from "../contexts/VirtualClockContext";
import { getShortUserName, getUserName } from "../app/userProfile";
import { getSelectableMilestoneIds } from "../app/milestones";
import FireworksOverlay from "../components/FireworksOverlay";
import NoGrandPlanPanel from "../components/NoGrandPlanPanel";
import PastUnactivatedMonthPanel from "../components/PastUnactivatedMonthPanel";
import FutureMonthPanel from "../components/FutureMonthPanel";
import TitleDescriptionModal from "../components/TitleDescriptionModal";
import {
  BadgePanel,
  DonutChart,
  ReportCard,
  ReportLegend,
  StackedHistogram,
  type BadgeItem,
  type DonutSlice,
  type StackedDatum,
} from "../components/ReportCharts";
import { formatDateLabel, getCategoryMeta, getColorHue, listDatesInMonth, UNKNOWN_CATEGORY, UNCATEGORIZED_CATEGORY } from "../app/reporting";
import { APP_MAIN_COLOR, REPORT_THEME } from "../app/theme";

function parseTimeToMinutes(time: string): number | null {
  const parts = time.split(":").map((x) => Number(x));
  if (parts.length !== 2) return null;
  const [hours, minutes] = parts;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function withHexAlpha(color: string, alphaHex: string): string {
  const normalizedAlpha = /^[0-9a-fA-F]{2}$/.test(alphaHex) ? alphaHex : "10";
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const r = color[1];
    const g = color[2];
    const b = color[3];
    return `#${r}${r}${g}${g}${b}${b}${normalizedAlpha}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${normalizedAlpha}`;
  if (/^#[0-9a-fA-F]{8}$/.test(color)) return `${color.slice(0, 7)}${normalizedAlpha}`;
  return color;
}

function getPreviousYM(ym: YM): YM | null {
  const [yearStr, monthStr] = ym.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() - 1);
  const prevYear = date.getFullYear();
  const prevMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${prevYear}-${prevMonth}` as YM;
}

function seedPlan(ym: YM): MonthPlan {
  return {
    ym,
    templates: [],
    pinnedMilestoneIds: [],
    primaryMilestoneId: undefined,
    createdAt: getVirtualTimestamp(),
  };
}

// Type for milestone navigation in toolbar
type MilestoneNavigationProps = {
  currentMilestoneId: string | null;
  pinnedMilestones: MilestoneNode[];
  categories: Category[];
  primaryMilestoneId: string | null;
  onSelectMilestone: (id: string | null) => void;
  onPinMilestone?: () => void;
  onUnpinMilestone?: (id: string) => void;
};

// Component for editing tasks under a milestone group
function TaskGroup({
  title,
  color,
  tasks,
  milestoneId,
  milestoneStatus,
  frozenTaskIds,
  boardSize,
  onUpdateBoardSize,
  links,
  onUpdateLinks,
  zoomStorageKey,
  onAddTask,
  onUpdateTask,
  onSetTaskStatus,
  onDeleteTask,
  onMarkMilestoneCompleted,
  isObjective = false,
  onSetObjective,
  hideAddButton = false,
  hideTitle = false,
  chromeless = false,
  floatingToolbar = false,
  milestoneNavigation,
}: {
  title: string;
  color: string;
  tasks: TaskNode[];
  milestoneId: string | null;
  milestoneStatus?: MilestoneStatus;
  frozenTaskIds: Set<string>;
  boardSize: { width: number; height: number };
  onUpdateBoardSize: (next: { width: number; height: number }) => void;
  links: { from: string; to: string }[];
  onUpdateLinks: (next: { from: string; to: string }[]) => void;
  zoomStorageKey: string;
  onAddTask: (milestoneId: string | null) => void;
  onUpdateTask: (
    taskId: string,
    updates: Partial<Pick<TaskNode, "title" | "notes" | "boardX" | "boardY" | "boardW" | "boardH">>
  ) => void;
  onSetTaskStatus: (taskId: string, outcome: "COMPLETED" | "NOT_COMPLETED" | undefined) => void;
  onDeleteTask: (taskId: string) => void;
  onMarkMilestoneCompleted?: (milestoneId: string) => void;
  isObjective?: boolean;
  onSetObjective?: (milestoneId: string) => void;
  hideAddButton?: boolean;
  hideTitle?: boolean;
  chromeless?: boolean;
  floatingToolbar?: boolean;
  milestoneNavigation?: MilestoneNavigationProps;
}) {
  const [taskModalTaskId, setTaskModalTaskId] = useState<string | null>(null);
  const [taskModalTitle, setTaskModalTitle] = useState("");
  const [taskModalNotes, setTaskModalNotes] = useState("");
  const [taskModalError, setTaskModalError] = useState<string | null>(null);

  const isCompleted = milestoneStatus === "COMPLETED";
  const accentColor = color;
  const uiAccent = chromeless ? "#000" : accentColor;
  const noteBorderColor = chromeless ? "#000" : accentColor;
  const noteBackgroundColor = "white";
  const canEditBoard = !isCompleted;
  const canSetObjective = Boolean(milestoneId && onSetObjective && !isObjective && !isCompleted);
  const objectiveAccent = "#d6a14a";

  const baseBoardWidth = Math.max(800, boardSize.width);
  const baseBoardHeight = Math.max(600, boardSize.height);

  type TaskRect = { x: number; y: number; w: number; h: number };
  type TaskPointerState = {
    taskId: string;
    pointerId: number;
    zoom: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    w: number;
    h: number;
    canDrag: boolean;
    moved: boolean;
  };
  type ResizePointerState = {
    taskId: string;
    pointerId: number;
    zoom: number;
    startClientX: number;
    startClientY: number;
    originW: number;
    originH: number;
    x: number;
    y: number;
    moved: boolean;
  };

  const [isLinkMode, setIsLinkMode] = useState(false);
  const [linkFromTaskId, setLinkFromTaskId] = useState<string | null>(null);
  const [milestoneDropdownOpen, setMilestoneDropdownOpen] = useState(false);

  const [boardZoom, setBoardZoom] = useState(() => {
    try {
      const raw = window.localStorage.getItem(zoomStorageKey);
      const n = raw ? Number(raw) : 1;
      if (!Number.isFinite(n)) return 1;
      return Math.max(0.5, Math.min(2, n));
    } catch {
      return 1;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(zoomStorageKey, String(boardZoom));
    } catch {
      // ignore
    }
  }, [zoomStorageKey, boardZoom]);

  const taskPointerRef = useRef<TaskPointerState | null>(null);
  const resizePointerRef = useRef<ResizePointerState | null>(null);

  const [dragPreview, setDragPreview] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ taskId: string; w: number; h: number } | null>(null);

  const pinnedMilestoneGroups = useMemo(() => {
    if (!milestoneNavigation) return [] as Array<{ category: Category | null; milestones: MilestoneNode[] }>;

    const categoriesById = new Map(milestoneNavigation.categories.map((category) => [category.id, category] as const));
    const sortedCategories = milestoneNavigation.categories
      .slice()
      .sort((a, b) => {
        const hueDiff = getColorHue(a.color) - getColorHue(b.color);
        if (hueDiff !== 0) return hueDiff;
        return a.title.localeCompare(b.title);
      });

    return sortedCategories
      .map((category) => {
        const milestones = milestoneNavigation.pinnedMilestones
          .filter((milestone) => milestone.categoryId === category.id)
          .slice()
          .sort((a, b) => {
            const aIsPrimary = milestoneNavigation.primaryMilestoneId === a.id;
            const bIsPrimary = milestoneNavigation.primaryMilestoneId === b.id;
            if (aIsPrimary !== bIsPrimary) return aIsPrimary ? -1 : 1;
            if (a.order !== b.order) return a.order - b.order;
            return a.title.localeCompare(b.title);
          });
        if (milestones.length === 0) return null;
        return { category, milestones };
      })
      .filter((group): group is { category: Category; milestones: MilestoneNode[] } => group !== null)
      .concat(
        (() => {
          const uncategorizedMilestones = milestoneNavigation.pinnedMilestones
            .filter((milestone) => !categoriesById.has(milestone.categoryId))
            .slice()
            .sort((a, b) => {
              const aIsPrimary = milestoneNavigation.primaryMilestoneId === a.id;
              const bIsPrimary = milestoneNavigation.primaryMilestoneId === b.id;
              if (aIsPrimary !== bIsPrimary) return aIsPrimary ? -1 : 1;
              if (a.order !== b.order) return a.order - b.order;
              return a.title.localeCompare(b.title);
            });
          return uncategorizedMilestones.length > 0
            ? [{ category: null, milestones: uncategorizedMilestones }]
            : [];
        })()
      );
  }, [milestoneNavigation]);

  useEffect(() => {
    if (!isLinkMode) setLinkFromTaskId(null);
  }, [isLinkMode]);

  const taskRectsById = useMemo(() => {
    const DEFAULT_W = 260;
    const DEFAULT_H = 180;
    const GAP = 26;
    const START_X = 28;
    const START_Y = floatingToolbar ? 80 : 28; // Leave space for floating toolbar

    const cols = Math.max(1, Math.floor((Math.max(320, boardSize.width) - START_X * 2) / (DEFAULT_W + GAP)));
    const map = new Map<string, TaskRect>();

    let unpositionedIdx = 0;
    tasks.forEach((task) => {
      let w = typeof task.boardW === "number" && Number.isFinite(task.boardW) ? task.boardW : DEFAULT_W;
      let h = typeof task.boardH === "number" && Number.isFinite(task.boardH) ? task.boardH : DEFAULT_H;

      const hasX = typeof task.boardX === "number" && Number.isFinite(task.boardX);
      const hasY = typeof task.boardY === "number" && Number.isFinite(task.boardY);

      let x = hasX ? task.boardX : START_X + (unpositionedIdx % cols) * (DEFAULT_W + GAP);
      let y = hasY ? task.boardY : START_Y + Math.floor(unpositionedIdx / cols) * (DEFAULT_H + GAP);

      if (!hasX || !hasY) unpositionedIdx++;

      if (dragPreview?.taskId === task.id) {
        x = dragPreview.x;
        y = dragPreview.y;
      }
      if (resizePreview?.taskId === task.id) {
        w = resizePreview.w;
        h = resizePreview.h;
      }

      w = Math.max(160, Math.min(720, w));
      h = Math.max(110, Math.min(640, h));
      x = Math.max(0, x);
      y = Math.max(0, y);

      map.set(task.id, { x, y, w, h });
    });

    return map;
  }, [tasks, boardSize.width, dragPreview, resizePreview, floatingToolbar]);

  const extendBoardToFit = (rect: TaskRect) => {
    const PAD = 160;
    const neededW = Math.max(boardSize.width, rect.x + rect.w + PAD);
    const neededH = Math.max(boardSize.height, rect.y + rect.h + PAD);
    if (neededW <= boardSize.width && neededH <= boardSize.height) return;

    const roundTo = (value: number, step: number) => Math.ceil(value / step) * step;
    onUpdateBoardSize({
      width: roundTo(neededW, 200),
      height: roundTo(neededH, 200),
    });
  };

  const handleExtendBoardClick = () => {
    onUpdateBoardSize({ width: boardSize.width + 800, height: boardSize.height + 600 });
  };

  const handleLinkTaskClick = (taskId: string) => {
    if (!canEditBoard) return;
    if (!isLinkMode) return;
    if (frozenTaskIds.has(taskId)) return;
    if (linkFromTaskId && frozenTaskIds.has(linkFromTaskId)) {
      setLinkFromTaskId(null);
      return;
    }

    if (!linkFromTaskId) {
      setLinkFromTaskId(taskId);
      return;
    }

    if (linkFromTaskId === taskId) {
      setLinkFromTaskId(null);
      return;
    }

    const exists = links.some(
      (l) =>
        (l.from === linkFromTaskId && l.to === taskId) ||
        (l.from === taskId && l.to === linkFromTaskId)
    );
    const next = exists
      ? links.filter(
          (l) =>
            !(
              (l.from === linkFromTaskId && l.to === taskId) ||
              (l.from === taskId && l.to === linkFromTaskId)
            )
        )
      : [...links, { from: linkFromTaskId, to: taskId }];
    onUpdateLinks(next);
    setLinkFromTaskId(null);
  };

  const openTaskModal = (task: TaskNode) => {
    setTaskModalTaskId(task.id);
    setTaskModalTitle(task.title);
    setTaskModalNotes((task.notes ?? "").trim());
    setTaskModalError(null);
  };

  const closeTaskModal = () => {
    setTaskModalTaskId(null);
    setTaskModalTitle("");
    setTaskModalNotes("");
    setTaskModalError(null);
  };

  const saveTaskModal = () => {
    if (!taskModalTaskId) return;
    if (isCompleted || frozenTaskIds.has(taskModalTaskId)) {
      closeTaskModal();
      return;
    }
    const nextTitle = taskModalTitle.trim();
    if (!nextTitle) {
      setTaskModalError("Title is required.");
      return;
    }
    const nextNotes = taskModalNotes.trim();
    onUpdateTask(taskModalTaskId, {
      title: nextTitle,
      notes: nextNotes || undefined,
    });
    closeTaskModal();
  };

	  const handleTaskPointerDown = (e: ReactPointerEvent<HTMLDivElement>, taskId: string) => {
	    if (e.button !== 0) return;
	    const rect = taskRectsById.get(taskId);
	    if (!rect) return;
      const isTaskFrozen = frozenTaskIds.has(taskId);

	    taskPointerRef.current = {
	      taskId,
	      pointerId: e.pointerId,
	      zoom: boardZoom,
	      startClientX: e.clientX,
	      startClientY: e.clientY,
	      originX: rect.x,
	      originY: rect.y,
	      w: rect.w,
      h: rect.h,
      canDrag: canEditBoard && !isLinkMode && !isTaskFrozen,
      moved: false,
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (canEditBoard && !isLinkMode && !isTaskFrozen) {
      e.preventDefault();
    }
  };

	  const handleTaskPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
	    const st = taskPointerRef.current;
	    if (!st || st.pointerId !== e.pointerId) return;
	    if (!st.canDrag) return;

	    const rawDx = e.clientX - st.startClientX;
	    const rawDy = e.clientY - st.startClientY;
	    const dist = Math.hypot(rawDx, rawDy);

	    if (!st.moved && dist < 3) return;
	    st.moved = true;

	    const zoom = Number.isFinite(st.zoom) && st.zoom > 0 ? st.zoom : 1;
	    const dx = rawDx / zoom;
	    const dy = rawDy / zoom;
	    const nextX = Math.max(0, st.originX + dx);
	    const nextY = Math.max(0, st.originY + dy);
	    setDragPreview({ taskId: st.taskId, x: nextX, y: nextY });
	  };

	  const handleTaskPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
	    const st = taskPointerRef.current;
	    if (!st || st.pointerId !== e.pointerId) return;

    taskPointerRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

	    const rawDx = e.clientX - st.startClientX;
	    const rawDy = e.clientY - st.startClientY;
	    const dist = Math.hypot(rawDx, rawDy);
	    const moved = st.canDrag && (st.moved || dist >= 3);

	    if (moved) {
	      const zoom = Number.isFinite(st.zoom) && st.zoom > 0 ? st.zoom : 1;
	      const dx = rawDx / zoom;
	      const dy = rawDy / zoom;
	      const nextX = Math.max(0, st.originX + dx);
	      const nextY = Math.max(0, st.originY + dy);
	      setDragPreview(null);
	      onUpdateTask(st.taskId, { boardX: nextX, boardY: nextY });
	      extendBoardToFit({ x: nextX, y: nextY, w: st.w, h: st.h });
	      return;
	    }

    setDragPreview(null);
    if (isLinkMode) {
      handleLinkTaskClick(st.taskId);
      return;
    }

    const task = tasks.find((t) => t.id === st.taskId);
    if (task) openTaskModal(task);
  };

	  const handleResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>, taskId: string) => {
	    if (!canEditBoard) return;
	    if (isLinkMode) return;
      if (frozenTaskIds.has(taskId)) return;
	    const rect = taskRectsById.get(taskId);
    if (!rect) return;

    e.stopPropagation();
    e.preventDefault();

	    resizePointerRef.current = {
	      taskId,
	      pointerId: e.pointerId,
	      zoom: boardZoom,
	      startClientX: e.clientX,
	      startClientY: e.clientY,
	      originW: rect.w,
	      originH: rect.h,
      x: rect.x,
      y: rect.y,
      moved: false,
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

	  const handleResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
	    const st = resizePointerRef.current;
	    if (!st || st.pointerId !== e.pointerId) return;

	    const rawDx = e.clientX - st.startClientX;
	    const rawDy = e.clientY - st.startClientY;
	    const dist = Math.hypot(rawDx, rawDy);
	    if (!st.moved && dist < 2) return;
	    st.moved = true;

	    const zoom = Number.isFinite(st.zoom) && st.zoom > 0 ? st.zoom : 1;
	    const dx = rawDx / zoom;
	    const dy = rawDy / zoom;
	    const nextW = Math.max(160, Math.min(720, st.originW + dx));
	    const nextH = Math.max(110, Math.min(640, st.originH + dy));
	    setResizePreview({ taskId: st.taskId, w: nextW, h: nextH });
	  };

	  const handleResizePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
	    const st = resizePointerRef.current;
	    if (!st || st.pointerId !== e.pointerId) return;

    resizePointerRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

	    const rawDx = e.clientX - st.startClientX;
	    const rawDy = e.clientY - st.startClientY;
	    const zoom = Number.isFinite(st.zoom) && st.zoom > 0 ? st.zoom : 1;
	    const dx = rawDx / zoom;
	    const dy = rawDy / zoom;
	    const nextW = Math.max(160, Math.min(720, st.originW + dx));
	    const nextH = Math.max(110, Math.min(640, st.originH + dy));
	    setResizePreview(null);

	    onUpdateTask(st.taskId, { boardW: nextW, boardH: nextH });
	    extendBoardToFit({ x: st.x, y: st.y, w: nextW, h: nextH });
	  };

  useEffect(() => {
    if (!taskModalTaskId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTaskModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [taskModalTaskId]);

  return (
    <div style={{ marginBottom: 16 }}>
      {!hideTitle ? (
        <div
          style={{
            fontWeight: 600,
            marginBottom: 12,
            color: uiAccent,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!chromeless && (
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: accentColor,
                  display: "inline-block",
                }}
              />
            )}
            {title}
            {isCompleted && (
              <span style={{ fontSize: 12, color: uiAccent }}>✓ Completed</span>
            )}
          </div>
          {/* Actions for milestones that aren't completed */}
          {milestoneId && !isCompleted && (onMarkMilestoneCompleted || canSetObjective) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {canSetObjective && (
                <button
                  onClick={() => onSetObjective?.(milestoneId)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: "#fff7ed",
                    color: "#8a5a12",
                    border: `1px solid ${objectiveAccent}`,
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  title="Make this the month objective"
                >
                  Objective
                </button>
              )}
              {milestoneId && onMarkMilestoneCompleted && (
                <button
                  onClick={() => onMarkMilestoneCompleted(milestoneId)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: "white",
                    color,
                    border: `1px solid ${color}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  title="Mark this milestone as completed"
                >
                  ★ Mark Completed
                </button>
              )}
            </div>
          )}
        </div>
      ) : isCompleted || (milestoneId && !isCompleted && onMarkMilestoneCompleted) ? (
        null
      ) : null}

      <div>
        {/* Tasks whiteboard - Modern toolbar (hidden when floatingToolbar is true) */}
        {!floatingToolbar && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 16,
            padding: "12px 16px",
            backgroundColor: "#f8f9fa",
            borderRadius: 12,
            border: "1px solid #e9ecef",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!isCompleted && !hideAddButton && (
              <button
                onClick={() => onAddTask(milestoneId)}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  backgroundColor: noteBorderColor,
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  transition: "transform 0.1s, box-shadow 0.1s",
                }}
              >
                + Add Task
              </button>
            )}

            {!isCompleted && (
              <button
                onClick={() => setIsLinkMode((v) => !v)}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  backgroundColor: isLinkMode ? "#fee2e2" : "white",
                  color: isLinkMode ? "#dc2626" : "#6b7280",
                  border: isLinkMode ? "1px solid #fca5a5" : "1px solid #d1d5db",
                  borderRadius: 8,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                }}
                title="Create red links between tasks"
              >
                {isLinkMode ? "✓ Done Linking" : "⤳ Link"}
              </button>
            )}

            {!isCompleted && (
              <button
                onClick={handleExtendBoardClick}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  backgroundColor: "white",
                  color: "#6b7280",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                }}
                title="Add more whiteboard space"
              >
                ⊕ Expand
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isCompleted ? (
              <span
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  backgroundColor: "#fef3c7",
                  color: "#92400e",
                  borderRadius: 8,
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ color: "#f59e0b" }}>★</span> Completed
              </span>
            ) : milestoneId && (onMarkMilestoneCompleted || canSetObjective) ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {canSetObjective && (
                  <button
                    onClick={() => onSetObjective?.(milestoneId)}
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 800,
                      backgroundColor: "#fff7ed",
                      color: "#8a5a12",
                      border: `1px solid ${objectiveAccent}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    title="Make this the month objective"
                  >
                    ★ Objective
                  </button>
                )}
                {milestoneId && onMarkMilestoneCompleted ? (
                  <button
                    onClick={() => onMarkMilestoneCompleted(milestoneId)}
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: "white",
                      color: "#6b7280",
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "all 0.15s",
                    }}
                    title="Mark this milestone as completed"
                  >
                    <span style={{ color: "#f59e0b" }}>★</span> Complete
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        )}

        {!floatingToolbar && isLinkMode && !isCompleted && (
          <div style={{
            marginBottom: 12,
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 500,
            color: "#dc2626",
            backgroundColor: "#fef2f2",
            borderRadius: 8,
            border: "1px solid #fecaca",
          }}>
            {linkFromTaskId
              ? "→ Click another task to create a link (click the same task to cancel)"
              : "→ Click a task, then click another to create a link"}
          </div>
        )}

	        <div
	          style={{
	            borderRadius: 16,
	            backgroundColor: "#ffffff",
	            boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)",
	            overflow: "hidden",
	            position: "relative",
	            border: "1px solid #e5e7eb",
	          }}
	        >
	          {/* Modern zoom controls */}
	          <div style={{
	            position: "absolute",
	            top: 16,
	            right: 16,
	            zIndex: 20,
	            display: "flex",
	            backgroundColor: "white",
	            borderRadius: 10,
	            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
	            border: "1px solid #e5e7eb",
	            overflow: "hidden",
	          }}>
	            <button
	              type="button"
	              onClick={() =>
	                setBoardZoom((z) => {
	                  const next = Math.round((z + 0.1) * 10) / 10;
	                  return Math.max(0.5, Math.min(2, next));
	                })
	              }
	              aria-label="Zoom in"
	              title="Zoom in"
	              style={{
	                width: 36,
	                height: 36,
	                backgroundColor: "transparent",
	                color: "#374151",
	                border: "none",
	                borderRight: "1px solid #e5e7eb",
	                fontSize: 18,
	                fontWeight: 500,
	                lineHeight: 1,
	                cursor: "pointer",
	                transition: "background-color 0.15s",
	              }}
	              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f3f4f6"}
	              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
	            >
	              +
	            </button>
	            <div style={{
	              width: 48,
	              height: 36,
	              display: "flex",
	              alignItems: "center",
	              justifyContent: "center",
	              fontSize: 12,
	              fontWeight: 600,
	              color: "#6b7280",
	              borderRight: "1px solid #e5e7eb",
	            }}>
	              {Math.round(boardZoom * 100)}%
	            </div>
	            <button
	              type="button"
	              onClick={() =>
	                setBoardZoom((z) => {
	                  const next = Math.round((z - 0.1) * 10) / 10;
	                  return Math.max(0.5, Math.min(2, next));
	                })
	              }
	              aria-label="Zoom out"
	              title="Zoom out"
	              style={{
	                width: 36,
	                height: 36,
	                backgroundColor: "transparent",
	                color: "#374151",
	                border: "none",
	                fontSize: 18,
	                fontWeight: 500,
	                lineHeight: 1,
	                cursor: "pointer",
	                transition: "background-color 0.15s",
	              }}
	              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f3f4f6"}
	              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
	            >
	              −
	            </button>
	          </div>

	          {/* Floating toolbars inside whiteboard */}
	          {floatingToolbar && (
	            <>
	              {/* Toolbar 1: Milestone Navigation */}
	              {milestoneNavigation && (
	                <div
	                  style={{
	                    position: "absolute",
	                    top: 16,
	                    left: 16,
	                    zIndex: 20,
	                    display: "flex",
	                    gap: 4,
	                    padding: "6px 8px",
	                    backgroundColor: "rgba(255,255,255,0.95)",
	                    backdropFilter: "blur(8px)",
	                    borderRadius: 10,
	                    border: "1px solid rgba(0,0,0,0.08)",
	                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
	                  }}
	                >
	                  <div
	                    style={{ position: "relative" }}
	                    onMouseEnter={() => setMilestoneDropdownOpen(true)}
	                    onMouseLeave={() => setMilestoneDropdownOpen(false)}
	                  >
	                  <button
	                    style={{
	                      padding: "8px 12px",
	                      fontSize: 12,
	                      fontWeight: 700,
	                      backgroundColor: "transparent",
	                      color: "#374151",
	                      border: "none",
	                      borderRadius: 8,
	                      cursor: "pointer",
	                      display: "flex",
	                      alignItems: "center",
	                      gap: 6,
	                      maxWidth: 180,
	                    }}
	                    title="Switch milestone"
	                  >
	                    <span
	                      style={{
	                        width: 8,
	                        height: 8,
	                        borderRadius: "50%",
	                        backgroundColor: noteBorderColor,
	                        flexShrink: 0,
	                      }}
	                    />
	                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
	                      {milestoneNavigation.currentMilestoneId
	                        ? milestoneNavigation.pinnedMilestones.find((m) => m.id === milestoneNavigation.currentMilestoneId)?.title ?? "Milestone"
	                        : "Standalone"}
	                    </span>
	                    <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 2 }}>▼</span>
	                  </button>

	                  {/* Dropdown menu with hover bridge */}
	                  {milestoneDropdownOpen && (
	                    <div
	                      style={{
	                        position: "absolute",
	                        top: "100%",
	                        left: 0,
	                        paddingTop: 8,
	                        zIndex: 100,
	                      }}
	                    >
	                      <div
	                        style={{
	                          minWidth: 240,
	                          maxWidth: 300,
	                          backgroundColor: "white",
	                          borderRadius: 12,
	                          border: "1px solid #e2e8f0",
	                          boxShadow: "0 12px 32px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)",
	                          padding: "8px 0",
	                          overflow: "hidden",
	                        }}
	                      >
	                      {/* Section header */}
	                      <div style={{
	                        padding: "8px 14px 6px",
	                        fontSize: 10,
	                        fontWeight: 700,
	                        color: "#94a3b8",
	                        textTransform: "uppercase",
	                        letterSpacing: "0.5px",
	                      }}>
	                        Milestones
	                      </div>
	                      {/* Pinned milestones */}
	                      {pinnedMilestoneGroups.map((group, groupIndex) => (
	                        <div
	                          key={group.category?.id ?? `uncategorized-${groupIndex}`}
	                          style={{
	                            borderTop: groupIndex === 0 ? "none" : "1px solid #eef2f7",
	                            marginTop: groupIndex === 0 ? 0 : 6,
	                            paddingTop: groupIndex === 0 ? 0 : 8,
	                          }}
	                        >
	                          <div
	                            style={{
	                              padding: "4px 14px 6px",
	                              fontSize: 11,
	                              fontWeight: 700,
	                              color: "#94a3b8",
	                              lineHeight: 1.2,
	                              display: "flex",
	                              alignItems: "center",
	                              gap: 8,
	                            }}
	                          >
	                            <span
	                              style={{
	                                width: 8,
	                                height: 8,
	                                borderRadius: "50%",
	                                backgroundColor: group.category?.color ?? "#cbd5e1",
	                                flexShrink: 0,
	                              }}
	                            />
	                            <span>{group.category?.title ?? "Other"}</span>
	                          </div>
	                          {group.milestones.map((m) => {
	                            const mColor = group.category?.color ?? APP_MAIN_COLOR;
	                            const isPrimary = milestoneNavigation.primaryMilestoneId === m.id;
	                            const isActive = milestoneNavigation.currentMilestoneId === m.id;
	                            return (
	                              <button
	                                key={m.id}
	                                onClick={() => {
	                                  milestoneNavigation.onSelectMilestone(m.id);
	                                  setMilestoneDropdownOpen(false);
	                                }}
	                                style={{
	                                  width: "100%",
	                                  padding: "10px 14px",
	                                  fontSize: 12,
	                                  fontWeight: isActive ? 800 : 600,
	                                  backgroundColor: isActive ? "#f3f4f6" : "transparent",
	                                  color: "#333",
	                                  border: "none",
	                                  cursor: "pointer",
	                                  display: "flex",
	                                  alignItems: "center",
	                                  gap: 10,
	                                  textAlign: "left",
	                                }}
	                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f9fafb"}
	                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActive ? "#f3f4f6" : "transparent"}
	                              >
	                                <span
	                                  style={{
	                                    width: 10,
	                                    height: 10,
	                                    borderRadius: "50%",
	                                    backgroundColor: mColor,
	                                    flexShrink: 0,
	                                  }}
	                                />
	                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
	                                  {m.title}
	                                </span>
	                                {isPrimary && (
	                                  <span style={{ fontSize: 10, color: "#8a5a12", fontWeight: 800, backgroundColor: "#fef3c7", padding: "2px 6px", borderRadius: 4 }}>
	                                    ★
	                                  </span>
	                                )}
	                                {m.status === "COMPLETED" && (
	                                  <span style={{ fontSize: 10, color: "#059669" }}>✓</span>
	                                )}
	                              </button>
	                            );
	                          })}
	                        </div>
	                      ))}

	                      {/* Standalone option */}
	                      <button
	                        onClick={() => {
	                          milestoneNavigation.onSelectMilestone(null);
	                          setMilestoneDropdownOpen(false);
	                        }}
	                        style={{
	                          width: "100%",
	                          padding: "10px 14px",
	                          fontSize: 12,
	                          fontWeight: milestoneNavigation.currentMilestoneId === null ? 800 : 600,
	                          backgroundColor: milestoneNavigation.currentMilestoneId === null ? "#f3f4f6" : "transparent",
	                          color: "#333",
	                          border: "none",
	                          cursor: "pointer",
	                          display: "flex",
	                          alignItems: "center",
	                          gap: 10,
	                          textAlign: "left",
	                        }}
	                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f9fafb"}
	                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = milestoneNavigation.currentMilestoneId === null ? "#f3f4f6" : "transparent"}
	                      >
	                        <span
	                          style={{
	                            width: 10,
	                            height: 10,
	                            borderRadius: "50%",
	                            backgroundColor: "#64748b",
	                            flexShrink: 0,
	                          }}
	                        />
	                        <span>Standalone</span>
	                      </button>

	                      {/* Pin more option */}
	                      {milestoneNavigation.onPinMilestone && (
	                        <>
	                          <div style={{ height: 1, backgroundColor: "#e5e7eb", margin: "6px 0" }} />
	                          <button
	                            onClick={() => {
	                              milestoneNavigation.onPinMilestone?.();
	                              setMilestoneDropdownOpen(false);
	                            }}
	                            style={{
	                              width: "100%",
	                              padding: "10px 14px",
	                              fontSize: 12,
	                              fontWeight: 600,
	                              backgroundColor: "transparent",
	                              color: "#6b7280",
	                              border: "none",
	                              cursor: "pointer",
	                              display: "flex",
	                              alignItems: "center",
	                              gap: 10,
	                              textAlign: "left",
	                            }}
	                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f9fafb"}
	                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
	                          >
	                            <span style={{ fontSize: 14, color: "#9ca3af" }}>+</span>
	                            <span>Pin another milestone...</span>
	                          </button>
	                        </>
	                      )}

	                      {/* Milestone actions - only for selected milestone */}
	                      {milestoneNavigation.currentMilestoneId && (canSetObjective || onMarkMilestoneCompleted || milestoneNavigation.onUnpinMilestone) && (
	                        <>
	                          <div style={{ height: 1, backgroundColor: "#e5e7eb", margin: "8px 0" }} />

	                          {/* Actions section header */}
	                          <div style={{
	                            padding: "8px 14px 6px",
	                            fontSize: 10,
	                            fontWeight: 700,
	                            color: "#94a3b8",
	                            textTransform: "uppercase",
	                            letterSpacing: "0.5px",
	                          }}>
	                            Actions
	                          </div>

	                          {/* Set as Objective */}
	                          {canSetObjective && (
	                            <button
	                              onClick={() => {
	                                onSetObjective?.(milestoneNavigation.currentMilestoneId!);
	                                setMilestoneDropdownOpen(false);
	                              }}
	                              style={{
	                                width: "100%",
	                                padding: "10px 14px",
	                                fontSize: 12,
	                                fontWeight: 600,
	                                backgroundColor: "transparent",
	                                color: "#92400e",
	                                border: "none",
	                                cursor: "pointer",
	                                display: "flex",
	                                alignItems: "center",
	                                gap: 10,
	                                textAlign: "left",
	                                transition: "background-color 0.15s ease",
	                              }}
	                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#fef3c7"}
	                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
	                            >
	                              <span style={{
	                                width: 20,
	                                height: 20,
	                                borderRadius: 6,
	                                backgroundColor: "#fef3c7",
	                                display: "flex",
	                                alignItems: "center",
	                                justifyContent: "center",
	                                fontSize: 11,
	                              }}>★</span>
	                              <span>Set as Objective</span>
	                            </button>
	                          )}

	                          {/* Mark Complete */}
	                          {onMarkMilestoneCompleted && (
	                            <button
	                              onClick={() => {
	                                onMarkMilestoneCompleted(milestoneNavigation.currentMilestoneId!);
	                                setMilestoneDropdownOpen(false);
	                              }}
	                              style={{
	                                width: "100%",
	                                padding: "10px 14px",
	                                fontSize: 12,
	                                fontWeight: 600,
	                                backgroundColor: "transparent",
	                                color: "#047857",
	                                border: "none",
	                                cursor: "pointer",
	                                display: "flex",
	                                alignItems: "center",
	                                gap: 10,
	                                textAlign: "left",
	                                transition: "background-color 0.15s ease",
	                              }}
	                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#d1fae5"}
	                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
	                            >
	                              <span style={{
	                                width: 20,
	                                height: 20,
	                                borderRadius: 6,
	                                backgroundColor: "#d1fae5",
	                                display: "flex",
	                                alignItems: "center",
	                                justifyContent: "center",
	                                fontSize: 11,
	                              }}>✓</span>
	                              <span>Mark Complete</span>
	                            </button>
	                          )}

	                          {/* Unpin milestone */}
	                          {milestoneNavigation.onUnpinMilestone && (
	                            <button
	                              onClick={() => {
	                                milestoneNavigation.onUnpinMilestone!(milestoneNavigation.currentMilestoneId!);
	                                setMilestoneDropdownOpen(false);
	                              }}
	                              style={{
	                                width: "100%",
	                                padding: "10px 14px",
	                                fontSize: 12,
	                                fontWeight: 600,
	                                backgroundColor: "transparent",
	                                color: "#dc2626",
	                                border: "none",
	                                cursor: "pointer",
	                                display: "flex",
	                                alignItems: "center",
	                                gap: 10,
	                                textAlign: "left",
	                                transition: "background-color 0.15s ease",
	                              }}
	                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#fef2f2"}
	                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
	                            >
	                              <span style={{
	                                width: 20,
	                                height: 20,
	                                borderRadius: 6,
	                                backgroundColor: "#fef2f2",
	                                display: "flex",
	                                alignItems: "center",
	                                justifyContent: "center",
	                                fontSize: 11,
	                              }}>✕</span>
	                              <span>Unpin from Month</span>
	                            </button>
	                          )}
	                        </>
	                      )}
	                      </div>
	                    </div>
	                  )}
	                  </div>
	                </div>
	              )}

	              {/* Toolbar 2: Editing tools - positioned to the right with gap */}
	              {!isCompleted && (
	                <div
	                  style={{
	                    position: "absolute",
	                    top: 16,
	                    left: 260,
	                    zIndex: 20,
	                    display: "flex",
	                    gap: 4,
	                    padding: "6px 8px",
	                    backgroundColor: "rgba(255,255,255,0.95)",
	                    backdropFilter: "blur(8px)",
	                    borderRadius: 10,
	                    border: "1px solid rgba(0,0,0,0.08)",
	                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
	                  }}
	                >
	                  {!hideAddButton && (
	                    <button
	                      data-tutorial-target="add-task-whiteboard"
	                      onClick={() => onAddTask(milestoneId)}
	                      style={{
	                        padding: "8px 14px",
	                        fontSize: 12,
	                        fontWeight: 800,
	                        backgroundColor: noteBorderColor,
	                        color: "white",
	                        border: "none",
	                        borderRadius: 8,
	                        cursor: "pointer",
	                        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
	                        display: "flex",
	                        alignItems: "center",
	                        gap: 4,
	                      }}
	                      title="Add a new task"
	                    >
	                      + Add
	                    </button>
	                  )}
	                  <button
	                    onClick={() => setIsLinkMode((v) => !v)}
	                    style={{
	                      padding: "8px 10px",
	                      fontSize: 14,
	                      backgroundColor: isLinkMode ? "#fee2e2" : "transparent",
	                      color: isLinkMode ? "#dc2626" : "#64748b",
	                      border: "none",
	                      borderRadius: 8,
	                      cursor: "pointer",
	                      display: "flex",
	                      alignItems: "center",
	                      justifyContent: "center",
	                    }}
	                    title={isLinkMode ? "Exit link mode" : "Create links between tasks"}
	                  >
	                    {isLinkMode ? "✓" : "⤳"}
	                  </button>
	                  <button
	                    onClick={handleExtendBoardClick}
	                    style={{
	                      padding: "8px 10px",
	                      fontSize: 14,
	                      backgroundColor: "transparent",
	                      color: "#64748b",
	                      border: "none",
	                      borderRadius: 8,
	                      cursor: "pointer",
	                      display: "flex",
	                      alignItems: "center",
	                      justifyContent: "center",
	                    }}
	                    title="Add more whiteboard space"
	                  >
	                    ⊕
	                  </button>
	                </div>
	              )}
	            </>
	          )}

	          {/* Link mode hint below editing toolbar */}
	          {floatingToolbar && isLinkMode && !isCompleted && (
	            <div style={{
	              position: "absolute",
	              top: 64,
	              left: 260,
	              zIndex: 20,
	              padding: "8px 12px",
	              fontSize: 11,
	              fontWeight: 600,
	              color: "#dc2626",
	              backgroundColor: "rgba(254,242,242,0.95)",
	              borderRadius: 8,
	              border: "1px solid #fecaca",
	              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
	            }}>
	              {linkFromTaskId
	                ? "Click another task to link"
	                : "Click a task to start linking"}
	            </div>
	          )}

	          <div style={{ overflow: "auto", height: "min(100vh, 1230px)", minHeight: 520 }}>
	            <div style={{ position: "relative", width: baseBoardWidth * boardZoom, height: baseBoardHeight * boardZoom }}>
		              <div
		                style={{
		                  position: "absolute",
		                  left: 0,
		                  top: 0,
		                  width: baseBoardWidth,
		                  height: baseBoardHeight,
		                  transform: `scale(${boardZoom})`,
		                  transformOrigin: "0 0",
		                  backgroundColor: "#fafbfc",
		                  backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
		                  backgroundSize: "24px 24px",
		                }}
		              >
		                {/* Links layer */}
		                <svg
		                  width={baseBoardWidth}
		                  height={baseBoardHeight}
		                  style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}
		                >
		                  {(() => {
		                    const markerId = `taskLinkArrow-${milestoneId ?? "standalone"}`;
		                    const LINK_COLOR = noteBorderColor;
		                    const DEFAULT_GAP = 12;

		                    const getEdgePoint = (rect: TaskRect, dirX: number, dirY: number) => {
		                      const cx = rect.x + rect.w / 2;
		                      const cy = rect.y + rect.h / 2;
		                      const absX = Math.abs(dirX);
		                      const absY = Math.abs(dirY);
		                      const hx = rect.w / 2;
		                      const hy = rect.h / 2;
		                      const tx = absX > 1e-6 ? hx / absX : Number.POSITIVE_INFINITY;
		                      const ty = absY > 1e-6 ? hy / absY : Number.POSITIVE_INFINITY;
		                      const t = Math.min(tx, ty);
		                      return { x: cx + dirX * t, y: cy + dirY * t };
		                    };

		                    return (
		                      <>
		                        <defs>
		                          <marker
		                            id={markerId}
		                            viewBox="0 0 10 10"
		                            markerWidth="4"
		                            markerHeight="4"
		                            refX="10"
		                            refY="5"
		                            orient="auto"
		                          >
		                            <path d="M 0 0 L 10 5 L 0 10 z" fill={LINK_COLOR} />
		                          </marker>
		                        </defs>

		                        {links.map((l) => {
		                          const a = taskRectsById.get(l.from);
		                          const b = taskRectsById.get(l.to);
		                          if (!a || !b) return null;

		                          const ax = a.x + a.w / 2;
		                          const ay = a.y + a.h / 2;
		                          const bx = b.x + b.w / 2;
		                          const by = b.y + b.h / 2;
		                          const dx = bx - ax;
		                          const dy = by - ay;
		                          const len = Math.hypot(dx, dy);
		                          if (!Number.isFinite(len) || len < 1e-6) return null;

		                          const ux = dx / len;
		                          const uy = dy / len;

		                          const aEdge = getEdgePoint(a, ux, uy);
		                          const bEdge = getEdgePoint(b, -ux, -uy);
		                          const edgeDist = Math.hypot(bEdge.x - aEdge.x, bEdge.y - aEdge.y);
		                          const gap = Math.max(0, Math.min(DEFAULT_GAP, edgeDist / 2 - 8));

		                          const x1 = aEdge.x + ux * gap;
		                          const y1 = aEdge.y + uy * gap;
		                          const x2 = bEdge.x - ux * gap;
		                          const y2 = bEdge.y - uy * gap;

		                          return (
		                            <line
		                              key={`${l.from}:${l.to}`}
		                              x1={x1}
		                              y1={y1}
		                              x2={x2}
		                              y2={y2}
		                              stroke={LINK_COLOR}
		                              strokeWidth={2}
		                              strokeLinecap="round"
		                              opacity={0.9}
		                              markerEnd={`url(#${markerId})`}
		                            />
		                          );
		                        })}
		                      </>
		                    );
		                  })()}
		                </svg>

	                {tasks.map((task) => {
	                const rect = taskRectsById.get(task.id);
	                if (!rect) return null;
                  const isTaskFrozen = frozenTaskIds.has(task.id);

                const statusGlyph = task.status === "GREEN" ? "✓" : task.status === "YELLOW" ? "◐" : "○";
                const statusLabel = task.status === "GREEN" ? "Completed" : task.status === "YELLOW" ? "In Progress" : "Not Started";
                const statusColor = task.status === "GREEN" ? "#10b981" : task.status === "YELLOW" ? "#f59e0b" : "#9ca3af";
                const statusBgColor = task.status === "GREEN" ? "#d1fae5" : task.status === "YELLOW" ? "#fef3c7" : "#f3f4f6";
                const notes = (task.notes ?? "").trim();

                const isLinkSelected = isLinkMode && linkFromTaskId === task.id;
                const isDragging = dragPreview?.taskId === task.id;

                return (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      if (isLinkMode) handleLinkTaskClick(task.id);
                      else openTaskModal(task);
                    }}
                    onPointerDown={(e) => handleTaskPointerDown(e, task.id)}
                    onPointerMove={handleTaskPointerMove}
                    onPointerUp={handleTaskPointerUp}
                    style={{
                      position: "absolute",
                      left: rect.x,
                      top: rect.y,
                      width: rect.w,
                      height: rect.h,
                      padding: "14px 14px 42px",
                      boxSizing: "border-box",
                      borderRadius: 12,
                      backgroundColor: "#ffffff",
                      border: isLinkSelected ? "2px dashed #ef4444" : "1px solid #e5e7eb",
                      boxShadow: isDragging
                        ? "0 20px 40px rgba(0,0,0,0.15), 0 0 0 2px rgba(59,130,246,0.5)"
                        : "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
                      cursor: isLinkMode && !isTaskFrozen ? "crosshair" : canEditBoard && !isTaskFrozen ? "grab" : "pointer",
                      userSelect: "none",
                      overflow: "hidden",
                      zIndex: isDragging ? 5 : 2,
                      transition: "box-shadow 0.15s, transform 0.1s",
                    }}
                    title={isLinkMode ? "Click to link" : task.title}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div
                        style={{
                          flex: 1,
                          fontWeight: 600,
                          fontSize: 14,
                          color: "#111827",
                          lineHeight: 1.3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {task.title}
                      </div>

                      {!isCompleted && !isTaskFrozen && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetTaskStatus(task.id, "COMPLETED");
                            }}
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 5,
                              border: "1px solid #10b981",
                              backgroundColor: task.status === "GREEN" ? "#10b981" : "#ffffff",
                              color: task.status === "GREEN" ? "#ffffff" : "#10b981",
                              cursor: "pointer",
                              fontSize: 10,
                              fontWeight: 800,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title={task.status === "GREEN" ? "Clear completed status" : "Mark task as completed"}
                          >
                            ✓
                          </button>
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetTaskStatus(task.id, "NOT_COMPLETED");
                            }}
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 5,
                              border: "1px solid #f59e0b",
                              backgroundColor: task.status === "YELLOW" ? "#f59e0b" : "#ffffff",
                              color: task.status === "YELLOW" ? "#ffffff" : "#f59e0b",
                              cursor: "pointer",
                              fontSize: 10,
                              fontWeight: 800,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title={task.status === "YELLOW" ? "Clear work in progress status" : "Mark task as work in progress"}
                          >
                            ◐
                          </button>
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!window.confirm(`Delete task "${task.title}"?`)) return;
                              const nextLinks = links.filter((l) => l.from !== task.id && l.to !== task.id);
                              if (nextLinks.length !== links.length) onUpdateLinks(nextLinks);
                              onDeleteTask(task.id);
                            }}
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 5,
                              border: "1px solid #fecaca",
                              backgroundColor: "#ffffff",
                              color: "#ef4444",
                              cursor: "pointer",
                              fontSize: 10,
                              fontWeight: 800,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                            title="Delete task"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 13,
                        color: notes ? "#4b5563" : "#9ca3af",
                        fontStyle: notes ? "normal" : "italic",
                        lineHeight: 1.45,
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {notes || "Add notes…"}
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        bottom: 8,
                        left: 14,
                        right: 24,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 8px",
                          borderRadius: 6,
                          backgroundColor: statusBgColor,
                          fontSize: 11,
                          fontWeight: 700,
                          color: statusColor,
                          minWidth: 0,
                        }}
                        title={statusLabel}
                      >
                        <span>{statusGlyph}</span>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {statusLabel}
                        </span>
                      </div>

                    </div>

                    {!isCompleted && !isLinkMode && !isTaskFrozen && (
                      <div
                        onPointerDown={(e) => handleResizePointerDown(e, task.id)}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleResizePointerUp}
                        style={{
                          position: "absolute",
                          right: 4,
                          bottom: 4,
                          width: 14,
                          height: 14,
                          cursor: "se-resize",
                          opacity: 0.4,
                          backgroundImage: "linear-gradient(135deg, transparent 50%, #9ca3af 50%)",
                          borderRadius: 2,
                          transition: "opacity 0.15s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = "0.8"}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = "0.4"}
                        title="Resize"
                      />
                    )}
                  </div>
                );
	                })}
              </div>
            </div>
          </div>
        </div>
      </div>

	      {taskModalTaskId && (
	        <div
	          style={{
	            position: "fixed",
	            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
            padding: 16,
          }}
          onClick={closeTaskModal}
        >
          <div
            style={{
              backgroundColor: noteBackgroundColor,
              backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.65), rgba(0,0,0,0.02))",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 560,
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 10px 40px rgba(0,0,0,0.30)",
              border: `2px solid ${noteBorderColor}`,
            }}
            onClick={(e) => e.stopPropagation()}
	          >
	            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
	              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#111" }}>
	                Task Details
	              </h3>
	              <button
	                onClick={closeTaskModal}
	                style={{
	                  padding: "4px 8px",
                  fontSize: 18,
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#666",
                  lineHeight: 1,
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

	            <div style={{ marginBottom: 12 }}>
	              <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 12, color: "#333" }}>
	                Title
	              </label>
	              <input
	                type="text"
	                value={taskModalTitle}
	                onChange={(e) => setTaskModalTitle(e.target.value)}
	                readOnly={isCompleted || frozenTaskIds.has(taskModalTaskId)}
	                autoFocus
	                style={{
	                  width: "100%",
	                  padding: 10,
	                  fontSize: 14,
	                  backgroundColor: isCompleted || frozenTaskIds.has(taskModalTaskId) ? "rgba(255,255,255,0.55)" : "white",
	                  border: `1px solid ${noteBorderColor}`,
	                  borderRadius: 6,
	                  boxSizing: "border-box",
	                  outline: "none",
	                  cursor: isCompleted || frozenTaskIds.has(taskModalTaskId) ? "default" : "text",
	                }}
	              />
	            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 12, color: "#333" }}>
                Notes
              </label>
	              <textarea
	                value={taskModalNotes}
	                onChange={(e) => setTaskModalNotes(e.target.value)}
	                readOnly={isCompleted || frozenTaskIds.has(taskModalTaskId)}
	                rows={14}
	                style={{
	                  width: "100%",
	                  padding: 10,
	                  fontSize: 13,
	                  backgroundColor: isCompleted || frozenTaskIds.has(taskModalTaskId) ? "rgba(255,255,255,0.55)" : "white",
	                  border: `1px solid ${noteBorderColor}`,
	                  borderRadius: 6,
	                  boxSizing: "border-box",
	                  outline: "none",
	                  resize: "vertical",
	                  fontFamily: "inherit",
	                  cursor: isCompleted || frozenTaskIds.has(taskModalTaskId) ? "default" : "text",
	                }}
	              />
	            </div>

            {taskModalError && (
              <div style={{ marginBottom: 10, color: "#f44336", fontSize: 12, fontWeight: 600 }}>
                {taskModalError}
              </div>
            )}

	            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
	              <button
	                onClick={closeTaskModal}
	                style={{
	                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: "white",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: 8,
	                  cursor: "pointer",
	                }}
	              >
	                {isCompleted || frozenTaskIds.has(taskModalTaskId) ? "Close" : "Cancel"}
	              </button>
	              {!isCompleted && !frozenTaskIds.has(taskModalTaskId) && (
	                <button
	                  onClick={saveTaskModal}
	                  style={{
	                    padding: "8px 12px",
	                    fontSize: 13,
	                    fontWeight: 800,
	                    backgroundColor: noteBorderColor,
	                    color: "white",
	                    border: "none",
	                    borderRadius: 8,
	                    cursor: "pointer",
	                  }}
	                >
	                  Save
	                </button>
	              )}
	            </div>
	          </div>
	        </div>
	      )}
    </div>
  );
}

function FocusTemplatesPanel({
  templates,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  variant = "card",
  showIntro = true,
  showTitle = true,
  emptyStateText = "No focus templates yet",
  addButtonPlacement = "header",
  addButtonTutorialTarget,
}: {
  templates: FocusTemplate[];
  onAddTemplate: () => void;
  onUpdateTemplate: (
    templateId: string,
    updates: Partial<Pick<FocusTemplate, "title" | "plannedStart" | "plannedEnd" | "daysOfWeek" | "isSuspended">>
  ) => void;
  onDeleteTemplate: (templateId: string) => void;
  variant?: "card" | "plain";
  showIntro?: boolean;
  showTitle?: boolean;
  emptyStateText?: string | null;
  addButtonPlacement?: "header" | "footer-left";
  addButtonTutorialTarget?: string;
}) {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editTemplateTitle, setEditTemplateTitle] = useState("");
  const [editTemplateStart, setEditTemplateStart] = useState("");
  const [editTemplateEnd, setEditTemplateEnd] = useState("");
  const [editTemplateDays, setEditTemplateDays] = useState<Weekday[]>([]);

  const suspendInfoStorageKey = "focustree.templateSuspendInfo.dismissed";
  const [suspendInfoDismissed, setSuspendInfoDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(suspendInfoStorageKey) === "1";
    } catch {
      return false;
    }
  });
  const [suspendInfo, setSuspendInfo] = useState<{ action: "suspend" | "resume"; title: string } | null>(null);

  const startTemplateEdit = (template: FocusTemplate) => {
    setEditingTemplateId(template.id);
    setEditTemplateTitle(template.title);
    setEditTemplateStart(template.plannedStart);
    setEditTemplateEnd(template.plannedEnd);
    setEditTemplateDays(template.daysOfWeek ? [...template.daysOfWeek] : []);
  };

  const saveTemplateEdit = () => {
    if (editingTemplateId && editTemplateTitle.trim()) {
      onUpdateTemplate(editingTemplateId, {
        title: editTemplateTitle.trim(),
        plannedStart: editTemplateStart || "09:00",
        plannedEnd: editTemplateEnd || "10:00",
        daysOfWeek: editTemplateDays.length > 0 ? editTemplateDays : undefined,
      });
    }
    setEditingTemplateId(null);
    setEditTemplateTitle("");
    setEditTemplateStart("");
    setEditTemplateEnd("");
    setEditTemplateDays([]);
  };

  const toggleTemplateDay = (day: Weekday) => {
    setEditTemplateDays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day);
      return sortWeekdays([...prev, day]);
    });
  };

  const panelBgColor = "#fbfaf7";
  const panelBgPattern =
    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)";

  const uiAccent = APP_MAIN_COLOR;

  const panelStyle =
    variant === "card"
      ? {
          border: "2px solid #eee",
          borderRadius: 12,
          padding: 20,
          backgroundColor: panelBgColor,
          backgroundImage: panelBgPattern,
          backgroundSize: "24px 24px",
        }
      : {
          border: "none",
          borderRadius: 0,
          padding: 0,
          backgroundColor: "transparent",
          backgroundImage: "none",
        };

  const addButton = (
    <button
      {...(addButtonTutorialTarget ? { "data-tutorial-target": addButtonTutorialTarget } : {})}
      onClick={onAddTemplate}
      style={{
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        backgroundColor: uiAccent,
        color: "white",
        border: "none",
        borderRadius: 10,
        cursor: "pointer",
        whiteSpace: "nowrap",
        boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
      }}
    >
      + Add focus template
    </button>
  );

  return (
    <div style={panelStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          {showTitle ? <div style={{ fontSize: 16, fontWeight: 900, color: "#333" }}>Focus templates</div> : null}
          {showIntro ? (
            <div style={{ fontSize: 13, color: "#666", marginTop: 6, lineHeight: 1.5 }}>
              Define monthly focus sessions here. You can link them to milestones day-by-day in the Daily page.
            </div>
          ) : null}
        </div>

        {addButtonPlacement === "header" ? addButton : null}
      </div>

      {templates.length === 0 ? (
        emptyStateText ? (
          <p style={{ fontSize: 14, color: "#999", fontStyle: "italic", margin: 0 }}>{emptyStateText}</p>
        ) : null
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {templates.map((template) => (
            <div
              key={template.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 12px",
                backgroundColor: "rgba(255,255,255,0.92)",
                borderRadius: 12,
                border: "1px solid #e6e6e6",
                opacity: template.isSuspended ? 0.55 : 1,
                flexWrap: "wrap",
              }}
            >
              {editingTemplateId === template.id ? (
                <>
                  <input
                    type="text"
                    value={editTemplateTitle}
                    onChange={(e) => setEditTemplateTitle(e.target.value)}
                    placeholder="Template name"
                    style={{
                      flex: "1 1 160px",
                      minWidth: 140,
                      padding: "7px 12px",
                      fontSize: 14,
                      border: `1px solid ${uiAccent}`,
                      borderRadius: 4,
                      outline: "none",
                    }}
                  />
                  <input
                    type="time"
                    value={editTemplateStart}
                    onChange={(e) => setEditTemplateStart(e.target.value)}
                    style={{
                      width: 92,
                      padding: "7px 10px",
                      fontSize: 14,
                      border: `1px solid ${uiAccent}`,
                      borderRadius: 4,
                    }}
                  />
                  <span style={{ fontSize: 13, color: "#999" }}>-</span>
                  <input
                    type="time"
                    value={editTemplateEnd}
                    onChange={(e) => setEditTemplateEnd(e.target.value)}
                    style={{
                      width: 92,
                      padding: "7px 10px",
                      fontSize: 14,
                      border: `1px solid ${uiAccent}`,
                      borderRadius: 4,
                    }}
                  />
                  <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#666" }}>Days:</span>
                    {WEEKDAY_ORDER.map((day) => {
                      const isSelected = editTemplateDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleTemplateDay(day)}
                          style={{
                            padding: "5px 10px",
                            fontSize: 13,
                            fontWeight: 800,
                            backgroundColor: isSelected ? uiAccent : "white",
                            color: isSelected ? "white" : uiAccent,
                            border: `1px solid ${uiAccent}`,
                            borderRadius: 999,
                            cursor: "pointer",
                          }}
                          title={WEEKDAY_SHORT[day]}
                        >
                          {WEEKDAY_SHORT[day]}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setEditTemplateDays([...MON_FRI])}
                      style={{
                        padding: "5px 10px",
                        fontSize: 13,
                        fontWeight: 800,
                        backgroundColor: "white",
                        color: uiAccent,
                        border: `1px dashed ${uiAccent}`,
                        borderRadius: 999,
                        cursor: "pointer",
                      }}
                    >
                      Mon–Fri
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditTemplateDays([])}
                      style={{
                        padding: "5px 10px",
                        fontSize: 13,
                        fontWeight: 800,
                        backgroundColor: "white",
                        color: uiAccent,
                        border: `1px dashed ${uiAccent}`,
                        borderRadius: 999,
                        cursor: "pointer",
                      }}
                    >
                      Any
                    </button>
                  </div>

                  <div style={{ flexBasis: "100%", display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                    <button
                      onClick={saveTemplateEdit}
                      style={{
                        padding: "7px 12px",
                        fontSize: 13,
                        backgroundColor: "#4caf50",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingTemplateId(null)}
                      style={{
                        padding: "7px 12px",
                        fontSize: 13,
                        backgroundColor: "transparent",
                        color: "#666",
                        border: "1px solid #ddd",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span
                    onClick={() => startTemplateEdit(template)}
                    style={{
                      flex: "1 1 160px",
                      minWidth: 140,
                      fontSize: 15,
                      cursor: "pointer",
                      color: "#333",
                      fontWeight: 900,
                    }}
                  >
                    {template.title}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      color: "#666",
                      flex: "1 1 160px",
                      minWidth: 140,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatWeekdays(template.daysOfWeek)}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      color: "#666",
                      fontFamily: "monospace",
                      flex: "0 0 auto",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {template.plannedStart}-{template.plannedEnd}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextSuspended = !template.isSuspended;
                        onUpdateTemplate(template.id, { isSuspended: nextSuspended });
                        if (!suspendInfoDismissed) {
                          setSuspendInfo({
                            action: nextSuspended ? "suspend" : "resume",
                            title: template.title,
                          });
                        }
                      }}
                      title={template.isSuspended ? "Resume focus template" : "Suspend focus template"}
                      style={{
                        padding: "4px 10px",
                        fontSize: 13,
                        backgroundColor: "transparent",
                        color: template.isSuspended ? "#2e7d32" : "#f9a825",
                        border: "none",
                        cursor: "pointer",
                        opacity: 0.8,
                      }}
                    >
                      {template.isSuspended ? "▶" : "⏸"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete focus template "${template.title}"?`)) {
                          onDeleteTemplate(template.id);
                        }
                      }}
                      style={{
                        padding: "4px 10px",
                        fontSize: 13,
                        backgroundColor: "transparent",
                        color: "#f44336",
                        border: "none",
                        cursor: "pointer",
                        opacity: 0.7,
                      }}
                      title="Delete focus template"
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {addButtonPlacement === "footer-left" ? (
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-start" }}>{addButton}</div>
      ) : null}

      {suspendInfo && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setSuspendInfo(null)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 460,
              width: "90%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>
              {suspendInfo.action === "suspend" ? "Focus template suspended" : "Focus template resumed"}
            </h3>
            <p style={{ margin: 0, marginBottom: 14, color: "#666", fontSize: 13, lineHeight: 1.5 }}>
              {suspendInfo.action === "suspend"
                ? `“${suspendInfo.title}” will stop appearing in the Daily page, but any past sessions remain saved. You can bring it back anytime with ▶.`
                : `“${suspendInfo.title}” will appear again in the Daily page on its scheduled days.`}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => {
                  try {
                    window.localStorage.setItem(suspendInfoStorageKey, "1");
                  } catch {
                    // ignore
                  }
                  setSuspendInfoDismissed(true);
                  setSuspendInfo(null);
                }}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "white",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: "#666",
                }}
              >
                Don't show again
              </button>
              <button
                onClick={() => setSuspendInfo(null)}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#111",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: "white",
                  fontWeight: 700,
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type MonthSetupPageProps = {
  tutorialMode?: boolean;
  onTutorialTick?: () => void;
  onWizardStateChange?: (info: { open: boolean; primarySelected: boolean; wizardStep: number }) => void;
};

export default function MonthSetupPage(props: MonthSetupPageProps = {}) {
  const { tutorialMode, onTutorialTick, onWizardStateChange } = props;
  const { selectedMonth } = useDateNavigation();
  const ymSafe = selectedMonth;

  const [tick, setTick] = useState(0);
  const rawState = useMemo(() => loadState(), [tick]);
  const currentYM = getCurrentYM();
  const { state, didAutoClose } = useMemo(() => {
    let next = rawState;
    let changed = false;
    Object.values(rawState.months).forEach((plan0) => {
      if (plan0.ym < currentYM && !plan0.isClosed) {
        next = autoCloseMonth(next, plan0.ym);
        changed = true;
      }
    });
    return { state: next, didAutoClose: changed };
  }, [rawState, currentYM]);
  const plan = getMonth(state, ymSafe);
  const frozenTaskIds = useMemo(() => getFrozenTaskIds(state), [state]);
  const shortName = getShortUserName(getUserName());
  const selectableMilestoneIds = state.grandPlan
    ? getSelectableMilestoneIds(state.grandPlan.milestones)
    : new Set<string>();

  const [fireworks, setFireworks] = useState<{ key: number; colors: string[] } | null>(null);

  // Check month access (uses virtual time in dev mode)
  const monthAccess = useMemo(
    () => checkMonthAccess(state, ymSafe),
    [state, ymSafe]
  );

  useEffect(() => {
    if (!didAutoClose) return;
    saveState(state);
    setTick((t) => t + 1);
  }, [didAutoClose, state]);

  const previousYM = useMemo(() => getPreviousYM(ymSafe), [ymSafe]);
  const previousPlan = previousYM ? getMonth(state, previousYM) : undefined;
  const carryoverMilestoneIds = useMemo(() => {
    if (!previousPlan || !state.grandPlan) return new Set<string>();
    const milestonesById = new Map(state.grandPlan.milestones.map((m) => [m.id, m] as const));
    return new Set(
      (previousPlan.pinnedMilestoneIds ?? []).filter((id) => {
        const milestone = milestonesById.get(id);
        return milestone ? milestone.status !== "COMPLETED" : false;
      })
    );
  }, [previousPlan, state.grandPlan]);

  // Header component for blocked/empty states
  const BlockedHeader = () => (
    <div style={{ marginBottom: 24, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
        <div />
        <div style={{ textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#111", letterSpacing: 0.2 }}>
            Month Plan
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

  // v6: Check if month is within Grand Plan period
  const isInPeriod = isMonthInGrandPlanPeriod(state, ymSafe);

  // v5: Close month modal
  const [showCloseModal, setShowCloseModal] = useState(false);

  // v6.1: Milestone picker modal
  const [showMilestonePicker, setShowMilestonePicker] = useState(false);

  // v12: Month setup wizard
  const [showMonthWizard, setShowMonthWizard] = useState(false);
  const [monthWizardStep, setMonthWizardStep] = useState(0);
  const [monthWizardPrimaryId, setMonthWizardPrimaryId] = useState<string | null>(null);
  const [monthWizardSecondaryIds, setMonthWizardSecondaryIds] = useState<string[]>([]);
  const [monthWizardPrimaryMenuOpen, setMonthWizardPrimaryMenuOpen] = useState(false);
  const [monthWizardSecondaryMenuOpen, setMonthWizardSecondaryMenuOpen] = useState(false);
  const monthWizardPrimaryMenuRef = useRef<HTMLDivElement | null>(null);
  const monthWizardSecondaryMenuRef = useRef<HTMLDivElement | null>(null);

  // v9.3: Confirm milestone completion
  const [confirmCompleteMilestoneId, setConfirmCompleteMilestoneId] = useState<string | null>(null);

  const [creatingTask, setCreatingTask] = useState<{ milestoneId: string | null } | null>(null);

  // v8: Pin navigation (null = Standalone)
  const selectedPinStorageKey = `focustree:month-setup:selected-pin:${ymSafe}`;
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(() => {
    try {
      const raw = window.localStorage.getItem(selectedPinStorageKey);
      if (!raw || raw === "standalone") return null;
      if (raw.startsWith("milestone:")) return raw.slice("milestone:".length) || null;
      return null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        selectedPinStorageKey,
        selectedMilestoneId ? `milestone:${selectedMilestoneId}` : "standalone"
      );
    } catch {
      // ignore
    }
  }, [selectedPinStorageKey, selectedMilestoneId]);

  // v6.3: Add focus template modal
  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newTemplateStart, setNewTemplateStart] = useState("09:00");
  const [newTemplateEnd, setNewTemplateEnd] = useState("10:00");
  const [newTemplateDays, setNewTemplateDays] = useState<Weekday[]>([...MON_FRI]);
  const [addTemplateError, setAddTemplateError] = useState<string | null>(null);

  const mutate = (fn: (s: typeof state) => typeof state) => {
    const current = loadState();
    const next = fn(current);
    saveState(next);
    setTick((x) => x + 1);
    onTutorialTick?.();
  };

  const create = () => {
    const current = loadState();
    const prevYM = getPreviousYM(ymSafe);
    const prevPlan = prevYM ? getMonth(current, prevYM) : undefined;
    const basePlan = seedPlan(ymSafe);
    const nextPlan = prevPlan
      ? { ...basePlan, templates: prevPlan.templates.map((t) => ({ ...t })) }
      : basePlan;
    const next = upsertMonth(current, nextPlan);
    saveState(next);
    setTick((x) => x + 1);
    onTutorialTick?.();
    setShowMonthWizard(true);
    setMonthWizardStep(0);
    onWizardStateChange?.({ open: true, primarySelected: false, wizardStep: 0 });
  };

  const handlePlanUpdate = (updatedPlan: MonthPlan) => {
    const current = loadState();
    saveState(upsertMonth(current, updatedPlan));
    setTick((x) => x + 1);
    onTutorialTick?.();
  };

  // v5: Close/reopen month handlers
  const handleCloseMonth = () => {
    const current = loadState();
    const next = closeMonth(current, ymSafe);
    saveState(next);
    setTick((x) => x + 1);
    setShowCloseModal(false);
  };

  const handleReopenMonth = () => {
    const current = loadState();
    const next = reopenMonth(current, ymSafe);
    saveState(next);
    setTick((x) => x + 1);
  };

  // v6.1: Task handlers
  const handleAddTask = (milestoneId: string | null) => {
    setCreatingTask({ milestoneId });
  };

  const handleUpdateTask = (
    taskId: string,
    updates: Partial<Pick<TaskNode, "title" | "notes" | "boardX" | "boardY" | "boardW" | "boardH">>
  ) => {
    mutate((s) => updateTask(s, taskId, updates));
  };

  const handleDeleteTask = (taskId: string) => {
    mutate((s) => deleteTask(s, taskId));
  };

  const handleSetTaskStatus = (taskId: string, outcome: "COMPLETED" | "NOT_COMPLETED" | undefined) => {
    mutate((s) => applyTaskStatus(s, taskId, outcome));
  };

  // v8: Milestones pinned to this month (shown as "pins" at the top)
  const pinnedMilestones = getMilestonesInMonth(state, ymSafe);
  const pinnedIdsKey = (plan?.pinnedMilestoneIds ?? []).join("|");
  const primaryMilestoneId = plan?.primaryMilestoneId ?? null;
  const orderedPinnedMilestones = useMemo(() => {
    const categoriesById = new Map((state.grandPlan?.categories ?? []).map((category) => [category.id, category] as const));
    return pinnedMilestones
      .slice()
      .sort((a, b) => {
        const aCategory = categoriesById.get(a.categoryId);
        const bCategory = categoriesById.get(b.categoryId);
        const hueDiff = getColorHue(aCategory?.color ?? "") - getColorHue(bCategory?.color ?? "");
        if (hueDiff !== 0) return hueDiff;
        const categoryTitleDiff = (aCategory?.title ?? "").localeCompare(bCategory?.title ?? "");
        if (categoryTitleDiff !== 0) return categoryTitleDiff;
        const aIsPrimary = a.id === primaryMilestoneId;
        const bIsPrimary = b.id === primaryMilestoneId;
        if (aIsPrimary !== bIsPrimary) return aIsPrimary ? -1 : 1;
        if (a.order !== b.order) return a.order - b.order;
        return a.title.localeCompare(b.title);
      });
  }, [pinnedMilestones, state.grandPlan?.categories, primaryMilestoneId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(selectedPinStorageKey);
      const pinned = plan?.pinnedMilestoneIds ?? [];
      const fallback = plan?.primaryMilestoneId ?? pinned[0] ?? null;
      if (!raw) {
        setSelectedMilestoneId(null);
        return;
      }
      if (raw === "standalone") {
        setSelectedMilestoneId(pinned.length > 0 ? fallback : null);
        return;
      }
      if (raw.startsWith("milestone:")) {
        setSelectedMilestoneId(raw.slice("milestone:".length) || null);
        return;
      }
      setSelectedMilestoneId(null);
    } catch {
      setSelectedMilestoneId(null);
    }
  }, [selectedPinStorageKey, plan?.primaryMilestoneId, pinnedIdsKey]);

  const wizardMilestoneGroups = useMemo(() => {
    if (!state.grandPlan) return [] as Array<{ category: Category; milestones: MilestoneNode[] }>;
    return state.grandPlan.categories
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((category) => {
        const milestones = state.grandPlan!.milestones
          .filter((m) => m.categoryId === category.id && selectableMilestoneIds.has(m.id))
          .slice()
          .sort((a, b) => a.order - b.order);
        if (milestones.length === 0) return null;
        return { category, milestones };
      })
      .filter((group): group is { category: Category; milestones: MilestoneNode[] } => group !== null);
  }, [state.grandPlan]);

  const wizardMilestoneIndex = useMemo(() => {
    const map = new Map<string, { title: string; categoryTitle: string; categoryColor: string }>();
    for (const group of wizardMilestoneGroups) {
      for (const milestone of group.milestones) {
        map.set(milestone.id, {
          title: milestone.title,
          categoryTitle: group.category.title,
          categoryColor: group.category.color,
        });
      }
    }
    return map;
  }, [wizardMilestoneGroups]);

  const selectedObjectiveTitle = monthWizardPrimaryId
    ? wizardMilestoneIndex.get(monthWizardPrimaryId)?.title ?? ""
    : "";

  useEffect(() => {
    if (!plan || !showMonthWizard) return;
    // Only pre-select if already saved, otherwise let user choose
    const primaryId = plan.primaryMilestoneId ?? null;
    const nextPrimary = primaryId && selectableMilestoneIds.has(primaryId) ? primaryId : null;
    setMonthWizardPrimaryId(nextPrimary);
    setMonthWizardSecondaryIds(
      (plan.pinnedMilestoneIds ?? []).filter((id) => id !== primaryId && selectableMilestoneIds.has(id))
    );
  }, [showMonthWizard, plan?.primaryMilestoneId, pinnedIdsKey]);

  useEffect(() => {
    if (!showMonthWizard) {
      setMonthWizardPrimaryMenuOpen(false);
      setMonthWizardSecondaryMenuOpen(false);
    }
  }, [showMonthWizard]);

  useEffect(() => {
    if (!monthWizardPrimaryMenuOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const node = monthWizardPrimaryMenuRef.current;
      if (!node) return;
      if (node.contains(e.target as Node)) return;
      setMonthWizardPrimaryMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [monthWizardPrimaryMenuOpen]);

  useEffect(() => {
    if (!monthWizardSecondaryMenuOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const node = monthWizardSecondaryMenuRef.current;
      if (!node) return;
      if (node.contains(e.target as Node)) return;
      setMonthWizardSecondaryMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [monthWizardSecondaryMenuOpen]);

  useEffect(() => {
    if (!monthWizardPrimaryId) {
      setMonthWizardSecondaryIds([]);
      setMonthWizardSecondaryMenuOpen(false);
      return;
    }
    setMonthWizardSecondaryIds((prev) => prev.filter((id) => id !== monthWizardPrimaryId));
  }, [monthWizardPrimaryId]);

  useEffect(() => {
    if (!plan) return;
    try {
      const raw = window.localStorage.getItem(selectedPinStorageKey);
      if (raw == null && plan.pinnedMilestoneIds.length > 0) {
        setSelectedMilestoneId(plan.pinnedMilestoneIds[0] ?? null);
      }
    } catch {
      // ignore
    }
  }, [selectedPinStorageKey, pinnedIdsKey]);

  useEffect(() => {
    if (!plan) return;
    const visibleIds = new Set(pinnedMilestones.map((m) => m.id));
    if (selectedMilestoneId && !visibleIds.has(selectedMilestoneId)) {
      setSelectedMilestoneId(pinnedMilestones[0]?.id ?? null);
    }
  }, [pinnedMilestones, selectedMilestoneId]);

  // Removed auto-selection of primary milestone - user must explicitly choose via wizard

  // If month is not allowed, show appropriate blocked panel
  if (!monthAccess.allowed) {
    if (monthAccess.reason === "future") {
      return (
        <div>
          <BlockedHeader />
          <FutureMonthPanel ym={ymSafe} />
        </div>
      );
    }
    if (monthAccess.reason === "past_unactivated") {
      return (
        <div>
          <BlockedHeader />
          <PastUnactivatedMonthPanel ym={ymSafe} />
        </div>
      );
    }
  }

  // v6: Grand Plan is mandatory - show panel to create one if not exists
  if (!state.grandPlan) {
    return (
      <div>
        <BlockedHeader />
        <NoGrandPlanPanel />
      </div>
    );
  }

  const allTasks = useMemo(() => getAllTasks(state), [state]);
  const monthTasks = useMemo(() => getTasksForMonth(state, ymSafe), [state, ymSafe]);
  const standaloneTasks = useMemo(() => getStandaloneTasks(state), [state]);

  const monthWizardSteps = ["Milestones", "Focus sessions"] as const;
  const monthWizardTitle = monthWizardSteps[monthWizardStep] ?? monthWizardSteps[0];

  // v8: Pin milestone to this month board (no automatic task creation)
  const handlePinMilestone = (milestone: MilestoneNode) => {
    if (!plan) return;
    if (!selectableMilestoneIds.has(milestone.id)) return;
    mutate((s0) => {
      const plan0 = getMonth(s0, ymSafe);
      if (!plan0) return s0;
      const nextPinned = plan0.pinnedMilestoneIds.includes(milestone.id)
        ? plan0.pinnedMilestoneIds
        : [...plan0.pinnedMilestoneIds, milestone.id];
      const nextPrimary = plan0.primaryMilestoneId ?? milestone.id;
      let nextState = upsertMonth(s0, { ...plan0, pinnedMilestoneIds: nextPinned, primaryMilestoneId: nextPrimary });
      const m0 = nextState.grandPlan?.milestones.find((m) => m.id === milestone.id);
      if (m0 && m0.status === "NOT_STARTED") {
        nextState = updateMilestone(nextState, milestone.id, { status: "IN_PROGRESS" });
      }
      return nextState;
    });
    setSelectedMilestoneId(milestone.id);
    setShowMilestonePicker(false);
  };

  const handleUnpinMilestone = (milestoneId: string) => {
    if (!plan) return;
    mutate((s0) => {
      const plan0 = getMonth(s0, ymSafe);
      if (!plan0) return s0;
      const nextPinned = plan0.pinnedMilestoneIds.filter((id) => id !== milestoneId);
      const nextPrimary = plan0.primaryMilestoneId === milestoneId
        ? nextPinned[0] ?? undefined
        : plan0.primaryMilestoneId;
      return upsertMonth(s0, {
        ...plan0,
        pinnedMilestoneIds: nextPinned,
        primaryMilestoneId: nextPrimary,
      });
    });
    setSelectedMilestoneId((prev) => prev === milestoneId ? null : prev);
  };

  const handleSetObjectiveMilestone = (milestoneId: string) => {
    if (!plan) return;
    mutate((s0) => {
      const plan0 = getMonth(s0, ymSafe);
      if (!plan0) return s0;
      const nextPinned = plan0.pinnedMilestoneIds.includes(milestoneId)
        ? plan0.pinnedMilestoneIds
        : [...plan0.pinnedMilestoneIds, milestoneId];
      let nextState = upsertMonth(s0, { ...plan0, pinnedMilestoneIds: nextPinned, primaryMilestoneId: milestoneId });
      const m0 = nextState.grandPlan?.milestones.find((m) => m.id === milestoneId);
      if (m0 && m0.status === "NOT_STARTED") {
        nextState = updateMilestone(nextState, milestoneId, { status: "IN_PROGRESS" });
      }
      return nextState;
    });
    setSelectedMilestoneId(milestoneId);
  };

  const closeMonthWizard = () => {
    setShowMonthWizard(false);
    setMonthWizardStep(0);
    onWizardStateChange?.({ open: false, primarySelected: false, wizardStep: 0 });
  };

  const applyMonthWizardMilestones = () => {
    if (!plan) return;
    const filteredSecondary = monthWizardSecondaryIds.filter(
      (id) => id && selectableMilestoneIds.has(id)
    );
    const fallbackPrimary = monthWizardPrimaryId && selectableMilestoneIds.has(monthWizardPrimaryId)
      ? monthWizardPrimaryId
      : filteredSecondary[0] ?? undefined;
    const secondaryIds = filteredSecondary.filter((id) => id && id !== fallbackPrimary);
    const nextPinned = Array.from(new Set([...(fallbackPrimary ? [fallbackPrimary] : []), ...secondaryIds]));
    mutate((s0) => {
      const plan0 = getMonth(s0, ymSafe);
      if (!plan0) return s0;
      const nextPlan: MonthPlan = {
        ...plan0,
        pinnedMilestoneIds: nextPinned,
        primaryMilestoneId: fallbackPrimary,
      };

      let nextState = upsertMonth(s0, nextPlan);
      nextPinned.forEach((milestoneId) => {
        const m0 = nextState.grandPlan?.milestones.find((m) => m.id === milestoneId);
        if (m0 && m0.status === "NOT_STARTED") {
          nextState = updateMilestone(nextState, milestoneId, { status: "IN_PROGRESS" });
        }
      });
      return nextState;
    });
    setSelectedMilestoneId(fallbackPrimary ?? nextPinned[0] ?? null);
  };

  const handleFinishMonthWizard = () => {
    applyMonthWizardMilestones();
    closeMonthWizard();
  };

  const handleWizardPrimarySelect = (milestoneId: string | null) => {
    setMonthWizardPrimaryId(milestoneId);
    setMonthWizardPrimaryMenuOpen(false);
    if (milestoneId) {
      setMonthWizardSecondaryIds((prev) => prev.filter((id) => id !== milestoneId));
    }
    onWizardStateChange?.({ open: true, primarySelected: !!milestoneId, wizardStep: monthWizardStep });
  };

  const toggleWizardSecondary = (milestoneId: string) => {
    setMonthWizardSecondaryIds((prev) => {
      if (prev.includes(milestoneId)) return prev.filter((id) => id !== milestoneId);
      if (milestoneId === monthWizardPrimaryId) return prev;
      return [...prev, milestoneId];
    });
  };

  const removeWizardSecondary = (milestoneId: string) => {
    setMonthWizardSecondaryIds((prev) => prev.filter((id) => id !== milestoneId));
  };

  // v6.1: Mark milestone as completed
  const handleMarkMilestoneCompleted = (milestoneId: string) => {
    setConfirmCompleteMilestoneId(milestoneId);
  };

  const confirmMarkMilestoneCompleted = () => {
    if (!confirmCompleteMilestoneId) return;
    const milestoneId = confirmCompleteMilestoneId;
    setConfirmCompleteMilestoneId(null);

    const milestone = state.grandPlan?.milestones.find((m) => m.id === milestoneId);
    const categoryColor = milestone
      ? state.grandPlan?.categories.find((c) => c.id === milestone.categoryId)?.color
      : undefined;
    const colors = categoryColor ? [categoryColor, "#FFD700", "#ffffff"] : ["#FFD700", "#ff9800", "#ffffff"];
    setFireworks({ key: Date.now(), colors });

    mutate((s) => updateMilestone(s, milestoneId, { status: "COMPLETED" }));
  };

  // v6.3: Template handlers
  const toggleNewTemplateDay = (day: Weekday) => {
    setNewTemplateDays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day);
      return sortWeekdays([...prev, day]);
    });
  };

  const handleAddTemplate = () => {
    setNewTemplateTitle("");
    setNewTemplateStart("09:00");
    setNewTemplateEnd("10:00");
    setNewTemplateDays([...MON_FRI]);
    setAddTemplateError(null);
    setShowAddTemplateModal(true);
  };

  const closeAddTemplateModal = () => {
    setShowAddTemplateModal(false);
    setNewTemplateTitle("");
    setNewTemplateStart("09:00");
    setNewTemplateEnd("10:00");
    setNewTemplateDays([...MON_FRI]);
    setAddTemplateError(null);
  };

  const confirmAddTemplate = () => {
    if (!plan) return;

    const title = newTemplateTitle.trim();
    if (!title) {
      setAddTemplateError("Template name is required.");
      return;
    }

    const startMinutes = parseTimeToMinutes(newTemplateStart);
    const endMinutes = parseTimeToMinutes(newTemplateEnd);
    if (startMinutes == null || endMinutes == null) {
      setAddTemplateError("Please select a valid start and end time.");
      return;
    }
    if (endMinutes <= startMinutes) {
      setAddTemplateError("End time must be after start time.");
      return;
    }

			    const newTemplate: FocusTemplate = {
			      id: makeId("tpl"),
			      title,
			      plannedStart: newTemplateStart,
			      plannedEnd: newTemplateEnd,
	          daysOfWeek: newTemplateDays.length > 0 ? newTemplateDays : undefined,
			      isSuspended: false,
			    };
	    const nextPlan: MonthPlan = { ...plan, templates: [...plan.templates, newTemplate] };
	    handlePlanUpdate(nextPlan);
	    closeAddTemplateModal();
	  };

	const handleUpdateTemplate = (
	    templateId: string,
	    updates: Partial<Pick<FocusTemplate, "title" | "plannedStart" | "plannedEnd" | "daysOfWeek" | "isSuspended">>
	  ) => {
	    if (!plan) return;
	    const nextTemplates = plan.templates.map((t) =>
	      t.id === templateId ? { ...t, ...updates } : t
	    );
    const nextPlan: MonthPlan = { ...plan, templates: nextTemplates };
    handlePlanUpdate(nextPlan);
  };

  const handleDeleteTemplate = (templateId: string) => {
    if (!plan) return;
    const nextPlan: MonthPlan = { ...plan, templates: plan.templates.filter((t) => t.id !== templateId) };
    handlePlanUpdate(nextPlan);
  };

  // v5: If month is closed, show read-only report view
  if (plan?.isClosed) {
    const grandPlan = state.grandPlan;

    const tasksTotalCount = monthTasks.length;
    const tasksCompletedCount = monthTasks.filter((t) => t.status === "GREEN").length;
    const completionRate = tasksTotalCount > 0 ? Math.round((tasksCompletedCount / tasksTotalCount) * 100) : 0;

    const dates = listDatesInMonth(ymSafe);
    const tasksById = new Map(allTasks.map((t) => [t.id, t] as const));
    const templatesById = new Map(plan.templates.map((t) => [t.id, t] as const));

    const categoryMetas = [
      ...(grandPlan?.categories ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ id: c.id, title: c.title, color: c.color })),
      UNCATEGORIZED_CATEGORY,
      UNKNOWN_CATEGORY,
    ];

    const [yearStr, monthStr] = ymSafe.split("-");
    const yearNum = Number(yearStr);
    const monthNum = Number(monthStr);
    const daysInMonth = Number.isFinite(yearNum) && Number.isFinite(monthNum) ? new Date(yearNum, monthNum, 0).getDate() : 30;
    const monthStart = `${ymSafe}-01`;
    const monthEnd = `${ymSafe}-${String(daysInMonth).padStart(2, "0")}`;

    const categoryById = new Map((grandPlan?.categories ?? []).map((c) => [c.id, c]));
    const monthBadges = (grandPlan?.milestones ?? [])
      .filter((m) => m.status === "COMPLETED")
      .map((m) => {
        const completedAt = m.completedAt ?? m.createdAt;
        const dateISO = completedAt.slice(0, 10);
        const category = categoryById.get(m.categoryId);
        const color = category?.color ?? UNKNOWN_CATEGORY.color;
        const categoryLabel = category?.title ?? UNKNOWN_CATEGORY.title;
        return {
          dateISO,
          badge: {
            id: m.id,
            title: m.title,
            dateLabel: formatDateLabel(dateISO as DateISO, { withYear: false }),
            categoryLabel,
            color,
            isGoal: m.parentId === null,
          } satisfies BadgeItem,
        };
      })
      .filter((b) => b.dateISO >= monthStart && b.dateISO <= monthEnd)
      .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1))
      .map((b) => b.badge);

    const emptyBadgeState = (
      <div style={{ display: "grid", placeItems: "center", gap: 8, padding: "10px 0" }}>
        <svg width="120" height="72" viewBox="0 0 120 72" aria-hidden>
          <defs>
            <linearGradient id="badge-empty-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#dbeafe" />
              <stop offset="100%" stopColor="#ede9fe" />
            </linearGradient>
          </defs>
          <rect x="12" y="12" width="96" height="48" rx="18" fill="url(#badge-empty-grad)" />
          <circle cx="50" cy="36" r="10" fill="#ffffff" opacity="0.9" />
          <circle cx="70" cy="36" r="10" fill="#ffffff" opacity="0.9" />
          <circle cx="50" cy="36" r="2" fill="#6b7280" />
          <circle cx="70" cy="36" r="2" fill="#6b7280" />
          <path d="M54 44c4 3 8 3 12 0" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M90 24l4 4-4 4-4-4z" fill="#fca5a5" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 800, color: REPORT_THEME.textPrimary }}>No badges this month</div>
        <div style={{ fontSize: 12, color: REPORT_THEME.textMuted }}>Small wins add up — keep going.</div>
      </div>
    );

    // ---- Histogram: tasks completed per day (stacked by category) ----
    const completedTasksByDate: StackedDatum[] = dates.map((date) => {
      const day = state.days[date];
      const counts = new Map<string, number>();

      if (day) {
        const ids = [day.primaryTaskId, ...(day.secondaryTaskIds ?? [])].filter(
          (x): x is string => typeof x === "string" && x.length > 0
        );
        ids.forEach((taskId) => {
          if (day.outcomeByTaskId?.[taskId] !== "COMPLETED") return;
          const task = tasksById.get(taskId);
          const cat = task ? getCategoryMeta(grandPlan, task.linkedMilestoneId) : UNKNOWN_CATEGORY;
          counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
        });
      }

      const segments = categoryMetas
        .map((c) => ({ key: c.id, label: c.title, value: counts.get(c.id) ?? 0, color: c.color }))
        .filter((s) => s.value > 0);

      const total = segments.reduce((a, b) => a + b.value, 0);
      return { key: date, label: date.slice(8, 10), total, segments };
    });

    const completedTaskTotalByCategoryId = new Map<string, number>();
    completedTasksByDate.forEach((d) => {
      d.segments.forEach((s) => {
        completedTaskTotalByCategoryId.set(s.key, (completedTaskTotalByCategoryId.get(s.key) ?? 0) + s.value);
      });
    });

    const completedTaskSlices: DonutSlice[] = categoryMetas.map((c) => ({
      key: c.id,
      label: c.title,
      value: completedTaskTotalByCategoryId.get(c.id) ?? 0,
      color: c.color,
    }));

    // ---- Histogram: focus hours per day (stacked by category) ----
    const activeTemplates = plan.templates.filter((t) => !t.isSuspended);
    const plannedFocusSessionsCount = dates.reduce((acc, date) => {
      const weekday = dayOfWeekFromDateISO(date);
      return acc + activeTemplates.filter((t) => isTemplateScheduledForWeekday(t.daysOfWeek, weekday)).length;
    }, 0);

    const completedSessionsInMonth = state.sessions.filter(
      (s) => s.ym === ymSafe && s.endedAt && typeof s.actualMinutes === "number"
    );
    const completedFocusSessionsCount = completedSessionsInMonth.length;
    const focusCompletionDenom = Math.max(plannedFocusSessionsCount, completedFocusSessionsCount);
    const focusCompletionRate = focusCompletionDenom > 0 ? Math.round((completedFocusSessionsCount / focusCompletionDenom) * 100) : 0;

    const focusHoursByDate: StackedDatum[] = dates.map((date) => {
      const day = state.days[date];
      const sessions = completedSessionsInMonth.filter((s) => s.date === date);
      const hoursByCat = new Map<string, number>();

      sessions.forEach((s) => {
        const minutes = typeof s.actualMinutes === "number" ? Math.max(0, s.actualMinutes) : 0;
        if (minutes <= 0) return;

        const milestoneId =
          day?.focusMilestoneByTemplateId?.[s.templateId] ??
          templatesById.get(s.templateId)?.linkedMilestoneId ??
          undefined;
        const cat = getCategoryMeta(grandPlan, milestoneId);
        hoursByCat.set(cat.id, (hoursByCat.get(cat.id) ?? 0) + minutes / 60);
      });

      const segments = categoryMetas
        .map((c) => ({ key: c.id, label: c.title, value: hoursByCat.get(c.id) ?? 0, color: c.color }))
        .filter((s) => s.value > 0);

      const total = segments.reduce((a, b) => a + b.value, 0);
      return { key: date, label: date.slice(8, 10), total, segments };
    });

    const focusHoursTotalByCategoryId = new Map<string, number>();
    focusHoursByDate.forEach((d) => {
      d.segments.forEach((s) => {
        focusHoursTotalByCategoryId.set(s.key, (focusHoursTotalByCategoryId.get(s.key) ?? 0) + s.value);
      });
    });

    const focusSlices: DonutSlice[] = categoryMetas.map((c) => ({
      key: c.id,
      label: c.title,
      value: Number((focusHoursTotalByCategoryId.get(c.id) ?? 0).toFixed(1)),
      color: c.color,
    }));

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
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: REPORT_THEME.textPrimary, letterSpacing: 0.2 }}>
              Monthly Report
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: REPORT_THEME.textMuted }}>{ymSafe}</div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <BadgePanel badges={monthBadges} emptyState={emptyBadgeState} />
            <ReportCard title="Task Completion">
              <div style={{ display: "flex", gap: 18, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 320px", minWidth: 260, maxWidth: 520 }}>
                  <ReportLegend slices={completedTaskSlices} valueFormatter={(n) => `${n}`} maxItems={10} layout="table" />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: "0 0 auto" }}>
                  <div style={{ marginRight: 72 }}>
                  <DonutChart
                    slices={[
                      { key: "done", label: "Completed", value: tasksCompletedCount, color: APP_MAIN_COLOR },
                      {
                        key: "rest",
                        label: "Remaining",
                        value: Math.max(0, tasksTotalCount - tasksCompletedCount),
                        color: REPORT_THEME.borderLight,
                      },
                    ]}
                    size={150}
                    thickness={18}
                    centerMain={`${completionRate}%`}
                  />
                  </div>
                  <DonutChart slices={completedTaskSlices} size={150} thickness={18} />
                </div>
              </div>
            </ReportCard>

            <ReportCard title="Tasks Completed Over Time">
              <StackedHistogram
                data={completedTasksByDate}
                height={190}
                barWidth={12}
                gap={6}
                xLabelEvery={3}
                formatTotal={(n) => `${n}`}
                fill
                minMaxTotal={8}
              />
            </ReportCard>

            <ReportCard title="Focus Sessions">
              <div style={{ display: "flex", gap: 18, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 320px", minWidth: 260, maxWidth: 520 }}>
                  <ReportLegend slices={focusSlices} valueFormatter={(n) => `${n.toFixed(1)}h`} maxItems={10} layout="table" />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: "0 0 auto" }}>
                  <div style={{ marginRight: 72 }}>
                  <DonutChart
                    slices={[
                      { key: "done", label: "Completed", value: completedFocusSessionsCount, color: APP_MAIN_COLOR },
                      {
                        key: "rest",
                        label: "Remaining",
                        value: Math.max(0, plannedFocusSessionsCount - completedFocusSessionsCount),
                        color: REPORT_THEME.borderLight,
                      },
                    ]}
                    size={150}
                    thickness={18}
                    centerMain={`${focusCompletionRate}%`}
                  />
                  </div>
                  <DonutChart slices={focusSlices} size={150} thickness={18} />
                </div>
              </div>
            </ReportCard>

            <ReportCard title="Focus Hours Over Time">
              <StackedHistogram
                data={focusHoursByDate}
                height={190}
                barWidth={12}
                gap={6}
                xLabelEvery={3}
                formatTotal={(n) => `${n.toFixed(1)}h`}
                fill
                minMaxTotal={8}
              />
            </ReportCard>

            <div style={{ textAlign: "center", marginTop: 28, paddingTop: 18, borderTop: `1px solid ${REPORT_THEME.borderLight}` }}>
              <button
                onClick={handleReopenMonth}
                style={{
                  padding: "12px 32px",
                  fontSize: 14,
                  fontWeight: 800,
                  backgroundColor: "white",
                  color: REPORT_THEME.textPrimary,
                  border: `1px solid ${REPORT_THEME.borderLight}`,
                  borderRadius: 12,
                  cursor: "pointer",
                  boxShadow: REPORT_THEME.cardShadow,
                }}
              >
                Reopen for Editing
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

	return (
	  <div>
	    {/* Header */}
    <div style={{ marginBottom: 24, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
        <div />
        <div style={{ textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#111", letterSpacing: 0.2 }}>
            Month Plan
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

	      {!plan ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            backgroundColor: "white",
            borderRadius: 16,
          }}
        >
          {!isInPeriod ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
              <p style={{ fontSize: 18, marginBottom: 12, color: "#f44336" }}>Month Outside Grand Plan Period</p>
              <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
                This month ({ymSafe}) is outside your Grand Plan period
                ({state.grandPlan.startMonth} - {state.grandPlan.endMonth ?? "Ongoing"}).
              </p>
              <p style={{ fontSize: 13, color: "#888" }}>
                Adjust your Grand Plan dates or navigate to a month within the plan period.
              </p>
            </>
          ) : monthAccess.canActivate ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
              <p style={{ fontSize: 18, marginBottom: 12 }}>No plan for {ymSafe} yet</p>
              <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
                Create a monthly plan to start tracking tasks and focus sessions
                {shortName ? `, ${shortName}` : ""}. ✨
              </p>
              <button
                data-tutorial-target="create-month-plan"
                onClick={create}
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
                📅 Create Month Plan
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <p style={{ fontSize: 18, marginBottom: 12 }}>Nothing to see here</p>
              <p style={{ color: "#666", fontSize: 14 }}>
                This month was never set up.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
	          {fireworks && (
	            <FireworksOverlay
	              key={fireworks.key}
	              colors={fireworks.colors}
	              onDone={() => setFireworks(null)}
	            />
	          )}

	          {/* Whiteboard wrapper - matches FocusTemplatesPanel style */}
	          <div
	            style={{
	              marginBottom: 24,
	              backgroundColor: "#fbfaf7",
	              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)",
	              backgroundSize: "24px 24px",
	              border: "2px solid #eee",
	              borderRadius: 12,
	              padding: 20,
	            }}
	          >
	              {pinnedMilestones.length === 0 && standaloneTasks.length === 0 && plan.templates.length === 0 && (
	                <div
	                  style={{
	                    padding: 12,
                    border: "1px dashed #ddd",
                    borderRadius: 10,
                    backgroundColor: "rgba(255,255,255,0.95)",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4, color: "#333" }}>
                    Welcome to your Month Plan
                  </div>
                  <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
                    Pin one or more milestones from your Grand Plan (top right), or start with standalone tasks and focus templates.
                  </div>
                </div>
              )}

	              {(() => {
	                const milestone = selectedMilestoneId
	                  ? state.grandPlan?.milestones.find((m) => m.id === selectedMilestoneId) ?? null
	                  : null;
	                const category = milestone
	                  ? state.grandPlan?.categories.find((c) => c.id === milestone.categoryId) ?? null
	                  : null;

		                const title = milestone
		                  ? `[${category?.title ?? "Category"}] ${milestone.title}`
		                  : "Standalone";

		                const color = milestone ? category?.color ?? APP_MAIN_COLOR : "#000";
		                const tasks = milestone ? getTasksForMilestone(state, milestone.id) : standaloneTasks;

		                const scopeKey = milestone ? `milestone:${milestone.id}` : "standalone";
		                const zoomStorageKey = `focustree:month-setup:board-zoom:${ymSafe}:${scopeKey}`;
		                const defaultBoardSize = { width: 2400, height: 1400 };
		                const boardSize = getTaskBoardForScope(state, scopeKey) ?? defaultBoardSize;
		                const links = getTaskLinksForScope(state, scopeKey);

	                const handleUpdateBoardSize = (next: { width: number; height: number }) => {
	                  mutate((s0) => updateTaskBoardForScope(s0, scopeKey, next));
	                };

	                const handleUpdateLinks = (next: { from: string; to: string }[]) => {
	                  mutate((s0) => updateTaskLinksForScope(s0, scopeKey, next));
	                };

		                return (
		                  <TaskGroup
		                    title={title}
		                    color={color}
		                    tasks={tasks}
		                    milestoneId={milestone ? milestone.id : null}
		                    milestoneStatus={milestone?.status}
                        frozenTaskIds={frozenTaskIds}
                        isObjective={Boolean(milestone && primaryMilestoneId === milestone.id)}
                        onSetObjective={milestone ? handleSetObjectiveMilestone : undefined}
		                    boardSize={boardSize}
		                    onUpdateBoardSize={handleUpdateBoardSize}
			                    links={links}
			                    onUpdateLinks={handleUpdateLinks}
			                    zoomStorageKey={zoomStorageKey}
			                    onAddTask={handleAddTask}
			                    onUpdateTask={handleUpdateTask}
			                    onSetTaskStatus={handleSetTaskStatus}
			                    onDeleteTask={handleDeleteTask}
		                    onMarkMilestoneCompleted={milestone ? handleMarkMilestoneCompleted : undefined}
		                    hideTitle
		                    chromeless={!milestone}
		                    floatingToolbar
		                    milestoneNavigation={{
		                      currentMilestoneId: selectedMilestoneId,
		                      pinnedMilestones: orderedPinnedMilestones,
		                      categories: state.grandPlan?.categories ?? [],
		                      primaryMilestoneId,
		                      onSelectMilestone: setSelectedMilestoneId,
		                      onPinMilestone: isInPeriod && state.grandPlan && state.grandPlan.milestones.length > 0 ? () => setShowMilestonePicker(true) : undefined,
		                      onUnpinMilestone: isInPeriod ? handleUnpinMilestone : undefined,
		                    }}
		                  />
		                );
		              })()}
	          </div>

	          <FocusTemplatesPanel
	            templates={plan.templates}
	            onAddTemplate={handleAddTemplate}
	            onUpdateTemplate={handleUpdateTemplate}
	            onDeleteTemplate={handleDeleteTemplate}
	          />

	          {/* v5: Close Month Button */}
          {!tutorialMode && <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: "2px solid #ddd" }}>
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
              🔒 Close Month
            </button>
            <p style={{ marginTop: 8, fontSize: 14, color: "#666" }}>
              Mark this month as complete and view the final report
            </p>
          </div>}

          {showMonthWizard && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(17, 24, 39, 0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1100,
                padding: 20,
              }}
              onClick={tutorialMode ? undefined : closeMonthWizard}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 980,
                  backgroundColor: "white",
                  borderRadius: 18,
                  border: "1px solid #eee",
                  boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
                  overflow: "hidden",
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
                      Month setup
                    </div>
                    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: "#111" }}>{monthWizardTitle}</div>
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
                      {monthWizardStep + 1} / {monthWizardSteps.length}
                    </div>
                    {!tutorialMode && (
                      <button
                        onClick={closeMonthWizard}
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

                <div style={{ padding: 22, maxHeight: "70vh", overflowY: "auto" }}>
                  {monthWizardStep === 0 ? (
                    <div style={{ display: "grid", gap: 18 }}>
                      <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
                        Pick the month objective and the secondary milestones you want to focus on. The objective will be highlighted first in your milestone list.
                      </div>

                      {wizardMilestoneGroups.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>
                          No milestones available yet.
                        </div>
                      ) : (
                        <div style={{ display: "grid", gap: 16 }}>
                          <div ref={monthWizardPrimaryMenuRef} style={{ position: "relative" }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#555", marginBottom: 6 }}>
                              Objective milestone
                            </label>
                            <button
                              data-tutorial-target="wizard-primary-select"
                              type="button"
                              disabled={wizardMilestoneGroups.length === 0}
                              onClick={() => {
                                if (wizardMilestoneGroups.length === 0) return;
                                setMonthWizardPrimaryMenuOpen((prev) => !prev);
                              }}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                fontSize: 14,
                                borderRadius: 10,
                                border: `1px solid ${monthWizardPrimaryMenuOpen ? APP_MAIN_COLOR : "#ddd"}`,
                                boxSizing: "border-box",
                                backgroundColor: wizardMilestoneGroups.length > 0 ? "white" : "#f5f5f5",
                                color: wizardMilestoneGroups.length > 0 ? "#111" : "#999",
                                cursor: wizardMilestoneGroups.length > 0 ? "pointer" : "not-allowed",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {monthWizardPrimaryId && selectedObjectiveTitle
                                  ? selectedObjectiveTitle
                                  : "Choose objective milestone…"}
                              </span>
                              <span style={{ color: wizardMilestoneGroups.length > 0 ? "#666" : "#aaa", fontSize: 12 }}>
                                {monthWizardPrimaryMenuOpen ? "▲" : "▼"}
                              </span>
                            </button>

                            {monthWizardPrimaryMenuOpen && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "calc(100% + 8px)",
                                  left: 0,
                                  right: 0,
                                  backgroundColor: "white",
                                  border: "1px solid #ddd",
                                  borderRadius: 12,
                                  boxShadow: "0 16px 38px rgba(0,0,0,0.16)",
                                  overflow: "hidden",
                                  zIndex: 10,
                                }}
                              >
                                <div style={{ maxHeight: 280, overflowY: "auto", padding: 6 }}>
                                  {wizardMilestoneGroups.map((group) => (
                                    <div key={group.category.id} style={{ marginBottom: 6 }}>
                                      <div style={{ fontSize: 11, fontWeight: 800, color: group.category.color, margin: "8px 8px 6px" }}>
                                        {group.category.title}
                                      </div>
                                      {group.milestones.map((milestone) => {
                                        const isSelected = monthWizardPrimaryId === milestone.id;
                                        const isCarryover = carryoverMilestoneIds.has(milestone.id);
                                        const backgroundColor = isSelected
                                          ? "rgba(245, 201, 105, 0.18)"
                                          : isCarryover
                                          ? "#fff7d6"
                                          : "transparent";
                                        const borderColor = isSelected
                                          ? "#f5c469"
                                          : isCarryover
                                          ? "#fde68a"
                                          : "transparent";
                                        return (
                                          <label
                                            key={milestone.id}
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 10,
                                              padding: "8px 10px",
                                              borderRadius: 10,
                                              cursor: "pointer",
                                              backgroundColor,
                                              border: `1px solid ${borderColor}`,
                                            }}
                                          >
                                            <input
                                              type="radio"
                                              checked={isSelected}
                                              onChange={() => handleWizardPrimarySelect(milestone.id)}
                                              style={{ cursor: "pointer" }}
                                            />
                                            <span style={{ flex: 1, color: "#111", fontSize: 14, lineHeight: 1.35 }}>
                                              {milestone.title}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div ref={monthWizardSecondaryMenuRef} style={{ position: "relative" }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#555", marginBottom: 6 }}>
                              Secondary milestones <span style={{ fontWeight: 700, color: "#888" }}>(optional)</span>
                            </label>
                            <button
                              type="button"
                              disabled={!monthWizardPrimaryId || wizardMilestoneGroups.length === 0}
                              onClick={() => {
                                if (!monthWizardPrimaryId || wizardMilestoneGroups.length === 0) return;
                                setMonthWizardSecondaryMenuOpen((prev) => !prev);
                              }}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                fontSize: 14,
                                borderRadius: 10,
                                border: `1px solid ${monthWizardSecondaryMenuOpen ? APP_MAIN_COLOR : "#ddd"}`,
                                boxSizing: "border-box",
                                backgroundColor: monthWizardPrimaryId ? "white" : "#f5f5f5",
                                color: monthWizardPrimaryId ? "#111" : "#999",
                                cursor: monthWizardPrimaryId ? "pointer" : "not-allowed",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {monthWizardSecondaryIds.length > 0
                                  ? `${monthWizardSecondaryIds.length} selected`
                                  : "Choose secondary milestones…"}
                              </span>
                              <span style={{ color: monthWizardPrimaryId ? "#666" : "#aaa", fontSize: 12 }}>
                                {monthWizardSecondaryMenuOpen ? "▲" : "▼"}
                              </span>
                            </button>

                            {!monthWizardPrimaryId && (
                              <div style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
                                Select an objective milestone to enable secondary milestones.
                              </div>
                            )}

                            {monthWizardSecondaryMenuOpen && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "calc(100% + 8px)",
                                  left: 0,
                                  right: 0,
                                  backgroundColor: "white",
                                  border: "1px solid #ddd",
                                  borderRadius: 12,
                                  boxShadow: "0 16px 38px rgba(0,0,0,0.16)",
                                  overflow: "hidden",
                                  zIndex: 10,
                                }}
                              >
                                <div style={{ maxHeight: 280, overflowY: "auto", padding: 6 }}>
                                  {wizardMilestoneGroups.map((group) => (
                                    <div key={group.category.id} style={{ marginBottom: 6 }}>
                                      <div style={{ fontSize: 11, fontWeight: 800, color: group.category.color, margin: "8px 8px 6px" }}>
                                        {group.category.title}
                                      </div>
                                      {group.milestones.map((milestone) => {
                                        const isPrimary = monthWizardPrimaryId === milestone.id;
                                        const checked = monthWizardSecondaryIds.includes(milestone.id);
                                        const isCarryover = carryoverMilestoneIds.has(milestone.id);
                                        const highlight = checked ? withHexAlpha(group.category.color, "1a") : "transparent";
                                        const backgroundColor = checked ? highlight : isCarryover ? "#fff7d6" : "transparent";
                                        const borderColor = checked
                                          ? withHexAlpha(group.category.color, "66")
                                          : isCarryover
                                          ? "#fde68a"
                                          : "transparent";
                                        return (
                                          <label
                                            key={milestone.id}
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 10,
                                              padding: "8px 10px",
                                              borderRadius: 10,
                                              cursor: isPrimary ? "not-allowed" : "pointer",
                                              backgroundColor,
                                              border: `1px solid ${borderColor}`,
                                              opacity: isPrimary ? 0.6 : 1,
                                            }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => toggleWizardSecondary(milestone.id)}
                                              disabled={isPrimary}
                                              style={{ cursor: isPrimary ? "not-allowed" : "pointer" }}
                                            />
                                            <span style={{ flex: 1, color: "#111", fontSize: 14, lineHeight: 1.35 }}>
                                              {milestone.title}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {(monthWizardPrimaryId || monthWizardSecondaryIds.length > 0) && (
                            <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {monthWizardPrimaryId && selectedObjectiveTitle ? (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    backgroundColor: "#fef3c7",
                                    border: "1px solid #f5c469",
                                    color: "#8a5a12",
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  ★ {selectedObjectiveTitle}
                                </div>
                              ) : null}
                              {monthWizardSecondaryIds.map((id) => {
                                const meta = wizardMilestoneIndex.get(id);
                                if (!meta) return null;
                                return (
                                  <button
                                    key={id}
                                    onClick={() => removeWizardSecondary(id)}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      padding: "6px 10px",
                                      borderRadius: 999,
                                      backgroundColor: withHexAlpha(meta.categoryColor, "14"),
                                      border: `1px solid ${withHexAlpha(meta.categoryColor, "66")}`,
                                      color: "#111",
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                    title="Remove secondary milestone"
                                  >
                                    {meta.title}
                                    <span style={{ fontWeight: 900, color: "#666" }}>✕</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 16 }}>
                      <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
                        Focus sessions are recurring deep-work blocks you plan for the month. You can attach them to milestones later from the Daily page.
                      </div>
                      <FocusTemplatesPanel
                        templates={plan?.templates ?? []}
                        onAddTemplate={handleAddTemplate}
                        onUpdateTemplate={handleUpdateTemplate}
                        onDeleteTemplate={handleDeleteTemplate}
                        variant="plain"
                        showIntro={false}
                        showTitle={false}
                        emptyStateText={null}
                        addButtonPlacement="footer-left"
                        addButtonTutorialTarget="wizard-focus-add"
                      />
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
                    onClick={() => {
                      const prevStep = Math.max(0, monthWizardStep - 1);
                      setMonthWizardStep(prevStep);
                      onWizardStateChange?.({ open: true, primarySelected: !!monthWizardPrimaryId, wizardStep: prevStep });
                    }}
                    disabled={monthWizardStep === 0}
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 800,
                      backgroundColor: "white",
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      cursor: monthWizardStep === 0 ? "not-allowed" : "pointer",
                      color: "#555",
                      opacity: monthWizardStep === 0 ? 0.5 : 1,
                    }}
                  >
                    ← Previous
                  </button>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      data-tutorial-target="wizard-finish"
                      onClick={handleFinishMonthWizard}
                      style={{
                        padding: "8px 16px",
                        fontSize: 13,
                        fontWeight: 900,
                        backgroundColor: APP_MAIN_COLOR,
                        color: "white",
                        border: "none",
                        borderRadius: 10,
                        cursor: "pointer",
                        boxShadow: "0 10px 22px rgba(0,0,0,0.12)",
                      }}
                    >
                      ✓ Start Month
                    </button>
                    <button
                      data-tutorial-target="wizard-next"
                      onClick={() => {
                        const nextStep = Math.min(monthWizardSteps.length - 1, monthWizardStep + 1);
                        setMonthWizardStep(nextStep);
                        onWizardStateChange?.({ open: true, primarySelected: !!monthWizardPrimaryId, wizardStep: nextStep });
                      }}
                      disabled={monthWizardStep >= monthWizardSteps.length - 1}
                      style={{
                        padding: "8px 14px",
                        fontSize: 13,
                        fontWeight: 800,
                        backgroundColor: "white",
                        border: "1px solid #ddd",
                        borderRadius: 10,
                        cursor: monthWizardStep >= monthWizardSteps.length - 1 ? "not-allowed" : "pointer",
                        color: "#555",
                        opacity: monthWizardStep >= monthWizardSteps.length - 1 ? 0.5 : 1,
                      }}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* v6.1: Milestone Picker Modal */}
          {showMilestonePicker && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={() => setShowMilestonePicker(false)}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 500,
                  width: "90%",
                  maxHeight: "80vh",
                  overflow: "auto",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>Pin a Milestone</h3>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
                  Choose a milestone from your Grand Plan to pin it to this month. Then add tasks and focus templates in the board.
                </p>

                {state.grandPlan.categories
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((category) => {
                    const milestones = state.grandPlan!.milestones.filter(
                      (m) => m.categoryId === category.id && selectableMilestoneIds.has(m.id)
                    );
                    if (milestones.length === 0) return null;

                    // Filter out already pinned milestones
                    const pinnedIds = new Set(plan.pinnedMilestoneIds);
                    const available = milestones.filter((m) => !pinnedIds.has(m.id));

                    if (available.length === 0) return null;

                    return (
                      <div key={category.id} style={{ marginBottom: 16 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: category.color,
                            fontWeight: 600,
                            marginBottom: 8,
                          }}
                        >
                          {category.title}
                        </div>
                        {available.map((milestone) => (
                          <button
                            key={milestone.id}
                            onClick={() => handlePinMilestone(milestone)}
                            style={{
                              display: "block",
                              width: "100%",
                              padding: "10px 12px",
                              marginBottom: 4,
                              textAlign: "left",
                              backgroundColor: "white",
                              border: `1px solid ${category.color}`,
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 14,
                            }}
                          >
                            {milestone.title}
                            <span
                              style={{
                                float: "right",
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 4,
                                backgroundColor:
                                  milestone.status === "COMPLETED"
                                    ? "#4caf50"
                                    : milestone.status === "IN_PROGRESS"
                                    ? "#ff9800"
                                    : "#9e9e9e",
                                color: "white",
                              }}
                            >
                              {milestone.status.replace("_", " ")}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                  <button
                    onClick={() => setShowMilestonePicker(false)}
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
                </div>
              </div>
            </div>
          )}

	          {/* v6.3: Add Focus Template Modal */}
	          {showAddTemplateModal && (
	            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1200,
                padding: 16,
              }}
              onClick={closeAddTemplateModal}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: 14,
                  border: "1px solid #eee",
                  maxWidth: 560,
                  width: "100%",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                  overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
              >
	                {(() => {
	                  const accentColor = APP_MAIN_COLOR;
                    const selectedBg = withHexAlpha(accentColor, "12");
                    const selectedBorder = withHexAlpha(accentColor, "55");
                    const startMinutes = parseTimeToMinutes(newTemplateStart);
                    const endMinutes = parseTimeToMinutes(newTemplateEnd);
                    const canSubmit =
                      newTemplateTitle.trim().length > 0 &&
                      startMinutes != null &&
                      endMinutes != null &&
                      endMinutes > startMinutes;

                  return (
                    <>
                      <div style={{ padding: "18px 20px", borderBottom: "1px solid #eee" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: "#111" }}>New focus template</div>
                            <div style={{ marginTop: 6, fontSize: 13, color: "#666", lineHeight: 1.4 }}>
                              Create a reusable focus block for your Daily page.
                            </div>
                          </div>
                          <button
                            onClick={closeAddTemplateModal}
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
                      </div>

                      <div style={{ padding: 20, display: "grid", gap: 14 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#555", marginBottom: 6 }}>
                            Template name <span style={{ color: "#f44336" }}>*</span>
                          </div>
                          <input
                            type="text"
                            value={newTemplateTitle}
                            onChange={(e) => {
                              setNewTemplateTitle(e.target.value);
                              setAddTemplateError(null);
                            }}
                            placeholder="e.g. Deep work"
                            autoFocus
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              fontSize: 14,
                              boxSizing: "border-box",
                            }}
                          />
                        </div>

                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#555", marginBottom: 6 }}>Time</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#777", marginBottom: 6 }}>Start</div>
                              <input
                                type="time"
                                value={newTemplateStart}
                                onChange={(e) => {
                                  setNewTemplateStart(e.target.value);
                                  setAddTemplateError(null);
                                }}
                                style={{
                                  width: "100%",
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  border: "1px solid #ddd",
                                  fontSize: 14,
                                  boxSizing: "border-box",
                                }}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#777", marginBottom: 6 }}>End</div>
                              <input
                                type="time"
                                value={newTemplateEnd}
                                onChange={(e) => {
                                  setNewTemplateEnd(e.target.value);
                                  setAddTemplateError(null);
                                }}
                                style={{
                                  width: "100%",
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  border: "1px solid #ddd",
                                  fontSize: 14,
                                  boxSizing: "border-box",
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#555", marginBottom: 6 }}>Schedule</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                            {WEEKDAY_ORDER.map((day) => {
                              const isSelected = newTemplateDays.includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => {
                                    toggleNewTemplateDay(day);
                                    setAddTemplateError(null);
                                  }}
                                  style={{
                                    padding: "7px 10px",
                                    fontSize: 12,
                                    fontWeight: 800,
                                    backgroundColor: isSelected ? selectedBg : "white",
                                    color: isSelected ? accentColor : "#555",
                                    border: `1px solid ${isSelected ? selectedBorder : "#ddd"}`,
                                    borderRadius: 10,
                                    cursor: "pointer",
                                  }}
                                  title={WEEKDAY_SHORT[day]}
                                >
                                  {WEEKDAY_SHORT[day]}
                                </button>
                              );
                            })}
                            <span style={{ width: 6 }} />
                            <button
                              type="button"
                              onClick={() => {
                                setNewTemplateDays([...MON_FRI]);
                                setAddTemplateError(null);
                              }}
                              style={{
                                padding: "7px 10px",
                                fontSize: 12,
                                fontWeight: 800,
                                backgroundColor: "white",
                                color: "#555",
                                border: "1px solid #ddd",
                                borderRadius: 10,
                                cursor: "pointer",
                              }}
                            >
                              Mon–Fri
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNewTemplateDays([]);
                                setAddTemplateError(null);
                              }}
                              style={{
                                padding: "7px 10px",
                                fontSize: 12,
                                fontWeight: 800,
                                backgroundColor: "white",
                                color: "#555",
                                border: "1px solid #ddd",
                                borderRadius: 10,
                                cursor: "pointer",
                              }}
                            >
                              Any day
                            </button>
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
                            Applies: {formatWeekdays(newTemplateDays)}
                          </div>
                        </div>

                        {addTemplateError && (
                          <div style={{ color: "#d32f2f", fontSize: 13, fontWeight: 700 }}>
                            {addTemplateError}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          padding: "14px 20px",
                          borderTop: "1px solid #eee",
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 10,
                          backgroundColor: "#fafafa",
                        }}
                      >
                        <button
                          onClick={closeAddTemplateModal}
                          style={{
                            padding: "10px 14px",
                            fontSize: 14,
                            fontWeight: 700,
                            backgroundColor: "white",
                            border: "1px solid #ddd",
                            borderRadius: 10,
                            cursor: "pointer",
                            color: "#555",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmAddTemplate}
                          disabled={!canSubmit}
                          style={{
                            padding: "10px 14px",
                            fontSize: 14,
                            fontWeight: 900,
                            backgroundColor: canSubmit ? accentColor : "#ddd",
                            color: "white",
                            border: "none",
                            borderRadius: 10,
                            cursor: canSubmit ? "pointer" : "not-allowed",
                            boxShadow: canSubmit ? "0 10px 22px rgba(0,0,0,0.10)" : "none",
                          }}
                        >
                          Add template
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
	            </div>
	          )}

	          {/* v9.3: Milestone Completion Confirmation Modal */}
	          {confirmCompleteMilestoneId && (
	            <div
	              style={{
	                position: "fixed",
	                inset: 0,
	                backgroundColor: "rgba(0, 0, 0, 0.5)",
	                display: "flex",
	                alignItems: "center",
	                justifyContent: "center",
	                zIndex: 1300,
	              }}
	              onClick={() => setConfirmCompleteMilestoneId(null)}
	            >
	              <div
	                style={{
	                  backgroundColor: "white",
	                  borderRadius: 12,
	                  padding: 24,
	                  maxWidth: 560,
	                  width: "90%",
	                  boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
	                }}
	                onClick={(e) => e.stopPropagation()}
	              >
	                {(() => {
	                  const milestone = state.grandPlan?.milestones.find((m) => m.id === confirmCompleteMilestoneId) ?? null;
	                  const category = milestone
	                    ? state.grandPlan?.categories.find((c) => c.id === milestone.categoryId) ?? null
	                    : null;
	                  const accentColor = category?.color ?? "#FFD700";
	                  const title = milestone?.title ?? "this milestone";

	                  return (
	                    <>
	                      <h3 style={{ marginTop: 0, marginBottom: 12, color: accentColor }}>Complete milestone?</h3>
	                      <p style={{ marginTop: 0, marginBottom: 14, color: "#555", lineHeight: 1.6 }}>
	                        Mark “{title}” as completed? After this, this milestone becomes read-only.
	                      </p>
	                      <ul style={{ margin: 0, paddingLeft: 18, color: "#666", fontSize: 13, lineHeight: 1.7 }}>
	                        <li>Month Setup: no add/delete/move/link/resize/edit for its tasks or focus templates.</li>
	                        <li>Daily page: its tasks can’t be selected anymore.</li>
	                        <li>Daily page: its focus templates stop appearing (past focus data stays saved).</li>
	                      </ul>
	                      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
	                        <button
	                          onClick={() => setConfirmCompleteMilestoneId(null)}
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
	                          onClick={confirmMarkMilestoneCompleted}
	                          style={{
	                            padding: "8px 16px",
	                            fontSize: 14,
	                            fontWeight: 800,
	                            backgroundColor: "white",
	                            color: accentColor,
	                            border: `2px solid ${accentColor}`,
	                            borderRadius: 6,
	                            cursor: "pointer",
	                            display: "flex",
	                            alignItems: "center",
	                            gap: 6,
	                          }}
	                        >
	                          <span style={{ color: "#FFD700" }}>★</span> Mark Completed
	                        </button>
	                      </div>
	                    </>
	                  );
	                })()}
	              </div>
	            </div>
	          )}

	          {/* v5: Close Month Confirmation Modal */}
	          {creatingTask && (
	            <TitleDescriptionModal
	              title="Add Task"
	              subtitle={
                  creatingTask.milestoneId
                    ? `This task will be linked to “${state.grandPlan?.milestones.find((m) => m.id === creatingTask.milestoneId)?.title ?? "Milestone"}”.`
                    : "This task will be standalone (not linked to a milestone)."
                }
	              accentColor={(() => {
                  const milestoneId = creatingTask.milestoneId;
                  if (!milestoneId) return APP_MAIN_COLOR;
                  const milestone = state.grandPlan?.milestones.find((m) => m.id === milestoneId);
                  const category = milestone
                    ? state.grandPlan?.categories.find((c) => c.id === milestone.categoryId)
                    : null;
                  return category?.color ?? APP_MAIN_COLOR;
                })()}
	              titlePlaceholder="Task title..."
	              descriptionLabel="Notes"
	              descriptionPlaceholder="What should be visible on this task card? (optional)..."
	              confirmLabel="Add Task"
	              onCancel={() => setCreatingTask(null)}
	              onConfirm={(title, notes) => {
                  const nextNotes = notes.trim() || undefined;
                  const milestoneId = creatingTask.milestoneId;

                  mutate((s0) => {
                    if (milestoneId) {
                      const result = addTaskWithMilestone(s0, title.trim(), milestoneId, null, nextNotes);
                      let nextState = result.state;
                      const m0 = nextState.grandPlan?.milestones.find((m) => m.id === milestoneId);
                      if (m0 && m0.status === "NOT_STARTED") {
                        nextState = updateMilestone(nextState, milestoneId, { status: "IN_PROGRESS" });
                      }
                      return nextState;
                    }

                    return addStandaloneTask(s0, title.trim(), null, nextNotes).state;
                  });

                  setCreatingTask(null);
                }}
	            />
	          )}

	          {showCloseModal && (
	            <div
	              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
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
                  maxWidth: 500,
                  width: "90%",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>🔒 Close Month</h3>
                <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
                  This will close the month and convert it to a read-only report view.
                  If this is the current month, it will also close today (ending any active focus session).
                  You can reopen the month later if needed.
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
                    onClick={handleCloseMonth}
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
                    ✓ Close Month
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
