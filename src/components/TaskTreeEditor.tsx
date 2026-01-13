import { useState } from "react";
import type { TaskNode, MonthPlan } from "../app/types";
import { makeId, countDescendants } from "../app/storage";

type TaskTreeEditorProps = {
  plan: MonthPlan;
  onUpdate: (updatedPlan: MonthPlan) => void;
};

export default function TaskTreeEditor({ plan, onUpdate }: TaskTreeEditorProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "child" | null>(null);

  const toggleExpand = (taskId: string) => {
    const next = new Set(expandedIds);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    setExpandedIds(next);
  };

  const startEdit = (task: TaskNode) => {
    setEditingId(task.id);
    setEditingTitle(task.title);
  };

  const saveEdit = (taskId: string) => {
    if (!editingTitle.trim()) {
      setEditingId(null);
      return;
    }

    const nextPlan: MonthPlan = {
      ...plan,
      tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, title: editingTitle.trim() } : t)),
    };
    onUpdate(nextPlan);
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleDelete = (task: TaskNode) => {
    const childCount = countDescendants(plan.tasks, task.id);
    const message =
      childCount > 0
        ? `Delete '${task.title}' and ${childCount} ${childCount === 1 ? "child" : "children"}?`
        : `Delete '${task.title}'?`;

    if (!confirm(message)) return;

    let nextTasks = plan.tasks.filter((t) => t.id !== task.id);

    // Remove descendants (cascade delete)
    const toDelete = new Set([task.id]);
    const findChildren = (parentId: string) => {
      plan.tasks.forEach((t) => {
        if (t.parentId === parentId && !toDelete.has(t.id)) {
          toDelete.add(t.id);
          findChildren(t.id);
        }
      });
    };
    findChildren(task.id);

    nextTasks = plan.tasks.filter((t) => !toDelete.has(t.id));
    const nextSnapshot = plan.initialSnapshotTaskIds.filter((id) => !toDelete.has(id));

    onUpdate({ ...plan, tasks: nextTasks, initialSnapshotTaskIds: nextSnapshot });
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetId) return;

    const draggedTask = plan.tasks.find((t) => t.id === draggedTaskId);
    const targetTask = plan.tasks.find((t) => t.id === targetId);

    // Only allow reordering within same parent (same level)
    if (!draggedTask || !targetTask || draggedTask.parentId !== targetTask.parentId) {
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    // Only allow before/after positioning (no child positioning)
    if (y < height * 0.5) {
      setDropPosition("before");
    } else {
      setDropPosition("after");
    }

    setDropTargetId(targetId);
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetId || !dropPosition) return;

    const draggedTask = plan.tasks.find((t) => t.id === draggedTaskId);
    const targetTask = plan.tasks.find((t) => t.id === targetId);

    // Only allow reordering within same parent
    if (!draggedTask || !targetTask || draggedTask.parentId !== targetTask.parentId) return;

    let nextTasks = [...plan.tasks];

    // Reorder within siblings
    const draggedIndex = nextTasks.findIndex((t) => t.id === draggedTaskId);
    const [removed] = nextTasks.splice(draggedIndex, 1);
    const newTargetIndex = nextTasks.findIndex((t) => t.id === targetId);
    const insertIndex = dropPosition === "before" ? newTargetIndex : newTargetIndex + 1;
    nextTasks.splice(insertIndex, 0, removed);

    onUpdate({ ...plan, tasks: nextTasks });
    setDraggedTaskId(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  const handleAddChild = (parentId: string) => {
    const title = prompt("Enter task title:");
    if (!title?.trim()) return;

    const newTask: TaskNode = {
      id: makeId("task"),
      title: title.trim(),
      parentId,
      status: "NONE",
    };

    onUpdate({ ...plan, tasks: [...plan.tasks, newTask] });

    // Auto-expand parent
    setExpandedIds(new Set(expandedIds).add(parentId));
  };

  const handleAddTopLevel = () => {
    if (!newTaskTitle.trim()) return;

    const newTask: TaskNode = {
      id: makeId("task"),
      title: newTaskTitle.trim(),
      parentId: null,
      status: "NONE",
    };

    onUpdate({ ...plan, tasks: [...plan.tasks, newTask] });
    setNewTaskTitle("");
  };

  const renderTask = (task: TaskNode, depth: number = 0) => {
    const children = plan.tasks.filter((t) => t.parentId === task.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(task.id);
    const isEditing = editingId === task.id;
    const isDragging = draggedTaskId === task.id;
    const isDropTarget = dropTargetId === task.id;

    // Visual feedback for drop position (only before/after within same level)
    let dropIndicatorStyle = {};
    if (isDropTarget && dropPosition) {
      if (dropPosition === "before") {
        dropIndicatorStyle = { borderTop: "3px solid #2196f3" };
      } else if (dropPosition === "after") {
        dropIndicatorStyle = { borderBottom: "3px solid #2196f3" };
      }
    }

    return (
      <div key={task.id} style={{ marginLeft: depth * 24 }}>
        <div
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, task.id)}
          onDragOver={(e) => handleDragOver(e, task.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, task.id)}
          onDragEnd={handleDragEnd}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            border: "1px solid #e0e0e0",
            borderRadius: 4,
            marginBottom: 4,
            backgroundColor: isEditing ? "#f0f8ff" : "white",
            opacity: isDragging ? 0.5 : 1,
            cursor: isEditing ? "text" : "grab",
            ...dropIndicatorStyle,
          }}
        >
          {/* Expand/Collapse Arrow */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(task.id)}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 16,
                padding: 0,
                width: 20,
              }}
            >
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (
            <span style={{ width: 20, display: "inline-block" }}></span>
          )}

          {/* Task Title or Edit Input */}
          {isEditing ? (
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit(task.id);
                if (e.key === "Escape") cancelEdit();
              }}
              style={{ flex: 1, padding: 4 }}
              autoFocus
            />
          ) : (
            <span
              onClick={() => startEdit(task)}
              style={{
                flex: 1,
                cursor: "pointer",
                fontWeight: task.parentId === null ? 600 : 400,
              }}
              title="Click to edit"
            >
              {task.title}
            </span>
          )}

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

          {/* Action Buttons */}
          {isEditing ? (
            <>
              <button onClick={() => saveEdit(task.id)} style={{ fontSize: 12 }}>
                ✓
              </button>
              <button onClick={cancelEdit} style={{ fontSize: 12 }}>
                ✕
              </button>
            </>
          ) : (
            <>
              <button onClick={() => handleAddChild(task.id)} style={{ fontSize: 12 }} title="Add child">
                +
              </button>
              <button onClick={() => handleDelete(task)} style={{ fontSize: 12, color: "#d9534f" }} title="Delete">
                🗑
              </button>
              <span
                style={{
                  fontSize: 11,
                  opacity: 0.5,
                  fontStyle: "italic",
                  cursor: "grab",
                  userSelect: "none",
                }}
                title="Drag to reorder"
              >
                ⋮⋮
              </span>
            </>
          )}
        </div>

        {/* Render Children */}
        {hasChildren && isExpanded && (
          <div style={{ marginTop: 4 }}>
            {children.map((child) => renderTask(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const topLevelTasks = plan.tasks.filter((t) => t.parentId === null);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ marginBottom: 8 }}>Task Tree</h4>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="New top-level task..."
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTopLevel()}
            style={{ flex: 1, padding: "6px 10px" }}
          />
          <button onClick={handleAddTopLevel} disabled={!newTaskTitle.trim()}>
            Add Task
          </button>
        </div>
      </div>

      {topLevelTasks.length === 0 ? (
        <p style={{ opacity: 0.6, fontStyle: "italic" }}>No tasks yet. Add one above.</p>
      ) : (
        <div>{topLevelTasks.map((task) => renderTask(task, 0))}</div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
        <div>💡 Click task title to rename</div>
        <div>💡 Drag tasks to reorder within the same level</div>
        <div>💡 Drop on top half to insert before, bottom half to insert after</div>
        <div>💡 Use + to add child tasks</div>
        <div>💡 Deleting a parent deletes all its children</div>
      </div>
    </div>
  );
}
