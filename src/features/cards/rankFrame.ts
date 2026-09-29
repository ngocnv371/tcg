/**
 * The rank frame vocabulary for a card face, shared by `CardTile` (library / party pickers) and
 * the quest battle board — so an opponent or a party member reads exactly like a card elsewhere
 * in the app. Tailwind needs the class names to appear literally, hence the maps.
 */
export const RANK_BORDER: Record<number, string> = {
  1: 'border-rank-1',
  2: 'border-rank-2',
  3: 'border-rank-3',
  4: 'border-rank-4',
  5: 'border-rank-5',
}

export const RANK_TEXT: Record<number, string> = {
  1: 'text-rank-1',
  2: 'text-rank-2',
  3: 'text-rank-3',
  4: 'text-rank-4',
  5: 'text-rank-5',
}
