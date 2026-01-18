
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Navigate } from "react-router-dom";
import type { MonthPlan, YM, TaskNode, MilestoneNode, MilestoneStatus, FocusTemplate, Weekday } from "../app/types";
import {
  loadState,
  saveState,
  getMonth,
  upsertMonth,
  makeId,
  closeMonth,
  reopenMonth,
  isMonthInGrandPlanPeriod,
  addTaskWithMilestone,
  getMilestonesInMonth,
  deleteTaskFromMonth,
  updateTaskInMonth,
  updateMilestone,
} from "../app/storage";
import { MON_FRI, WEEKDAY_ORDER, WEEKDAY_SHORT, formatWeekdays, sortWeekdays } from "../app/weekdays";
import { useDateNavigation } from "../contexts/DateNavigationContext";
import FireworksOverlay from "../components/FireworksOverlay";
import { APP_MAIN_COLOR } from "../app/theme";

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

function seedPlan(ym: YM): MonthPlan {
  return {
    ym,
    tasks: [],
    templates: [],
    pinnedMilestoneIds: [],
    createdAt: new Date().toISOString(),
  };
}

function PinGlyph({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        width: 14,
        height: 16,
        flex: "0 0 auto",
        transform: "rotate(-18deg)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 0,
          left: 3,
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        }}
      />
      <span
        style={{
          position: "absolute",
          top: 7,
          left: 6,
          width: 2,
          height: 6,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
      <span
        style={{
          position: "absolute",
          top: 12,
          left: 4,
          width: 0,
          height: 0,
          borderLeft: "3px solid transparent",
          borderRight: "3px solid transparent",
          borderTop: `4px solid ${color}`,
        }}
      />
    </span>
  );
}

