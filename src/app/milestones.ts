import type { MilestoneNode } from "./types";

export function getRootMilestone(milestones: MilestoneNode[], milestoneId: string | null | undefined): MilestoneNode | undefined {
  if (!milestoneId) return undefined;
  const byId = new Map(milestones.map((milestone) => [milestone.id, milestone] as const));
  let current = byId.get(milestoneId);
  const visited = new Set<string>();

  while (current?.parentId) {
    if (visited.has(current.id)) return current;
    visited.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) return current;
    current = parent;
  }

  return current;
}

export function getMilestoneTreeName(milestones: MilestoneNode[], milestoneId: string | null | undefined): string | undefined {
  const root = getRootMilestone(milestones, milestoneId);
  const treeName = root?.treeName?.trim();
  return treeName || undefined;
}

export function formatMilestoneTitle(milestone: MilestoneNode, milestones: MilestoneNode[]): string {
  const treeName = getMilestoneTreeName(milestones, milestone.id);
  return treeName ? `${milestone.title} (${treeName})` : milestone.title;
}

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
