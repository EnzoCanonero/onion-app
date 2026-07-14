import type { MilestoneNode, MilestoneStatus } from "../app/types";

const COMPLETED_FIREWORKS = [
  { top: -16, left: -10, color: "#f59e0b", symbol: "✦", delay: "0s", size: 18 },
  { top: -18, right: 8, color: "#22c55e", symbol: "✺", delay: "0.35s", size: 16 },
  { top: 18, right: -14, color: "#14b8a6", symbol: "✷", delay: "0.7s", size: 15 },
  { bottom: 18, left: -14, color: "#eab308", symbol: "✹", delay: "1.05s", size: 17 },
] as const;

interface MilestoneTreeViewProps {
  milestones: MilestoneNode[];
  categoryColor: string;
  onAddMilestone: (parentId: string | null) => void;
  onSelectMilestone: (milestone: MilestoneNode) => void;
  selectableMilestoneIds?: Set<string>;
  disableAddForMilestoneIds?: Set<string>;
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
  selectableMilestoneIds?: Set<string>;
  disableAddForMilestoneIds?: Set<string>;
}

// Renders a single tree with root at bottom, children branching upward
function SingleTree({
  rootMilestone,
  allMilestones,
  categoryColor,
  onAddMilestone,
  onSelectMilestone,
  selectableMilestoneIds,
  disableAddForMilestoneIds,
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
	            {levelNodes.map((milestone) => {
	              const isSelectable = selectableMilestoneIds?.has(milestone.id) ?? false;
	              const isLocked = selectableMilestoneIds
	                ? milestone.status !== "COMPLETED" && !isSelectable
	                : false;
	              const isAddDisabled = disableAddForMilestoneIds?.has(milestone.id) ?? false;
	              const isCompleted = milestone.status === "COMPLETED";
	              const cardBorderColor = isCompleted
	                ? "#16a34a"
	                : isLocked
	                ? "#cbd5e1"
	                : categoryColor;
	              const cardBackground = isCompleted
	                ? "linear-gradient(145deg, #fff7d6 0%, #ffffff 42%, #ecfccb 100%)"
	                : isLocked
	                ? "#f8fafc"
	                : "white";
	              const cardShadow = isCompleted
	                ? "0 16px 34px rgba(34,197,94,0.16), 0 0 0 3px rgba(250,204,21,0.20)"
	                : isSelectable
	                ? `0 0 0 3px ${categoryColor}22`
	                : isLocked
	                ? "0 1px 4px rgba(0,0,0,0.08)"
	                : "0 2px 8px rgba(0,0,0,0.1)";
	              const titleColor = isCompleted ? "#14532d" : isLocked ? "#64748b" : "#111";
	              const descriptionColor = isCompleted ? "#3f6212" : isLocked ? "#94a3b8" : "#475569";
	              const statusBadgeBackground = isCompleted
	                ? "linear-gradient(135deg, #16a34a 0%, #eab308 100%)"
	                : getStatusColor(milestone.status);
	              const statusBadgeSize = isCompleted ? 30 : 24;
	              const rootTreeName = milestone.parentId === null ? milestone.treeName?.trim() : undefined;

              return (
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
	                    background: cardBackground,
	                    border: `2px solid ${cardBorderColor}`,
	                    borderRadius: isCompleted ? 16 : 8,
	                    cursor: "pointer",
	                    textAlign: "center",
	                    boxShadow: cardShadow,
	                    transition: "transform 0.2s, box-shadow 0.2s",
	                    position: "relative",
	                    overflow: "visible",
	                  }}
	                  onMouseEnter={(e) => {
	                    if (isLocked) return;
	                    e.currentTarget.style.transform = "scale(1.02)";
	                    e.currentTarget.style.boxShadow = isCompleted
	                      ? "0 20px 40px rgba(34,197,94,0.22), 0 0 0 4px rgba(250,204,21,0.24)"
	                      : isSelectable
	                      ? `0 0 0 3px ${categoryColor}22`
	                      : "0 4px 12px rgba(0,0,0,0.15)";
	                  }}
	                  onMouseLeave={(e) => {
	                    if (isLocked) return;
	                    e.currentTarget.style.transform = "scale(1)";
	                    e.currentTarget.style.boxShadow = isCompleted
	                      ? "0 16px 34px rgba(34,197,94,0.16), 0 0 0 3px rgba(250,204,21,0.20)"
	                      : isSelectable
	                      ? `0 0 0 3px ${categoryColor}22`
	                      : "0 2px 8px rgba(0,0,0,0.1)";
	                  }}
	                >
	                  {isCompleted && (
	                    <>
	                      <div
	                        style={{
	                          position: "absolute",
	                          inset: 0,
	                          borderRadius: 14,
	                          background:
	                            "radial-gradient(circle at top left, rgba(250,204,21,0.22), transparent 34%), radial-gradient(circle at bottom right, rgba(34,197,94,0.18), transparent 32%)",
	                          pointerEvents: "none",
	                        }}
	                      />
	                      <div
	                        className="milestone-complete-sheen"
	                        style={{
	                          position: "absolute",
	                          top: 10,
	                          left: 12,
	                          right: 12,
	                          height: 4,
	                          borderRadius: 999,
	                          background: "linear-gradient(90deg, rgba(250,204,21,0.18), rgba(34,197,94,0.95), rgba(250,204,21,0.18))",
	                          pointerEvents: "none",
	                        }}
	                      />
	                      {COMPLETED_FIREWORKS.map((firework, index) => (
	                        <span
	                          key={`${milestone.id}-firework-${index}`}
	                          className="milestone-firework"
	                          style={{
	                            position: "absolute",
	                            ...firework,
	                            color: firework.color,
	                            fontSize: firework.size,
	                            animationDelay: firework.delay,
	                            pointerEvents: "none",
	                            textShadow: `0 0 12px ${firework.color}55`,
	                            lineHeight: 1,
	                          }}
	                        >
	                          {firework.symbol}
	                        </span>
	                      ))}
	                    </>
	                  )}

	                  {/* Status badge */}
	                  <div
	                    style={{
	                      position: "absolute",
	                      top: isCompleted ? -14 : -10,
	                      right: isCompleted ? -14 : -10,
	                      width: statusBadgeSize,
	                      height: statusBadgeSize,
	                      borderRadius: "50%",
	                      background: statusBadgeBackground,
	                      color: "white",
	                      display: "flex",
	                      alignItems: "center",
	                      justifyContent: "center",
	                      fontSize: isCompleted ? 16 : 14,
	                      fontWeight: 700,
	                      border: isCompleted ? "2px solid #fff7ed" : "none",
	                      boxShadow: isCompleted ? "0 8px 18px rgba(22,163,74,0.28)" : "none",
	                      zIndex: 2,
	                    }}
	                  >
                    {getStatusIcon(milestone.status)}
                  </div>

                  {/* Root tree label */}
                  {rootTreeName && (
                    <div
                      style={{
                        position: "absolute",
                        top: -10,
                        left: -10,
                        padding: "2px 6px",
                        maxWidth: 150,
                        backgroundColor: categoryColor,
                        color: "white",
                        fontSize: 9,
                        fontWeight: 700,
                        borderRadius: 4,
                        lineHeight: 1.2,
                        overflowWrap: "anywhere",
                        whiteSpace: "normal",
                      }}
                    >
                      {rootTreeName}
                    </div>
                  )}

                  {isSelectable && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: -10,
                        right: -10,
                        padding: "2px 6px",
                        backgroundColor: categoryColor,
                        color: "white",
                        fontSize: 9,
                        fontWeight: 800,
                        borderRadius: 4,
                        letterSpacing: 0.3,
                      }}
                    >
                      NEXT
                    </div>
                  )}

	                  <div style={{ position: "relative", zIndex: 1 }}>
	                    {isCompleted && (
	                      <div
	                        style={{
	                          display: "inline-flex",
	                          alignItems: "center",
	                          gap: 6,
	                          marginBottom: 8,
	                          padding: "4px 10px",
	                          borderRadius: 999,
	                          backgroundColor: "rgba(255,255,255,0.78)",
	                          border: "1px solid rgba(22,163,74,0.16)",
	                          color: "#15803d",
	                          fontSize: 10,
	                          fontWeight: 900,
	                          letterSpacing: 0.6,
	                          textTransform: "uppercase",
	                          boxShadow: "0 4px 10px rgba(250,204,21,0.14)",
	                        }}
	                      >
	                        <span>Completed</span>
	                        <span style={{ color: "#eab308" }}>✦</span>
	                      </div>
	                    )}

	                    <div
	                      style={{
	                        fontWeight: isCompleted ? 800 : 600,
	                        fontSize: isCompleted ? 14 : 13,
	                        marginBottom: 4,
	                        color: titleColor,
	                      }}
	                    >
	                      {milestone.title}
	                    </div>

	                    {milestone.description && (
	                      <div
	                        style={{
	                          marginTop: 8,
	                          textAlign: "left",
	                          fontSize: 12,
	                          lineHeight: 1.5,
	                          color: descriptionColor,
	                          whiteSpace: "pre-wrap",
	                          overflow: "hidden",
	                          display: "-webkit-box",
	                          WebkitLineClamp: 5,
	                          WebkitBoxOrient: "vertical",
	                        }}
	                      >
	                        {milestone.description}
	                      </div>
	                    )}
	                  </div>

                  {/* Add milestone above button (adds a child which appears above in inverted view) */}
	                  <button
	                    data-tutorial-target="add-milestone"
	                    onClick={(e) => {
	                      e.stopPropagation();
	                      if (isAddDisabled) return;
                      onAddMilestone(milestone.id);
                    }}
                    disabled={isAddDisabled}
	                  style={{
	                    marginTop: 8,
	                    padding: "3px 6px",
	                    fontSize: 10,
	                    backgroundColor: isAddDisabled ? "#e2e8f0" : isCompleted ? "#15803d" : categoryColor,
	                    color: isAddDisabled ? "#64748b" : "white",
	                    border: "none",
	                    borderRadius: 4,
	                    cursor: isAddDisabled ? "not-allowed" : "pointer",
	                    opacity: isAddDisabled ? 1 : isCompleted ? 0.92 : 0.8,
	                    position: "relative",
	                    zIndex: 1,
	                    boxShadow: isCompleted ? "0 6px 14px rgba(21,128,61,0.18)" : "none",
	                  }}
	                    title={isAddDisabled ? "Locked while this milestone is pinned in a month" : "Add a sub-milestone"}
	                  >
                    + Add Milestone
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
              );
            })}
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
  selectableMilestoneIds,
  disableAddForMilestoneIds,
}: MilestoneTreeViewProps) {
  // Find root milestones (no parent) - these are the final goals at the bottom of each tree
  const rootMilestones = milestones.filter((m) => m.parentId === null).sort((a, b) => a.order - b.order);

  if (milestones.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 32 }}>
        <p style={{ color: "#666", marginBottom: 16 }}>No milestones yet. Add your first goal to start building your roadmap.</p>
        <button
          data-tutorial-target="add-goal"
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
      <style>{`
        @keyframes milestoneFireworkFloat {
          0%, 100% { transform: translateY(0) scale(0.94); opacity: 0.55; }
          50% { transform: translateY(-6px) scale(1.12); opacity: 1; }
        }

        @keyframes milestoneCompleteSheen {
          0%, 100% { opacity: 0.85; transform: scaleX(0.98); }
          50% { opacity: 1; transform: scaleX(1); }
        }

        .milestone-firework {
          animation: milestoneFireworkFloat 2.8s ease-in-out infinite;
        }

        .milestone-complete-sheen {
          animation: milestoneCompleteSheen 2.6s ease-in-out infinite;
        }
      `}</style>

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
            selectableMilestoneIds={selectableMilestoneIds}
            disableAddForMilestoneIds={disableAddForMilestoneIds}
          />
        ))}
      </div>

    </div>
  );
}
