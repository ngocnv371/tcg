import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { FillPlayer } from '@/components/FillPlayer'
import { RANK_BORDER, RANK_TEXT } from '@/features/cards/rankFrame'
import { AttackAnimation } from '@/features/quests/AttackAnimation'
import { BattleArena } from '@/features/quests/BattleArena'
import { CombatIntroAnimation } from '@/features/quests/CombatIntroAnimation'
import type { PartyMember } from '@/features/quests/combat'
import { enemyCombatants, playerCombatants } from '@/features/quests/combat'
import {
  ATTACK_HIT_DURATION,
  ATTACK_MISS_DURATION,
  COMBAT_INTRO_DURATION,
  COMBAT_STAGE_FPS,
} from '@/features/quests/questBattleVisuals'
import { QuizPanel } from '@/features/quests/QuizPanel'
import {
  answerPlayerTurn,
  isAlive,
  playEnemyTurn,
  startBattle,
  type BattleState,
  type Combatant,
} from '@/game/battle'
import { makeQuestion } from '@/game/quiz'
import { resolveArtSrc } from '@/lib/art'
import { cn } from '@/lib/utils'
import type { Card, Quest } from '@/types/db'

export type BattleResult = { won: boolean; hits: number; misses: number }

/** How long an enemy holds the stage before its strike lands. */
const ENEMY_THINK_MS = 520
/** Beat after the last clash frame before the overlay is torn down. */
const STRIKE_TAIL_MS = 80

/** One attack, ready to be animated: who swung, at whom, and whether it landed. */
type Strike = {
  /** The battle event id — unique per battle, so it also remounts the Player. */
  key: number
  attackerIcon: string
  attackerArtPath: string | null
  defenderIcon: string
  defenderArtPath: string | null
  side: 'player' | 'enemy'
  hit: boolean
  durationInFrames: number
}

/** Reads the swing that just resolved out of the engine's event log, as something animatable. */
function strikeFrom(next: BattleState): Strike | null {
  const event = next.events[next.events.length - 1]
  if (!event) return null
  const attacker = next.combatants.find((combatant) => combatant.id === event.actorId)
  if (!attacker) return null
  const defender = event.targetId
    ? next.combatants.find((combatant) => combatant.id === event.targetId)
    : null

  return {
    key: event.id,
    attackerIcon: attacker.icon,
    attackerArtPath: attacker.artPath,
    defenderIcon: defender?.icon ?? '❔',
    defenderArtPath: defender?.artPath ?? null,
    side: attacker.side,
    hit: event.damage > 0,
    durationInFrames: event.damage > 0 ? ATTACK_HIT_DURATION : ATTACK_MISS_DURATION,
  }
}

/**
 * One combatant, drawn as a card face (real art, rank frame, name plate) with an HP/SPD strip —
 * the same presentation as the card library and the party screen, so a battle reads as cards.
 */
function CombatantCard({ combatant, active }: { combatant: Combatant; active: boolean }) {
  const alive = isAlive(combatant)
  const artSrc = resolveArtSrc(combatant.artPath)
  const pct = Math.max(0, Math.round((combatant.hp / combatant.maxHp) * 100))
  const rank = combatant.rank

  return (
    <div className={cn('w-20', alive ? '' : 'opacity-40 grayscale')}>
      <div
        className={cn(
          // The active card wears its highlight on the frame it already has instead of a second
          // ring around it: one border, one meaning — gold is the card whose turn it is.
          'relative aspect-[2/3] w-full overflow-hidden rounded-[10px] border-2 bg-ink-900',
          active ? 'border-gold-400' : RANK_BORDER[rank],
        )}
      >
        {artSrc ? (
          <img
            src={artSrc}
            alt={combatant.name}
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center text-3xl text-ink-600"
          >
            {combatant.icon}
          </span>
        )}

        <span
          className={cn(
            'absolute right-1 top-1 rounded-md bg-ink-950/75 px-1.5 py-px font-display text-[10px] leading-tight backdrop-blur-sm',
            RANK_TEXT[rank],
          )}
        >
          {rank}★
        </span>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/75 to-transparent px-1.5 pb-1.5 pt-5">
          <p className="truncate text-[11px] leading-tight text-ink-50">{combatant.name}</p>
        </div>
      </div>

      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-faction-verdant transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-0.5 text-center text-[9px] tabular-nums text-ink-400">
        {Math.max(0, combatant.hp)}/{combatant.maxHp} · {combatant.spd} SPD
      </p>
    </div>
  )
}

