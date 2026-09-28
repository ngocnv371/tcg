import { describe, expect, it } from 'vitest'

import {
  answerPlayerTurn,
  attackDamage,
  autoBattle,
  isAlive,
  livingOf,
  playEnemyTurn,
  startBattle,
  type Combatant,
} from './battle'

const player = (overrides: Partial<Combatant> = {}): Combatant => ({
  id: 'hero',
  side: 'player',
  name: 'Hero',
  icon: '⚔️',
  artPath: null,
  rank: 1,
  hp: 80,
  maxHp: 80,
  atk: 20,
  def: 12,
  spd: 10,
  ...overrides,
})

const enemy = (overrides: Partial<Combatant> = {}): Combatant => ({
  id: 'wolf',
  side: 'enemy',
  name: 'Wolf',
  icon: '🐺',
  artPath: null,
  rank: 1,
  hp: 60,
  maxHp: 60,
  atk: 10,
  def: 2,
  spd: 10,
  ...overrides,
})

describe('attackDamage', () => {
  it('is ATK minus DEF, never below 1', () => {
    expect(attackDamage(20, 2)).toBe(18)
    expect(attackDamage(8, 12)).toBe(1)
    expect(attackDamage(0, 0)).toBe(1)
  })
})

describe('turn order', () => {
  it('lets a double-SPD combatant act about twice as often', () => {
    // Same sides, only SPD differs; the huge HP pool keeps both alive so we can count turns.
    let turns = startBattle(
      [player({ spd: 20, atk: 1, hp: 100_000 })],
      [enemy({ spd: 10, atk: 1, def: 1, hp: 100_000 })],
    )
    let playerTurns = 0
    let enemyTurns = 0
    for (let i = 0; i < 300 && !turns.over; i += 1) {
      const actor = turns.combatants[turns.active!]
      if (actor.side === 'player') {
        turns = answerPlayerTurn(turns, true)
        playerTurns += 1
      } else {
        turns = playEnemyTurn(turns)
        enemyTurns += 1
      }
    }
    expect(playerTurns).toBeGreaterThan(enemyTurns)
    // 20 vs 10: roughly double, allow a wide band around the 2:1 ratio.
    expect(playerTurns / enemyTurns).toBeGreaterThan(1.7)
    expect(playerTurns / enemyTurns).toBeLessThan(2.3)
  })

  it('starts with the only living combatant', () => {
    const state = startBattle([player()], [])
    expect(state.over).toBe(true)
    expect(state.won).toBe(true)
  })
})

describe('resolving a battle', () => {
  it('clears the enemy when every answer is right', () => {
    const state = autoBattle([player()], [enemy()], true)
    expect(state.won).toBe(true)
    expect(state.over).toBe(true)
    expect(state.misses).toBe(0)
    expect(livingOf(state, 'enemy')).toHaveLength(0)
  })

  it('loses when every answer is wrong — a miss never damages the enemy', () => {
    const state = autoBattle([player()], [enemy()], false)
    expect(state.won).toBe(false)
    expect(state.hits).toBe(0)
    expect(livingOf(state, 'player')).toHaveLength(0)
  })

  it('is deterministic: the same answers replay to the same outcome', () => {
    const policy = (turn: number) => turn % 3 !== 0
    const first = autoBattle([player(), player({ id: 'hero2' })], [enemy()], policy)
    const second = autoBattle([player(), player({ id: 'hero2' })], [enemy()], policy)
    expect(first.won).toBe(second.won)
    expect(first.hits).toBe(second.hits)
    expect(first.misses).toBe(second.misses)
    expect(first.events.map((event) => event.text)).toEqual(second.events.map((event) => event.text))
  })

  it('targets the front enemy first, then the next', () => {
    const state = autoBattle(
      [player()],
      [enemy({ id: 'a', hp: 18, def: 0 }), enemy({ id: 'b', hp: 18, def: 0 })],
      true,
    )
    expect(state.won).toBe(true)
    expect(state.combatants.filter((c) => c.side === 'enemy').map((c) => c.hp)).toEqual([0, 0])
  })

  it('clamps hp at 0 and does not let a wiped side act', () => {
    const state = autoBattle([player()], [enemy({ hp: 5, def: 0 })], true)
    expect(state.combatants.find((c) => c.side === 'enemy')!.hp).toBe(0)
    expect(isAlive(state.combatants.find((c) => c.side === 'enemy')!)).toBe(false)
  })
})
