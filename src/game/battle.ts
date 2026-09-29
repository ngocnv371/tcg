/**
 * Turn-based quest combat — pure, deterministic, unit tested.
 *
 * There is deliberately NO randomness here. Turn order comes from SPD alone (a combatant
 * with double the SPD acts twice as often), and the only variable input is the player's quiz
 * answer, which decides whether an attack lands. Because nothing is rolled, the same inputs
 * always produce the same battle — which is also what lets the client animate a fight and
 * honestly report its outcome to the server.
 *
 * The client drives the state machine a turn at a time (so it can pause for a quiz); a test
 * or a preview can run it to completion with `autoBattle`.
 */

export type CombatSide = 'player' | 'enemy'

export type Combatant = {
  /** Stable key: a player copy id, or the quest's authored enemy id. */
  id: string
  side: CombatSide
  name: string
  /** Emoji avatar, used when there is no card art to show. */
  icon: string
  /** Public URL of the card art when this combatant is a catalog card that has some; else null. */
  artPath: string | null
  /** Display rank (1..5) for the board's rank frame and star. */
  rank: number
  hp: number
  maxHp: number
  atk: number
  def: number
  /** Turn-order weight. Baseline 10 (`CARD_SPEED_BASE`); 20 acts twice as often. */
  spd: number
}

/** One resolved swing. Carries the ids and damage so the view can animate it, plus a
 * human-readable line for the accessible label. */
export type BattleEvent = {
  id: number
  /** Who swung. */
  actorId: string
  /** Who took it, or null when the swing missed. */
  targetId: string | null
  tone: 'player-hit' | 'player-miss' | 'enemy-hit'
  /** Damage dealt; 0 on a miss. */
  damage: number
  text: string
}

export type BattleState = {
  combatants: Combatant[]
  /** Action points, parallel to `combatants`; a combatant acts at `SPEED_FULL`. */
  gauges: number[]
  /** Index into `combatants` whose turn is pending; null between turns or when over. */
  active: number | null
  over: boolean
  won: boolean
  hits: number
  misses: number
  events: BattleEvent[]
}

/** A combatant acts once its gauge reaches this. */
export const SPEED_FULL = 100
/** Safety valve: every SPD is positive, so a real battle never reaches this. */
export const MAX_TICKS = 20_000

/** One attack's damage: ATK minus the target's DEF, never below 1. */
export function attackDamage(atk: number, def: number): number {
  return Math.max(1, atk - def)
}

export function isAlive(combatant: Combatant): boolean {
  return combatant.hp > 0
}

function sideAlive(combatants: Combatant[], side: CombatSide): boolean {
  return combatants.some((combatant) => combatant.side === side && isAlive(combatant))
}

/** First living combatant on a side — the attack target. */
function frontOf(combatants: Combatant[], side: CombatSide): number {
  return combatants.findIndex((combatant) => combatant.side === side && isAlive(combatant))
}

function logEvent(state: BattleState, event: Omit<BattleEvent, 'id'>): BattleEvent[] {
  return [...state.events, { ...event, id: state.events.length + 1 }]
}

/**
 * Tick gauges until someone is due, then hand them the turn. Victory/defeat is checked first,
 * so a side that has been wiped never gets another swing.
 */
function advance(state: BattleState): BattleState {
  if (!sideAlive(state.combatants, 'enemy')) {
    return { ...state, active: null, over: true, won: true }
  }
  if (!sideAlive(state.combatants, 'player')) {
    return { ...state, active: null, over: true, won: false }
  }

  const gauges = [...state.gauges]
  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    for (let index = 0; index < state.combatants.length; index += 1) {
      if (isAlive(state.combatants[index])) gauges[index] += state.combatants[index].spd
    }

    // Highest gauge acts; the strict `>` tie-break keeps the earliest index, and players are
    // listed before enemies, so a tie goes to the player.
    let best = -1
    for (let index = 0; index < state.combatants.length; index += 1) {
      if (!isAlive(state.combatants[index])) continue
      if (best === -1 || gauges[index] > gauges[best]) best = index
    }
    if (best !== -1 && gauges[best] >= SPEED_FULL) {
      gauges[best] -= SPEED_FULL
      return { ...state, gauges, active: best }
    }
  }

  // Unreachable with positive SPD; treated as a draw so the caller can never hang.
  return { ...state, gauges, active: null, over: true, won: false }
}

