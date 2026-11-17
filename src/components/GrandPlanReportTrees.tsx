import { useEffect, useMemo, useState } from "react";
import type { DateISO, GrandPlan, MilestoneNode, MilestoneStatus, TaskNode, TaskStatus } from "../app/types";
import { REPORT_THEME, STATUS_DISPLAY } from "../app/theme";
import { formatDateLabel, UNKNOWN_CATEGORY } from "../app/reporting";
import { getMilestoneTreeName } from "../app/milestones";
import { ReportCard } from "./ReportCharts";
import MilestoneTreeView from "./MilestoneTreeView";

type CategoryGroup = {
  id: string;
  title: string;
  color: string;
  milestones: MilestoneNode[];
  completedCount: number;
};

const MILESTONE_STATUS_META: Record<MilestoneStatus, { label: string; glyph: string; color: string }> = {
  NOT_STARTED: { label: "Not Started", glyph: "○", color: "#9e9e9e" },
  IN_PROGRESS: { label: "In Progress", glyph: "◐", color: "#ff9800" },
  COMPLETED: { label: "Completed", glyph: "✓", color: "#4caf50" },
};

const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  GREEN: "#4caf50",
  YELLOW: "#ff9800",
  NONE: "#9e9e9e",
};

function StatusPill({ status }: { status: MilestoneStatus }) {
  const meta = MILESTONE_STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${meta.color}`,
        color: meta.color,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      <span>{meta.glyph}</span>
      {meta.label}
    </span>
  );
}

function TaskRow({ task, subtasks }: { task: TaskNode; subtasks: TaskNode[] }) {
  const notes = task.notes?.trim();
  return (
    <div
      style={{
        padding: "10px 12px",
        backgroundColor: "white",
        borderRadius: 10,
        border: `1px solid ${REPORT_THEME.borderLight}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span
          style={{ width: 20, textAlign: "center", fontWeight: 800, color: TASK_STATUS_COLOR[task.status], flexShrink: 0 }}
          title={STATUS_DISPLAY[task.status].label}
        >
          {STATUS_DISPLAY[task.status].glyph}
        </span>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#333", lineHeight: 1.35, overflowWrap: "anywhere" }}>
            {task.title}
          </div>
          {notes ? (
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: REPORT_THEME.textSecondary,
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {notes}
            </div>
          ) : null}
          {subtasks.length > 0 ? (
            <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
              {subtasks.map((subtask) => (
                <div key={subtask.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "#475569" }}>
                  <span
                    style={{ width: 16, textAlign: "center", fontWeight: 800, color: TASK_STATUS_COLOR[subtask.status], flexShrink: 0 }}
                    title={STATUS_DISPLAY[subtask.status].label}
                  >
                    {STATUS_DISPLAY[subtask.status].glyph}
                  </span>
                  <span style={{ lineHeight: 1.4, overflowWrap: "anywhere" }}>{subtask.title}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FrozenMilestoneModal({
  milestone,
  allMilestones,
  categoryTitle,
  categoryColor,
  tasks,
  onNavigate,
  onClose,
}: {
  milestone: MilestoneNode;
  allMilestones: MilestoneNode[];
  categoryTitle: string;
  categoryColor: string;
  tasks: TaskNode[];
  onNavigate: (milestoneId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const treeName = getMilestoneTreeName(allMilestones, milestone.id);
  const parent = milestone.parentId ? allMilestones.find((m) => m.id === milestone.parentId) : undefined;
  const children = allMilestones
    .filter((m) => m.parentId === milestone.id)
    .sort((a, b) => a.order - b.order);
  const completedLabel =
    milestone.status === "COMPLETED" && milestone.completedAt
      ? formatDateLabel(milestone.completedAt.slice(0, 10) as DateISO)
      : undefined;
  const description = milestone.description?.trim();

  const sortedTasks = [...tasks].sort((a, b) => a.title.localeCompare(b.title));
  const topLevelTasks = sortedTasks.filter((task) => !task.parentId);
  const completedTaskCount = topLevelTasks.filter((task) => task.status === "GREEN").length;

  const sectionLabelStyle = {
    fontSize: 11,
    fontWeight: 800,
    color: REPORT_THEME.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  } as const;

  const linkButtonStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 700,
    color: "#333",
    backgroundColor: "white",
    border: `1px solid ${REPORT_THEME.borderLight}`,
    borderRadius: 8,
    cursor: "pointer",
    textAlign: "left",
  } as const;

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
        role="dialog"
        aria-modal="true"
        aria-label={milestone.title}
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          borderTop: `4px solid ${categoryColor}`,
          padding: 24,
          maxWidth: 550,
          width: "90%",
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: REPORT_THEME.textSecondary, marginBottom: 6 }}>
              <span style={{ color: categoryColor }}>●</span> {categoryTitle}
              {treeName ? ` · ${treeName}` : ""}
              {milestone.parentId === null ? " · Goal" : ""}
            </div>
            <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.3, overflowWrap: "anywhere" }}>{milestone.title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: "4px 8px",
              fontSize: 18,
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#666",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "12px 0 20px" }}>
          <StatusPill status={milestone.status} />
          {completedLabel ? (
            <span style={{ fontSize: 12, color: REPORT_THEME.textSecondary }}>on {completedLabel}</span>
          ) : null}
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={sectionLabelStyle}>Notes</div>
          {description ? (
            <div
              style={{
                padding: 12,
                fontSize: 14,
                lineHeight: 1.6,
                color: "#333",
                backgroundColor: REPORT_THEME.pageBg,
                border: `1px solid ${REPORT_THEME.borderLight}`,
                borderRadius: 8,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {description}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No notes</div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={sectionLabelStyle}>
            Tasks
            {topLevelTasks.length > 0 ? ` · ${completedTaskCount} of ${topLevelTasks.length} completed` : ""}
          </div>
          {topLevelTasks.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {topLevelTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  subtasks={sortedTasks.filter((candidate) => candidate.parentId === task.id)}
                />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No tasks were linked</div>
          )}
        </div>

        {parent || children.length > 0 ? (
          <div style={{ marginBottom: 20 }}>
            {parent ? (
              <div style={{ marginBottom: children.length > 0 ? 14 : 0 }}>
                <div style={sectionLabelStyle}>Leads to</div>
                <button onClick={() => onNavigate(parent.id)} style={linkButtonStyle}>
                  <span style={{ color: MILESTONE_STATUS_META[parent.status].color, fontWeight: 800 }}>
                    {MILESTONE_STATUS_META[parent.status].glyph}
                  </span>
                  {parent.title}
                </button>
              </div>
            ) : null}
            {children.length > 0 ? (
              <div>
                <div style={sectionLabelStyle}>Sub-milestones</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {children.map((child) => (
                    <button key={child.id} onClick={() => onNavigate(child.id)} style={linkButtonStyle}>
                      <span style={{ color: MILESTONE_STATUS_META[child.status].color, fontWeight: 800 }}>
                        {MILESTONE_STATUS_META[child.status].glyph}
                      </span>
                      {child.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid #eee" }}>
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Read-only explorer for the milestone trees of a closed Grand Plan.
 * Shows every tree (completed or not) as it stood at closing; milestones open
 * a details view but nothing can be edited from here.
 */
export default function GrandPlanReportTrees({
  grandPlan,
  getTasksForMilestone,
}: {
  grandPlan: GrandPlan;
  getTasksForMilestone: (milestoneId: string) => TaskNode[];
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);

  const groups = useMemo<CategoryGroup[]>(() => {
    const toGroup = (id: string, title: string, color: string, milestones: MilestoneNode[]): CategoryGroup => ({
      id,
      title,
      color,
      milestones,
      completedCount: milestones.filter((m) => m.status === "COMPLETED").length,
    });
    const categoryIds = new Set(grandPlan.categories.map((c) => c.id));
    const result = grandPlan.categories
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((c) => toGroup(c.id, c.title, c.color, grandPlan.milestones.filter((m) => m.categoryId === c.id)));
    // Milestones whose category no longer exists still belong in the report.
    const orphans = grandPlan.milestones.filter((m) => !categoryIds.has(m.categoryId));
    if (orphans.length > 0) {
      result.push(toGroup(UNKNOWN_CATEGORY.id, UNKNOWN_CATEGORY.title, UNKNOWN_CATEGORY.color, orphans));
    }
    return result;
  }, [grandPlan]);

  const activeGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0];

  const goals = grandPlan.milestones.filter((m) => m.parentId === null);
  const goalsReached = goals.filter((m) => m.status === "COMPLETED").length;
  const milestonesCompleted = grandPlan.milestones.filter((m) => m.status === "COMPLETED").length;

  const selectedMilestone = selectedMilestoneId
    ? grandPlan.milestones.find((m) => m.id === selectedMilestoneId)
    : undefined;
  const selectedGroup = selectedMilestone
    ? groups.find((g) => g.milestones.some((m) => m.id === selectedMilestone.id))
    : undefined;

  const summary =
    grandPlan.milestones.length > 0 ? (
      <div style={{ fontSize: 12, color: REPORT_THEME.textSecondary, fontWeight: 700, textAlign: "right" }}>
        {goalsReached} of {goals.length} goal{goals.length === 1 ? "" : "s"} reached · {milestonesCompleted} of{" "}
        {grandPlan.milestones.length} milestone{grandPlan.milestones.length === 1 ? "" : "s"} completed
      </div>
    ) : undefined;

  return (
    <ReportCard
      title="Milestone Trees"
      subtitle="Frozen as they stood when the plan was closed. Click a milestone to see its notes and tasks."
      right={summary}
    >
      {!activeGroup ? (
        <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>
          This plan had no categories or milestones
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto", paddingBottom: 2, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", width: "max-content" }}>
              {groups.map((group) => {
                const isActive = group.id === activeGroup.id;
                return (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    aria-pressed={isActive}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 700,
                      backgroundColor: isActive ? group.color : "white",
                      color: isActive ? "white" : group.color,
                      border: `2px solid ${group.color}`,
                      borderRadius: 20,
                      cursor: "pointer",
                      flex: "0 0 auto",
                    }}
                  >
                    {group.title}
                    <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.85 }}>
                      {group.completedCount}/{group.milestones.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${REPORT_THEME.borderLight}`,
              borderRadius: 12,
              backgroundColor: "#fbfaf7",
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)",
              backgroundSize: "24px 24px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 16,
                justifyContent: "center",
                flexWrap: "wrap",
                fontSize: 12,
                color: "#666",
                padding: "12px 12px 0",
              }}
            >
              {(Object.keys(MILESTONE_STATUS_META) as MilestoneStatus[]).map((status) => (
                <span key={status}>
                  <span style={{ color: MILESTONE_STATUS_META[status].color, fontWeight: 700 }}>
                    {MILESTONE_STATUS_META[status].glyph}
                  </span>{" "}
                  {MILESTONE_STATUS_META[status].label}
                </span>
              ))}
            </div>
            <MilestoneTreeView
              milestones={activeGroup.milestones}
              categoryColor={activeGroup.color}
              onAddMilestone={() => {}}
              onSelectMilestone={(milestone) => setSelectedMilestoneId(milestone.id)}
              readOnly
            />
          </div>
        </>
      )}

      {selectedMilestone ? (
        <FrozenMilestoneModal
          milestone={selectedMilestone}
          allMilestones={grandPlan.milestones}
          categoryTitle={selectedGroup?.title ?? UNKNOWN_CATEGORY.title}
          categoryColor={selectedGroup?.color ?? UNKNOWN_CATEGORY.color}
          tasks={getTasksForMilestone(selectedMilestone.id)}
          onNavigate={setSelectedMilestoneId}
          onClose={() => setSelectedMilestoneId(null)}
        />
      ) : null}
    </ReportCard>
  );
}
