/**
 * The contract every multi-chest reveal renders against, kept out of the variant files so one
 * variant can be swapped for another — or a new one added — without touching the others.
 */

/**
 * One revealed card. Deliberately no `wasNew`: the batch has no per-card caption (the per-copy
 * NEW/COPY badges live on the vault grid behind the overlay, straight from the DB rows).
 */
export type BatchUnlockCard = {
  cardName: string
  artPath: string | null
  rank: number
}

export type BatchUnlockProps = {
  /** Two or more reveals; a single reveal goes through `CardUnlockAnimation` instead. */
  cards: BatchUnlockCard[]
}
