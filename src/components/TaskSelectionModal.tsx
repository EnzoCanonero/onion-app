import { useState } from "react";
import type { TaskNode } from "../app/types";

type TaskSelectionModalProps = {
  tasks: TaskNode[];
  currentPrimaryId?: string;
  currentSecondaryIds: string[];
  onConfirm: (primaryId: string | undefined, secondaryIds: string[]) => void;
  onCancel: () => void;
  suggestedSecondaryIds?: string[];
};

export default function TaskSelectionModal({
  tasks,
  currentPrimaryId,
  currentSecondaryIds,
  onConfirm,
  onCancel,
  suggestedSecondaryIds = [],
}: TaskSelectionModalProps) {
  const [step, setStep] = useState<"primary" | "secondary">("primary");
  const [selectedPrimary, setSelectedPrimary] = useState<string | undefined>(currentPrimaryId);
  const [selectedSecondaries, setSelectedSecondaries] = useState<string[]>(currentSecondaryIds);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (taskId: string) => {
    const next = new Set(expandedIds);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    setExpandedIds(next);
  };

  const handlePrimarySelect = (taskId: string) => {
    setSelectedPrimary(taskId);
  };

  const handleSecondaryToggle = (taskId: string) => {
    if (selectedSecondaries.includes(taskId)) {
      setSelectedSecondaries(selectedSecondaries.filter((id) => id !== taskId));
    } else {
      setSelectedSecondaries([...selectedSecondaries, taskId]);
    }
  };

  const handleNext = () => {
    if (step === "primary") {
      setStep("secondary");
    } else {
      onConfirm(selectedPrimary, selectedSecondaries);
    }
  };

  const handleBack = () => {
    setStep("primary");
  };

  const canProceed = step === "primary" ? selectedPrimary : true;

  const renderTask = (task: TaskNode, depth: number = 0) => {
    const children = tasks.filter((t) => t.parentId === task.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(task.id);
    const isSelected = step === "primary" ? task.id === selectedPrimary : selectedSecondaries.includes(task.id);
    const isSuggested = step === "secondary" && suggestedSecondaryIds.includes(task.id) && !isSelected;
    const isDisabled = step === "secondary" && task.id === selectedPrimary;

    return (
      <div key={task.id} style={{ marginLeft: depth * 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            marginBottom: 4,
            backgroundColor: isSelected ? "#e3f2fd" : isDisabled ? "#f5f5f5" : "white",
            borderRadius: 6,
            border: isSelected ? "2px solid #2196f3" : "1px solid #e0e0e0",
            cursor: isDisabled ? "not-allowed" : "pointer",
            opacity: isDisabled ? 0.5 : 1,
          }}
          onClick={() => {
            if (isDisabled) return;
            if (step === "primary") {
              handlePrimarySelect(task.id);
            } else {
              handleSecondaryToggle(task.id);
            }
          }}
        >
          {/* Expand/Collapse Arrow */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(task.id);
              }}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 14,
                padding: 0,
                width: 20,
              }}
            >
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (
            <span style={{ width: 20, display: "inline-block" }}></span>
          )}

          {/* Selection Indicator */}
          {step === "primary" ? (
            <input
              type="radio"
              checked={isSelected}
              onChange={() => handlePrimarySelect(task.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ cursor: "pointer" }}
            />
          ) : (
            <input
              type="checkbox"
              checked={isSelected}
              disabled={isDisabled}
              onChange={() => handleSecondaryToggle(task.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ cursor: isDisabled ? "not-allowed" : "pointer" }}
            />
          )}

          {/* Task Title */}
          <span
            style={{
              flex: 1,
              fontWeight: isSelected ? 600 : task.parentId === null ? 500 : 400,
            }}
          >
            {task.title}
            {isSuggested && (
              <span style={{ fontSize: 11, marginLeft: 6, color: "#ff9800", fontWeight: 400 }}>
                (suggested)
              </span>
            )}
            {isDisabled && (
              <span style={{ fontSize: 11, marginLeft: 6, color: "#999", fontWeight: 400 }}>
                (primary)
              </span>
            )}
          </span>

          {/* Status Indicator */}
          {task.status !== "NONE" && (
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: task.status === "GREEN" ? "#4caf50" : "#ff9800",
                border: "2px solid white",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
              }}
              title={task.status}
            />
          )}
        </div>

        {/* Render Children */}
        {hasChildren && isExpanded && (
          <div style={{ marginTop: 2 }}>
            {children.map((child) => renderTask(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const topLevelTasks = tasks.filter((t) => t.parentId === null);
  const selectedPrimaryTask = selectedPrimary ? tasks.find((t) => t.id === selectedPrimary) : undefined;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          padding: 24,
          maxWidth: 600,
          width: "100%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, marginBottom: 8 }}>
            {step === "primary" ? "Step 1: Select Primary Task" : "Step 2: Select Secondary Tasks"}
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
            {step === "primary"
              ? "Choose your main focus for today"
              : "Choose supporting tasks (optional, you can select multiple)"}
          </p>
        </div>

        {/* Progress Indicator */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#2196f3",
            }}
          />
          <div
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: step === "secondary" ? "#2196f3" : "#e0e0e0",
            }}
          />
        </div>

        {/* Task List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            marginBottom: 16,
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: 12,
          }}
        >
          {topLevelTasks.length === 0 ? (
            <p style={{ opacity: 0.6, fontStyle: "italic", textAlign: "center", padding: 24 }}>
              No tasks available. Go to Month Setup to create tasks.
            </p>
          ) : (
            topLevelTasks.map((task) => renderTask(task, 0))
          )}
        </div>

        {/* Selection Summary */}
        {step === "secondary" && selectedPrimaryTask && (
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: "#f5f5f5", borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#666" }}>
              Primary task:
            </div>
            <div style={{ fontWeight: 600 }}>{selectedPrimaryTask.title}</div>
            {selectedSecondaries.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#666" }}>
                  Secondary tasks ({selectedSecondaries.length}):
                </div>
                <div style={{ fontSize: 14 }}>
                  {selectedSecondaries
                    .map((id) => tasks.find((t) => t.id === id)?.title)
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          {step === "secondary" && (
            <button
              onClick={handleBack}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #ddd",
                backgroundColor: "white",
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
          )}
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #ddd",
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              backgroundColor: canProceed ? "#2196f3" : "#ccc",
              color: "white",
              cursor: canProceed ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            {step === "primary" ? "Next →" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
