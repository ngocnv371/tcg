import { describe, expect, it } from 'vitest'

import { dungeonsDropping, type FarmDungeonLike } from './farmRoutes'

const dungeon = (
  id: string,
  req_power: number,
  material_ids: string[],
): FarmDungeonLike => ({
  id,
  name: id,
  req_power,
  materials: material_ids.map((material_id) => ({ material_id })),
})

describe('dungeonsDropping', () => {
  const catalog = [
    dungeon('hard', 900, ['mythic_fire_core']),
    dungeon('easy', 100, ['lesser_fire_core', 'common_shard']),
    dungeon('mid', 400, ['greater_fire_core']),
  ]

  it('returns only dungeons whose table lists the material', () => {
    expect(dungeonsDropping('greater_fire_core', catalog).map((d) => d.id)).toEqual(['mid'])
    expect(dungeonsDropping('common_shard', catalog).map((d) => d.id)).toEqual(['easy'])
  })

  it('orders the suggestions easiest first', () => {
    const shared = [dungeon('hard', 900, ['fire']), dungeon('easy', 100, ['fire'])]
    expect(dungeonsDropping('fire', shared).map((d) => d.id)).toEqual(['easy', 'hard'])
  })

  it('returns nothing for a material no dungeon pays', () => {
    expect(dungeonsDropping('ghost_shard', catalog)).toEqual([])
  })
})
