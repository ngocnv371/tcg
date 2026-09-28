/**
 * The quest battle's attack prompt: a question is the card's swing, a right answer is a hit
 * and a wrong one is a miss. For now it is the multiplication table (a kids' learning game),
 * derived purely from its index so the same question number always asks the same thing and a
 * test can pin it — swapping in another subject later means replacing `makeQuestion` alone.
 */

export type QuizQuestion = {
  a: number
  b: number
  answer: number
  /** The multiple-choice options, correct one included. */
  choices: number[]
}

export const QUIZ_MAX_FACTOR = 10
export const QUIZ_CHOICES = 4

/**
 * The multiplication question for this index (0-based, one per player turn). Factors and the
 * distractors are all functions of `index`, so there is no RNG anywhere in a battle.
 */
export function makeQuestion(
  index: number,
  maxFactor = QUIZ_MAX_FACTOR,
  choiceCount = QUIZ_CHOICES,
): QuizQuestion {
  const a = 1 + ((index * 7 + 3) % maxFactor)
  const b = 1 + ((index * 5 + 1) % maxFactor)
  const answer = a * b

  // Near-miss distractors first (off by one, off by a factor), positive and distinct.
  const candidates = [answer + a, answer - b, answer + 1, answer - 1, answer + b, answer - a]
  const choices = [answer]
  for (const candidate of candidates) {
    if (choices.length >= choiceCount) break
    if (candidate > 0 && !choices.includes(candidate)) choices.push(candidate)
  }

  // Rotate deterministically so the correct choice is not always first.
  const shift = choices.length ? index % choices.length : 0
  const rotated = [...choices.slice(shift), ...choices.slice(0, shift)]

  return { a, b, answer, choices: rotated }
}

export function isCorrect(question: QuizQuestion, choice: number): boolean {
  return choice === question.answer
}
