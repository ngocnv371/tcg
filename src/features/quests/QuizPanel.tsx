import { useEffect, useRef, useState } from 'react'

import type { Combatant } from '@/game/battle'
import type { QuizQuestion } from '@/game/quiz'
import { resolveArtSrc } from '@/lib/art'
import { cn } from '@/lib/utils'

/**
 * The attack prompt: a multiple-choice question is one card's swing. A right pick is a hit,
 * a wrong one a miss. The chosen button flashes before the answer is applied so the turn
 * reads even when the fight moves on immediately. Mount with a `key` per question so the
 * flash state resets between turns.
 */
export function QuizPanel({
  question,
  actor,
  onAnswer,
}: {
  question: QuizQuestion
  /**
   * The card whose turn it is. Persona-style, it faces the player from the panel's top-left
   * corner and poses the question — the card that swings is the card that asks.
   */
  actor: Combatant
  onAnswer: (correct: boolean) => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const onAnswerRef = useRef(onAnswer)
  useEffect(() => {
    onAnswerRef.current = onAnswer
  })

  useEffect(() => {
    if (picked === null) return
    const timer = setTimeout(() => onAnswerRef.current(picked === question.answer), 420)
    return () => clearTimeout(timer)
  }, [picked, question])

  const artSrc = resolveArtSrc(actor.artPath)

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="relative rounded-card border border-gold-600/60 bg-ink-900/70 p-3.5 shadow-2xl shadow-ink-950/60 backdrop-blur-md">
        {/* The name and line are indented past the cut-in, so the character stands in front of
            the panel without ever covering what is being said. */}
        <div className="pl-24">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[11px] uppercase tracking-wide text-gold-300">
              {actor.name}
            </span>
            <span className="shrink-0 font-display text-xs text-gold-400">{actor.rank}★</span>
          </div>
          <p className="text-[11px] text-ink-300">Answer right and I strike!</p>
        </div>

        <p className="mt-2 text-center font-display text-2xl text-ink-50 tabular-nums">
          {question.a} × {question.b} = ?
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {question.choices.map((choice) => {
            const isPicked = picked === choice
            const isAnswer = choice === question.answer
            const showState = picked !== null
            return (
              <button
                key={choice}
                type="button"
                disabled={picked !== null}
                onClick={() => setPicked(choice)}
                className={cn(
                  'rounded-card border px-3 py-2.5 text-base font-medium tabular-nums transition-colors',
                  showState && isAnswer
                    ? 'border-faction-verdant bg-faction-verdant/20 text-faction-verdant'
                    : showState && isPicked
                      ? 'border-faction-ember bg-faction-ember/20 text-faction-ember'
                      : 'border-ink-700 bg-ink-850 text-ink-100 hover:border-ink-600',
                )}
              >
                {choice}
              </button>
            )
          })}
        </div>
      </div>

      {/* The cut-in: the acting card's art pops out of the panel's top-left corner and stands
          in front of it, so the card that swings is the card that speaks. The bottom is masked
          away so the art dissolves into the panel instead of reading as a framed thumbnail.
          Decorative — the indented name on the panel is what says who is speaking. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-2 -top-24 z-10 h-32 w-24 drop-shadow-[0_8px_20px_rgba(0,0,0,0.7)]"
        style={{
          // Centred crop plus a late fade: card art puts the subject mid-frame, so an
          // `object-top` window would only surface background above the character's head.
          maskImage: 'linear-gradient(180deg, #000 68%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 68%, transparent 100%)',
        }}
      >
        {artSrc ? (
          <img src={artSrc} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-4xl text-ink-600">
            {actor.icon}
          </span>
        )}
      </div>
    </div>
  )
}
