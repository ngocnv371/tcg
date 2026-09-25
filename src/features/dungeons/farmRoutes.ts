/**
 * Reverse of the dungeon drop table: given a material a rank-up is short on, which dungeons
 * list it. The drop table is fixed and paid in full, so this is a promise rather than a
 * guess — it is what turns "3 more Fire Cores" into a place to go.
 */
export type FarmDungeonLike = {
  id: string
  name: string
  req_power: number
  materials: ReadonlyArray<{ material_id: string }>
}

/**
 * Every dungeon whose drop table contains `materialId`, easiest first so the suggestion is
 * the one a player can actually clear. Generic over the row so callers keep the full
 * `Dungeon` shape.
 */
export function dungeonsDropping<T extends FarmDungeonLike>(
  materialId: string,
  dungeons: readonly T[],
): T[] {
  return dungeons
    .filter((dungeon) => dungeon.materials.some((drop) => drop.material_id === materialId))
    .sort((a, b) => a.req_power - b.req_power)
}
