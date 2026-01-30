import type { MilestoneNode } from "./types";

export const getSelectableMilestoneIds = (milestones: MilestoneNode[]) => {
  const childrenByParent = new Map<string, MilestoneNode[]>();
  for (const milestone of milestones) {
    if (!milestone.parentId) continue;
    const list = childrenByParent.get(milestone.parentId) ?? [];
    list.push(milestone);
    childrenByParent.set(milestone.parentId, list);
  }

  const hasIncompleteDescendantMemo = new Map<string, boolean>();
  const hasIncompleteDescendant = (id: string): boolean => {
    const cached = hasIncompleteDescendantMemo.get(id);
    if (cached !== undefined) return cached;
    const children = childrenByParent.get(id) ?? [];
    for (const child of children) {
      if (child.status !== "COMPLETED" || hasIncompleteDescendant(child.id)) {
        hasIncompleteDescendantMemo.set(id, true);
        return true;
      }
    }
    hasIncompleteDescendantMemo.set(id, false);
    return false;
  };

  const selectable = new Set<string>();
  for (const milestone of milestones) {
    if (milestone.status === "COMPLETED") continue;
    if (!hasIncompleteDescendant(milestone.id)) {
      selectable.add(milestone.id);
    }
  }
  return selectable;
};
