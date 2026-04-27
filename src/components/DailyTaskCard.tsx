import { useState, type KeyboardEvent } from "react";
import type { TaskNode } from "../app/types";
import TaskSubtasksSection, { type TaskSubtaskItem } from "./TaskSubtasksSection";

type DailyTaskCardProps = {
  task: TaskNode;
  accentColor: string;
  isPrimary: boolean;
  frozen: boolean;
  canSetCompleted: boolean;
  canSetInProgress: boolean;
  canSwitchPrimaryTask?: boolean;
  onOpen?: () => void;
  onToggleCompleted: () => void;
  onToggleInProgress: () => void;
  onSwitchPrimary?: () => void;
  onRemoveFromSelection?: () => void;
  subtasks: TaskSubtaskItem[];
  canAddSubtask: boolean;
  onAddSubtask?: (title: string) => void;
};

export default function DailyTaskCard({
  task,
  accentColor,
  isPrimary,
  frozen,
  canSetCompleted,
  canSetInProgress,
  canSwitchPrimaryTask = false,
  onOpen,
  onToggleCompleted,
  onToggleInProgress,
  onSwitchPrimary,
  onRemoveFromSelection,
  subtasks,
  canAddSubtask,
  onAddSubtask,
}: DailyTaskCardProps) {
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const isCompleted = task.status === "GREEN";
  const isInProgress = task.status === "YELLOW";
  const notes = (task.notes ?? "").trim();
  const showSelectionActions = !isCompleted;
  const cardBorderColor = isPrimary ? "#ecd7a4" : "#e6ebf2";
  const cardBackground = isPrimary
    ? "linear-gradient(180deg, #fff9ee 0%, #fff3d9 100%)"
    : "#ffffff";
  const canSubmitSubtask = canAddSubtask && subtaskDraft.trim().length > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpen) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };

  const handleSubtaskSubmit = () => {
    const nextTitle = subtaskDraft.trim();
    if (!canAddSubtask || !onAddSubtask || !nextTitle) return;
    onAddSubtask(nextTitle);
    setSubtaskDraft("");
  };

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      style={{
        position: "relative",
        padding: "16px 18px 14px 20px",
        borderRadius: 18,
        border: `1px solid ${cardBorderColor}`,
        borderLeft: `4px solid ${accentColor}`,
        background: cardBackground,
        boxShadow: isPrimary
          ? "0 12px 28px rgba(180, 130, 25, 0.14)"
          : "0 8px 22px rgba(15,23,42,0.05)",
        cursor: onOpen ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: isPrimary ? 18 : 16,
              lineHeight: 1.25,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: -0.2,
            }}
          >
            {task.title}
          </div>

          {notes ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                lineHeight: 1.65,
                color: "#64748b",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {notes}
            </div>
          ) : null}
        </div>

        {showSelectionActions ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {isPrimary ? (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  if (!canSwitchPrimaryTask || !onSwitchPrimary) return;
                  onSwitchPrimary();
                }}
                disabled={!canSwitchPrimaryTask}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  border: "1px solid #d7dee8",
                  backgroundColor: canSwitchPrimaryTask ? "#ffffff" : "#f3f4f6",
                  color: canSwitchPrimaryTask ? "#475569" : "#9ca3af",
                  cursor: canSwitchPrimaryTask ? "pointer" : "not-allowed",
                  fontSize: 14,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title={canSwitchPrimaryTask ? "Change primary task" : "No secondary task available to switch"}
              >
                ↻
              </button>
            ) : null}

            {!isPrimary && onRemoveFromSelection ? (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveFromSelection();
                }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  border: "1px solid #fecaca",
                  backgroundColor: "#ffffff",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Remove from daily selection"
              >
                ✕
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid #eef2f7",
        }}
      >
        <TaskSubtasksSection
          subtasks={subtasks}
          accentColor={accentColor}
          canAddSubtask={canAddSubtask}
          addSubtaskValue={subtaskDraft}
          onAddSubtaskValueChange={setSubtaskDraft}
          onAddSubtaskSubmit={handleSubtaskSubmit}
          canSubmitSubtask={canSubmitSubtask}
          variant="daily"
          stopPropagationOnAction
        />
      </div>

      {!frozen ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button
            onClick={(event) => {
              event.stopPropagation();
              if (!canSetCompleted) return;
              onToggleCompleted();
            }}
            disabled={!canSetCompleted}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: canSetCompleted ? (isCompleted ? "#10b981" : "#ffffff") : "#f3f4f6",
              color: canSetCompleted ? (isCompleted ? "#ffffff" : "#10b981") : "#9ca3af",
              border: `1px solid ${canSetCompleted ? "#10b981" : "#d1d5db"}`,
              borderRadius: 999,
              cursor: canSetCompleted ? "pointer" : "not-allowed",
            }}
          >
            ✓ Completed
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              if (!canSetInProgress) return;
              onToggleInProgress();
            }}
            disabled={!canSetInProgress}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: canSetInProgress ? (isInProgress ? "#f59e0b" : "#ffffff") : "#f3f4f6",
              color: canSetInProgress ? (isInProgress ? "#ffffff" : "#f59e0b") : "#9ca3af",
              border: `1px solid ${canSetInProgress ? "#f59e0b" : "#d1d5db"}`,
              borderRadius: 999,
              cursor: canSetInProgress ? "pointer" : "not-allowed",
            }}
          >
            ◐ In Progress
          </button>
        </div>
      ) : null}
    </div>
  );
}
