/** Shared by the dungeon card's timer column and the party picker's footer. */
export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} sec`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${Math.round(seconds / 3600)} h`
}
