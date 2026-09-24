/** Shared by the dungeon card's timer column and the party picker's footer. */
export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} sec`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${Math.round(seconds / 3600)} h`
}

/**
 * `lesser_fire_core` → `Lesser Fire Core`. The material catalog query is where real names
 * come from; this is the fallback for a drop the catalog has not listed (yet, or any more).
 */
export function materialLabel(id: string) {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
