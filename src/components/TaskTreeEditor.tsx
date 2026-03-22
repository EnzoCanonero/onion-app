import { useState } from "react";
import type { TaskNode } from "../app/types";
import { countDescendants, makeId } from "../app/storage";

type TaskTreeEditorProps = {
  tasks: TaskNode[];
  onUpdate: (tasks: TaskNode[]) => void;
};

export default function TaskTreeEditor({ tasks, onUpdate }: TaskTreeEditorProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const toggleExpand = (taskId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const saveEdit = (taskId: string) => {
    const nextTitle = editingTitle.trim();
    if (!nextTitle) {
      setEditingId(null);
      setEditingTitle("");
      return;
    }
    onUpdate(tasks.map((task) => (task.id === taskId ? { ...task, title: nextTitle } : task)));
    setEditingId(null);
    setEditingTitle("");
  };

  const handleDelete = (task: TaskNode) => {
    const childCount = countDescendants(tasks, task.id);
    const message =
      childCount > 0
        ? `Delete '${task.title}' and ${childCount} ${childCount === 1 ? "child" : "children"}?`
        : `Delete '${task.title}'?`;

    if (!confirm(message)) return;

    const toDelete = new Set([task.id]);
    const findChildren = (parentId: string) => {
      tasks.forEach((candidate) => {
        if (candidate.parentId === parentId && !toDelete.has(candidate.id)) {
          toDelete.add(candidate.id);
          findChildren(candidate.id);
        }
      });
    };
    findChildren(task.id);
    onUpdate(tasks.filter((candidate) => !toDelete.has(candidate.id)));
  };

  const handleAddChild = (parentId: string) => {
    const title = prompt("Enter task title:");
    if (!title?.trim()) return;
    onUpdate([
      ...tasks,
      {
        id: makeId("task"),
        title: title.trim(),
        parentId,
        status: "NONE",
      },
    ]);
    setExpandedIds((prev) => new Set(prev).add(parentId));
  };

  const handleAddTopLevel = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    onUpdate([
      ...tasks,
      {
        id: makeId("task"),
        title,
        parentId: null,
        status: "NONE",
      },
    ]);
    setNewTaskTitle("");
  };

  const renderTask = (task: TaskNode, depth: number = 0): JSX.Element => {
    const children = tasks.filter((candidate) => candidate.parentId === task.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(task.id);
    const isEditing = editingId === task.id;

    return (
      <div key={task.id} style={{ marginLeft: depth * 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            border: "1px solid #e0e0e0",
            borderRadius: 4,
            marginBottom: 4,
            backgroundColor: isEditing ? "#f0f8ff" : "white",
          }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(task.id)}
              style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, padding: 0, width: 20 }}
            >
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (
            <span style={{ width: 20, display: "inline-block" }} />
          )}

          {isEditing ? (
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={() => saveEdit(task.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit(task.id);
                if (e.key === "Escape") {
                  setEditingId(null);
                  setEditingTitle("");
                }
              }}
              autoFocus
              style={{ flex: 1, padding: "4px 8px", fontSize: 14 }}
            />
          ) : (
            <span style={{ flex: 1, fontSize: 14 }}>{task.title}</span>
          )}

          {!isEditing && (
            <>
              <button onClick={() => { setEditingId(task.id); setEditingTitle(task.title); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#666" }}>
                Edit
              </button>
              <button onClick={() => handleAddChild(task.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "#2196f3" }}>
                Add Child
              </button>
              <button onClick={() => handleDelete(task)} style={{ border: "none", background: "none", cursor: "pointer", color: "#f44336" }}>
                Delete
              </button>
            </>
          )}
        </div>

        {hasChildren && isExpanded && children.map((child) => renderTask(child, depth + 1))}
      </div>
    );
  };

  const topLevelTasks = tasks.filter((task) => task.parentId === null);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="Add top-level task..."
          style={{ flex: 1, padding: "8px 10px", fontSize: 14 }}
        />
        <button onClick={handleAddTopLevel} style={{ padding: "8px 12px", cursor: "pointer" }}>
          Add
        </button>
      </div>

      {topLevelTasks.length === 0 ? (
        <div style={{ color: "#666", fontSize: 13 }}>No tasks yet.</div>
      ) : (
        topLevelTasks.map((task) => renderTask(task))
      )}
    </div>
  );
}
