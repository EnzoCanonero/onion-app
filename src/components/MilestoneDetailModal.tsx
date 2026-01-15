import { useState } from "react";
import type { MilestoneNode, MilestoneStatus } from "../app/types";

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

        {/* Info about tasks */}
        <div style={{ marginBottom: 24, padding: 12, backgroundColor: "#f5f5f5", borderRadius: 6 }}>
          <p style={{ fontSize: 13, color: "#666", margin: 0, lineHeight: 1.5 }}>
            Tasks for this milestone can be managed in the Month Setup page. Link this milestone to a month to add tasks that contribute to this goal.
          </p>
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
