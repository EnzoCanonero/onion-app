import { useEffect, useState } from "react";
import type { TaskNode } from "../app/types";

type PrimaryTaskSwitchModalProps = {
  tasks: TaskNode[];
  currentPrimaryTitle: string;
  onConfirm: (primaryId: string) => void;
  onCancel: () => void;
};

export default function PrimaryTaskSwitchModal({
  tasks,
  currentPrimaryTitle,
  onConfirm,
  onCancel,
}: PrimaryTaskSwitchModalProps) {
  const [selectedTaskId, setSelectedTaskId] = useState("");

  useEffect(() => {
    setSelectedTaskId("");
  }, [tasks, currentPrimaryTitle]);

  useEffect(() => {
    const availableIds = new Set(tasks.map((task) => task.id));
    if (!selectedTaskId || !availableIds.has(selectedTaskId)) {
      setSelectedTaskId("");
    }
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const canConfirm = Boolean(selectedTaskId);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2500,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          backgroundColor: "white",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#111" }}>Change primary task</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "#666", lineHeight: 1.4 }}>
              Current: {currentPrimaryTitle}
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              padding: "4px 8px",
              fontSize: 14,
              fontWeight: 900,
              backgroundColor: "white",
              border: "1px solid #ddd",
              borderRadius: 8,
              cursor: "pointer",
              color: "#666",
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          {tasks.length === 0 ? (
            <div
              style={{
                padding: 12,
                border: "1px solid #eee",
                borderRadius: 10,
                backgroundColor: "#fafafa",
                color: "#666",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              No secondary tasks available to switch with.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 6,
                maxHeight: "40vh",
                overflowY: "auto",
              }}
            >
              {tasks.map((task) => {
                const isSelected = selectedTaskId === task.id;
                return (
                  <label
                    key={task.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${isSelected ? "#9ca3af" : "#e5e7eb"}`,
                      backgroundColor: "white",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="daily-primary-switch"
                      checked={isSelected}
                      onChange={() => setSelectedTaskId(task.id)}
                      style={{ cursor: "pointer" }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: isSelected ? 800 : 700,
                          color: "#111827",
                          lineHeight: 1.35,
                        }}
                      >
                        {task.title}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 700,
              backgroundColor: "white",
              border: "1px solid #ddd",
              borderRadius: 8,
              cursor: "pointer",
              color: "#555",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!canConfirm || !selectedTaskId) return;
              onConfirm(selectedTaskId);
            }}
            disabled={!canConfirm}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 900,
              backgroundColor: canConfirm ? "#111827" : "#e5e7eb",
              color: canConfirm ? "white" : "#9ca3af",
              border: "none",
              borderRadius: 8,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Switch
          </button>
        </div>
      </div>
    </div>
  );
}