/** Opens a battle: both sides in play, first actor already chosen. */
export function startBattle(player: Combatant[], enemy: Combatant[]): BattleState {
  const combatants = [...player, ...enemy]
  return advance({
    combatants,
    gauges: combatants.map(() => 0),
    active: null,
    over: false,
    won: false,
    hits: 0,
    misses: 0,
    events: [],
  })
}

/**
 * Resolves the current player turn with the quiz result. A correct answer strikes the front
 * enemy; a miss lets the swing go wide. Either way the turn passes.
 */
export function answerPlayerTurn(state: BattleState, correct: boolean): BattleState {
  if (state.over || state.active === null) return state
  const actor = state.combatants[state.active]
  if (actor.side !== 'player') return state

  const combatants = state.combatants.map((combatant) => ({ ...combatant }))
  let events = state.events

  if (correct) {
    const target = frontOf(combatants, 'enemy')
    if (target !== -1) {
      const damage = attackDamage(actor.atk, combatants[target].def)
      combatants[target].hp = Math.max(0, combatants[target].hp - damage)
      events = logEvent(state, {
        actorId: actor.id,
        targetId: combatants[target].id,
        tone: 'player-hit',
        damage,
        text: `${actor.name} hits ${combatants[target].name} for ${damage}`,
      })
    }
  } else {
    events = logEvent(state, {
      actorId: actor.id,
      targetId: null,
      tone: 'player-miss',
      damage: 0,
      text: `${actor.name} misses!`,
    })
  }

  return advance({
    ...state,
    combatants,
    events,
    hits: state.hits + (correct ? 1 : 0),
    misses: state.misses + (correct ? 0 : 1),
  })
}

/** Resolves the current enemy turn — enemies always land their strike. */
export function playEnemyTurn(state: BattleState): BattleState {
  if (state.over || state.active === null) return state
  const actor = state.combatants[state.active]
  if (actor.side !== 'enemy') return state

  const combatants = state.combatants.map((combatant) => ({ ...combatant }))
  let events = state.events

  const target = frontOf(combatants, 'player')
  if (target !== -1) {
    const damage = attackDamage(actor.atk, combatants[target].def)
    combatants[target].hp = Math.max(0, combatants[target].hp - damage)
    events = logEvent(state, {
      actorId: actor.id,
      targetId: combatants[target].id,
      tone: 'enemy-hit',
      damage,
      text: `${actor.name} strikes ${combatants[target].name} for ${damage}`,
    })
  }

  return advance({ ...state, combatants, events })
}

/**
 * Runs a whole battle to completion. `answer` is either a fixed correctness or a policy that
 * sees the turn number and the acting combatant — used by tests and by the party picker to
 * preview an encounter without a player.
 */
export function autoBattle(
  player: Combatant[],
  enemy: Combatant[],
  answer: boolean | ((turn: number, actor: Combatant) => boolean),
): BattleState {
  let state = startBattle(player, enemy)
  let turn = 0

  while (!state.over && state.active !== null) {
    const actor = state.combatants[state.active]
    if (actor.side === 'player') {
      const correct = typeof answer === 'boolean' ? answer : answer(turn, actor)
      state = answerPlayerTurn(state, correct)
      turn += 1
    } else {
      state = playEnemyTurn(state)
    }
  }

  return state
}

/** Living members of a side, for rendering and for the "enemy party" preview. */
export function livingOf(state: BattleState, side: CombatSide): Combatant[] {
  return state.combatants.filter((combatant) => combatant.side === side && isAlive(combatant))
}
