import { describe, expect, it } from 'vitest'

import { describeChestOpenFailure } from './openError'

describe('chest open failure', () => {
  it('rewrites the catalog errors a player cannot act on, keeping the server wording', () => {
    const failure = describeChestOpenFailure(new Error('card catalog is empty'))
    expect(failure.summary).toBe('The card catalog is empty — there is nothing to reveal yet.')
    expect(failure.detail).toBe('card catalog is empty')
  })

  it('drops the chest type from the short-count message the vault already shows', () => {
    const failure = describeChestOpenFailure(new Error('not enough unopened mythic chests'))
    expect(failure.summary).toBe("You don't have that many unopened chests of that type.")
    expect(failure.detail).toBeNull()
  })

  it('passes through wording it has no rewrite for', () => {
    expect(describeChestOpenFailure(new Error('Failed to fetch'))).toEqual({
      detail: null,
      summary: 'Failed to fetch',
    })
  })

  it('reads the plain object PostgREST rejects with, not just an Error', () => {
    // `instanceof Error` is false for this shape, and stringifying it gives "[object Object]".
    const failure = describeChestOpenFailure({ code: 'P0001', message: 'not authenticated' })
    expect(failure.summary).toBe('Your session has expired — sign in again.')
    expect(failure.detail).toBe('not authenticated')
  })

  it('survives a non-Error throw and an empty message', () => {
    expect(describeChestOpenFailure('boom').summary).toBe('boom')
    expect(describeChestOpenFailure(new Error('')).summary).toBe('Something went wrong.')
    expect(describeChestOpenFailure({ code: 'PGRST301' }).summary).toBe('Something went wrong.')
    expect(describeChestOpenFailure(null).summary).toBe('Something went wrong.')
  })
})
