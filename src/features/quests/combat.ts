import type { PartyLoadout } from '@/features/party/api'
import type { Combatant } from '@/game/battle'
import { cardAtk, cardDef, cardHp } from '@/game/formulas'
import type { Card, CardRank, PlayerCard, QuestEnemy } from '@/types/db'

/** One party slot resolved to its catalog card and the owned copy that fights. */
export type PartyMember = { card: Card; playerCard: PlayerCard }

const ROLE_ICON: Record<string, string> = { tank: '🛡️', dps: '⚔️', support: '✨' }

/**
 * Resolves a party's slots into (catalog card + owned copy) pairs. A slot whose copy or
 * catalog row is missing is dropped, exactly like the dungeon party picker does.
 */
export function partyMembers(
  loadout: PartyLoadout,
  collection: PlayerCard[],
  catalog: Card[],
): PartyMember[] {
  const playerCardById = new Map(collection.map((row) => [row.id, row]))
  const cardById = new Map(catalog.map((card) => [card.id, card]))

  return loadout.slots.flatMap((slot) => {
    const playerCard = playerCardById.get(slot.player_card_id)
    const card = playerCard ? cardById.get(playerCard.card_id) : undefined
    return card && playerCard ? [{ card, playerCard }] : []
  })
}

/** Player combatants: stats from the owned copy (rank/level) plus the card's SPD, and the card's
 * own art so the board looks like the party screen. */
export function playerCombatants(members: PartyMember[]): Combatant[] {
  return members.map(({ card, playerCard }) => {
    const rank = playerCard.rank as CardRank
    const hp = cardHp(rank, playerCard.level)
    return {
      id: playerCard.id,
      side: 'player',
      name: card.name,
      icon: ROLE_ICON[card.role] ?? '⚔️',
      artPath: card.art_path,
      rank,
      hp,
      maxHp: hp,
      atk: cardAtk(rank, playerCard.level),
      def: cardDef(rank, playerCard.level),
      spd: card.speed,
    }
  })
}

/**
 * Enemy combatants. Each opponent is a catalog card for its art and name; its battle stats come
 * from the bestiary, scaled by the encounter, so a quest's difficulty is tuned independently of
 * the catalog.
 */
export function enemyCombatants(enemies: QuestEnemy[], cardById: Map<string, Card>): Combatant[] {
  return enemies.map((enemy) => {
    const card = cardById.get(enemy.cardId)
    return {
      id: enemy.id,
      side: 'enemy',
      name: card?.name ?? enemy.name,
      // An opponent is always drawn as its card, so this emoji is only the last-ditch fallback for
      // a database whose catalog has not been imported: `Combatant.icon` is not optional.
      icon: '❔',
      artPath: card?.art_path ?? null,
      rank: card?.rank ?? 1,
      hp: enemy.hp,
      maxHp: enemy.hp,
      atk: enemy.atk,
      def: enemy.def,
      spd: enemy.spd,
    }
  })
}
