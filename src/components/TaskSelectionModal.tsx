import { useEffect, useMemo, useRef, useState } from "react";
import type { GrandPlan, TaskNode } from "../app/types";
import { compareTaskGroupMeta, getTaskGroupMeta } from "../app/reporting";
import { APP_MAIN_COLOR } from "../app/theme";

type TaskSelectionModalProps = {
  tasks: TaskNode[];
  grandPlan?: GrandPlan;
  currentPrimaryId?: string;
  currentSecondaryIds: string[];
  onConfirm: (primaryId: string | undefined, secondaryIds: string[]) => void;
  onCancel: () => void;
  suggestedSecondaryIds?: string[];
  completedTodayIds?: Set<string>;
  variant?: "modal" | "inline";
  showHeader?: boolean;
  showCancel?: boolean;
  confirmLabel?: string;
  showFooter?: boolean;
  surface?: "card" | "none";
  onDraftChange?: (primaryId: string | undefined, secondaryIds: string[]) => void;
  primaryButtonTutorialTarget?: string;
  showPrimarySelection?: boolean;
  title?: string;
  description?: string;
};

export default function TaskSelectionModal({
  tasks,
  grandPlan,
  currentPrimaryId,
  currentSecondaryIds,
  onConfirm,
  onCancel,
  suggestedSecondaryIds = [],
  completedTodayIds = new Set(),
  variant = "modal",
  showHeader = true,
  showCancel = true,
  confirmLabel = "Save",
  showFooter = true,
  surface = "card",
  onDraftChange,
  primaryButtonTutorialTarget,
  showPrimarySelection = true,
  title = "Daily task selection",
  description = "Choose a primary task and optional secondary tasks.",
}: TaskSelectionModalProps) {
  const lastDraftRef = useRef<{ primaryId?: string; secondaryIds: string[] }>({
    primaryId: currentPrimaryId ?? undefined,
    secondaryIds: currentSecondaryIds ?? [],
  });
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string>(currentPrimaryId ?? "");
  const [selectedSecondaryIds, setSelectedSecondaryIds] = useState<string[]>(currentSecondaryIds);
  const [primaryMenuOpen, setPrimaryMenuOpen] = useState(false);
  const [secondaryMenuOpen, setSecondaryMenuOpen] = useState(false);
  const primaryMenuRef = useRef<HTMLDivElement | null>(null);
  const secondaryMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ids = new Set(tasks.map((t) => t.id));
    setSelectedPrimaryId((prev) => (prev && ids.has(prev) ? prev : ""));
    setSelectedSecondaryIds((prev) => prev.filter((id) => ids.has(id)));
  }, [tasks]);

  const areArraysEqual = (a: string[], b: string[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  useEffect(() => {
    const nextPrimary = currentPrimaryId ?? "";
    const nextSecondary = currentSecondaryIds ?? [];
    const primaryChanged = selectedPrimaryId !== nextPrimary;
    const secondaryChanged = !areArraysEqual(selectedSecondaryIds, nextSecondary);
    if (primaryChanged) setSelectedPrimaryId(nextPrimary);
    if (secondaryChanged) setSelectedSecondaryIds(nextSecondary);
    if (primaryChanged || secondaryChanged) {
      lastDraftRef.current = {
        primaryId: nextPrimary || undefined,
        secondaryIds: nextSecondary,
      };
    }
  }, [currentPrimaryId, currentSecondaryIds]);

  useEffect(() => {
    if (!selectedPrimaryId) {
      setSelectedSecondaryIds([]);
      setSecondaryMenuOpen(false);
      return;
    }
    setSelectedSecondaryIds((prev) => prev.filter((id) => id !== selectedPrimaryId));
  }, [selectedPrimaryId]);

  useEffect(() => {
    if (!onDraftChange) return;
    const primaryId = selectedPrimaryId || undefined;
    const secondaryIds = selectedSecondaryIds;
    const last = lastDraftRef.current;
    if (last && last.primaryId === primaryId && areArraysEqual(last.secondaryIds, secondaryIds)) return;
    lastDraftRef.current = { primaryId, secondaryIds };
    onDraftChange(primaryId, secondaryIds);
  }, [selectedPrimaryId, selectedSecondaryIds, onDraftChange]);

  useEffect(() => {
    if (variant !== "modal") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (secondaryMenuOpen) {
        setSecondaryMenuOpen(false);
        return;
      }
      if (primaryMenuOpen) {
        setPrimaryMenuOpen(false);
        return;
      }
      onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, secondaryMenuOpen, primaryMenuOpen, variant]);

  useEffect(() => {
    if (!primaryMenuOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const node = primaryMenuRef.current;
      if (!node) return;
      if (node.contains(e.target as Node)) return;
      setPrimaryMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [primaryMenuOpen]);

  useEffect(() => {
    if (!secondaryMenuOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const node = secondaryMenuRef.current;
      if (!node) return;
      if (node.contains(e.target as Node)) return;
      setSecondaryMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [secondaryMenuOpen]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);
  const selectedPrimaryTask = selectedPrimaryId ? tasksById.get(selectedPrimaryId) : undefined;

  const orderedTasks = useMemo(() => {
    const childrenByParentId = new Map<string | null, TaskNode[]>();
    for (const task of tasks) {
      const key = task.parentId;
      const list = childrenByParentId.get(key);
      if (list) list.push(task);
      else childrenByParentId.set(key, [task]);
    }

    const out: Array<{ task: TaskNode; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
      const children = childrenByParentId.get(parentId) ?? [];
      for (const child of children) {
        out.push({ task: child, depth });
        walk(child.id, depth + 1);
      }
    };
    walk(null, 0);

    const included = new Set(out.map((x) => x.task.id));
    for (const task of tasks) {
      if (included.has(task.id)) continue;
      out.push({ task, depth: 0 });
    }
    return out;
  }, [tasks]);

  const groupedTaskOptions = useMemo(() => {
    const primaryGroupKey = selectedPrimaryTask ? getTaskGroupMeta(grandPlan, selectedPrimaryTask).groupKey : null;
    const groupsByKey = new Map<string, {
      meta: ReturnType<typeof getTaskGroupMeta>;
      items: Array<{ task: TaskNode; depth: number }>;
    }>();

    for (const item of orderedTasks) {
      const meta = getTaskGroupMeta(grandPlan, item.task);
      const existing = groupsByKey.get(meta.groupKey);
      if (existing) {
        existing.items.push(item);
        continue;
      }
      groupsByKey.set(meta.groupKey, { meta, items: [item] });
    }

    return Array.from(groupsByKey.values()).sort((a, b) => {
      const aIsPrimaryGroup = a.meta.groupKey === primaryGroupKey;
      const bIsPrimaryGroup = b.meta.groupKey === primaryGroupKey;
      if (aIsPrimaryGroup !== bIsPrimaryGroup) return aIsPrimaryGroup ? -1 : 1;
      return compareTaskGroupMeta(a.meta, b.meta);
    });
  }, [grandPlan, orderedTasks, selectedPrimaryTask]);

  const secondaryGroups = useMemo(() => {
    return groupedTaskOptions
      .map((group) => ({
        ...group,
        items: group.items
          .filter(({ task }) => task.id !== selectedPrimaryId)
          .map((item) => ({
            ...item,
            isSuggested: suggestedSecondaryIds.includes(item.task.id),
          })),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedTaskOptions, selectedPrimaryId, suggestedSecondaryIds]);

  const toggleSecondary = (taskId: string) => {
    setSelectedSecondaryIds((prev) => {
      if (prev.includes(taskId)) return prev.filter((id) => id !== taskId);
      return [...prev, taskId];
    });
  };

  const removeSecondary = (taskId: string) => {
    setSelectedSecondaryIds((prev) => prev.filter((id) => id !== taskId));
  };

  const selectedSecondaryTitles = useMemo(() => {
    return selectedSecondaryIds.map((id) => tasksById.get(id)?.title).filter(Boolean) as string[];
  }, [selectedSecondaryIds, tasksById]);

  const selectedPrimaryTitle = selectedPrimaryId ? tasksById.get(selectedPrimaryId)?.title ?? "Primary task" : "";

  const canOpenPrimaryMenu = orderedTasks.length > 0;
  const canOpenSecondaryMenu = Boolean(selectedPrimaryId) && secondaryGroups.length > 0;

  const handleSave = () => {
    const primaryId = selectedPrimaryId || undefined;
    const secondaryIds = primaryId ? selectedSecondaryIds.filter((id) => id !== primaryId) : [];
    onConfirm(primaryId, secondaryIds);
  };

  const renderTaskGroupHeader = (
    meta: ReturnType<typeof getTaskGroupMeta>,
    groupIndex: number
  ) => (
    <div
      style={{
        borderTop: groupIndex === 0 ? "none" : "1px solid #eef2f7",
        marginTop: groupIndex === 0 ? 0 : 8,
        paddingTop: groupIndex === 0 ? 0 : 10,
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
            backgroundColor: meta.categoryColor,
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
          {meta.categoryTitle}
        </span>
        {!meta.isStandalone ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#334155", lineHeight: 1.2 }}>
            {meta.milestoneTitle}
          </span>
        ) : null}
      </div>
    </div>
  );

  const header = showHeader ? (
    <div
      style={{
        padding: "18px 20px",
        borderBottom: "1px solid #eee",
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        background: "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(250,250,250,1) 100%)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#111" }}>{title}</div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#666", lineHeight: 1.4 }}>
            {description}
          </div>
        </div>
        <button
          onClick={onCancel}
          style={{
            padding: "6px 10px",
            fontSize: 14,
            fontWeight: 900,
            backgroundColor: "white",
            border: "1px solid #ddd",
            borderRadius: 10,
            cursor: "pointer",
            color: "#666",
          }}
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  ) : null;

  const footer = showFooter ? (
    <div
      style={{
        padding: "14px 20px",
        borderTop: "1px solid #eee",
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 14,
        display: "flex",
        justifyContent: "flex-end",
        gap: 10,
        backgroundColor: "#fafafa",
      }}
    >
      {showCancel ? (
        <button
          onClick={onCancel}
          style={{
            padding: "10px 14px",
            fontSize: 14,
            fontWeight: 700,
            backgroundColor: "white",
            border: "1px solid #ddd",
            borderRadius: 10,
            cursor: "pointer",
            color: "#555",
          }}
        >
          Cancel
        </button>
      ) : null}
      <button
        onClick={handleSave}
        style={{
          padding: "10px 14px",
          fontSize: 14,
          fontWeight: 900,
          backgroundColor: APP_MAIN_COLOR,
          color: "white",
          border: "none",
          borderRadius: 10,
          cursor: "pointer",
          boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
          transition: "transform 120ms ease, box-shadow 120ms ease",
        }}
      >
        {confirmLabel}
      </button>
    </div>
  ) : null;

  const content = (
    <div
      style={{
        width: "100%",
        maxWidth: surface === "card" ? 640 : "100%",
        backgroundColor: surface === "card" ? "white" : "transparent",
        borderRadius: surface === "card" ? 14 : 0,
        border: surface === "card" ? "1px solid #eee" : "none",
        boxShadow: surface === "card" ? "0 20px 60px rgba(0,0,0,0.35)" : "none",
        overflow: "visible",
      }}
    >
      {header}

        <div style={{ padding: 20, display: "grid", gap: 16 }}>
          {orderedTasks.length === 0 ? (
            <div
              style={{
                padding: 14,
                border: "1px solid #eee",
                borderRadius: 12,
                backgroundColor: "#fafafa",
                color: "#666",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              No tasks available. Create tasks in Month Setup, then come back here to select your daily tasks.
            </div>
          ) : (
            <>
              {showPrimarySelection ? (
              <div ref={primaryMenuRef} style={{ position: "relative" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#555", marginBottom: 6 }}>
                  Primary task
                </label>
                <button
                  {...(primaryButtonTutorialTarget ? { "data-tutorial-target": primaryButtonTutorialTarget } : {})}
                  type="button"
                  disabled={!canOpenPrimaryMenu}
                  onClick={() => {
                    if (!canOpenPrimaryMenu) return;
                    setPrimaryMenuOpen((v) => !v);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    borderRadius: 10,
                    border: `1px solid ${primaryMenuOpen ? APP_MAIN_COLOR : "#ddd"}`,
                    boxSizing: "border-box",
                    backgroundColor: canOpenPrimaryMenu ? "white" : "#f5f5f5",
                    color: canOpenPrimaryMenu ? "#111" : "#999",
                    cursor: canOpenPrimaryMenu ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedPrimaryId ? selectedPrimaryTitle : "Choose primary task…"}
                  </span>
                  <span style={{ color: canOpenPrimaryMenu ? "#666" : "#aaa", fontSize: 12 }}>
                    {primaryMenuOpen ? "▲" : "▼"}
                  </span>
                </button>

                {primaryMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: 0,
                      right: 0,
                      backgroundColor: "white",
                      border: "1px solid #ddd",
                      borderRadius: 12,
                      boxShadow: "0 16px 38px rgba(0,0,0,0.16)",
                      overflow: "hidden",
                      zIndex: 10,
                    }}
                  >
                    <div style={{ maxHeight: 300, overflowY: "auto", overscrollBehavior: "contain", padding: 6 }}>
                      {groupedTaskOptions.map((group, groupIndex) => (
                        <div key={group.meta.groupKey}>
                          {renderTaskGroupHeader(group.meta, groupIndex)}
                          {group.items.map(({ task, depth }) => {
                            const isSelected = selectedPrimaryId === task.id;
                            const isWip = task.status === "YELLOW";
                            const isCompletedToday = completedTodayIds.has(task.id);
                            const backgroundColor = isCompletedToday
                              ? isSelected
                                ? "#d1fae5"
                                : "#dcfce7"
                              : isWip
                                ? isSelected
                                  ? "#fff1c2"
                                  : "#fff7d6"
                                : isSelected
                                ? "rgba(103,58,183,0.10)"
                                : "transparent";
                            const borderColor = isCompletedToday
                              ? "#86efac"
                              : isWip
                              ? "#fde68a"
                              : "transparent";

                            return (
                              <label
                                key={task.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  cursor: "pointer",
                                  backgroundColor,
                                  border: `1px solid ${borderColor}`,
                                  marginLeft: depth * 14,
                                }}
                              >
                                <input
                                  type="radio"
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedPrimaryId(task.id);
                                    setPrimaryMenuOpen(false);
                                  }}
                                  style={{ cursor: "pointer" }}
                                />
                                <span style={{ flex: 1, color: "#111", fontSize: 14, lineHeight: 1.35 }}>
                                  {task.title}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ))}
                      <div aria-hidden="true" style={{ height: 28 }} />
                    </div>
                  </div>
                )}
              </div>
              ) : null}

              <div ref={secondaryMenuRef} style={{ position: "relative" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#555", marginBottom: 6 }}>
                  Secondary tasks <span style={{ fontWeight: 700, color: "#888" }}>(optional)</span>
                </label>

                <button
                  type="button"
                  disabled={!canOpenSecondaryMenu}
                  onClick={() => {
                    if (!canOpenSecondaryMenu) return;
                    setSecondaryMenuOpen((v) => !v);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    borderRadius: 10,
                    border: `1px solid ${secondaryMenuOpen ? APP_MAIN_COLOR : "#ddd"}`,
                    boxSizing: "border-box",
                    backgroundColor: canOpenSecondaryMenu ? "white" : "#f5f5f5",
                    color: canOpenSecondaryMenu ? "#111" : "#999",
                    cursor: canOpenSecondaryMenu ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedSecondaryIds.length > 0 ? `${selectedSecondaryIds.length} selected` : "Choose secondary tasks…"}
                  </span>
                  <span style={{ color: canOpenSecondaryMenu ? "#666" : "#aaa", fontSize: 12 }}>
                    {secondaryMenuOpen ? "▲" : "▼"}
                  </span>
                </button>

                {!showPrimarySelection && !selectedPrimaryId ? null : !selectedPrimaryId && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
                    Select a primary task to enable secondary tasks.
                  </div>
                )}

                {secondaryMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: 0,
                      right: 0,
                      backgroundColor: "white",
                      border: "1px solid #ddd",
                      borderRadius: 12,
                      boxShadow: "0 16px 38px rgba(0,0,0,0.16)",
                      overflow: "hidden",
                      zIndex: 10,
                    }}
                  >
                    <div style={{ maxHeight: 300, overflowY: "auto", overscrollBehavior: "contain", padding: 6 }}>
                      {secondaryGroups.map((group, groupIndex) => (
                        <div key={group.meta.groupKey}>
                          {renderTaskGroupHeader(group.meta, groupIndex)}
                          {group.items.map((item) => {
                            const checked = selectedSecondaryIds.includes(item.task.id);
                            const isWip = item.task.status === "YELLOW";
                            const isCompletedToday = completedTodayIds.has(item.task.id);
                            const showSuggested = item.isSuggested && !checked;
                            const backgroundColor = isCompletedToday
                              ? checked
                                ? "#d1fae5"
                                : "#dcfce7"
                              : isWip
                                ? checked
                                  ? "#fff1c2"
                                  : "#fff7d6"
                                : checked
                                ? "rgba(103,58,183,0.10)"
                                : "transparent";
                            const borderColor = isCompletedToday
                              ? "#86efac"
                              : isWip
                              ? "#fde68a"
                              : "transparent";

                            return (
                              <label
                                key={item.task.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  cursor: "pointer",
                                  backgroundColor,
                                  border: `1px solid ${borderColor}`,
                                  marginLeft: item.depth * 14,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSecondary(item.task.id)}
                                  style={{ cursor: "pointer" }}
                                />
                                <span style={{ flex: 1, color: "#111", fontSize: 14, lineHeight: 1.35 }}>
                                  {item.task.title}
                                  {showSuggested && (
                                    <span style={{ marginLeft: 8, fontSize: 11, color: "#ff9800", fontWeight: 700 }}>
                                      Suggested
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ))}
                      <div aria-hidden="true" style={{ height: 28 }} />
                    </div>
                  </div>
                )}

                {(selectedSecondaryIds.length > 0 || selectedPrimaryId) && (
                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {selectedPrimaryId ? (
                      <div
                        key="primary-chip"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          borderRadius: 999,
                          backgroundColor: "#fff1c2",
                          border: "1px solid #facc15",
                          color: "#7a4f0b",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                        title={selectedPrimaryTitle}
                      >
                        <span style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {selectedPrimaryTitle}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedPrimaryId("")}
                          style={{
                            padding: 0,
                            width: 18,
                            height: 18,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 999,
                            border: "1px solid #f59e0b",
                            backgroundColor: "white",
                            color: "#b45309",
                            cursor: "pointer",
                            lineHeight: 1,
                          }}
                          title="Remove primary"
                        >
                          ✕
                        </button>
                      </div>
                    ) : null}
                    {selectedSecondaryIds.map((id) => {
                      const title = tasksById.get(id)?.title ?? "Task";
                      return (
                        <div
                          key={id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            borderRadius: 999,
                            backgroundColor: "rgba(103,58,183,0.10)",
                            border: "1px solid rgba(103,58,183,0.18)",
                            color: "#3b2a69",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                          title={title}
                        >
                          <span style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {title}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeSecondary(id)}
                            style={{
                              padding: 0,
                              width: 18,
                              height: 18,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 999,
                              border: "1px solid rgba(103,58,183,0.25)",
                              backgroundColor: "white",
                              color: "#5a3fb0",
                              cursor: "pointer",
                              lineHeight: 1,
                            }}
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedSecondaryIds.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#777", lineHeight: 1.4 }}>
                    Selected: {selectedSecondaryTitles.join(", ")}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      {footer}
    </div>
  );

  if (variant === "inline") {
    return content;
  }

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
      <div onClick={(e) => e.stopPropagation()}>{content}</div>
    </div>
  );
}
