export function compareTaskFlagPriority(
  a: { flagged?: unknown },
  b: { flagged?: unknown }
): number {
  const aFlagged = a.flagged === true;
  const bFlagged = b.flagged === true;
  if (aFlagged === bFlagged) return 0;
  return aFlagged ? -1 : 1;
}
