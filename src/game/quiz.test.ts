import { describe, expect, it } from 'vitest'

import { isCorrect, makeQuestion, QUIZ_CHOICES } from './quiz'

describe('multiplication quiz', () => {
  it('asks a valid table question whose answer is one of the choices', () => {
    for (let index = 0; index < 200; index += 1) {
      const question = makeQuestion(index)
      expect(question.answer).toBe(question.a * question.b)
      expect(question.a).toBeGreaterThanOrEqual(1)
      expect(question.b).toBeGreaterThanOrEqual(1)
      expect(question.choices).toContain(question.answer)
    }
  })

  it('offers four distinct positive choices', () => {
    for (let index = 0; index < 200; index += 1) {
      const { choices } = makeQuestion(index)
      expect(choices).toHaveLength(QUIZ_CHOICES)
      expect(new Set(choices).size).toBe(QUIZ_CHOICES)
      expect(choices.every((choice) => choice > 0)).toBe(true)
    }
  })

  it('is deterministic, and moves the correct choice around', () => {
    expect(makeQuestion(5)).toEqual(makeQuestion(5))
    const positions = new Set(
      Array.from({ length: 40 }, (_, index) => {
        const question = makeQuestion(index)
        return question.choices.indexOf(question.answer)
      }),
    )
    expect(positions.size).toBeGreaterThan(1)
  })

  it('marks only the true answer correct', () => {
    const question = makeQuestion(3)
    expect(isCorrect(question, question.answer)).toBe(true)
    const wrong = question.choices.find((choice) => choice !== question.answer)!
    expect(isCorrect(question, wrong)).toBe(false)
  })
})
