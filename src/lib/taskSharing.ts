export function taskViewerIds(args: {
  isPrivate: boolean;
  currentUid: string | null | undefined;
  householdMemberIds: string[];
}): string[] {
  const currentUid = args.currentUid?.trim() ?? '';
  if (args.isPrivate) return currentUid ? [currentUid] : [];

  const members = args.householdMemberIds
    .map((id) => id.trim())
    .filter(Boolean);
  if (currentUid) members.push(currentUid);
  return Array.from(new Set(members));
}
