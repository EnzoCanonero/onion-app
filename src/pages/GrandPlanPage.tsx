import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DateISO, YM, Category, MilestoneNode } from "../app/types";
import { APP_MAIN_COLOR, REPORT_THEME } from "../app/theme";
import {
  BadgePanel,
  DonutChart,
  ReportCard,
  ReportLegend,
  StackedHistogram,
  type BadgeItem,
  type DonutSlice,
  type StackedDatum,
} from "../components/ReportCharts";
import { formatDateLabel, getCategoryMeta, listMonthsInRange, UNKNOWN_CATEGORY, UNCATEGORIZED_CATEGORY } from "../app/reporting";
import { dayOfWeekFromDateISO, isTemplateScheduledForWeekday } from "../app/weekdays";
import {
  loadState,
  saveState,
  createGrandPlan,
  createGrandPlanWithExamples,
  updateGrandPlan,
  closeGrandPlan,
  reopenGrandPlan,
  deleteGrandPlan,
  addCategory,
  updateCategory,
  deleteCategory,
  addMilestone,
  updateMilestone,
  deleteMilestone,
  getTodayDate,
  getCurrentYM,
} from "../app/storage";
import MilestoneTreeView from "../components/MilestoneTreeView";
import MilestoneDetailModal from "../components/MilestoneDetailModal";
import TitleDescriptionModal from "../components/TitleDescriptionModal";

const DEFAULT_COLORS = ["#4caf50", "#2196f3", "#ff9800", "#e91e63", APP_MAIN_COLOR, "#00bcd4"];
const SELECTED_CATEGORY_STORAGE_KEY = "focustree:grand-plan:selected-category";

function dateISOToDate(date: DateISO): Date | null {
  const parts = date.split("-").map((x) => Number(x));
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year) return null;
  if (d.getMonth() + 1 !== month) return null;
  if (d.getDate() !== day) return null;
  return d;
}

