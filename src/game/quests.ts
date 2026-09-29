/**
 * Quest content: short visual-novel encounters with a manual, turn-based fight.
 *
 * This is authored content, not balance, so it lives beside the code rather than in
 * `formulas.ts` — but it is still seeded into the `quests` table by `npm run seed:build`
 * (the server is what pays a clear, so it must know the reward). The client reads the same
 * rows back, so the card preview and the payout can never disagree.
 *
 * An enemy is plain stats (`hp/atk/def/spd`) plus an emoji avatar: enemies are not cards, so
 * they have no art pipeline yet. `intro`/`outro` are the visual-novel beats shown before the
 * fight and after a win.
 */
import { tagCoreId } from './formulas.ts'

export type QuestEnemy = {
  id: string
  /**
   * The catalog card this opponent is: its art (and its display name, when the catalog has been
   * imported) come from the `cards` row, so an opponent looks exactly like a card elsewhere.
   */
  cardId: string
  /** Fallback name for a database whose catalog has not been imported yet. */
  name: string
  /** Fallback emoji avatar, used only when there is no card art to show. */
  icon: string
  /**
   * Battle stats are authored here rather than derived from the card, so a quest's difficulty is
   * tuned deliberately and does not shift when the catalog changes.
   */
  hp: number
  atk: number
  def: number
  spd: number
}

export type QuestLine = {
  speaker: string
  avatar: string
  text: string
}

export type Quest = {
  id: string
  name: string
  /** Display order (also `quests.sort_order`). */
  order: number
  /** Advisory only: what the card shows as "recommended power". Not enforced by the server. */
  reqPower: number
  enemies: QuestEnemy[]
  /** Repeating reward, paid on every clear. */
  gold: number
  materials: Record<string, number>
  /** One-time bonus, paid only on the first clear. */
  firstClearGold: number
  firstClearMaterials: Record<string, number>
  intro: QuestLine[]
  outro: QuestLine[]
}

export const QUESTS: Quest[] = [
  {
    id: 'the_kidnapped_chicken',
    name: 'The Kidnapped Chicken',
    order: 1,
    reqPower: 80,
    enemies: [
      { id: 'scruffy_wolf', cardId: 'thunder-wolf', name: 'Scruffy Wolf', icon: '🐺', hp: 60, atk: 10, def: 2, spd: 12 },
    ],
    gold: 250,
    materials: { [tagCoreId('physical', 'lesser')]: 1 },
    firstClearGold: 150,
    firstClearMaterials: { [tagCoreId('earth', 'lesser')]: 1 },
    intro: [
      { speaker: 'Pip the Farmer', avatar: '🧑‍🌾', text: 'Oh no, a wolf has kidnapped my pet chicken!' },
      { speaker: 'Pip the Farmer', avatar: '🧑‍🌾', text: 'Please — face it in battle and bring her home!' },
    ],
    outro: [
      { speaker: 'Pip the Farmer', avatar: '🧑‍🌾', text: 'You did it! Cluckers is safe and sound. Thank you!' },
    ],
  },
  {
    id: 'mushroom_menace',
    name: 'Mushroom Menace',
    order: 2,
    reqPower: 150,
    enemies: [
      { id: 'spore_cap', cardId: 'mushroom-back-turtle', name: 'Spore Cap', icon: '🍄', hp: 45, atk: 12, def: 4, spd: 8 },
      { id: 'razor_vine', cardId: 'razor-leaf', name: 'Razor Vine', icon: '🌿', hp: 45, atk: 12, def: 4, spd: 8 },
    ],
    gold: 400,
    materials: { [tagCoreId('grass', 'lesser')]: 2 },
    firstClearGold: 200,
    firstClearMaterials: { [tagCoreId('grass', 'greater')]: 1 },
    intro: [
      { speaker: 'Grimble the Guide', avatar: '🧙', text: 'The old cellar has been overgrown for years — mushrooms and worse.' },
      { speaker: 'Grimble the Guide', avatar: '🧙', text: 'Two of them guard the grain. Clear them out — carefully!' },
    ],
    outro: [
      { speaker: 'Grimble the Guide', avatar: '🧙', text: 'Not a single spore left. The harvest is saved!' },
    ],
  },
  {
    id: 'bandits_at_the_bridge',
    name: 'Brutes at the Bridge',
    order: 3,
    reqPower: 240,
    enemies: [
      { id: 'bridge_troll', cardId: 'rock-troll', name: 'Bridge Troll', icon: '🧌', hp: 50, atk: 14, def: 5, spd: 14 },
      { id: 'brawler', cardId: 'knuckle-monkey', name: 'Brawler', icon: '🐒', hp: 50, atk: 14, def: 5, spd: 14 },
      { id: 'gnawer', cardId: 'horned-beaver', name: 'Gnawer', icon: '🦫', hp: 50, atk: 14, def: 5, spd: 14 },
    ],
    gold: 700,
    materials: { [tagCoreId('dark', 'lesser')]: 2 },
    firstClearGold: 300,
    firstClearMaterials: { [tagCoreId('dark', 'greater')]: 1 },
    intro: [
      { speaker: 'Captain Rook', avatar: '🛡️', text: 'A troll and its cronies have barred the only bridge out of the valley.' },
      { speaker: 'Captain Rook', avatar: '🛡️', text: 'Three of them. Scatter them and the road is ours again.' },
    ],
    outro: [
      { speaker: 'Captain Rook', avatar: '🛡️', text: 'The bridge is open. The valley owes you a debt, champion.' },
    ],
  },
]
