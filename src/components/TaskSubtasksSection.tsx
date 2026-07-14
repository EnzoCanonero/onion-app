import { type CSSProperties, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from "react";
import type { TaskNode } from "../app/types";

export type TaskSubtaskItem = {
  id: string;
  title: string;
  status: TaskNode["status"];
  showActionCluster?: boolean;
  canToggleCompleted?: boolean;
  canToggleInProgress?: boolean;
  canDelete?: boolean;
  onToggleCompleted?: () => void;
  onToggleInProgress?: () => void;
  onDelete?: () => void;
};

type TaskSubtasksSectionProps = {
  subtasks: TaskSubtaskItem[];
  accentColor: string;
  canAddSubtask?: boolean;
  showAddSubtaskComposer?: boolean;
  addSubtaskValue?: string;
  onAddSubtaskValueChange?: (value: string) => void;
  onAddSubtaskSubmit?: () => void;
  canSubmitSubtask?: boolean;
  variant?: "modal" | "daily";
  stopPropagationOnAction?: boolean;
};

function withHexAlpha(color: string, alphaHex: string): string {
  const normalizedAlpha = /^[0-9a-fA-F]{2}$/.test(alphaHex) ? alphaHex : "18";
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

function getSubtaskStatusColor(status: TaskNode["status"]): string {
  switch (status) {
    case "GREEN":
      return "#10b981";
    case "YELLOW":
      return "#f59e0b";
    case "NONE":
    default:
      return "#94a3b8";
  }
}

function getSubtaskStatusGlyph(status: TaskNode["status"]): string {
  switch (status) {
    case "GREEN":
      return "✓";
    case "YELLOW":
      return "◐";
    case "NONE":
    default:
      return "○";
  }
}

export default function TaskSubtasksSection({
  subtasks,
  accentColor,
  canAddSubtask = false,
  showAddSubtaskComposer = true,
  addSubtaskValue = "",
  onAddSubtaskValueChange,
  onAddSubtaskSubmit,
  canSubmitSubtask = false,
  variant = "modal",
  stopPropagationOnAction = false,
}: TaskSubtasksSectionProps) {
  const blockedStatusColors = {
    border: "#d1d5db",
    background: "#f3f4f6",
    text: "#9ca3af",
  };
  const isModal = variant === "modal";
  const composerDisabled = !canAddSubtask;
  const canSubmit = canAddSubtask && canSubmitSubtask;
  const accentGlow = withHexAlpha(accentColor, "28");

  const subtaskRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: isModal ? 10 : 8,
    padding: isModal ? "10px 12px" : "8px 10px",
    borderRadius: isModal ? 14 : 12,
    backgroundColor: "#ffffff",
    border: "1px solid #e7ebf0",
  };

  const composerInputStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: isModal ? "11px 14px" : "9px 12px",
    fontSize: isModal ? 14 : 13,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "#0f172a",
    backgroundColor: composerDisabled ? "#f8fafc" : "#ffffff",
    border: `1px solid ${composerDisabled ? "#d7dee8" : "#e5e7eb"}`,
    borderRadius: isModal ? 14 : 12,
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "inherit",
    cursor: composerDisabled ? "not-allowed" : "text",
  };

  const composerButtonStyle: CSSProperties = {
    minWidth: isModal ? 72 : 64,
    padding: isModal ? "0 16px" : "0 14px",
    borderRadius: isModal ? 14 : 12,
    border: "none",
    backgroundColor: canSubmit ? accentColor : blockedStatusColors.background,
    color: canSubmit ? "#ffffff" : blockedStatusColors.text,
    fontSize: isModal ? 12 : 11,
    fontWeight: 800,
    cursor: canSubmit ? "pointer" : "not-allowed",
    boxShadow: canSubmit ? `0 10px 20px ${accentGlow}` : "none",
    whiteSpace: "nowrap",
  };

  const maybeStopPropagation = (event: SyntheticEvent<HTMLElement>) => {
    if (!stopPropagationOnAction) return;
    event.stopPropagation();
  };

  const handleButtonAction = (
    event: MouseEvent<HTMLButtonElement>,
    action: (() => void) | undefined
  ) => {
    if (stopPropagationOnAction) event.stopPropagation();
    action?.();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (stopPropagationOnAction) event.stopPropagation();
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!canSubmit) return;
    onAddSubtaskSubmit?.();
  };

  return (
    <>
      {subtasks.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: isModal ? 8 : 6 }}>
          {subtasks.map((subtask) => {
            const statusColor = getSubtaskStatusColor(subtask.status);
            const showActionCluster = subtask.showActionCluster !== false;
            return (
              <div key={subtask.id} style={subtaskRowStyle}>
                <span
                  style={{
                    color: statusColor,
                    fontWeight: 800,
                    fontSize: isModal ? 13 : 12,
                    flexShrink: 0,
                    width: isModal ? 16 : 14,
                    textAlign: "center",
                  }}
                >
                  {getSubtaskStatusGlyph(subtask.status)}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: isModal ? 13 : 12,
                    color: subtask.status === "GREEN" ? "#94a3b8" : "#334155",
                    textDecoration: subtask.status === "GREEN" ? "line-through" : "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {subtask.title}
                </span>
                {showActionCluster ? (
                  <div
                    style={{ display: "flex", gap: 4, flexShrink: 0 }}
                    onClick={maybeStopPropagation}
                    onMouseDown={maybeStopPropagation}
                    onPointerDown={maybeStopPropagation}
                  >
                    <button
                      onClick={(event) => handleButtonAction(event, subtask.onToggleCompleted)}
                      disabled={!subtask.canToggleCompleted}
                      style={{
                        width: isModal ? 24 : 22,
                        height: isModal ? 24 : 22,
                        borderRadius: isModal ? 7 : 6,
                        border: `1px solid ${subtask.canToggleCompleted ? "#10b981" : blockedStatusColors.border}`,
                        backgroundColor: subtask.canToggleCompleted
                          ? subtask.status === "GREEN" ? "#10b981" : "#ffffff"
                          : blockedStatusColors.background,
                        color: subtask.canToggleCompleted
                          ? subtask.status === "GREEN" ? "#ffffff" : "#10b981"
                          : blockedStatusColors.text,
                        cursor: subtask.canToggleCompleted ? "pointer" : "not-allowed",
                        fontSize: isModal ? 10 : 9,
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Toggle completed"
                    >
                      ✓
                    </button>
                    <button
                      onClick={(event) => handleButtonAction(event, subtask.onToggleInProgress)}
                      disabled={!subtask.canToggleInProgress}
                      style={{
                        width: isModal ? 24 : 22,
                        height: isModal ? 24 : 22,
                        borderRadius: isModal ? 7 : 6,
                        border: `1px solid ${subtask.canToggleInProgress ? "#f59e0b" : blockedStatusColors.border}`,
                        backgroundColor: subtask.canToggleInProgress
                          ? subtask.status === "YELLOW" ? "#f59e0b" : "#ffffff"
                          : blockedStatusColors.background,
                        color: subtask.canToggleInProgress
                          ? subtask.status === "YELLOW" ? "#ffffff" : "#f59e0b"
                          : blockedStatusColors.text,
                        cursor: subtask.canToggleInProgress ? "pointer" : "not-allowed",
                        fontSize: isModal ? 10 : 9,
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Toggle WIP"
                    >
                      ◐
                    </button>
                    {subtask.canDelete !== undefined ? (
                      <button
                        onClick={(event) => handleButtonAction(event, subtask.onDelete)}
                        disabled={!subtask.canDelete}
                        style={{
                          width: isModal ? 24 : 22,
                          height: isModal ? 24 : 22,
                          borderRadius: isModal ? 7 : 6,
                          border: `1px solid ${subtask.canDelete ? "#fecaca" : blockedStatusColors.border}`,
                          backgroundColor: subtask.canDelete ? "#ffffff" : blockedStatusColors.background,
                          color: subtask.canDelete ? "#ef4444" : blockedStatusColors.text,
                          cursor: subtask.canDelete ? "pointer" : "not-allowed",
                          fontSize: isModal ? 10 : 9,
                          fontWeight: 800,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title="Delete subtask"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {showAddSubtaskComposer ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: subtasks.length > 0 ? 12 : 0,
          }}
          onClick={maybeStopPropagation}
        >
          <input
            type="text"
            value={addSubtaskValue}
            onChange={(event) => onAddSubtaskValueChange?.(event.target.value)}
            disabled={composerDisabled}
            placeholder="Add subtask..."
            onClick={maybeStopPropagation}
            onMouseDown={maybeStopPropagation}
            onPointerDown={maybeStopPropagation}
            onFocus={maybeStopPropagation}
            onKeyDown={handleComposerKeyDown}
            style={composerInputStyle}
          />
          <button
            onClick={(event) => {
              if (stopPropagationOnAction) event.stopPropagation();
              if (!canSubmit) return;
              onAddSubtaskSubmit?.();
            }}
            disabled={!canSubmit}
            onMouseDown={maybeStopPropagation}
            onPointerDown={maybeStopPropagation}
            style={composerButtonStyle}
          >
            Add
          </button>
        </div>
      ) : null}
    </>
  );
}
