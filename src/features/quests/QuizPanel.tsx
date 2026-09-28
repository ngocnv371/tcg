import { useEffect, useRef, useState } from 'react'

import type { QuizQuestion } from '@/game/quiz'
import { cn } from '@/lib/utils'

/**
 * The attack prompt: a multiple-choice question is one card's swing. A right pick is a hit,
 * a wrong one a miss. The chosen button flashes before the answer is applied so the turn
 * reads even when the fight moves on immediately. Mount with a `key` per question so the
 * flash state resets between turns.
 */
export function QuizPanel({
  question,
  onAnswer,
}: {
  question: QuizQuestion
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

  return (
    <div className="mx-auto w-full max-w-md rounded-card border border-gold-600/60 bg-ink-900/95 p-3.5">
      <p className="text-center text-xs uppercase tracking-wide text-gold-300">Quick maths!</p>
      <p className="mt-1 text-center font-display text-xl text-ink-50 tabular-nums">
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
  )
}
