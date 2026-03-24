import { useState } from "react";
import type { MilestoneNode, MilestoneStatus, TaskNode } from "../app/types";

interface MilestoneDetailModalProps {
  milestone: MilestoneNode;
  linkedTasks: TaskNode[];
  frozenTaskIds: Set<string>;
  onClose: () => void;
  onSave: (milestoneId: string, updates: Partial<Pick<MilestoneNode, "title" | "description" | "status">>) => void;
  onDelete: (milestoneId: string) => void;
  onSetTaskStatus: (taskId: string, outcome: "COMPLETED" | "NOT_COMPLETED") => void;
  onDeleteTask: (taskId: string) => void;
}

export default function MilestoneDetailModal({
  milestone,
  linkedTasks,
  frozenTaskIds,
  onClose,
  onSave,
  onDelete,
  onSetTaskStatus,
  onDeleteTask,
}: MilestoneDetailModalProps) {
  const [title, setTitle] = useState(milestone.title);
  const [description, setDescription] = useState(milestone.description ?? "");
  const [status, setStatus] = useState<MilestoneStatus>(milestone.status);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const totalLinkedTasks = linkedTasks.length;

  const getTaskStatusIcon = (task: TaskNode) => {
    switch (task.status) {
      case "GREEN":
        return "✓";
      case "YELLOW":
        return "◐";
      case "NONE":
      default:
        return "○";
    }
  };

  const getTaskStatusColor = (task: TaskNode) => {
    switch (task.status) {
      case "GREEN":
        return "#4caf50";
      case "YELLOW":
        return "#ff9800";
      case "NONE":
      default:
        return "#9e9e9e";
    }
  };

  const handleSave = () => {
    onSave(milestone.id, {
      title: title.trim() || milestone.title,
      description: description.trim() || undefined,
      status,
    });
    onClose();
  };

  const handleDelete = () => {
    onDelete(milestone.id);
    onClose();
  };

  const handleSetLinkedTaskStatus = (
    taskId: string,
    outcome: "COMPLETED" | "NOT_COMPLETED"
  ) => {
    onSetTaskStatus(taskId, outcome);
    if (status === "NOT_STARTED") {
      setStatus("IN_PROGRESS");
    }
  };

  const handleDeleteLinkedTask = (task: TaskNode) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    onDeleteTask(task.id);
  };

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          padding: 24,
          maxWidth: 550,
          width: "90%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Milestone Details</h3>
          <button
            onClick={onClose}
            style={{
              padding: "4px 8px",
              fontSize: 18,
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#666",
            }}
          >
            ✕
          </button>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 6,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Status */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as MilestoneStatus)}
            style={{
              width: "100%",
              padding: 10,
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 6,
              boxSizing: "border-box",
            }}
          >
            <option value="NOT_STARTED">Not Started</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Notes</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes about this milestone..."
            rows={12}
            style={{
              width: "100%",
              padding: 12,
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 6,
              boxSizing: "border-box",
              resize: "vertical",
              lineHeight: 1.6,
              minHeight: 300,
            }}
          />
        </div>

        {/* Linked tasks */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 8 }}>
            Linked Tasks
          </div>

          {linkedTasks.length === 0 ? (
            <div style={{ padding: 12, backgroundColor: "#f5f5f5", borderRadius: 6 }}>
              <p style={{ fontSize: 13, color: "#666", margin: 0, lineHeight: 1.5 }}>
                This milestone has no tasks yet. Add them from the Month Plan page and they will stay attached to this milestone instead of being split by month.
              </p>
            </div>
          ) : (
            <div style={{ padding: 12, backgroundColor: "#f5f5f5", borderRadius: 6 }}>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 10 }}>
                {totalLinkedTasks} task{totalLinkedTasks === 1 ? "" : "s"} linked to this milestone
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {linkedTasks.map((task) => {
                  const isTaskFrozen = frozenTaskIds.has(task.id);
                  return (
                    <div
                      key={task.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: "10px 12px",
                        backgroundColor: "white",
                        borderRadius: 10,
                        border: "1px solid #e0e0e0",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span
                          style={{
                            width: 20,
                            textAlign: "center",
                            fontWeight: 800,
                            color: getTaskStatusColor(task),
                            flexShrink: 0,
                          }}
                          title={task.status}
                        >
                          {getTaskStatusIcon(task)}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            color: "#333",
                            fontWeight: 600,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {task.title}
                        </span>
                      </div>

                      {!isTaskFrozen ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => handleSetLinkedTaskStatus(task.id, "COMPLETED")}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              border: "1px solid #10b981",
                              backgroundColor: task.status === "GREEN" ? "#10b981" : "#ffffff",
                              color: task.status === "GREEN" ? "#ffffff" : "#10b981",
                              cursor: "pointer",
                              fontSize: 13,
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
                            onClick={() => handleSetLinkedTaskStatus(task.id, "NOT_COMPLETED")}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              border: "1px solid #f59e0b",
                              backgroundColor: task.status === "YELLOW" ? "#f59e0b" : "#ffffff",
                              color: task.status === "YELLOW" ? "#ffffff" : "#f59e0b",
                              cursor: "pointer",
                              fontSize: 13,
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
                            onClick={() => handleDeleteLinkedTask(task)}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              border: "1px solid #fecaca",
                              backgroundColor: "#ffffff",
                              color: "#ef4444",
                              cursor: "pointer",
                              fontSize: 13,
                              fontWeight: 800,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title="Delete task"
                          >
                            ✕
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {task.notes ? (
                      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5, paddingLeft: 28 }}>
                        {task.notes}
                      </div>
                    ) : null}
                    {(task.createdAt || task.completedAt) && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingLeft: 28 }}>
                        {task.createdAt && (
                          <span style={{ fontSize: 11, color: "#666" }}>
                            Created {task.createdAt.slice(0, 10)}
                          </span>
                        )}
                        {task.completedAt && (
                          <span style={{ fontSize: 11, color: "#666" }}>
                            Completed {task.completedAt.slice(0, 10)}
                          </span>
                        )}
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: "1px solid #eee" }}>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: "white",
              color: "#f44336",
              border: "1px solid #f44336",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Delete Milestone
          </button>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={onClose}
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
              onClick={handleSave}
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
              Save Changes
            </button>
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1001,
            }}
            onClick={() => setShowDeleteConfirm(false)}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: 12,
                padding: 24,
                maxWidth: 400,
                width: "90%",
                boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginTop: 0, marginBottom: 16, color: "#f44336" }}>Delete Milestone?</h3>
              <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
                This will delete &quot;{milestone.title}&quot; and all its child milestones. This action cannot be undone.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
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
                  onClick={handleDelete}
                  style={{
                    padding: "8px 16px",
                    fontSize: 14,
                    fontWeight: 600,
                    backgroundColor: "#f44336",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
