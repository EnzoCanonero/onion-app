import type { MilestoneNode, MilestoneStatus } from "../app/types";

interface MilestoneTreeViewProps {
  milestones: MilestoneNode[];
  categoryColor: string;
  onAddMilestone: (parentId: string | null) => void;
  onSelectMilestone: (milestone: MilestoneNode) => void;
}

function getStatusIcon(status: MilestoneStatus): string {
  switch (status) {
    case "COMPLETED":
      return "✓";
    case "IN_PROGRESS":
      return "◐";
    case "NOT_STARTED":
    default:
      return "○";
  }
}

function getStatusColor(status: MilestoneStatus): string {
  switch (status) {
    case "COMPLETED":
      return "#4caf50";
    case "IN_PROGRESS":
      return "#ff9800";
    case "NOT_STARTED":
    default:
      return "#9e9e9e";
  }
}

interface SingleTreeProps {
  rootMilestone: MilestoneNode;
  allMilestones: MilestoneNode[];
  categoryColor: string;
  onAddMilestone: (parentId: string | null) => void;
  onSelectMilestone: (milestone: MilestoneNode) => void;
}

// Renders a single tree with root at bottom, children branching upward
function SingleTree({
  rootMilestone,
  allMilestones,
  categoryColor,
  onAddMilestone,
  onSelectMilestone,
}: SingleTreeProps) {
  // Get all milestones in this tree
  const treeMilestones = allMilestones.filter((m) => {
    let current: MilestoneNode | undefined = m;
    while (current) {
      if (current.id === rootMilestone.id) return true;
      current = allMilestones.find((p) => p.id === current?.parentId);
    }
    return false;
  });

  // Build inverted tree: start from leaves, go down to root
  // Group by depth level (0 = leaves at top, max = root at bottom)
  const getDepthFromRoot = (node: MilestoneNode): number => {
    let depth = 0;
    let current: MilestoneNode | undefined = node;
    while (current && current.parentId) {
      depth++;
      current = allMilestones.find((m) => m.id === current?.parentId);
    }
    return depth;
  };

  const maxDepth = Math.max(0, ...treeMilestones.map(getDepthFromRoot));

  // Group milestones by their inverted level (leaves at top = level 0)
  const levels: MilestoneNode[][] = [];
  for (let i = maxDepth; i >= 0; i--) {
    const nodesAtDepth = treeMilestones
      .filter((m) => getDepthFromRoot(m) === i)
      .sort((a, b) => a.order - b.order);
    levels.push(nodesAtDepth);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 200, paddingTop: 16, paddingLeft: 16, paddingRight: 16 }}>
      {levels.map((levelNodes, levelIndex) => (
        <div key={levelIndex}>
          {/* Nodes at this level */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            {levelNodes.map((milestone) => (
              <div key={milestone.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                {/* Connection line from parent above */}
                {levelIndex > 0 && (
                  <div
                    style={{
                      width: 2,
                      height: 20,
                      backgroundColor: categoryColor,
                    }}
                  />
                )}

                {/* Milestone Card */}
                <div
                  onClick={() => onSelectMilestone(milestone)}
                  style={{
                    padding: "12px 16px",
                    minWidth: 160,
                    maxWidth: 220,
                    backgroundColor: "white",
                    border: `2px solid ${categoryColor}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.02)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                  }}
                >
                  {/* Status badge */}
                  <div
                    style={{
                      position: "absolute",
                      top: -10,
                      right: -10,
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      backgroundColor: getStatusColor(milestone.status),
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {getStatusIcon(milestone.status)}
                  </div>

                  {/* Root indicator (final goal) */}
                  {milestone.parentId === null && (
                    <div
                      style={{
                        position: "absolute",
                        top: -10,
                        left: -10,
                        padding: "2px 6px",
                        backgroundColor: categoryColor,
                        color: "white",
                        fontSize: 9,
                        fontWeight: 700,
                        borderRadius: 4,
                      }}
                    >
                      GOAL
                    </div>
                  )}

                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{milestone.title}</div>

                  {milestone.description && (
                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                      {milestone.description.slice(0, 40)}
                      {milestone.description.length > 40 ? "..." : ""}
                    </div>
                  )}

                  {/* Add step above button (adds a child which appears above in inverted view) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddMilestone(milestone.id);
                    }}
                    style={{
                      marginTop: 8,
                      padding: "3px 6px",
                      fontSize: 10,
                      backgroundColor: categoryColor,
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      opacity: 0.8,
                    }}
                  >
                    + Add Step
                  </button>
                </div>

                {/* Connection line to child below (if this node has a parent, which means there's a child below in inverted view) */}
                {levelIndex < levels.length - 1 && allMilestones.some((m) => m.parentId === milestone.id) && (
                  <div
                    style={{
                      width: 2,
                      height: 20,
                      backgroundColor: categoryColor,
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Horizontal connector between siblings at this level if multiple */}
          {levelNodes.length > 1 && levelIndex < levels.length - 1 && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: -20 }}>
              <div
                style={{
                  height: 2,
                  backgroundColor: categoryColor,
                  width: `${(levelNodes.length - 1) * 176 + 80}px`,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MilestoneTreeView({
  milestones,
  categoryColor,
  onAddMilestone,
  onSelectMilestone,
}: MilestoneTreeViewProps) {
  // Find root milestones (no parent) - these are the final goals at the bottom of each tree
  const rootMilestones = milestones.filter((m) => m.parentId === null).sort((a, b) => a.order - b.order);

  if (milestones.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 32 }}>
        <p style={{ color: "#666", marginBottom: 16 }}>No milestones yet. Add your first goal to start building your roadmap.</p>
        <button
          onClick={() => onAddMilestone(null)}
          style={{
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            backgroundColor: categoryColor,
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          + Add Goal
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, justifyContent: "center", fontSize: 12, color: "#666" }}>
        <span>
          <span style={{ color: getStatusColor("NOT_STARTED"), fontWeight: 700 }}>○</span> Not Started
        </span>
        <span>
          <span style={{ color: getStatusColor("IN_PROGRESS"), fontWeight: 700 }}>◐</span> In Progress
        </span>
        <span>
          <span style={{ color: getStatusColor("COMPLETED"), fontWeight: 700 }}>✓</span> Completed
        </span>
      </div>

      {/* Horizontal scrollable container for multiple trees */}
      <div
        style={{
          display: "flex",
          gap: 48,
          overflowX: "auto",
          paddingBottom: 16,
          minHeight: 200,
        }}
      >
        {rootMilestones.map((root) => (
          <SingleTree
            key={root.id}
            rootMilestone={root}
            allMilestones={milestones}
            categoryColor={categoryColor}
            onAddMilestone={onAddMilestone}
            onSelectMilestone={onSelectMilestone}
          />
        ))}
      </div>

      {/* Add another goal */}
      <div style={{ textAlign: "center", marginTop: 24 }}>
        <button
          onClick={() => onAddMilestone(null)}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            backgroundColor: "white",
            color: categoryColor,
            border: `2px dashed ${categoryColor}`,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          + Add Another Goal
        </button>
      </div>
    </div>
  );
}
