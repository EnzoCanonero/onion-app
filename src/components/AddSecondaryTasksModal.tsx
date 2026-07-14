import { useEffect, useState } from "react";
import type { GrandPlan, TaskNode } from "../app/types";
import { compareTaskGroupMeta, getTaskGroupMeta } from "../app/reporting";

type AddSecondaryTasksModalProps = {
  tasks: TaskNode[];
  grandPlan?: GrandPlan;
  currentPrimaryTitle: string;
  onConfirm: (taskIds: string[]) => void;
  onCancel: () => void;
};

export default function AddSecondaryTasksModal({
  tasks,
  grandPlan,
  currentPrimaryTitle,
  onConfirm,
  onCancel,
}: AddSecondaryTasksModalProps) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedTaskIds([]);
  }, [tasks, currentPrimaryTitle]);

  useEffect(() => {
    const availableIds = new Set(tasks.map((task) => task.id));
    setSelectedTaskIds((prev) => prev.filter((id) => availableIds.has(id)));
  }, [tasks]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const canConfirm = selectedTaskIds.length > 0;

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
  };

  const groupedTasks = tasks
    .map((task, index) => ({
      task,
      index,
      meta: getTaskGroupMeta(grandPlan, task),
    }))
    .sort((a, b) => {
      const groupCompare = compareTaskGroupMeta(a.meta, b.meta);
      if (groupCompare !== 0) return groupCompare;
      return a.index - b.index;
    });

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
            <div style={{ fontSize: 16, fontWeight: 900, color: "#111" }}>Add secondary tasks</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "#666", lineHeight: 1.4 }}>
              Primary: {currentPrimaryTitle}
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
              No additional tasks available to add.
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
              {groupedTasks.map((item, index) => {
                const previous = groupedTasks[index - 1];
                const showGroupHeader = index === 0 || previous.meta.groupKey !== item.meta.groupKey;
                const task = item.task;
                const isSelected = selectedTaskIds.includes(task.id);
                const isWip = task.status === "YELLOW";
                const backgroundColor = isWip
                  ? isSelected
                    ? "#fff1c2"
                    : "#fff7d6"
                  : "white";
                const borderColor = isWip
                  ? "#fde68a"
                  : isSelected
                    ? "#9ca3af"
                    : "#e5e7eb";
                return (
                  <div key={task.id}>
                    {showGroupHeader ? (
                      <div
                        style={{
                          borderTop: index === 0 ? "none" : "1px solid #eef2f7",
                          marginTop: index === 0 ? 0 : 8,
                          paddingTop: index === 0 ? 0 : 10,
                        }}
                      >
                        <div
                          style={{
                            padding: "2px 10px 8px",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor: item.meta.categoryColor,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: "#94a3b8",
                              lineHeight: 1.2,
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                            }}
                          >
                            {item.meta.categoryTitle}
                          </span>
                          {!item.meta.isStandalone ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#334155", lineHeight: 1.2 }}>
                              {item.meta.milestoneTitle}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <label
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1px solid ${borderColor}`,
                        backgroundColor,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTask(task.id)}
                        style={{ cursor: "pointer" }}
                      />
                      <div
                        style={{
                          minWidth: 0,
                          fontSize: 14,
                          fontWeight: isSelected ? 800 : 700,
                          color: "#111827",
                          lineHeight: 1.35,
                        }}
                      >
                        {task.title}
                      </div>
                    </label>
                  </div>
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
              if (!canConfirm) return;
              onConfirm(selectedTaskIds);
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
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
