import { useMemo, useState } from "react";
import type { MilestoneNode, MilestoneStatus, TaskNode } from "../app/types";
import { loadState } from "../app/storage";

interface MilestoneDetailModalProps {
  milestone: MilestoneNode;
  onClose: () => void;
  onSave: (milestoneId: string, updates: Partial<Pick<MilestoneNode, "title" | "description" | "status">>) => void;
  onDelete: (milestoneId: string) => void;
}

export default function MilestoneDetailModal({
  milestone,
  onClose,
  onSave,
  onDelete,
}: MilestoneDetailModalProps) {
  const [title, setTitle] = useState(milestone.title);
  const [description, setDescription] = useState(milestone.description ?? "");
  const [status, setStatus] = useState<MilestoneStatus>(milestone.status);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const linkedTasksByMonth = useMemo(() => {
    const state = loadState();
    const months = Object.values(state.months ?? {});
    return months
      .map((plan) => ({
        ym: plan.ym,
        tasks: plan.tasks.filter((t) => t.linkedMilestoneId === milestone.id),
      }))
      .filter((x) => x.tasks.length > 0)
      .sort((a, b) => a.ym.localeCompare(b.ym));
  }, [milestone.id]);

  const totalLinkedTasks = useMemo(
    () => linkedTasksByMonth.reduce((sum, x) => sum + x.tasks.length, 0),
    [linkedTasksByMonth]
  );

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

        {/* Description */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes about this milestone..."
            rows={3}
            style={{
              width: "100%",
              padding: 10,
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 6,
              boxSizing: "border-box",
              resize: "vertical",
            }}
          />
        </div>

        {/* Linked tasks */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 8 }}>
            Linked Tasks
          </div>

          {linkedTasksByMonth.length === 0 ? (
            <div style={{ padding: 12, backgroundColor: "#f5f5f5", borderRadius: 6 }}>
              <p style={{ fontSize: 13, color: "#666", margin: 0, lineHeight: 1.5 }}>
                Tasks for this milestone are managed in the Month Setup page. Link this milestone to a month to add tasks that contribute to this goal.
              </p>
            </div>
          ) : (
            <div style={{ padding: 12, backgroundColor: "#f5f5f5", borderRadius: 6 }}>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 10 }}>
                {totalLinkedTasks} task{totalLinkedTasks === 1 ? "" : "s"} across {linkedTasksByMonth.length} month{linkedTasksByMonth.length === 1 ? "" : "s"} (managed in Month Setup)
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {linkedTasksByMonth.map((bucket) => (
                  <div key={bucket.ym}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 6 }}>
                      {bucket.ym}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {bucket.tasks.map((task) => (
                        <div
                          key={task.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 8px",
                            backgroundColor: "white",
                            borderRadius: 6,
                            border: "1px solid #e0e0e0",
                          }}
                        >
                          <span
                            style={{
                              width: 20,
                              textAlign: "center",
                              fontWeight: 800,
                              color: getTaskStatusColor(task),
                            }}
                            title={task.status}
                          >
                            {getTaskStatusIcon(task)}
                          </span>
                          <span style={{ fontSize: 13, color: "#333" }}>{task.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