/**
 * The fight itself. The state machine is `src/game/battle.ts` (deterministic, unit tested):
 * this component only drives it — a Remotion curtain introduces the enemies, a quiz is asked on
 * each player turn, an enemy turn resolves on a beat, and every attack plays a short clash
 * before the next turn. Losing is a local event: only a win reaches the server.
 */
export function QuestBattle({
  quest,
  members,
  catalog,
  onFinish,
  onQuit,
}: {
  quest: Quest
  members: PartyMember[]
  /** The card catalog, so an opponent can wear the art of the card it is. */
  catalog: Card[]
  onFinish: (result: BattleResult) => void
  onQuit: () => void
}) {
  const cardById = useMemo(() => new Map(catalog.map((card) => [card.id, card])), [catalog])
  const [state, setState] = useState<BattleState>(() =>
    startBattle(playerCombatants(members), enemyCombatants(quest.enemies, cardById)),
  )
  const [questionIndex, setQuestionIndex] = useState(0)
  const [introDone, setIntroDone] = useState(false)
  const [strike, setStrike] = useState<Strike | null>(null)
  const finished = useRef(false)
  const onFinishRef = useRef(onFinish)
  useEffect(() => {
    onFinishRef.current = onFinish
  })

  const activeActor = state.active === null ? null : state.combatants[state.active]

  // The curtain runs for a fixed 2s, or until the player taps through it.
  useEffect(() => {
    if (introDone) return
    const timer = setTimeout(
      () => setIntroDone(true),
      (COMBAT_INTRO_DURATION / COMBAT_STAGE_FPS) * 1000,
    )
    return () => clearTimeout(timer)
  }, [introDone])

  // A clash holds the turn: the next quiz (or enemy strike) waits until it has played out.
  useEffect(() => {
    if (!strike) return
    const timer = setTimeout(
      () => setStrike(null),
      (strike.durationInFrames / COMBAT_STAGE_FPS) * 1000 + STRIKE_TAIL_MS,
    )
    return () => clearTimeout(timer)
  }, [strike])

  // Enemy turns need no input, so they resolve themselves after a beat.
  useEffect(() => {
    if (!introDone || state.over || strike || activeActor?.side !== 'enemy') return
    const timer = setTimeout(() => {
      const next = playEnemyTurn(state)
      setState(next)
      setStrike(strikeFrom(next))
    }, ENEMY_THINK_MS)
    return () => clearTimeout(timer)
  }, [activeActor, introDone, state, strike])

  // Report the outcome only once the fight is over AND its final clash has finished playing.
  // The killing blow sets `over` on the same render it lands, so without the `strike` gate the
  // screen would hand over to the celebration before the winning attack could be seen.
  useEffect(() => {
    if (!state.over || strike || finished.current) return
    finished.current = true
    onFinishRef.current({ won: state.won, hits: state.hits, misses: state.misses })
  }, [state, strike])

  const question = useMemo(() => makeQuestion(questionIndex), [questionIndex])

  function answer(correct: boolean) {
    const next = answerPlayerTurn(state, correct)
    setState(next)
    setStrike(strikeFrom(next))
    setQuestionIndex((index) => index + 1)
  }

  const enemies = state.combatants.filter((combatant) => combatant.side === 'enemy')
  const players = state.combatants.filter((combatant) => combatant.side === 'player')

  return (
    // A centred phone-width stage, like every screen in the app: the arena, the board and the
    // prompt then line up at any window size instead of stretching into a letterboxed strip.
    <div className="fixed inset-0 z-40 mx-auto flex w-full max-w-md flex-col overflow-hidden border-ink-800/60 bg-ink-950 sm:border-x">
      <BattleArena />

      <header className="relative z-10 flex items-center justify-between gap-3 border-b border-ink-800/70 px-4 py-3">
        <span className="truncate text-sm text-ink-200">{quest.name}</span>
        <button
          type="button"
          onClick={onQuit}
          aria-label="Retreat"
          title="Retreat"
          className="grid size-8 place-items-center rounded-card text-ink-400 hover:bg-ink-800 hover:text-ink-100"
        >
          <X className="size-4" />
        </button>
      </header>

      {/* The board keeps the whole height: the two rows are pushed to its edges, so the empty
          middle ground is what the clash and the prompt both sit over. It scrolls if a short
          window cannot fit both rows. */}
      <div className="scrollbar-slim relative z-10 flex min-h-0 flex-1 flex-col items-center justify-between gap-3 overflow-y-auto px-4 pb-4 pt-4">
        <div className="flex shrink-0 flex-wrap justify-center gap-2">
          {enemies.map((combatant) => (
            <CombatantCard
              key={combatant.id}
              combatant={combatant}
              active={activeActor?.id === combatant.id && !strike}
            />
          ))}
        </div>

        {/* The clash composites over this empty middle ground. */}
        <div className="min-h-3 flex-1" />

        <div className="flex shrink-0 flex-wrap justify-center gap-2">
          {players.map((combatant) => (
            <CombatantCard
              key={combatant.id}
              combatant={combatant}
              active={activeActor?.id === combatant.id && !strike}
            />
          ))}
        </div>
      </div>

      {/* A centered dialog over the board's empty middle ground — never over a card row, so the
          party's HP bars stay readable while a question is up. Translucent and click-through
          apart from the prompt itself, so the arena keeps reading behind it. */}
      <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-4">
        {!introDone ? (
          <p className="text-center text-sm text-ink-400">The enemy approaches…</p>
        ) : strike ? (
          // The clash owns the stage; the verdict waits until the final blow has landed.
          <p className="animate-pulse text-center text-sm text-ink-600">…</p>
        ) : state.over ? (
          <p className="text-center font-display text-lg text-gold-300">
            {state.won ? 'Victory!' : 'Your party was defeated…'}
          </p>
        ) : activeActor?.side === 'player' ? (
          <div className="pointer-events-auto w-full max-w-md">
            {/* `activeActor` is narrowed to a player card by the branch guard above. */}
            <QuizPanel key={questionIndex} question={question} actor={activeActor} onAnswer={answer} />
          </div>
        ) : (
          <p className="animate-pulse text-center text-sm text-ink-400">
            {activeActor?.name} is attacking…
          </p>
        )}
      </div>

      {strike ? (
        // Opaque takeover: the battlefield is hidden for the beat of the attack. It covers the whole
        // viewport — the clash is a full-screen cut, never a letterboxed strip.
        <div className="pointer-events-none fixed inset-0 z-[45] bg-ink-950">
          <FillPlayer
            playerKey={strike.key}
            component={AttackAnimation}
            durationInFrames={strike.durationInFrames}
            inputProps={{
              attackerIcon: strike.attackerIcon,
              attackerArtPath: strike.attackerArtPath,
              defenderIcon: strike.defenderIcon,
              defenderArtPath: strike.defenderArtPath,
              side: strike.side,
              hit: strike.hit,
            }}
          />
        </div>
      ) : null}

      {!introDone ? (
        <div className="fixed inset-0 z-50 bg-ink-950">
          <FillPlayer
            component={CombatIntroAnimation}
            durationInFrames={COMBAT_INTRO_DURATION}
            inputProps={{ questName: quest.name, enemies, party: players }}
          />
          <button
            type="button"
            onClick={() => setIntroDone(true)}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-card border border-ink-700 bg-ink-900/80 px-4 py-2 text-xs text-ink-200"
          >
            Begin ▸
          </button>
        </div>
      ) : null}
    </div>
  )
}