// Component for editing tasks under a milestone group
function TaskGroup({
  title,
  color,
  tasks,
  milestoneId,
  milestoneStatus,
  boardSize,
  onUpdateBoardSize,
  links,
  onUpdateLinks,
  zoomStorageKey,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onMarkMilestoneCompleted,
  hideAddButton = false,
  hideTitle = false,
  chromeless = false,
}: {
  title: string;
  color: string;
  tasks: TaskNode[];
  milestoneId: string | null;
  milestoneStatus?: MilestoneStatus;
  boardSize: { width: number; height: number };
  onUpdateBoardSize: (next: { width: number; height: number }) => void;
  links: { from: string; to: string }[];
  onUpdateLinks: (next: { from: string; to: string }[]) => void;
  zoomStorageKey: string;
  onAddTask: (milestoneId: string | null) => void;
  onUpdateTask: (
    taskId: string,
    updates: Partial<Pick<TaskNode, "title" | "description" | "notes" | "boardX" | "boardY" | "boardW" | "boardH">>
  ) => void;
  onDeleteTask: (taskId: string) => void;
  onMarkMilestoneCompleted?: (milestoneId: string) => void;
  hideAddButton?: boolean;
  hideTitle?: boolean;
  chromeless?: boolean;
}) {
  const [taskModalTaskId, setTaskModalTaskId] = useState<string | null>(null);
  const [taskModalTitle, setTaskModalTitle] = useState("");
  const [taskModalDescription, setTaskModalDescription] = useState("");
  const [taskModalNotes, setTaskModalNotes] = useState("");
  const [taskModalError, setTaskModalError] = useState<string | null>(null);

  const isCompleted = milestoneStatus === "COMPLETED";
  const accentColor = isCompleted ? "#FFD700" : color;
  const uiAccent = chromeless ? "#000" : accentColor;
  const noteBorderColor = chromeless ? "#000" : accentColor;
  const noteBackgroundColor = chromeless ? "rgba(255,255,255,0.96)" : "#fffde7";
  const canEditBoard = !isCompleted;

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

  useEffect(() => {
    if (!isLinkMode) setLinkFromTaskId(null);
  }, [isLinkMode]);

  const taskRectsById = useMemo(() => {
    const DEFAULT_W = 260;
    const DEFAULT_H = 180;
    const GAP = 26;
    const START_X = 28;
    const START_Y = 28;

    const cols = Math.max(1, Math.floor((Math.max(320, boardSize.width) - START_X * 2) / (DEFAULT_W + GAP)));
    const map = new Map<string, TaskRect>();

    tasks.forEach((task, idx) => {
      let w = typeof task.boardW === "number" && Number.isFinite(task.boardW) ? task.boardW : DEFAULT_W;
      let h = typeof task.boardH === "number" && Number.isFinite(task.boardH) ? task.boardH : DEFAULT_H;

      let x =
        typeof task.boardX === "number" && Number.isFinite(task.boardX)
          ? task.boardX
          : START_X + (idx % cols) * (DEFAULT_W + GAP);
      let y =
        typeof task.boardY === "number" && Number.isFinite(task.boardY)
          ? task.boardY
          : START_Y + Math.floor(idx / cols) * (DEFAULT_H + GAP);

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
  }, [tasks, boardSize.width, dragPreview, resizePreview]);

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
    setTaskModalDescription(task.description ?? "");
    setTaskModalNotes(task.notes ?? "");
    setTaskModalError(null);
  };

  const closeTaskModal = () => {
    setTaskModalTaskId(null);
    setTaskModalTitle("");
    setTaskModalDescription("");
    setTaskModalNotes("");
    setTaskModalError(null);
  };

  const saveTaskModal = () => {
    if (!taskModalTaskId) return;
    if (isCompleted) {
      closeTaskModal();
      return;
    }
    const nextTitle = taskModalTitle.trim();
    if (!nextTitle) {
      setTaskModalError("Title is required.");
      return;
    }
    const nextDescription = taskModalDescription.trim();
    const nextNotes = taskModalNotes.trim();
    onUpdateTask(taskModalTaskId, {
      title: nextTitle,
      description: nextDescription || undefined,
      notes: nextNotes || undefined,
    });
    closeTaskModal();
  };

	  const handleTaskPointerDown = (e: ReactPointerEvent<HTMLDivElement>, taskId: string) => {
	    if (e.button !== 0) return;
	    const rect = taskRectsById.get(taskId);
	    if (!rect) return;

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
      canDrag: canEditBoard && !isLinkMode,
      moved: false,
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (canEditBoard && !isLinkMode) {
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
          {/* Mark as completed button - only show for milestones that aren't completed */}
          {milestoneId && !isCompleted && onMarkMilestoneCompleted && (
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
      ) : isCompleted || (milestoneId && !isCompleted && onMarkMilestoneCompleted) ? (
        null
      ) : null}

      <div>
        {/* Tasks whiteboard */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {!isCompleted && !hideAddButton && (
              <button
                onClick={() => onAddTask(milestoneId)}
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  backgroundColor: "white",
                  color: noteBorderColor,
                  border: `2px solid ${noteBorderColor}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                + Add Task
              </button>
            )}

            {!isCompleted && (
              <button
                onClick={() => setIsLinkMode((v) => !v)}
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  backgroundColor: isLinkMode ? "#f4433612" : "white",
                  color: "#f44336",
                  border: isLinkMode ? "2px solid #f44336" : "2px dashed #f44336",
                  borderRadius: 10,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                title="Create red links between tasks"
              >
                {isLinkMode ? "Done Linking" : "Link Tasks"}
              </button>
            )}

            {!isCompleted && (
              <button
                onClick={handleExtendBoardClick}
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  backgroundColor: "white",
                  color: "#333",
                  border: "2px dashed #bbb",
                  borderRadius: 10,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                title="Add more whiteboard space"
              >
                Extend Board
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {isCompleted ? (
              <span
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  backgroundColor: "#fff8e1",
                  color: "#8d6e63",
                  border: "2px solid #FFD700",
                  borderRadius: 10,
                  whiteSpace: "nowrap",
                }}
              >
                ✓ Completed
              </span>
            ) : milestoneId && onMarkMilestoneCompleted ? (
              <button
                onClick={() => onMarkMilestoneCompleted(milestoneId)}
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  backgroundColor: "white",
                  color: noteBorderColor,
                  border: `2px solid ${noteBorderColor}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title="Mark this milestone as completed"
              >
                <span style={{ color: "#FFD700" }}>★</span> Mark Completed
              </button>
            ) : null}
          </div>
        </div>

        {isLinkMode && !isCompleted && (
          <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 800, color: "#f44336" }}>
            {linkFromTaskId
              ? "Click another task to create a red arrow (click the same task to cancel)."
              : "Click a task, then click another to create a red arrow."}
          </div>
        )}

	        <div
	          style={{
	            border: `2px solid ${noteBorderColor}`,
	            borderRadius: 16,
	            backgroundColor: "rgba(255,255,255,0.86)",
	            boxShadow: "0 2px 0 rgba(0,0,0,0.05), 0 14px 26px rgba(0,0,0,0.08)",
	            overflow: "hidden",
	            position: "relative",
	          }}
	        >
	          <div style={{ position: "absolute", top: 12, right: 12, zIndex: 20, display: "flex", flexDirection: "column", gap: 8 }}>
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
	                width: 34,
	                height: 34,
	                borderRadius: 10,
	                backgroundColor: "white",
	                color: noteBorderColor,
	                border: `2px solid ${noteBorderColor}`,
	                fontSize: 18,
	                fontWeight: 900,
	                lineHeight: 1,
	                cursor: "pointer",
	              }}
	            >
	              +
	            </button>
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
	                width: 34,
	                height: 34,
	                borderRadius: 10,
	                backgroundColor: "white",
	                color: noteBorderColor,
	                border: `2px solid ${noteBorderColor}`,
	                fontSize: 18,
	                fontWeight: 900,
	                lineHeight: 1,
	                cursor: "pointer",
	              }}
	            >
	              −
	            </button>
	          </div>
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
		                  backgroundColor: "white",
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
		                    const LINK_COLOR = "#f44336";
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
		                            markerWidth="6"
		                            markerHeight="6"
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

                const statusGlyph = task.status === "GREEN" ? "✓" : task.status === "YELLOW" ? "◐" : "○";
                const statusColor = task.status === "GREEN" ? "#4caf50" : task.status === "YELLOW" ? "#ff9800" : "#999";
                const description = (task.description ?? "").trim();

                const isLinkSelected = isLinkMode && linkFromTaskId === task.id;
                const border = isLinkSelected ? "2px dashed #f44336" : `2px solid ${noteBorderColor}`;
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
                      padding: "12px 12px 20px",
                      boxSizing: "border-box",
                      borderRadius: 14,
                      backgroundColor: noteBackgroundColor,
                      backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(0,0,0,0.02))",
                      border,
                      boxShadow: isDragging
                        ? "0 4px 0 rgba(0,0,0,0.06), 0 20px 34px rgba(0,0,0,0.18)"
                        : "0 2px 0 rgba(0,0,0,0.05), 0 12px 22px rgba(0,0,0,0.10)",
                      cursor: isLinkMode ? "crosshair" : canEditBoard ? "grab" : "pointer",
                      userSelect: "none",
                      overflow: "hidden",
                      zIndex: isDragging ? 5 : 2,
                    }}
                    title={isLinkMode ? "Click to link" : task.title}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div
                        style={{
                          flex: 1,
                          fontWeight: 900,
                          fontSize: 13,
                          color: "#222",
                          lineHeight: 1.2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {task.title}
                      </div>

                      {!isCompleted && (
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
                            padding: "2px 8px",
                            fontSize: 12,
                            backgroundColor: "transparent",
                            color: "#f44336",
                            border: "none",
                            cursor: "pointer",
                            opacity: 0.85,
                            lineHeight: 1,
                          }}
                          title="Delete task"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: description ? "#444" : "#888",
                        fontStyle: description ? "normal" : "italic",
                        lineHeight: 1.35,
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {description || "Add a short description…"}
                    </div>

                    <div style={{ position: "absolute", bottom: 8, left: 12, fontSize: 12, fontWeight: 900, color: statusColor }}>
                      {statusGlyph}
                    </div>

                    {!isCompleted && !isLinkMode && (
                      <div
                        onPointerDown={(e) => handleResizePointerDown(e, task.id)}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleResizePointerUp}
                        style={{
                          position: "absolute",
                          right: 6,
                          bottom: 6,
                          width: 16,
                          height: 16,
                          cursor: "se-resize",
                          opacity: 0.7,
                          borderRight: `2px solid ${noteBorderColor}`,
                          borderBottom: `2px solid ${noteBorderColor}`,
                          borderRadius: 2,
                        }}
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
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "stretch",
            zIndex: 1200,
            padding: 0,
          }}
          onClick={closeTaskModal}
        >
          <div
            style={{
              backgroundColor: noteBackgroundColor,
              backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.65), rgba(0,0,0,0.02))",
              borderRadius: 0,
              padding: 24,
              width: "100%",
              height: "100%",
              overflow: "auto",
              boxShadow: "0 14px 60px rgba(0,0,0,0.35)",
              border: `3px solid ${noteBorderColor}`,
            }}
            onClick={(e) => e.stopPropagation()}
	          >
	            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start", marginBottom: 14 }}>
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
	                readOnly={isCompleted}
	                autoFocus
	                style={{
	                  width: "100%",
	                  padding: 10,
	                  fontSize: 14,
	                  backgroundColor: isCompleted ? "rgba(255,255,255,0.55)" : "white",
	                  border: `1px solid ${noteBorderColor}`,
	                  borderRadius: 6,
	                  boxSizing: "border-box",
	                  outline: "none",
	                  cursor: isCompleted ? "default" : "text",
	                }}
	              />
	            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 12, color: "#333" }}>
                Short Description
              </label>
	              <textarea
	                value={taskModalDescription}
	                onChange={(e) => setTaskModalDescription(e.target.value)}
	                readOnly={isCompleted}
	                rows={4}
	                style={{
	                  width: "100%",
	                  padding: 10,
	                  fontSize: 13,
	                  backgroundColor: isCompleted ? "rgba(255,255,255,0.55)" : "white",
	                  border: `1px solid ${noteBorderColor}`,
	                  borderRadius: 6,
	                  boxSizing: "border-box",
	                  outline: "none",
	                  resize: "vertical",
	                  fontFamily: "inherit",
	                  cursor: isCompleted ? "default" : "text",
	                }}
	              />
	            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 12, color: "#333" }}>
                Notes / Comments
              </label>
	              <textarea
	                value={taskModalNotes}
	                onChange={(e) => setTaskModalNotes(e.target.value)}
	                readOnly={isCompleted}
	                rows={14}
	                style={{
	                  width: "100%",
	                  padding: 10,
	                  fontSize: 13,
	                  backgroundColor: isCompleted ? "rgba(255,255,255,0.55)" : "white",
	                  border: `1px solid ${noteBorderColor}`,
	                  borderRadius: 6,
	                  boxSizing: "border-box",
	                  outline: "none",
	                  resize: "vertical",
	                  fontFamily: "inherit",
	                  cursor: isCompleted ? "default" : "text",
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
	                {isCompleted ? "Close" : "Cancel"}
	              </button>
	              {!isCompleted && (
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
}: {
  templates: FocusTemplate[];
  onAddTemplate: () => void;
  onUpdateTemplate: (
    templateId: string,
    updates: Partial<Pick<FocusTemplate, "title" | "plannedStart" | "plannedEnd" | "daysOfWeek" | "isSuspended">>
  ) => void;
  onDeleteTemplate: (templateId: string) => void;
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

  return (
    <div
      style={{
        border: "2px solid #eee",
        borderRadius: 12,
        padding: 20,
        backgroundColor: panelBgColor,
        backgroundImage: panelBgPattern,
        backgroundSize: "24px 24px",
      }}
    >
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
          <div style={{ fontSize: 16, fontWeight: 900, color: "#333", display: "flex", alignItems: "center", gap: 8 }}>
            ⏱️ Focus templates
          </div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 6, lineHeight: 1.5 }}>
            Define monthly focus sessions here. You can link them to milestones day-by-day in the Daily page.
          </div>
        </div>

        <button
          onClick={onAddTemplate}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 600,
            backgroundColor: "white",
            color: "#666",
            border: "2px dashed #ccc",
            borderRadius: 20,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Add Focus Template
        </button>
      </div>

      {templates.length === 0 ? (
        <p style={{ fontSize: 14, color: "#999", fontStyle: "italic", margin: 0 }}>
          No focus templates yet
        </p>
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

export default function MonthSetupPage() {
  const { selectedMonth } = useDateNavigation();
  const ymSafe = selectedMonth;

  const [tick, setTick] = useState(0);
  const state = useMemo(() => loadState(), [tick]);
  const plan = getMonth(state, ymSafe);

  const [fireworks, setFireworks] = useState<{ key: number; colors: string[] } | null>(null);

  // v6: Grand Plan is mandatory - redirect if not exists
  if (!state.grandPlan) {
    return <Navigate to="/grand-plan" replace />;
  }

  // v6: Check if month is within Grand Plan period
  const isInPeriod = isMonthInGrandPlanPeriod(state, ymSafe);

  // v5: Close month modal
  const [showCloseModal, setShowCloseModal] = useState(false);

  // v6.1: Milestone picker modal
  const [showMilestonePicker, setShowMilestonePicker] = useState(false);

  // v9.3: Confirm milestone completion
  const [confirmCompleteMilestoneId, setConfirmCompleteMilestoneId] = useState<string | null>(null);

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
      const raw = window.localStorage.getItem(selectedPinStorageKey);
      if (!raw || raw === "standalone") setSelectedMilestoneId(null);
      else if (raw.startsWith("milestone:")) setSelectedMilestoneId(raw.slice("milestone:".length) || null);
      else setSelectedMilestoneId(null);
    } catch {
      setSelectedMilestoneId(null);
    }
  }, [selectedPinStorageKey]);

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
  };

  const create = () => {
    const current = loadState();
    const next = upsertMonth(current, seedPlan(ymSafe));
    saveState(next);
    setTick((x) => x + 1);
  };

  const handlePlanUpdate = (updatedPlan: MonthPlan) => {
    const current = loadState();
    saveState(upsertMonth(current, updatedPlan));
    setTick((x) => x + 1);
  };

  // v5: Close/reopen month handlers
  const handleCloseMonth = () => {
    const next = closeMonth(state, ymSafe);
    saveState(next);
    setTick((x) => x + 1);
    setShowCloseModal(false);
  };

  const handleReopenMonth = () => {
    const next = reopenMonth(state, ymSafe);
    saveState(next);
    setTick((x) => x + 1);
  };

  // v6.1: Task handlers
  const handleAddTask = (milestoneId: string | null) => {
    const title = prompt("New task:");
    if (!title?.trim()) return;

    if (milestoneId) {
      mutate((s) => addTaskWithMilestone(s, ymSafe, title.trim(), milestoneId).state);
    } else {
      // Add standalone task
      if (!plan) return;
      const task: TaskNode = {
        id: makeId("task"),
        title: title.trim(),
        parentId: null,
        status: "NONE",
      };
      const nextPlan: MonthPlan = { ...plan, tasks: [...plan.tasks, task] };
      handlePlanUpdate(nextPlan);
    }
  };

  const handleUpdateTask = (
    taskId: string,
    updates: Partial<Pick<TaskNode, "title" | "description" | "notes" | "boardX" | "boardY" | "boardW" | "boardH">>
  ) => {
    mutate((s) => updateTaskInMonth(s, ymSafe, taskId, updates));
  };

  const handleDeleteTask = (taskId: string) => {
    mutate((s) => deleteTaskFromMonth(s, ymSafe, taskId));
  };

  // v8: Milestones pinned to this month (shown as "pins" at the top)
  const pinnedMilestones = getMilestonesInMonth(state, ymSafe);
  const pinnedIdsKey = (plan?.pinnedMilestoneIds ?? []).join("|");

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
    if (selectedMilestoneId && !plan.pinnedMilestoneIds.includes(selectedMilestoneId)) {
      setSelectedMilestoneId(plan.pinnedMilestoneIds[0] ?? null);
    }
  }, [pinnedIdsKey, selectedMilestoneId]);

  // v6.1: Get standalone tasks (no linkedMilestoneId)
  const standaloneTasks = plan?.tasks.filter((t) => !t.linkedMilestoneId) ?? [];

  const scopeBgColor = "#fbfaf7";
  const scopeBgPattern =
    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)";

  // v6.1: Get tasks for a specific milestone
  const getTasksForMilestone = (milestoneId: string) => {
    return plan?.tasks.filter((t) => t.linkedMilestoneId === milestoneId) ?? [];
  };

  // v8: Pin milestone to this month board (no automatic task creation)
  const handlePinMilestone = (milestone: MilestoneNode) => {
    if (!plan) return;
    const nextPinned = plan.pinnedMilestoneIds.includes(milestone.id)
      ? plan.pinnedMilestoneIds
      : [...plan.pinnedMilestoneIds, milestone.id];
    handlePlanUpdate({ ...plan, pinnedMilestoneIds: nextPinned });
    setSelectedMilestoneId(milestone.id);
    setShowMilestonePicker(false);
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
    // Calculate all metrics
    const tasksAddedCount = plan.tasks.length;
    const tasksCompletedCount = plan.tasks.filter((t) => t.status === "GREEN").length;

    const sessions = state.sessions.filter((s) => s.ym === ymSafe && s.endedAt && typeof s.actualMinutes === "number");

    const byTemplate = plan.templates.map((tpl) => {
      const list = sessions.filter((s) => s.templateId === tpl.id);
      const totalMinutes = list.reduce((a, b) => a + (b.actualMinutes ?? 0), 0);
      return { tpl, count: list.length, totalMinutes };
    });

    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((a, b) => a + (b.actualMinutes ?? 0), 0);

    const completionRate = tasksAddedCount > 0 ? Math.round((tasksCompletedCount / tasksAddedCount) * 100) : 0;
    const avgSessionDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

    const daysWithSessions = new Set(
      state.sessions
        .filter((s) => s.ym === ymSafe && s.endedAt)
        .map((s) => s.date)
    ).size;

    const daysWithCompletedPrimary = Object.values(state.days).filter(
      (d) => d.ym === ymSafe && d.primaryTaskId && d.outcomeByTaskId[d.primaryTaskId] === "COMPLETED"
    ).length;

    const maxMinutes = Math.max(...byTemplate.map((x) => x.totalMinutes), 1);
    const createBar = (minutes: number) => {
      const percentage = Math.round((minutes / maxMinutes) * 100);
      const filled = Math.round(percentage / 10);
      const empty = 10 - filled;
      return "█".repeat(filled) + "░".repeat(empty);
    };

    // Return closed view
    return (
      <div style={{
        minHeight: "100vh",
        backgroundColor: "#fef9e7",
        padding: "32px 24px",
        fontFamily: "Georgia, serif"
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
	          <h2 style={{ textAlign: "center", marginBottom: 8, fontSize: 28, color: "#5d4037" }}>
	            Monthly Report
	          </h2>
          <p style={{ textAlign: "center", marginBottom: 32, opacity: 0.7, fontSize: 16 }}>
            {ymSafe}
          </p>

          {/* Task Completion Section */}
          <div style={{
            border: "2px solid #4caf50",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            backgroundColor: "#f1f8f4",
          }}>
	            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#2e7d32" }}>Task Completion</h3>
	            <div style={{ display: "grid", gap: 12 }}>
	              <div style={{
	                padding: "12px",
	                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #c8e6c9",
              }}>
                <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Completion Rate</div>
	                <div style={{ fontSize: 24, fontWeight: 700, color: "#2e7d32" }}>
	                  {completionRate}%
	                </div>
	                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
	                  {tasksCompletedCount} / {tasksAddedCount} tasks
	                </div>
	              </div>

	              <div style={{
	                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #c8e6c9",
              }}>
	                <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Tasks Added</div>
	                <div style={{ fontSize: 24, fontWeight: 700, color: "#2e7d32" }}>
	                  {tasksAddedCount}
	                </div>
	                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>total tasks in this month plan</div>
	              </div>

	              <div style={{
	                padding: "12px",
	                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #c8e6c9",
              }}>
	                <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Tasks Completed</div>
	                <div style={{ fontSize: 24, fontWeight: 700, color: "#2e7d32" }}>
	                  {tasksCompletedCount}
	                </div>
	                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>completed (GREEN) tasks</div>
	              </div>
	            </div>
	          </div>

          {/* Focus Sessions Summary */}
          <div style={{
            border: "2px solid #ff9800",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            backgroundColor: "#fff8e1",
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#e65100" }}>Focus Sessions</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #ffe0b2",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Total Sessions</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#e65100" }}>{totalSessions}</div>
              </div>

              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #ffe0b2",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Total Minutes</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#e65100" }}>{totalMinutes}</div>
              </div>

              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #ffe0b2",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Avg Duration</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#e65100" }}>{avgSessionDuration}</div>
                <div style={{ fontSize: 12, color: "#666" }}>min/session</div>
              </div>
            </div>
          </div>

          {/* Focus Distribution */}
          <div style={{
            border: "2px solid #2196f3",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            backgroundColor: "#e3f2fd",
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#1565c0" }}>Focus Distribution</h3>
            {byTemplate.length === 0 ? (
              <p style={{
                opacity: 0.6,
                fontStyle: "italic",
                textAlign: "center",
                padding: "24px",
                backgroundColor: "white",
                borderRadius: 8,
              }}>
                No sessions logged yet
              </p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {byTemplate.map(({ tpl, count, totalMinutes: mins }) => {
                  const percentage = maxMinutes > 0 ? Math.round((mins / maxMinutes) * 100) : 0;
                  return (
                    <div key={tpl.id} style={{
                      backgroundColor: "white",
                      borderRadius: 8,
                      padding: 12,
                      border: "1px solid #bbdefb",
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: "#1565c0" }}>{tpl.title}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 14, marginBottom: 4 }}>
                        {createBar(mins)} {percentage}%
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {mins} min · {count} sessions
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Consistency Metrics */}
          <div style={{
            border: "2px solid #f44336",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            backgroundColor: "#ffebee",
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#c62828" }}>Consistency</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #ffcdd2",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Days with Focus</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#c62828" }}>{daysWithSessions}</div>
                <div style={{ fontSize: 12, color: "#666" }}>days with sessions</div>
              </div>

              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #ffcdd2",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Primary Completed</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#c62828" }}>{daysWithCompletedPrimary}</div>
                <div style={{ fontSize: 12, color: "#666" }}>days completed</div>
              </div>
            </div>
          </div>

          {/* Reopen Button */}
          <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: "2px solid #d7ccc8" }}>
            <button
              onClick={handleReopenMonth}
              style={{
                padding: "12px 32px",
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: "#4caf50",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Reopen Month for Editing
            </button>
          </div>
        </div>
      </div>
    );
  }

	return (
	  <div>
	    {/* Header */}
	    <div style={{ marginBottom: 24, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
	      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", gap: 12 }}>
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
	          <p style={{ margin: "8px 0 0", color: "#666", fontSize: 13 }}>
	            {ymSafe}
	            {plan ? (
	              <>
	                {" "}
	                · Tasks: <strong>{plan.tasks.length}</strong> · Completed:{" "}
	                <strong>{plan.tasks.filter((t) => t.status === "GREEN").length}</strong>
	              </>
	            ) : (
	              <> · Configure your monthly tasks and focus templates</>
	            )}
	          </p>
	        </div>
	        <div />
	      </div>
	    </div>

	      {!plan ? (
	        <div
	          style={{
            padding: 32,
            border: "2px dashed #ddd",
            borderRadius: 12,
            textAlign: "center",
            backgroundColor: "#fafafa",
          }}
        >
          {!isInPeriod ? (
            <>
              <p style={{ fontSize: 18, marginBottom: 16, color: "#f44336" }}>Month Outside Grand Plan Period</p>
              <p style={{ color: "#666", marginBottom: 16 }}>
                This month ({ymSafe}) is outside your Grand Plan period
                ({state.grandPlan.startMonth} - {state.grandPlan.endMonth ?? "Ongoing"}).
              </p>
              <p style={{ fontSize: 13, color: "#666" }}>
                Adjust your Grand Plan dates or navigate to a month within the plan period.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 18, marginBottom: 16 }}>No plan for {ymSafe} yet</p>
              <p style={{ color: "#666", marginBottom: 24 }}>
                Create a monthly plan to start tracking tasks and focus sessions.
              </p>
              <button
                onClick={create}
                style={{
                  padding: "12px 24px",
                  fontSize: 16,
                  fontWeight: 600,
                  backgroundColor: "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                }}
              >
                Create Month Plan
              </button>
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

	          {/* Pins bar (Grand Plan-like) */}
	          <div
	            style={{
	              display: "flex",
	              gap: 12,
	              marginBottom: 24,
	              alignItems: "center",
	              borderBottom: "2px solid #eee",
	              paddingBottom: 12,
	            }}
	          >
	            <div style={{ flex: "1 1 auto", minWidth: 0, overflowX: "auto", overflowY: "hidden", paddingBottom: 2 }}>
	              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap", width: "max-content" }}>
		                  <button
		                    onClick={() => setSelectedMilestoneId(null)}
		                    style={{
		                      padding: "8px 12px",
	                      fontSize: 12,
	                      fontWeight: 800,
	                      backgroundColor: selectedMilestoneId === null ? "#00000010" : "white",
	                      color: "#111",
	                      border: selectedMilestoneId === null ? "2px solid #111" : "1px solid #ddd",
	                      borderRadius: 12,
	                      cursor: "pointer",
	                      whiteSpace: "nowrap",
	                      display: "flex",
	                      alignItems: "center",
	                      gap: 8,
	                      boxShadow:
	                        selectedMilestoneId === null ? "0 8px 18px rgba(0,0,0,0.10)" : "0 2px 8px rgba(0,0,0,0.06)",
	                      flex: "0 0 auto",
	                    }}
	                    title="Standalone (not linked to a milestone)"
	                  >
	                    <PinGlyph color="#111" />
		                    Standalone
		                  </button>

		                  {pinnedMilestones.map((milestone) => {
	                    const category = state.grandPlan?.categories.find((c) => c.id === milestone.categoryId);
		                    const baseColor = category?.color ?? APP_MAIN_COLOR;
	                    const pinColor = milestone.status === "COMPLETED" ? "#FFD700" : baseColor;
	                    const active = selectedMilestoneId === milestone.id;
	                    return (
	                      <button
	                        key={milestone.id}
	                        onClick={() => setSelectedMilestoneId(milestone.id)}
	                        style={{
	                          padding: "8px 12px",
	                          fontSize: 12,
	                          fontWeight: 800,
	                          backgroundColor: active ? withHexAlpha(pinColor, "12") : "white",
	                          color: "#333",
	                          border: active ? `2px solid ${pinColor}` : `1px solid ${pinColor}`,
	                          borderRadius: 12,
	                          cursor: "pointer",
	                          display: "flex",
	                          alignItems: "center",
	                          gap: 8,
	                          whiteSpace: "nowrap",
	                          maxWidth: 240,
	                          overflow: "hidden",
	                          textOverflow: "ellipsis",
	                          boxShadow: active
	                            ? `0 8px 18px ${withHexAlpha(pinColor, "26")}`
	                            : `0 2px 8px ${withHexAlpha(pinColor, "14")}`,
	                          transform: active ? "translateY(-1px)" : "none",
	                          flex: "0 0 auto",
	                        }}
	                        title={`${category?.title ?? "Category"} · ${milestone.title}`}
	                      >
	                        <PinGlyph color={pinColor} />
	                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{milestone.title}</span>
	                        {milestone.status === "COMPLETED" && <span style={{ fontSize: 11, opacity: 0.7 }}>✓</span>}
	                      </button>
	                    );
		                  })}
	              </div>
	            </div>

	            {isInPeriod && state.grandPlan.milestones.length > 0 && (
	              <button
	                onClick={() => setShowMilestonePicker(true)}
	                style={{
	                  padding: "8px 16px",
	                  fontSize: 14,
	                  fontWeight: 600,
	                  backgroundColor: "white",
	                  color: "#666",
	                  border: "2px dashed #ccc",
	                  borderRadius: 20,
	                  cursor: "pointer",
	                  flex: "0 0 auto",
	                  whiteSpace: "nowrap",
	                }}
	              >
	                + Pin Milestone
	              </button>
	            )}
	          </div>

	          {/* Board content (Grand Plan-like container) */}
		          <div
		            style={{
		              border: "2px solid #eee",
		              borderRadius: 12,
		              padding: 20,
		              backgroundColor: scopeBgColor,
		              backgroundImage: scopeBgPattern,
		              backgroundSize: "24px 24px",
		              minHeight: 300,
		              marginBottom: 24,
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
		                const tasks = milestone ? getTasksForMilestone(milestone.id) : standaloneTasks;

		                const scopeKey = milestone ? `milestone:${milestone.id}` : "standalone";
		                const zoomStorageKey = `focustree:month-setup:board-zoom:${ymSafe}:${scopeKey}`;
		                const defaultBoardSize = { width: 2400, height: 1400 };
		                const boardSize = plan.boardByScope?.[scopeKey] ?? defaultBoardSize;
		                const links = plan.taskLinksByScope?.[scopeKey] ?? [];

	                const handleUpdateBoardSize = (next: { width: number; height: number }) => {
	                  mutate((s0) => {
	                    const plan0 = getMonth(s0, ymSafe);
	                    if (!plan0) return s0;
	                    const nextBoardByScope = { ...(plan0.boardByScope ?? {}), [scopeKey]: next };
	                    return upsertMonth(s0, { ...plan0, boardByScope: nextBoardByScope });
	                  });
	                };

	                const handleUpdateLinks = (next: { from: string; to: string }[]) => {
	                  mutate((s0) => {
	                    const plan0 = getMonth(s0, ymSafe);
	                    if (!plan0) return s0;
	                    const nextLinksByScope = { ...(plan0.taskLinksByScope ?? {}), [scopeKey]: next };
	                    return upsertMonth(s0, { ...plan0, taskLinksByScope: nextLinksByScope });
	                  });
	                };

		                return (
		                  <TaskGroup
		                    title={title}
		                    color={color}
		                    tasks={tasks}
		                    milestoneId={milestone ? milestone.id : null}
		                    milestoneStatus={milestone?.status}
		                    boardSize={boardSize}
		                    onUpdateBoardSize={handleUpdateBoardSize}
			                    links={links}
			                    onUpdateLinks={handleUpdateLinks}
			                    zoomStorageKey={zoomStorageKey}
			                    onAddTask={handleAddTask}
			                    onUpdateTask={handleUpdateTask}
			                    onDeleteTask={handleDeleteTask}
		                    onMarkMilestoneCompleted={milestone ? handleMarkMilestoneCompleted : undefined}
		                    hideTitle
		                    chromeless={!milestone}
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
	          <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: "2px solid #ddd" }}>
	            <button
              onClick={() => setShowCloseModal(true)}
              style={{
                padding: "12px 32px",
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Close Month
            </button>
            <p style={{ marginTop: 8, fontSize: 14, color: "#666" }}>
              Mark this month as complete and view the final report
            </p>
          </div>

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
                      (m) => m.categoryId === category.id
                    );
                    if (milestones.length === 0) return null;

                    // Filter out already pinned milestones and completed milestones
                    const pinnedIds = new Set(plan.pinnedMilestoneIds);
                    const available = milestones.filter(
                      (m) => !pinnedIds.has(m.id) && m.status !== "COMPLETED"
                    );

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
              }}
              onClick={closeAddTemplateModal}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 520,
                  width: "90%",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
	                {(() => {
	                  const accentColor = APP_MAIN_COLOR;

                  return (
                    <>
                      <h3 style={{ marginTop: 0, marginBottom: 16, color: accentColor }}>
                        New Focus Template
                      </h3>
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 6 }}>
                      Template name
                    </div>
                    <input
                      type="text"
                      value={newTemplateTitle}
                      onChange={(e) => {
                        setNewTemplateTitle(e.target.value);
                        setAddTemplateError(null);
                      }}
                      placeholder="e.g. Deep Work"
                      autoFocus
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${accentColor}`,
                        fontSize: 14,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
	                  <div>
	                    <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 6 }}>
	                      Hour range
	                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#777", marginBottom: 6 }}>Start</div>
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
                            borderRadius: 8,
                            border: `1px solid ${accentColor}`,
                            fontSize: 14,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#777", marginBottom: 6 }}>End</div>
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
                            borderRadius: 8,
                            border: `1px solid ${accentColor}`,
                            fontSize: 14,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
	                    </div>
	                  </div>
	                  <div>
	                    <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 6 }}>
	                      Days of week
	                    </div>
	                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
	                      {WEEKDAY_ORDER.map((day) => {
	                        const isSelected = newTemplateDays.includes(day);
	                        return (
	                          <button
	                            key={day}
	                            type="button"
	                            onClick={() => toggleNewTemplateDay(day)}
	                            style={{
	                              padding: "6px 10px",
	                              fontSize: 12,
	                              fontWeight: 800,
	                              backgroundColor: isSelected ? accentColor : "white",
	                              color: isSelected ? "white" : accentColor,
	                              border: `1px solid ${accentColor}`,
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
	                        onClick={() => setNewTemplateDays([...MON_FRI])}
	                        style={{
	                          padding: "6px 10px",
	                          fontSize: 12,
	                          fontWeight: 800,
	                          backgroundColor: "white",
	                          color: accentColor,
	                          border: `1px dashed ${accentColor}`,
	                          borderRadius: 999,
	                          cursor: "pointer",
	                        }}
	                      >
	                        Mon–Fri (default)
	                      </button>
	                      <button
	                        type="button"
	                        onClick={() => setNewTemplateDays([])}
	                        style={{
	                          padding: "6px 10px",
	                          fontSize: 12,
	                          fontWeight: 800,
	                          backgroundColor: "white",
	                          color: accentColor,
	                          border: `1px dashed ${accentColor}`,
	                          borderRadius: 999,
	                          cursor: "pointer",
	                        }}
	                      >
	                        Any day
	                      </button>
	                    </div>
	                    <div style={{ marginTop: 6, fontSize: 11, color: "#777" }}>
	                      Applies: {formatWeekdays(newTemplateDays)}
	                    </div>
	                  </div>
	                  {addTemplateError && (
	                    <div style={{ color: "#d32f2f", fontSize: 13 }}>
	                      {addTemplateError}
	                    </div>
	                  )}
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
                  <button
                    onClick={closeAddTemplateModal}
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
                    onClick={confirmAddTemplate}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      backgroundColor: accentColor,
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Add Template
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
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>Close Month</h3>
                <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
                  This will close the month and convert it to a read-only report view.
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
                      backgroundColor: "#ff9800",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Close Month
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
