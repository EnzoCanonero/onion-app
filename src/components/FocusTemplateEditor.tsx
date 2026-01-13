import { useState } from "react";
import type { FocusTemplate, MonthPlan } from "../app/types";
import { makeId } from "../app/storage";

type FocusTemplateEditorProps = {
  plan: MonthPlan;
  onUpdate: (updatedPlan: MonthPlan) => void;
};

export default function FocusTemplateEditor({ plan, onUpdate }: FocusTemplateEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingStart, setEditingStart] = useState("");
  const [editingEnd, setEditingEnd] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [draggedTemplateId, setDraggedTemplateId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(null);

  const startEdit = (template: FocusTemplate) => {
    setEditingId(template.id);
    setEditingTitle(template.title);
    setEditingStart(template.plannedStart);
    setEditingEnd(template.plannedEnd);
  };

  const saveEdit = () => {
    if (!editingId || !editingTitle.trim() || !editingStart || !editingEnd) return;

    const nextTemplates = plan.templates.map((t) =>
      t.id === editingId
        ? { ...t, title: editingTitle.trim(), plannedStart: editingStart, plannedEnd: editingEnd }
        : t
    );

    onUpdate({ ...plan, templates: nextTemplates });
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
    setEditingStart("");
    setEditingEnd("");
  };

  const handleDelete = (template: FocusTemplate) => {
    if (!confirm(`Delete focus template "${template.title}"?`)) return;

    const nextTemplates = plan.templates.filter((t) => t.id !== template.id);
    onUpdate({ ...plan, templates: nextTemplates });
  };

  const handleAdd = () => {
    if (!newTitle.trim() || !newStart || !newEnd) return;

    const newTemplate: FocusTemplate = {
      id: makeId("tpl"),
      title: newTitle.trim(),
      plannedStart: newStart,
      plannedEnd: newEnd,
    };

    onUpdate({ ...plan, templates: [...plan.templates, newTemplate] });
    setNewTitle("");
    setNewStart("");
    setNewEnd("");
    setShowAddForm(false);
  };

  const handleDragStart = (e: React.DragEvent, templateId: string) => {
    setDraggedTemplateId(templateId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", templateId);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedTemplateId || draggedTemplateId === targetId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

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
    if (!draggedTemplateId || draggedTemplateId === targetId || !dropPosition) return;

    let nextTemplates = [...plan.templates];
    const draggedIndex = nextTemplates.findIndex((t) => t.id === draggedTemplateId);
    const [removed] = nextTemplates.splice(draggedIndex, 1);
    const newTargetIndex = nextTemplates.findIndex((t) => t.id === targetId);
    const insertIndex = dropPosition === "before" ? newTargetIndex : newTargetIndex + 1;
    nextTemplates.splice(insertIndex, 0, removed);

    onUpdate({ ...plan, templates: nextTemplates });
    setDraggedTemplateId(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedTemplateId(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Focus Templates</h3>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              padding: "6px 12px",
              fontSize: 14,
              backgroundColor: "#2196f3",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            + Add Template
          </button>
        )}
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div
          style={{
            border: "2px solid #2196f3",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            backgroundColor: "#f0f8ff",
          }}
        >
          <h4 style={{ marginTop: 0, marginBottom: 12 }}>New Focus Template</h4>
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Template title (e.g., Deep Work A)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{ padding: "6px 10px" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                type="time"
                placeholder="Start time"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                style={{ padding: "6px 10px" }}
              />
              <input
                type="time"
                placeholder="End time"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                style={{ padding: "6px 10px" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewTitle("");
                setNewStart("");
                setNewEnd("");
              }}
              style={{
                padding: "6px 12px",
                backgroundColor: "white",
                border: "1px solid #ddd",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim() || !newStart || !newEnd}
              style={{
                padding: "6px 12px",
                backgroundColor: newTitle.trim() && newStart && newEnd ? "#2196f3" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: newTitle.trim() && newStart && newEnd ? "pointer" : "not-allowed",
                fontWeight: 600,
              }}
            >
              Add Template
            </button>
          </div>
        </div>
      )}

      {/* Templates List */}
      {plan.templates.length === 0 ? (
        <p style={{ opacity: 0.6, fontStyle: "italic" }}>No templates yet. Add one above.</p>
      ) : (
        <div>
          {plan.templates.map((template) => {
            const isDragging = draggedTemplateId === template.id;
            const isDropTarget = dropTargetId === template.id;

            let dropIndicatorStyle = {};
            if (isDropTarget && dropPosition) {
              if (dropPosition === "before") {
                dropIndicatorStyle = { borderTop: "3px solid #2196f3" };
              } else if (dropPosition === "after") {
                dropIndicatorStyle = { borderBottom: "3px solid #2196f3" };
              }
            }

            return (
            <div
              key={template.id}
              draggable={editingId !== template.id}
              onDragStart={(e) => handleDragStart(e, template.id)}
              onDragOver={(e) => handleDragOver(e, template.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, template.id)}
              onDragEnd={handleDragEnd}
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                backgroundColor: editingId === template.id ? "#f0f8ff" : "white",
                opacity: isDragging ? 0.5 : 1,
                cursor: editingId === template.id ? "default" : "grab",
                ...dropIndicatorStyle,
              }}
            >
              {editingId === template.id ? (
                <>
                  <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      style={{ padding: "6px 10px", fontWeight: 600 }}
                      autoFocus
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <input
                        type="time"
                        value={editingStart}
                        onChange={(e) => setEditingStart(e.target.value)}
                        style={{ padding: "6px 10px" }}
                      />
                      <input
                        type="time"
                        value={editingEnd}
                        onChange={(e) => setEditingEnd(e.target.value)}
                        style={{ padding: "6px 10px" }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      onClick={cancelEdit}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        backgroundColor: "white",
                        border: "1px solid #ddd",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        backgroundColor: "#4caf50",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      ✓ Save
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 16,
                        opacity: 0.5,
                        cursor: "grab",
                        userSelect: "none",
                      }}
                      title="Drag to reorder"
                    >
                      ⋮⋮
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{template.title}</div>
                      <div style={{ fontSize: 13, color: "#666" }}>
                        {template.plannedStart} - {template.plannedEnd}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => startEdit(template)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        backgroundColor: "white",
                        border: "1px solid #ddd",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                      title="Edit"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(template)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        backgroundColor: "white",
                        border: "1px solid #ddd",
                        borderRadius: 4,
                        cursor: "pointer",
                        color: "#d9534f",
                      }}
                      title="Delete"
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
        <div>💡 Click Edit to modify template name and time brackets</div>
        <div>💡 Drag templates by the ⋮⋮ handle to reorder</div>
        <div>💡 Drop on top half to insert before, bottom half to insert after</div>
      </div>
    </div>
  );
}
