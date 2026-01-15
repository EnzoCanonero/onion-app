import { useMemo, useState } from "react";
import type { YM, Category, MilestoneNode } from "../app/types";
import {
  loadState,
  saveState,
  createGrandPlan,
  createGrandPlanWithExamples,
  updateGrandPlan,
  deleteGrandPlan,
  addCategory,
  updateCategory,
  deleteCategory,
  addMilestone,
  updateMilestone,
  deleteMilestone,
  getCurrentYM,
} from "../app/storage";
import MilestoneTreeView from "../components/MilestoneTreeView";
import MilestoneDetailModal from "../components/MilestoneDetailModal";

const DEFAULT_COLORS = ["#4caf50", "#2196f3", "#ff9800", "#e91e63", "#9c27b0", "#00bcd4"];

export default function GrandPlanPage() {
  const [tick, setTick] = useState(0);
  const state = useMemo(() => loadState(), [tick]);
  const grandPlan = state.grandPlan;

  // UI state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneNode | null>(null);

  // Create form state
  const [newTitle, setNewTitle] = useState("My Grand Plan");
  const [newStartMonth, setNewStartMonth] = useState<string>(getCurrentYM());
  const [newEndMonth, setNewEndMonth] = useState<string>("");
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_COLORS[0]);

  const mutate = (fn: (s: typeof state) => typeof state) => {
    const next = fn(state);
    saveState(next);
    setTick((x) => x + 1);
  };

  const handleCreateGrandPlan = () => {
    mutate((s) => createGrandPlan(s, newTitle, newStartMonth as YM, newEndMonth ? (newEndMonth as YM) : undefined));
    setShowCreateModal(false);
  };

  const handleCreateWithExamples = () => {
    mutate((s) => createGrandPlanWithExamples(s, newTitle, newStartMonth as YM, newEndMonth ? (newEndMonth as YM) : undefined));
    setShowCreateModal(false);
  };

  const handleUpdateGrandPlan = () => {
    mutate((s) => updateGrandPlan(s, {
      title: newTitle,
      startMonth: newStartMonth as YM,
      endMonth: newEndMonth ? (newEndMonth as YM) : undefined,
    }));
    setShowEditModal(false);
  };

  const handleDeleteGrandPlan = () => {
    mutate((s) => deleteGrandPlan(s));
    setShowDeleteConfirm(false);
  };

  const handleAddCategory = () => {
    if (!newCategoryTitle.trim()) return;
    mutate((s) => addCategory(s, newCategoryTitle.trim(), newCategoryColor));
    setNewCategoryTitle("");
    setNewCategoryColor(DEFAULT_COLORS[(grandPlan?.categories.length ?? 0) % DEFAULT_COLORS.length]);
    setShowAddCategory(false);
  };

  const handleUpdateCategory = () => {
    if (!editingCategory || !newCategoryTitle.trim()) return;
    mutate((s) => updateCategory(s, editingCategory.id, {
      title: newCategoryTitle.trim(),
      color: newCategoryColor,
    }));
    setEditingCategory(null);
    setNewCategoryTitle("");
  };

  const handleDeleteCategory = (categoryId: string) => {
    if (!confirm("Delete this category and all its milestones?")) return;
    mutate((s) => deleteCategory(s, categoryId));
    if (selectedCategoryId === categoryId) {
      setSelectedCategoryId(null);
    }
  };

  const handleAddMilestone = (parentId: string | null) => {
    if (!selectedCategoryId) return;
    const title = prompt("Milestone title:");
    if (!title?.trim()) return;
    mutate((s) => addMilestone(s, selectedCategoryId, title.trim(), parentId));
  };

  const handleSaveMilestone = (milestoneId: string, updates: Partial<Pick<MilestoneNode, "title" | "description" | "status">>) => {
    mutate((s) => updateMilestone(s, milestoneId, updates));
  };

  const handleDeleteMilestone = (milestoneId: string) => {
    mutate((s) => deleteMilestone(s, milestoneId, true));
    setSelectedMilestone(null);
  };

  // Select first category by default
  const sortedCategories = grandPlan?.categories.slice().sort((a, b) => a.order - b.order) ?? [];
  const activeCategory = selectedCategoryId
    ? sortedCategories.find((c) => c.id === selectedCategoryId)
    : sortedCategories[0];

  if (activeCategory && !selectedCategoryId) {
    setSelectedCategoryId(activeCategory.id);
  }

  // No Grand Plan - show create prompt
  if (!grandPlan) {
    return (
      <div>
        <h2>Grand Plan</h2>
        <p style={{ opacity: 0.7, marginBottom: 24 }}>
          Create a long-term plan to track your goals across multiple months.
        </p>

        <div
          style={{
            padding: 32,
            border: "2px dashed #ddd",
            borderRadius: 12,
            textAlign: "center",
            backgroundColor: "#fafafa",
          }}
        >
          <p style={{ fontSize: 18, marginBottom: 16 }}>No Grand Plan yet</p>
          <p style={{ color: "#666", marginBottom: 24 }}>
            A Grand Plan helps you organize long-term goals into categories and milestones.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: "12px 32px",
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: "#4caf50",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            + Create Grand Plan
          </button>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
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
            onClick={() => setShowCreateModal(false)}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: 12,
                padding: 24,
                maxWidth: 450,
                width: "90%",
                boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginTop: 0, marginBottom: 20 }}>Create Your Grand Plan</h3>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
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

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Start Month</label>
                <input
                  type="month"
                  value={newStartMonth}
                  onChange={(e) => setNewStartMonth(e.target.value)}
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

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>
                  End Month <span style={{ fontWeight: 400, color: "#666" }}>(optional)</span>
                </label>
                <input
                  type="month"
                  value={newEndMonth}
                  onChange={(e) => setNewEndMonth(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 10,
                    fontSize: 14,
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    boxSizing: "border-box",
                  }}
                />
                <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  Leave empty for an open-ended plan
                </p>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  onClick={() => setShowCreateModal(false)}
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
                  onClick={handleCreateWithExamples}
                  disabled={!newTitle.trim() || !newStartMonth}
                  style={{
                    padding: "8px 16px",
                    fontSize: 14,
                    fontWeight: 600,
                    backgroundColor: newTitle.trim() && newStartMonth ? "#ff9800" : "#ddd",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: newTitle.trim() && newStartMonth ? "pointer" : "not-allowed",
                  }}
                >
                  Create with Examples
                </button>
                <button
                  onClick={handleCreateGrandPlan}
                  disabled={!newTitle.trim() || !newStartMonth}
                  style={{
                    padding: "8px 16px",
                    fontSize: 14,
                    fontWeight: 600,
                    backgroundColor: newTitle.trim() && newStartMonth ? "#4caf50" : "#ddd",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: newTitle.trim() && newStartMonth ? "pointer" : "not-allowed",
                  }}
                >
                  Create Empty
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Grand Plan exists - show full UI
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>{grandPlan.title}</h2>
            <p style={{ margin: "8px 0 0", opacity: 0.7 }}>
              {grandPlan.startMonth} - {grandPlan.endMonth ?? "Ongoing"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                setNewTitle(grandPlan.title);
                setNewStartMonth(grandPlan.startMonth);
                setNewEndMonth(grandPlan.endMonth ?? "");
                setShowEditModal(true);
              }}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: "#2196f3",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Edit Settings
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                padding: "6px 12px",
                fontSize: 13,
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

      {/* Category Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 24,
          flexWrap: "wrap",
          alignItems: "center",
          borderBottom: "2px solid #eee",
          paddingBottom: 12,
        }}
      >
        {sortedCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategoryId(cat.id)}
            onDoubleClick={() => {
              setEditingCategory(cat);
              setNewCategoryTitle(cat.title);
              setNewCategoryColor(cat.color);
            }}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              backgroundColor: selectedCategoryId === cat.id ? cat.color : "white",
              color: selectedCategoryId === cat.id ? "white" : cat.color,
              border: `2px solid ${cat.color}`,
              borderRadius: 20,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {cat.title}
          </button>
        ))}
        <button
          onClick={() => setShowAddCategory(true)}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 600,
            backgroundColor: "white",
            color: "#666",
            border: "2px dashed #ccc",
            borderRadius: 20,
            cursor: "pointer",
          }}
        >
          + Add Category
        </button>
      </div>

      {/* Category Content */}
      {activeCategory ? (
        <div
          style={{
            border: `2px solid ${activeCategory.color}`,
            borderRadius: 12,
            padding: 20,
            backgroundColor: `${activeCategory.color}10`,
            minHeight: 300,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: activeCategory.color }}>{activeCategory.title}</h3>
            <button
              onClick={() => handleDeleteCategory(activeCategory.id)}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                backgroundColor: "#f44336",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Delete Category
            </button>
          </div>

          <MilestoneTreeView
            milestones={grandPlan.milestones.filter((m) => m.categoryId === activeCategory.id)}
            categoryColor={activeCategory.color}
            onAddMilestone={handleAddMilestone}
            onSelectMilestone={setSelectedMilestone}
          />
        </div>
      ) : (
        <div
          style={{
            padding: 48,
            textAlign: "center",
            border: "2px dashed #ddd",
            borderRadius: 12,
            color: "#666",
          }}
        >
          <p>Add a category to start building your milestone tree</p>
        </div>
      )}

      {/* Edit Grand Plan Modal */}
      {showEditModal && (
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
          onClick={() => setShowEditModal(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 450,
              width: "90%",
              boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>Edit Grand Plan</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
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

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Start Month</label>
              <input
                type="month"
                value={newStartMonth}
                onChange={(e) => setNewStartMonth(e.target.value)}
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

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>
                End Month <span style={{ fontWeight: 400, color: "#666" }}>(optional)</span>
              </label>
              <input
                type="month"
                value={newEndMonth}
                onChange={(e) => setNewEndMonth(e.target.value)}
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

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowEditModal(false)}
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
                onClick={handleUpdateGrandPlan}
                style={{
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  backgroundColor: "#2196f3",
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
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
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
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#f44336" }}>Delete Grand Plan?</h3>
            <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
              This will permanently delete your Grand Plan, all categories, milestones, and their details.
              This action cannot be undone.
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
                onClick={handleDeleteGrandPlan}
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
                Delete Grand Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategory && (
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
          onClick={() => setShowAddCategory(false)}
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
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>Add Category</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Name</label>
              <input
                type="text"
                value={newCategoryTitle}
                onChange={(e) => setNewCategoryTitle(e.target.value)}
                placeholder="e.g., Work, Health, Personal Growth"
                style={{
                  width: "100%",
                  padding: 10,
                  fontSize: 14,
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Color</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewCategoryColor(color)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      backgroundColor: color,
                      border: newCategoryColor === color ? "3px solid #333" : "3px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowAddCategory(false)}
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
                onClick={handleAddCategory}
                disabled={!newCategoryTitle.trim()}
                style={{
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  backgroundColor: newCategoryTitle.trim() ? newCategoryColor : "#ddd",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: newCategoryTitle.trim() ? "pointer" : "not-allowed",
                }}
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
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
          onClick={() => setEditingCategory(null)}
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
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>Edit Category</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Name</label>
              <input
                type="text"
                value={newCategoryTitle}
                onChange={(e) => setNewCategoryTitle(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  fontSize: 14,
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Color</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewCategoryColor(color)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      backgroundColor: color,
                      border: newCategoryColor === color ? "3px solid #333" : "3px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setEditingCategory(null)}
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
                onClick={handleUpdateCategory}
                disabled={!newCategoryTitle.trim()}
                style={{
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  backgroundColor: newCategoryTitle.trim() ? newCategoryColor : "#ddd",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: newCategoryTitle.trim() ? "pointer" : "not-allowed",
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Milestone Detail Modal */}
      {selectedMilestone && (
        <MilestoneDetailModal
          milestone={selectedMilestone}
          onClose={() => setSelectedMilestone(null)}
          onSave={handleSaveMilestone}
          onDelete={handleDeleteMilestone}
        />
      )}
    </div>
  );
}