function dateToISO(date: Date): DateISO {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` as DateISO;
}

function listDatesInRangeInclusive(start: DateISO, end: DateISO): DateISO[] {
  if (end < start) return [];
  const startDate = dateISOToDate(start);
  const endDate = dateISOToDate(end);
  if (!startDate || !endDate) return [];

  const out: DateISO[] = [];
  const cursor = new Date(startDate);
  const safetyMax = 5000;
  while (cursor <= endDate && out.length < safetyMax) {
    out.push(dateToISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function weekStartMonday(date: DateISO): DateISO | null {
  const d = dateISOToDate(date);
  if (!d) return null;
  const dow = d.getDay(); // 0=Sun
  const diff = (dow + 6) % 7; // days since Monday
  const start = new Date(d);
  start.setDate(start.getDate() - diff);
  return dateToISO(start);
}

function listWeekStartsInRange(start: DateISO, end: DateISO): DateISO[] {
  const startWeek = weekStartMonday(start);
  const endWeek = weekStartMonday(end);
  if (!startWeek || !endWeek) return [];
  const startDate = dateISOToDate(startWeek);
  const endDate = dateISOToDate(endWeek);
  if (!startDate || !endDate) return [];

  const out: DateISO[] = [];
  const cursor = new Date(startDate);
  const safetyMax = 2000;
  while (cursor <= endDate && out.length < safetyMax) {
    out.push(dateToISO(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

export default function GrandPlanPage() {
  const [tick, setTick] = useState(0);
  const state = useMemo(() => loadState(), [tick]);
  const grandPlan = state.grandPlan;
  const location = useLocation();
  const navigate = useNavigate();

  // UI state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(() => {
    try {
      const stored = window.localStorage.getItem(SELECTED_CATEGORY_STORAGE_KEY);
      return stored && stored.trim() ? stored : null;
    } catch {
      return null;
    }
  });
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneNode | null>(null);
  const [creatingMilestone, setCreatingMilestone] = useState<{ categoryId: string; parentId: string | null } | null>(null);

  useEffect(() => {
    try {
      if (selectedCategoryId) {
        window.localStorage.setItem(SELECTED_CATEGORY_STORAGE_KEY, selectedCategoryId);
      } else {
        window.localStorage.removeItem(SELECTED_CATEGORY_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [selectedCategoryId]);

  useEffect(() => {
    if (grandPlan) return;
    const params = new URLSearchParams(location.search);
    if (params.get("create") !== "1") return;
    setShowCreateModal(true);
    params.delete("create");
    const nextSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" },
      { replace: true }
    );
  }, [grandPlan, location.pathname, location.search, navigate]);

  // Create form state
  const [newTitle, setNewTitle] = useState("My Grand Plan");
  const [newStartMonth, setNewStartMonth] = useState<string>(getCurrentYM());
  const [newEndMonth, setNewEndMonth] = useState<string>("");
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_COLORS[0]);

  const mutate = (fn: (s: typeof state) => typeof state) => {
    const current = loadState();
    const next = fn(current);
    saveState(next);
    setTick((x) => x + 1);
  };

  const handleCreateGrandPlan = () => {
    mutate((s) =>
      createGrandPlan(deleteGrandPlan(s), newTitle, newStartMonth as YM, newEndMonth ? (newEndMonth as YM) : undefined)
    );
    setShowCreateModal(false);
  };

  const handleCreateWithExamples = () => {
    mutate((s) =>
      createGrandPlanWithExamples(
        deleteGrandPlan(s),
        newTitle,
        newStartMonth as YM,
        newEndMonth ? (newEndMonth as YM) : undefined
      )
    );
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
    setSelectedCategoryId(null);
    try {
      window.localStorage.removeItem(SELECTED_CATEGORY_STORAGE_KEY);
    } catch {
      // ignore
    }
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
    setCreatingMilestone({ categoryId: selectedCategoryId, parentId });
  };

  const handleSaveMilestone = (milestoneId: string, updates: Partial<Pick<MilestoneNode, "title" | "description" | "status">>) => {
    mutate((s) => updateMilestone(s, milestoneId, updates));
  };

  const handleDeleteMilestone = (milestoneId: string) => {
    mutate((s) => deleteMilestone(s, milestoneId, true));
    setSelectedMilestone(null);
  };

  const handleCloseGrandPlan = () => {
    mutate((s) => closeGrandPlan(s));
    setShowCloseConfirm(false);
  };

  const handleReopenGrandPlan = () => {
    mutate((s) => reopenGrandPlan(s));
  };

  // Select first category by default
  const sortedCategories = grandPlan?.categories.slice().sort((a, b) => a.order - b.order) ?? [];
  const activeCategory =
    sortedCategories.find((c) => c.id === selectedCategoryId) ?? sortedCategories[0];

  useEffect(() => {
    if (!grandPlan) return;

    if (sortedCategories.length === 0) {
      if (selectedCategoryId !== null) setSelectedCategoryId(null);
      return;
    }

    const firstId = sortedCategories[0]?.id;
    if (!firstId) return;

    if (!selectedCategoryId || !sortedCategories.some((c) => c.id === selectedCategoryId)) {
      setSelectedCategoryId(firstId);
    }
  }, [grandPlan, sortedCategories, selectedCategoryId]);

  const createModal = showCreateModal ? (
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
          <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Leave empty for an open-ended plan</p>
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
  ) : null;

  // No Grand Plan - show create prompt
  if (!grandPlan) {
    return (
      <div>
        <div style={{ marginBottom: 24, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", gap: 12 }}>
            <div />
            <div style={{ textAlign: "center" }}>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#111", letterSpacing: 0.2 }}>
                Grand Plan
              </h2>
              <div
                style={{
                  margin: "10px auto 0",
                  width: 56,
                  height: 4,
                  borderRadius: 999,
                  backgroundColor: APP_MAIN_COLOR,
                  opacity: 0.9,
                }}
              />
              <p style={{ margin: "8px 0 0", color: "#666", fontSize: 13 }}>
                Create a long-term plan to track your goals across multiple months.
              </p>
            </div>
            <div />
          </div>
        </div>

        <div
          style={{
            padding: 48,
            border: "2px dashed #ddd",
            borderRadius: 12,
            textAlign: "center",
            backgroundColor: "#fafafa",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
          <p style={{ fontSize: 18, marginBottom: 12 }}>No Grand Plan yet</p>
          <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
            A Grand Plan helps you organize long-term goals into categories and milestones.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: "12px 24px",
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: "#4caf50",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            }}
          >
            🎯 Create Grand Plan
          </button>
        </div>

        {createModal}
      </div>
    );
  }

  if (grandPlan.isClosed) {
    const today = getTodayDate();
    const closedDate = grandPlan.closedAt?.slice(0, 10);
    const canStartNew = closedDate ? today > closedDate : false;
    const actualEndMonth = (grandPlan.endMonth ?? grandPlan.closedAt?.slice(0, 7) ?? getCurrentYM()) as YM;

    const closedDateISO = (closedDate ? (closedDate as DateISO) : undefined);
    const [eyStr, emStr] = actualEndMonth.split("-");
    const ey = Number(eyStr);
    const em = Number(emStr);
    const daysInEndMonth = Number.isFinite(ey) && Number.isFinite(em) ? new Date(ey, em, 0).getDate() : 28;
    const fallbackEndDate = `${actualEndMonth}-${String(daysInEndMonth).padStart(2, "0")}` as DateISO;

    const startDate = `${grandPlan.startMonth}-01` as DateISO;
    const endDate = closedDateISO ?? fallbackEndDate;

    const datesInPlan = listDatesInRangeInclusive(startDate, endDate);
    const weekStartsRaw = listWeekStartsInRange(startDate, endDate);
    const weeks = weekStartsRaw.length > 0 ? weekStartsRaw : ([weekStartMonday(startDate) ?? startDate] as DateISO[]);
    const xLabelEvery = weeks.length > 40 ? 4 : weeks.length > 24 ? 3 : 2;

    const monthsInPlan = listMonthsInRange(grandPlan.startMonth, actualEndMonth);
    const months = monthsInPlan.length > 0 ? monthsInPlan : ([grandPlan.startMonth] as YM[]);

    const tasksInPlan = months.flatMap((ym) => state.months[ym]?.tasks ?? []);
    const tasksTotalCount = tasksInPlan.length;
    const tasksCompletedCount = tasksInPlan.filter((t) => t.status === "GREEN").length;
    const tasksCompletionRate = tasksTotalCount > 0 ? Math.round((tasksCompletedCount / tasksTotalCount) * 100) : 0;

    const categoryMetas = [
      ...grandPlan.categories
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ id: c.id, title: c.title, color: c.color })),
      UNCATEGORIZED_CATEGORY,
      UNKNOWN_CATEGORY,
    ];

    const categoryById = new Map(grandPlan.categories.map((c) => [c.id, c]));
    const planBadges = grandPlan.milestones
      .filter((m) => m.status === "COMPLETED")
      .map((m) => {
        const completedAt = m.completedAt ?? m.createdAt;
        const dateISO = completedAt.slice(0, 10);
        const category = categoryById.get(m.categoryId);
        const color = category?.color ?? UNKNOWN_CATEGORY.color;
        const categoryLabel = category?.title ?? UNKNOWN_CATEGORY.title;
        return {
          dateISO,
          badge: {
            id: m.id,
            title: m.title,
            dateLabel: formatDateLabel(dateISO as DateISO),
            categoryLabel,
            color,
            isGoal: m.parentId === null,
          } satisfies BadgeItem,
        };
      })
      .filter((b) => b.dateISO >= startDate && b.dateISO <= endDate)
      .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1))
      .map((b) => b.badge);

    const taskMilestoneById = new Map<string, string | null | undefined>();
    const templateMilestoneById = new Map<string, string | null | undefined>();
    Object.values(state.months).forEach((mp) => {
      mp.tasks.forEach((t) => {
        if (!taskMilestoneById.has(t.id)) taskMilestoneById.set(t.id, t.linkedMilestoneId);
      });
      mp.templates.forEach((t) => {
        if (!templateMilestoneById.has(t.id)) templateMilestoneById.set(t.id, t.linkedMilestoneId);
      });
    });

    const taskCountsByWeekStart = new Map<DateISO, Map<string, number>>();
    weeks.forEach((w) => taskCountsByWeekStart.set(w, new Map()));

    datesInPlan.forEach((date) => {
      const weekStart = weekStartMonday(date);
      if (!weekStart) return;
      const day = state.days[date];
      if (!day) return;

      const ids = [day.primaryTaskId, ...(day.secondaryTaskIds ?? [])].filter(
        (x): x is string => typeof x === "string" && x.length > 0
      );
      ids.forEach((taskId) => {
        if (day.outcomeByTaskId?.[taskId] !== "COMPLETED") return;
        const known = taskMilestoneById.has(taskId);
        const milestoneId = known ? taskMilestoneById.get(taskId) : undefined;
        const cat = known ? getCategoryMeta(grandPlan, milestoneId) : UNKNOWN_CATEGORY;
        const counts = taskCountsByWeekStart.get(weekStart);
        if (!counts) return;
        counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
      });
    });

    const completedTasksByWeek: StackedDatum[] = weeks.map((weekStart, idx) => {
      const counts = taskCountsByWeekStart.get(weekStart) ?? new Map<string, number>();
      const segments = categoryMetas
        .map((c) => ({ key: c.id, label: c.title, value: counts.get(c.id) ?? 0, color: c.color }))
        .filter((s) => s.value > 0);
      const total = segments.reduce((a, b) => a + b.value, 0);
      return { key: weekStart, label: `W${idx + 1}`, total, segments };
    });

    const completedTaskTotalsByCategoryId = new Map<string, number>();
    completedTasksByWeek.forEach((d) => {
      d.segments.forEach((s) => {
        completedTaskTotalsByCategoryId.set(s.key, (completedTaskTotalsByCategoryId.get(s.key) ?? 0) + s.value);
      });
    });

    const completedTaskSlices: DonutSlice[] = categoryMetas.map((c) => ({
      key: c.id,
      label: c.title,
      value: completedTaskTotalsByCategoryId.get(c.id) ?? 0,
      color: c.color,
    }));

    const plannedFocusSessionsCount = datesInPlan.reduce((acc, date) => {
      const ym = date.slice(0, 7) as YM;
      const mp = state.months[ym];
      if (!mp) return acc;
      const weekday = dayOfWeekFromDateISO(date);
      const activeTemplates = mp.templates.filter((t) => !t.isSuspended);
      return acc + activeTemplates.filter((t) => isTemplateScheduledForWeekday(t.daysOfWeek, weekday)).length;
    }, 0);

    const completedSessionsInPlan = state.sessions.filter(
      (s) => s.endedAt && typeof s.actualMinutes === "number" && s.date >= startDate && s.date <= endDate
    );
    const completedFocusSessionsCount = completedSessionsInPlan.length;
    const focusCompletionDenom = Math.max(plannedFocusSessionsCount, completedFocusSessionsCount);
    const focusCompletionRate = focusCompletionDenom > 0 ? Math.round((completedFocusSessionsCount / focusCompletionDenom) * 100) : 0;

    const focusHoursByWeekStart = new Map<DateISO, Map<string, number>>();
    weeks.forEach((w) => focusHoursByWeekStart.set(w, new Map()));

    completedSessionsInPlan.forEach((s) => {
      const weekStart = weekStartMonday(s.date);
      if (!weekStart) return;
      const minutes = typeof s.actualMinutes === "number" ? Math.max(0, s.actualMinutes) : 0;
      if (minutes <= 0) return;

      const day = state.days[s.date];
      const dayMilestoneId = day?.focusMilestoneByTemplateId?.[s.templateId];
      const knownTemplate = templateMilestoneById.has(s.templateId);
      const fallbackMilestoneId = knownTemplate ? templateMilestoneById.get(s.templateId) : undefined;
      const milestoneId = dayMilestoneId ?? fallbackMilestoneId ?? undefined;
      const cat = knownTemplate || dayMilestoneId ? getCategoryMeta(grandPlan, milestoneId) : UNKNOWN_CATEGORY;

      const hoursByCat = focusHoursByWeekStart.get(weekStart);
      if (!hoursByCat) return;
      hoursByCat.set(cat.id, (hoursByCat.get(cat.id) ?? 0) + minutes / 60);
    });

    const focusHoursByWeek: StackedDatum[] = weeks.map((weekStart, idx) => {
      const hoursByCat = focusHoursByWeekStart.get(weekStart) ?? new Map<string, number>();
      const segments = categoryMetas
        .map((c) => ({ key: c.id, label: c.title, value: hoursByCat.get(c.id) ?? 0, color: c.color }))
        .filter((s) => s.value > 0);
      const total = segments.reduce((a, b) => a + b.value, 0);
      return { key: weekStart, label: `W${idx + 1}`, total, segments };
    });

    const focusHoursTotalsByCategoryId = new Map<string, number>();
    focusHoursByWeek.forEach((d) => {
      d.segments.forEach((s) => {
        focusHoursTotalsByCategoryId.set(s.key, (focusHoursTotalsByCategoryId.get(s.key) ?? 0) + s.value);
      });
    });

    const focusSlices: DonutSlice[] = categoryMetas.map((c) => ({
      key: c.id,
      label: c.title,
      value: Number((focusHoursTotalsByCategoryId.get(c.id) ?? 0).toFixed(1)),
      color: c.color,
    }));

    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: REPORT_THEME.pageBg,
          padding: "32px 24px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 1020, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: REPORT_THEME.textPrimary, letterSpacing: 0.2 }}>
              Grand Plan Report
            </div>
            <div style={{ marginTop: 6, fontSize: 15, color: REPORT_THEME.textSecondary, fontWeight: 800 }}>
              {grandPlan.title}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: REPORT_THEME.textMuted }}>
              {grandPlan.startMonth} – {actualEndMonth}
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <BadgePanel badges={planBadges} />
            <ReportCard title="Task Completion">
              <div style={{ display: "flex", gap: 18, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 320px", minWidth: 260, maxWidth: 520 }}>
                  <ReportLegend slices={completedTaskSlices} valueFormatter={(n) => `${n}`} maxItems={10} layout="table" />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: "0 0 auto" }}>
                  <div style={{ marginRight: 72 }}>
                    <DonutChart
                      slices={[
                        { key: "done", label: "Completed", value: tasksCompletedCount, color: APP_MAIN_COLOR },
                        {
                          key: "rest",
                          label: "Remaining",
                          value: Math.max(0, tasksTotalCount - tasksCompletedCount),
                          color: REPORT_THEME.borderLight,
                        },
                      ]}
                      size={150}
                      thickness={18}
                      centerMain={`${tasksCompletionRate}%`}
                    />
                  </div>
                  <DonutChart slices={completedTaskSlices} size={150} thickness={18} />
                </div>
              </div>
            </ReportCard>

            <ReportCard title="Tasks Completed Over Time">
              <StackedHistogram
                data={completedTasksByWeek}
                height={190}
                barWidth={12}
                gap={6}
                xLabelEvery={xLabelEvery}
                formatTotal={(n) => `${n}`}
                fill
                minMaxTotal={40}
              />
            </ReportCard>

            <ReportCard title="Focus Sessions">
              <div style={{ display: "flex", gap: 18, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 320px", minWidth: 260, maxWidth: 520 }}>
                  <ReportLegend slices={focusSlices} valueFormatter={(n) => `${n.toFixed(1)}h`} maxItems={10} layout="table" />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: "0 0 auto" }}>
                  <div style={{ marginRight: 72 }}>
                    <DonutChart
                      slices={[
                        { key: "done", label: "Completed", value: completedFocusSessionsCount, color: APP_MAIN_COLOR },
                        {
                          key: "rest",
                          label: "Remaining",
                          value: Math.max(0, plannedFocusSessionsCount - completedFocusSessionsCount),
                          color: REPORT_THEME.borderLight,
                        },
                      ]}
                      size={150}
                      thickness={18}
                      centerMain={`${focusCompletionRate}%`}
                    />
                  </div>
                  <DonutChart slices={focusSlices} size={150} thickness={18} />
                </div>
              </div>
            </ReportCard>

            <ReportCard title="Focus Hours Over Time">
              <StackedHistogram
                data={focusHoursByWeek}
                height={190}
                barWidth={12}
                gap={6}
                xLabelEvery={xLabelEvery}
                formatTotal={(n) => `${n.toFixed(1)}h`}
                fill
                minMaxTotal={40}
              />
            </ReportCard>

            <div style={{ textAlign: "center", marginTop: 28, paddingTop: 18, borderTop: `1px solid ${REPORT_THEME.borderLight}` }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
                <button
                  onClick={handleReopenGrandPlan}
                  style={{
                    padding: "12px 22px",
                    fontSize: 14,
                    fontWeight: 800,
                    backgroundColor: "white",
                    color: REPORT_THEME.textPrimary,
                    border: `1px solid ${REPORT_THEME.borderLight}`,
                    borderRadius: 12,
                    cursor: "pointer",
                    boxShadow: REPORT_THEME.cardShadow,
                  }}
                >
                  Reopen for Editing
                </button>
                {canStartNew ? (
                  <button
                    onClick={() => {
                      setNewTitle("My Grand Plan");
                      setNewStartMonth(getCurrentYM());
                      setNewEndMonth("");
                      setShowCreateModal(true);
                    }}
                    style={{
                      padding: "12px 22px",
                      fontSize: 14,
                      fontWeight: 900,
                      backgroundColor: APP_MAIN_COLOR,
                      color: "white",
                      border: "none",
                      borderRadius: 12,
                      cursor: "pointer",
                      boxShadow: "0 12px 26px rgba(0,0,0,0.14)",
                    }}
                  >
                    Start New Grand Plan
                  </button>
                ) : (
                  <div style={{ fontSize: 13, color: REPORT_THEME.textMuted, alignSelf: "center" }}>
                    A new Grand Plan can be started tomorrow.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {createModal}
      </div>
    );
  }

  // Grand Plan exists - show full UI
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", gap: 12 }}>
          <div />
          <div style={{ textAlign: "center" }}>
            <h2
              style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#111", letterSpacing: 0.2, cursor: "pointer" }}
              title="Click to edit Grand Plan"
              role="button"
              tabIndex={0}
              onClick={() => {
                setNewTitle(grandPlan.title);
                setNewStartMonth(grandPlan.startMonth);
                setNewEndMonth(grandPlan.endMonth ?? "");
                setShowEditModal(true);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                setNewTitle(grandPlan.title);
                setNewStartMonth(grandPlan.startMonth);
                setNewEndMonth(grandPlan.endMonth ?? "");
                setShowEditModal(true);
              }}
            >
              {grandPlan.title}
            </h2>
            <div
              style={{
                margin: "10px auto 0",
                width: 56,
                height: 4,
                borderRadius: 999,
                backgroundColor: APP_MAIN_COLOR,
                opacity: 0.9,
              }}
            />
            <p style={{ margin: "8px 0 0", color: "#666", fontSize: 13 }}>
              {grandPlan.startMonth} - {grandPlan.endMonth ?? "Ongoing"}
            </p>
          </div>
          <div />
        </div>
      </div>

      {/* Category Tabs */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          alignItems: "center",
          borderBottom: "2px solid #eee",
          paddingBottom: 12,
        }}
      >
        <div style={{ flex: "1 1 auto", minWidth: 0, overflowX: "auto", overflowY: "hidden", paddingBottom: 2 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap", width: "max-content" }}>
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
                  flex: "0 0 auto",
                }}
              >
                {cat.title}
              </button>
            ))}
          </div>
        </div>
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
            flex: "0 0 auto",
          }}
        >
          + Add Category
        </button>
      </div>

	      {/* Category Content */}
	      {activeCategory ? (
	        <div
	          style={{
	            border: "2px solid #eee",
	            borderRadius: 12,
	            padding: 20,
	            backgroundColor: "#fbfaf7",
	            backgroundImage:
	              "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)",
	            backgroundSize: "24px 24px",
	            minHeight: 300,
	          }}
	        >
	          <div
	            style={{
	              display: "flex",
	              justifyContent: "space-between",
	              alignItems: "center",
	              marginBottom: 16,
	              gap: 12,
	              flexWrap: "wrap",
	            }}
	          >
		            <button
		              onClick={() => handleAddMilestone(null)}
		              style={{
		                padding: "8px 16px",
		                fontSize: 13,
		                fontWeight: 600,
		                backgroundColor: "white",
		                color: activeCategory.color,
		                border: `2px solid ${activeCategory.color}`,
		                borderRadius: 20,
		                cursor: "pointer",
		              }}
		            >
		              + Add another goal
		            </button>
	            <div
	              style={{
	                display: "flex",
	                gap: 16,
	                justifyContent: "center",
	                fontSize: 12,
	                color: "#666",
	                alignItems: "center",
	                flex: "1 1 auto",
	                whiteSpace: "nowrap",
	              }}
	            >
	              <span>
	                <span style={{ color: "#9e9e9e", fontWeight: 700 }}>○</span> Not Started
	              </span>
	              <span>
	                <span style={{ color: "#ff9800", fontWeight: 700 }}>◐</span> In Progress
	              </span>
	              <span>
	                <span style={{ color: "#4caf50", fontWeight: 700 }}>✓</span> Completed
	              </span>
	            </div>
		            <button
		              onClick={() => handleDeleteCategory(activeCategory.id)}
		              style={{
		                padding: "8px 16px",
		                fontSize: 13,
		                fontWeight: 600,
		                backgroundColor: "white",
		                color: "#f44336",
		                border: "2px solid #f44336",
		                borderRadius: 20,
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

      {/* v11: Close Grand Plan Button */}
      <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: "2px solid #ddd" }}>
        <button
          onClick={() => setShowCloseConfirm(true)}
          style={{
            padding: "16px 32px",
            fontSize: 16,
            fontWeight: 600,
            backgroundColor: APP_MAIN_COLOR,
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          }}
        >
          🔒 Close Grand Plan
        </button>
        <p style={{ marginTop: 8, fontSize: 14, color: "#666" }}>Mark this Grand Plan as complete and view the report</p>
      </div>

      {/* Close Grand Plan Confirmation Modal */}
      {showCloseConfirm && (
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
          onClick={() => setShowCloseConfirm(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 420,
              width: "90%",
              boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>🔒 Close Grand Plan</h3>
            <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
              This will close your Grand Plan and convert it into a read-only report view.
              It will also close the current month (if it exists) and today (ending any active focus session).
              You can reopen the Grand Plan later if you need to make changes.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowCloseConfirm(false)}
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
                onClick={handleCloseGrandPlan}
                style={{
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  backgroundColor: APP_MAIN_COLOR,
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                ✓ Close Grand Plan
              </button>
            </div>
          </div>
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

            <div style={{ marginBottom: 24, paddingTop: 16, borderTop: "1px solid #eee" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f44336", marginBottom: 8 }}>Danger zone</div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setShowDeleteConfirm(true);
                }}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  backgroundColor: "white",
                  color: "#f44336",
                  border: "2px solid #f44336",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                🗑 Delete Grand Plan
              </button>
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

      {/* Create Milestone Modal */}
      {creatingMilestone && (
        <TitleDescriptionModal
          title={creatingMilestone.parentId ? "Add Step" : "Add Goal"}
          subtitle={
            creatingMilestone.parentId
              ? `Create a step under “${grandPlan?.milestones.find((m) => m.id === creatingMilestone.parentId)?.title ?? "Milestone"}”.`
              : `Create a new goal inside “${activeCategory?.title ?? "Category"}”.`
          }
          accentColor={activeCategory?.color ?? APP_MAIN_COLOR}
          titlePlaceholder={creatingMilestone.parentId ? "Step title..." : "Goal title..."}
          descriptionPlaceholder="Add a description (optional)..."
          confirmLabel={creatingMilestone.parentId ? "Add Step" : "Add Goal"}
          onCancel={() => setCreatingMilestone(null)}
          onConfirm={(title, description) => {
            const nextDescription = description.trim() || undefined;
            mutate((s) => addMilestone(s, creatingMilestone.categoryId, title.trim(), creatingMilestone.parentId, nextDescription));
            setCreatingMilestone(null);
          }}
        />
      )}
    </div>
  );
}
