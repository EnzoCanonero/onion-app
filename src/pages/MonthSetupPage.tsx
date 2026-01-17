
import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  getTemplatesForMilestone,
  getStandaloneTemplates,
} from "../app/storage";
import { MON_FRI, WEEKDAY_ORDER, WEEKDAY_SHORT, formatWeekdays, sortWeekdays } from "../app/weekdays";
import { useDateNavigation } from "../contexts/DateNavigationContext";
import FireworksOverlay from "../components/FireworksOverlay";

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

// Component for editing tasks under a milestone group
function TaskGroup({
  title,
  color,
  tasks,
  milestoneId,
  milestoneStatus,
  templates,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onMarkMilestoneCompleted,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  hideAddButton = false,
  hideTitle = false,
  chromeless = false,
}: {
  title: string;
  color: string;
  tasks: TaskNode[];
  milestoneId: string | null;
  milestoneStatus?: MilestoneStatus;
  templates: FocusTemplate[];
  onAddTask: (milestoneId: string | null) => void;
  onUpdateTask: (taskId: string, updates: Partial<Pick<TaskNode, "title" | "description">>) => void;
  onDeleteTask: (taskId: string) => void;
  onMarkMilestoneCompleted?: (milestoneId: string) => void;
  onAddTemplate: (milestoneId: string | null) => void;
  onUpdateTemplate: (
    templateId: string,
    updates: Partial<Pick<FocusTemplate, "title" | "plannedStart" | "plannedEnd" | "daysOfWeek" | "isSuspended">>
  ) => void;
  onDeleteTemplate: (templateId: string) => void;
  hideAddButton?: boolean;
  hideTitle?: boolean;
  chromeless?: boolean;
}) {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editTemplateTitle, setEditTemplateTitle] = useState("");
  const [editTemplateStart, setEditTemplateStart] = useState("");
  const [editTemplateEnd, setEditTemplateEnd] = useState("");
  const [editTemplateDays, setEditTemplateDays] = useState<Weekday[]>([]);

  const [taskModalTaskId, setTaskModalTaskId] = useState<string | null>(null);
  const [taskModalTitle, setTaskModalTitle] = useState("");
  const [taskModalDescription, setTaskModalDescription] = useState("");
  const [taskModalError, setTaskModalError] = useState<string | null>(null);

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

  const isCompleted = milestoneStatus === "COMPLETED";
  const accentColor = isCompleted ? "#FFD700" : color;
  const groupBackgroundColor = withHexAlpha(accentColor, "10");
  const uiAccent = chromeless ? "#000" : accentColor;

  const openTaskModal = (task: TaskNode) => {
    setTaskModalTaskId(task.id);
    setTaskModalTitle(task.title);
    setTaskModalDescription(task.description ?? "");
    setTaskModalError(null);
  };

  const closeTaskModal = () => {
    setTaskModalTaskId(null);
    setTaskModalTitle("");
    setTaskModalDescription("");
    setTaskModalError(null);
  };

  const saveTaskModal = () => {
    if (!taskModalTaskId) return;
    const nextTitle = taskModalTitle.trim();
    if (!nextTitle) {
      setTaskModalError("Title is required.");
      return;
    }
    const nextDescription = taskModalDescription.trim();
    onUpdateTask(taskModalTaskId, { title: nextTitle, description: nextDescription || undefined });
    closeTaskModal();
  };

  useEffect(() => {
    if (!taskModalTaskId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTaskModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [taskModalTaskId]);

  const bubbleStyle: CSSProperties = chromeless
    ? {
        padding: 16,
        backgroundColor: "transparent",
        borderRadius: 14,
        border: "2px solid #000",
      }
    : {
        padding: 16,
        backgroundColor: groupBackgroundColor,
        borderRadius: 14,
        border: `2px solid ${accentColor}`,
        boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 10px 24px rgba(0,0,0,0.06)",
      };

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
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 12 }}>
          {isCompleted && (
            <span style={{ fontSize: 12, fontWeight: 700, color: uiAccent }}>✓ Completed</span>
          )}
          {milestoneId && !isCompleted && onMarkMilestoneCompleted && (
            <button
              onClick={() => onMarkMilestoneCompleted(milestoneId)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 700,
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
      ) : null}

      <div style={{ display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap" }}>
        {/* Tasks (left bubble) */}
        <div style={{ ...bubbleStyle, flex: "3 1 420px", minWidth: 320, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: uiAccent, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            ✅ Tasks
            <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 600 }}>({tasks.length})</span>
          </div>

          <div style={{ flex: "1 1 auto" }}>
            {tasks.length === 0 ? (
              <p style={{ fontSize: 13, color: "#999", fontStyle: "italic", margin: 0 }}>
                No tasks yet
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openTaskModal(task);
                    }}
                    onClick={() => openTaskModal(task)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: chromeless ? "6px 0" : "7.2px 8px",
                      backgroundColor: chromeless ? "transparent" : "white",
                      borderRadius: chromeless ? 0 : 4,
                      border: chromeless ? "none" : `1px solid ${accentColor}`,
                      cursor: "pointer",
                    }}
                  >
                    {!chromeless && (
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                          fontWeight: 700,
                          color:
                            task.status === "GREEN"
                              ? "#4caf50"
                              : task.status === "YELLOW"
                              ? "#ff9800"
                              : "#ccc",
                        }}
                        title={
                          task.status === "GREEN"
                            ? "Completed"
                            : task.status === "YELLOW"
                            ? "In Progress"
                            : "Not started"
                        }
                      >
                        {task.status === "GREEN" ? "✓" : task.status === "YELLOW" ? "◐" : "○"}
                      </span>
                    )}

                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        textDecoration: "none",
                        color: chromeless ? "#000" : "#333",
                      }}
                    >
                      {task.title}
                    </span>

                    {!isCompleted && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete task "${task.title}"?`)) {
                            onDeleteTask(task.id);
                          }
                        }}
                        style={{
                          padding: "2px 6px",
                          fontSize: 11,
                          backgroundColor: "transparent",
                          color: "#f44336",
                          border: "none",
                          cursor: "pointer",
                          opacity: 0.7,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isCompleted && !hideAddButton && (
            <div style={{ marginTop: "auto", paddingTop: 10 }}>
              <button
                onClick={() => onAddTask(milestoneId)}
                style={{
                  padding: "4.95px 9.9px",
                  fontSize: 9.9,
                  fontWeight: 700,
                  backgroundColor: "white",
                  color: chromeless ? "#000" : color,
                  border: chromeless ? "2px solid #000" : `2px solid ${color}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                + Add Task
              </button>
            </div>
          )}
        </div>

        {/* Focus Templates (right bubble) */}
        <div style={{ ...bubbleStyle, flex: "2 1 320px", minWidth: 280, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: uiAccent, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            ⏱️ Focus Templates
            <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 600 }}>({templates.length})</span>
          </div>

          <div style={{ flex: "1 1 auto" }}>
            {templates.length === 0 ? (
              <p style={{ fontSize: 12, color: "#999", fontStyle: "italic", margin: 0 }}>
                No focus templates
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {templates.map((template) => (
	                  <div
	                    key={template.id}
	                    style={{
	                      display: "flex",
	                      alignItems: "center",
	                      gap: 8,
	                      padding: chromeless ? "6px 0" : "7.2px 8px",
	                      backgroundColor: chromeless ? "transparent" : "white",
	                      borderRadius: chromeless ? 0 : 4,
	                      border: chromeless ? "none" : `1px solid ${accentColor}`,
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
                            padding: "4px 8px",
                            fontSize: 12,
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
                            padding: "4px",
                            fontSize: 12,
                            border: `1px solid ${uiAccent}`,
                            borderRadius: 4,
                          }}
                        />
                        <span style={{ fontSize: 12, color: "#999" }}>-</span>
                        <input
                          type="time"
                          value={editTemplateEnd}
                          onChange={(e) => setEditTemplateEnd(e.target.value)}
                          style={{
                            width: 92,
                            padding: "4px",
                            fontSize: 12,
                            border: `1px solid ${uiAccent}`,
                            borderRadius: 4,
                          }}
                        />
                        <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>Days:</span>
                          {WEEKDAY_ORDER.map((day) => {
                            const isSelected = editTemplateDays.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleTemplateDay(day)}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 11,
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
                              padding: "4px 8px",
                              fontSize: 11,
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
                              padding: "4px 8px",
                              fontSize: 11,
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
                              padding: "4px 8px",
                              fontSize: 11,
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
                              padding: "4px 8px",
                              fontSize: 11,
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
                            fontSize: 12,
                            cursor: "pointer",
                            color: chromeless ? "#000" : "#333",
                          }}
                        >
                          {template.title}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: chromeless ? "#000" : "#888",
                            flex: "1 1 140px",
                            minWidth: 120,
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatWeekdays(template.daysOfWeek)}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: chromeless ? "#000" : "#888",
                            fontFamily: "monospace",
                            flex: "0 0 auto",
                            whiteSpace: "nowrap",
                          }}
	                        >
	                          {template.plannedStart}-{template.plannedEnd}
	                        </span>
	                        {!isCompleted && (
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
	                                padding: "2px 6px",
	                                fontSize: 11,
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
	                                padding: "2px 6px",
	                                fontSize: 11,
	                                backgroundColor: "transparent",
	                                color: "#f44336",
	                                border: "none",
	                                cursor: "pointer",
	                                opacity: 0.7,
	                              }}
	                            >
	                              ✕
	                            </button>
	                          </div>
	                        )}
	                      </>
	                    )}
	                  </div>
	                ))}
	              </div>
	            )}
	          </div>

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

	          {!isCompleted && (
	            <div style={{ marginTop: "auto", paddingTop: 10 }}>
	              <button
	                onClick={() => onAddTemplate(milestoneId)}
	                style={{
                  padding: "4.95px 9.9px",
                  fontSize: 9.9,
                  fontWeight: 700,
                  backgroundColor: "white",
                  color: chromeless ? "#000" : color,
                  border: chromeless ? "2px solid #000" : `2px solid ${color}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                + Add Focus Template
              </button>
            </div>
          )}
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
              backgroundColor: "white",
              borderRadius: 12,
              padding: 18,
              maxWidth: 560,
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
              border: `2px solid ${uiAccent}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: uiAccent }}>Task</div>
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
                autoFocus
                style={{
                  width: "100%",
                  padding: 10,
                  fontSize: 14,
                  border: `1px solid ${uiAccent}`,
                  borderRadius: 6,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 12, color: "#333" }}>
                Description
              </label>
              <textarea
                value={taskModalDescription}
                onChange={(e) => setTaskModalDescription(e.target.value)}
                rows={6}
                style={{
                  width: "100%",
                  padding: 10,
                  fontSize: 13,
                  border: `1px solid ${uiAccent}`,
                  borderRadius: 6,
                  boxSizing: "border-box",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
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
                Cancel
              </button>
              <button
                onClick={saveTaskModal}
                style={{
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 800,
                  backgroundColor: uiAccent,
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Save
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
  const [addTemplateMilestoneId, setAddTemplateMilestoneId] = useState<string | null>(null);
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newTemplateStart, setNewTemplateStart] = useState("09:00");
  const [newTemplateEnd, setNewTemplateEnd] = useState("10:00");
  const [newTemplateDays, setNewTemplateDays] = useState<Weekday[]>([...MON_FRI]);
  const [addTemplateError, setAddTemplateError] = useState<string | null>(null);

  const mutate = (fn: (s: typeof state) => typeof state) => {
    const next = fn(state);
    saveState(next);
    setTick((x) => x + 1);
  };

  const create = () => {
    const next = upsertMonth(state, seedPlan(ymSafe));
    saveState(next);
    setTick((x) => x + 1);
  };

  const handlePlanUpdate = (updatedPlan: MonthPlan) => {
    saveState(upsertMonth(state, updatedPlan));
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

  const handleUpdateTask = (taskId: string, updates: Partial<Pick<TaskNode, "title" | "description">>) => {
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
  const standaloneTemplates = getStandaloneTemplates(state, ymSafe);

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

  const handleAddTemplate = (milestoneId: string | null) => {
    setAddTemplateMilestoneId(milestoneId);
    setNewTemplateTitle("");
    setNewTemplateStart("09:00");
    setNewTemplateEnd("10:00");
    setNewTemplateDays([...MON_FRI]);
    setAddTemplateError(null);
    setShowAddTemplateModal(true);
  };

  const closeAddTemplateModal = () => {
    setShowAddTemplateModal(false);
    setAddTemplateMilestoneId(null);
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
			      linkedMilestoneId: addTemplateMilestoneId,
			      isSuspended: false,
			    };
		    const nextPinnedMilestoneIds =
		      typeof addTemplateMilestoneId === "string" && addTemplateMilestoneId
		        ? plan.pinnedMilestoneIds.includes(addTemplateMilestoneId)
		          ? plan.pinnedMilestoneIds
	          : [...plan.pinnedMilestoneIds, addTemplateMilestoneId]
	        : plan.pinnedMilestoneIds;
	    const nextPlan: MonthPlan = { ...plan, templates: [...plan.templates, newTemplate], pinnedMilestoneIds: nextPinnedMilestoneIds };
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
      <h2>Month Setup: {ymSafe}</h2>
      <p style={{ marginTop: -8, marginBottom: 24, opacity: 0.7 }}>
        Configure your monthly tasks and focus templates
      </p>

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

          {/* Stats & Controls */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
              marginBottom: 24,
            }}
          >
	            {/* Stats */}
	            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
	              <span style={{ fontSize: 14, color: "#666" }}>
	                Tasks: <strong>{plan.tasks.length}</strong>
	              </span>
	              <span style={{ color: "#ddd" }}>|</span>
	              <span style={{ fontSize: 14, color: "#666" }}>
	                Completed: <strong>{plan.tasks.filter((t) => t.status === "GREEN").length}</strong>
	              </span>
	            </div>
	          </div>

          {/* v8: Month Setup "board" with pins */}
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "white",
              boxShadow: "0 6px 14px rgba(0,0,0,0.06)",
              marginBottom: 24,
            }}
          >
            {/* Pins bar */}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                padding: 12,
                borderBottom: "1px solid #eee",
                backgroundColor: "white",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: "#666", marginRight: 4 }}>📌 Pins</div>

              <button
                onClick={() => setSelectedMilestoneId(null)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 800,
                  backgroundColor: selectedMilestoneId === null ? "#00000010" : "white",
                  color: "#000",
                  border: selectedMilestoneId === null ? "2px solid #000" : "1px solid #ddd",
                  borderRadius: 999,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                title="Standalone (not linked to a milestone)"
              >
                Standalone
              </button>

              {pinnedMilestones.map((milestone) => {
                const category = state.grandPlan?.categories.find((c) => c.id === milestone.categoryId);
                const baseColor = category?.color ?? "#9c27b0";
                const pinColor = milestone.status === "COMPLETED" ? "#FFD700" : baseColor;
                const active = selectedMilestoneId === milestone.id;
                return (
                  <button
                    key={milestone.id}
                    onClick={() => setSelectedMilestoneId(milestone.id)}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 800,
                      backgroundColor: active ? `${pinColor}10` : "white",
                      color: "#333",
                      border: active ? `2px solid ${pinColor}` : `1px solid ${pinColor}`,
                      borderRadius: 999,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      whiteSpace: "nowrap",
                      maxWidth: 240,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={`${category?.title ?? "Category"} · ${milestone.title}`}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: pinColor,
                        display: "inline-block",
                        flex: "0 0 auto",
                      }}
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{milestone.title}</span>
                    {milestone.status === "COMPLETED" && <span style={{ fontSize: 11, opacity: 0.7 }}>✓</span>}
                  </button>
                );
              })}

              <div style={{ flex: "1 1 auto" }} />

              {isInPeriod && state.grandPlan.milestones.length > 0 && (
                <button
                  onClick={() => setShowMilestonePicker(true)}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    backgroundColor: "white",
                    color: "#333",
                    border: "2px dashed #bbb",
                    borderRadius: 10,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  + Pin Milestone
                </button>
              )}
            </div>

            {/* Board content */}
            <div
              style={{
                padding: 16,
                backgroundColor: "#fafafa",
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)",
                backgroundSize: "18px 18px",
              }}
            >
              {pinnedMilestones.length === 0 && standaloneTasks.length === 0 && standaloneTemplates.length === 0 && (
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

                const color = milestone ? category?.color ?? "#9c27b0" : "#000";
                const tasks = milestone ? getTasksForMilestone(milestone.id) : standaloneTasks;
                const templates = milestone
                  ? getTemplatesForMilestone(state, ymSafe, milestone.id)
                  : standaloneTemplates;

	                return (
	                  <TaskGroup
	                    title={title}
	                    color={color}
	                    tasks={tasks}
	                    milestoneId={milestone ? milestone.id : null}
	                    milestoneStatus={milestone?.status}
	                    templates={templates}
	                    onAddTask={handleAddTask}
	                    onUpdateTask={handleUpdateTask}
	                    onDeleteTask={handleDeleteTask}
	                    onMarkMilestoneCompleted={milestone ? handleMarkMilestoneCompleted : undefined}
	                    onAddTemplate={handleAddTemplate}
	                    onUpdateTemplate={handleUpdateTemplate}
	                    onDeleteTemplate={handleDeleteTemplate}
	                    hideTitle
	                    chromeless={!milestone}
	                  />
	                );
	              })()}
            </div>
          </div>

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
	                  const accentColor =
	                    addTemplateMilestoneId === null
	                      ? "#000"
	                      : state.grandPlan?.categories.find(
	                          (c) => c.id === state.grandPlan?.milestones.find((m) => m.id === addTemplateMilestoneId)?.categoryId
	                        )?.color ?? "#ff9800";

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
