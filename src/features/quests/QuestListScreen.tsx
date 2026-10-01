import { useMemo, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import { Tabs } from '@/components/Tabs'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import { RANK_BORDER } from '@/features/cards/rankFrame'
import { materialLabel } from '@/features/dungeons/format'
import type { VictoryPartyCard } from '@/features/dungeons/RunVictoryAnimation'
import { useMaterialCatalog } from '@/features/inventory/api'
import { MaterialIcon } from '@/features/inventory/MaterialIcon'
import { useParties, type PartyLoadout } from '@/features/party/api'
import { QuestBattle, type BattleResult } from '@/features/quests/QuestBattle'
import { QuestDialogue } from '@/features/quests/QuestDialogue'
import { QuestPartyPicker } from '@/features/quests/QuestPartyPicker'
import { QuestResultOverlay } from '@/features/quests/QuestResultOverlay'
import { QuestVictoryOverlay } from '@/features/quests/QuestVictoryOverlay'
import { useCompleteQuest, useQuestCompletions, useQuests, type QuestClear } from '@/features/quests/api'
import { partyMembers } from '@/features/quests/combat'
import { resolveArtSrc } from '@/lib/art'
import { cn } from '@/lib/utils'
import type { Card, Material, Quest, QuestEnemy } from '@/types/db'

/** The journey one quest takes: context → party → fight → (win) celebration → outro → payout. */
type Phase = 'intro' | 'party' | 'battle' | 'victory' | 'outro' | 'result'

/** Unfinished quests lead the screen so the next challenge is on top; clears move to their own tab. */
type QuestTab = 'new' | 'cleared'

/**
 * Quests: story encounters with a manual, turn-based fight — the hands-on counterpart to the
 * idle dungeons. This screen owns the whole flow; each phase is one overlay.
 */
export function QuestListScreen() {
  const { data: quests, error } = useQuests()
  const { data: completions } = useQuestCompletions()
  const { data: parties } = useParties()
  const { data: collection } = useCollection()
  const { data: catalog } = useCardCatalog()
  const { data: materials } = useMaterialCatalog()
  const completeQuest = useCompleteQuest()

  // An enemy wears a catalog card's art and rank, and a reward shows the material's uploaded
  // icon, so both lists resolve through a lookup rather than a restated label.
  const cardById = useMemo(() => new Map((catalog ?? []).map((card) => [card.id, card])), [catalog])
  const materialById = useMemo(
    () => new Map((materials ?? []).map((material) => [material.id, material])),
    [materials],
  )

  const [quest, setQuest] = useState<Quest | null>(null)
  const [phase, setPhase] = useState<Phase>('intro')
  const [loadout, setLoadout] = useState<PartyLoadout | null>(null)
  // Bumped to remount the battle on a retry, so it starts from a clean state.
  const [battleKey, setBattleKey] = useState(0)
  const [won, setWon] = useState(false)
  const [clear, setClear] = useState<QuestClear | null>(null)
  const [error2, setError2] = useState<string | null>(null)

  const completionByQuest = new Map((completions ?? []).map((row) => [row.quest_id, row]))
  const clearedCount = (questId: string) => completionByQuest.get(questId)

  const [params, setParams] = useSearchParams()
  const tab: QuestTab = params.get('tab') === 'cleared' ? 'cleared' : 'new'
  const selectTab = (next: QuestTab) =>
    setParams(next === 'new' ? {} : { tab: next }, { replace: true })

  const questsList = quests ?? []
  // "Next best on top": easiest recommended power first, catalog order breaking ties.
  const fresh = questsList
    .filter((entry) => !completionByQuest.has(entry.id))
    .sort((a, b) => a.req_power - b.req_power || a.sort_order - b.sort_order)
  const clearedSorted = questsList
    .filter((entry) => completionByQuest.has(entry.id))
    .sort((a, b) => a.sort_order - b.sort_order)
  const visible = tab === 'cleared' ? clearedSorted : fresh

  // The lineup the celebration animates — built from the same party the fight used.
  const victoryParty = useMemo<VictoryPartyCard[]>(() => {
    if (!loadout) return []
    return partyMembers(loadout, collection ?? [], catalog ?? []).map(({ card, playerCard }) => ({
      artPath: card.art_path,
      cardName: card.name,
      rank: playerCard.rank,
    }))
  }, [catalog, collection, loadout])

  function begin(next: Quest) {
    setQuest(next)
    setPhase('intro')
    setLoadout(null)
    setWon(false)
    setClear(null)
    setError2(null)
    setBattleKey(0)
  }

  function end() {
    setQuest(null)
    setLoadout(null)
  }

  async function handleFinish(result: BattleResult) {
    if (!quest || !loadout) return
    setWon(result.won)

    if (!result.won) {
      setPhase('result')
      return
    }

    // A win is settled with the server before the outro: the reward is server-owned, and the
    // clear is banked even if the player closes the app during the closing dialogue.
    try {
      const settled = await completeQuest.mutateAsync({
        questId: quest.id,
        partyId: loadout.party.id,
      })
      setClear(settled)
      setError2(null)
      setPhase('victory')
    } catch (mutationError) {
      setError2(mutationError instanceof Error ? mutationError.message : 'Could not save your clear.')
      setPhase('result')
    }
  }

  function retry() {
    setWon(false)
    setClear(null)
    setError2(null)
    setBattleKey((key) => key + 1)
    setPhase('battle')
  }

  return (
    <Screen title="Quests" hint="Hands-on battles — answer the times tables to land your hits.">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-ink-800 bg-ink-900/70 px-3 py-2">
        <p className="text-xs text-ink-300">Not strong enough? Train in the Dungeons.</p>
        <NavLink
          to="/dungeons"
          className="rounded-card border border-gold-600 px-3 py-1.5 text-xs text-gold-300 hover:bg-ink-850"
        >
          Dungeons
        </NavLink>
      </div>

      {error ? (
        <Panel>
          <p className="text-sm text-faction-ember">
            No database yet — run <code>npm run db:start</code> then <code>npm run db:reset</code>.
          </p>
        </Panel>
      ) : null}

      <Tabs
        ariaLabel="Quest lists"
        tabs={[
          { id: 'new', label: `New (${fresh.length})` },
          { id: 'cleared', label: `Cleared (${clearedSorted.length})` },
        ]}
        value={tab}
        onChange={selectTab}
      />

      {visible.length ? (
        <ul className="space-y-2.5">
          {visible.map((entry) => {
            const completion = clearedCount(entry.id)
            return (
              <li key={entry.id}>
                <Panel>
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-sm text-ink-100">{entry.name}</h2>
                    <span className="text-[11px] uppercase tracking-wide text-ink-400">
                      {completion ? `Cleared ×${completion.clears}` : 'New'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    Recommended power {entry.req_power.toLocaleString('en-US')}
                  </p>

                  <EnemyCardRow enemies={entry.enemies} cardById={cardById} />

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    <span className="text-gold-300">
                      💰 {entry.gold.toLocaleString('en-US')} gold
                    </span>
                    {Object.entries(entry.materials).map(([materialId, qty]) => (
                      <MaterialReward
                        key={materialId}
                        id={materialId}
                        qty={qty}
                        materialById={materialById}
                      />
                    ))}
                  </div>
                  {!completion ? (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-400">
                      <span>First clear: +{entry.first_clear_gold.toLocaleString('en-US')} gold</span>
                      {Object.entries(entry.first_clear_materials).map(([materialId, qty]) => (
                        <MaterialReward
                          key={materialId}
                          id={materialId}
                          qty={qty}
                          materialById={materialById}
                        />
                      ))}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    className="mt-3 w-full rounded-card border border-gold-600 px-3 py-2 text-xs text-gold-300 hover:border-gold-500"
                    onClick={() => begin(entry)}
                  >
                    {completion ? 'Re-run' : 'Embark'}
                  </button>
                </Panel>
              </li>
            )
          })}
        </ul>
      ) : questsList.length ? (
        <Panel>
          <p className="text-sm text-ink-400">
            {tab === 'cleared'
              ? 'No cleared quests yet — win a battle to bank it here.'
              : 'Every quest is cleared. Pick one from Cleared to run it again.'}
          </p>
        </Panel>
      ) : null}

      {quest && phase === 'intro' ? (
        <QuestDialogue title={quest.name} lines={quest.intro} onDone={() => setPhase('party')} />
      ) : null}

      {quest && phase === 'party' ? (
        <QuestPartyPicker
          quest={quest}
          parties={parties}
          collection={collection ?? []}
          catalog={catalog ?? []}
          onPick={(picked) => {
            setLoadout(picked)
            setPhase('battle')
          }}
          onClose={end}
        />
      ) : null}

      {quest && loadout && phase === 'battle' ? (
        <QuestBattle
          key={battleKey}
          quest={quest}
          members={partyMembers(loadout, collection ?? [], catalog ?? [])}
          catalog={catalog ?? []}
          onFinish={handleFinish}
          onQuit={end}
        />
      ) : null}

      {quest && phase === 'victory' && clear ? (
        <QuestVictoryOverlay
          quest={quest}
          party={victoryParty}
          partyName={loadout?.party.name ?? null}
          clear={clear}
          onClose={() => setPhase('outro')}
        />
      ) : null}

      {quest && phase === 'outro' ? (
        <QuestDialogue title={quest.name} lines={quest.outro} onDone={() => setPhase('result')} />
      ) : null}

      {quest && phase === 'result' ? (
        <QuestResultOverlay
          quest={quest}
          won={won}
          clear={clear}
          error={error2}
          onRetry={retry}
          onClose={end}
        />
      ) : null}
    </Screen>
  )
}

/**
 * The line-up a quest fields, as small card faces: one tile per distinct opponent wearing its
 * catalog card's art and rank frame — the same vocabulary as the battle board — with a ×N badge
 * when the fight lines up more than one copy. A database whose catalog has not been imported yet
 * falls back to a neutral glyph rather than a broken image.
 */
function EnemyCardRow({ enemies, cardById }: { enemies: QuestEnemy[]; cardById: Map<string, Card> }) {
  const groups = new Map<string, { name: string; count: number }>()
  for (const enemy of enemies) {
    const name = cardById.get(enemy.cardId)?.name ?? enemy.name
    const existing = groups.get(enemy.cardId)
    if (existing) existing.count += 1
    else groups.set(enemy.cardId, { name, count: 1 })
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {[...groups].map(([cardId, { name, count }]) => {
        const card = cardById.get(cardId)
        const artSrc = resolveArtSrc(card?.art_path ?? null)
        const rank = card?.rank ?? 1
        return (
          <div key={cardId} className="w-12" title={name}>
            <div
              className={cn(
                'relative aspect-[2/3] w-full overflow-hidden rounded-[8px] border-2 bg-ink-900',
                RANK_BORDER[rank],
              )}
            >
              {artSrc ? (
                <img
                  src={artSrc}
                  alt={name}
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-0 grid place-items-center text-lg text-ink-600"
                >
                  ❔
                </span>
              )}
              {count > 1 ? (
                <span className="absolute bottom-0.5 right-0.5 rounded bg-ink-950/85 px-1 text-[9px] tabular-nums text-ink-100 backdrop-blur-sm">
                  ×{count}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-center text-[9px] leading-tight text-ink-400">
              {name}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/**
 * A material reward as its uploaded icon — or the neutral crate when the catalog has no art for
 * it — beside "Name ×qty". The same `materials.icon` lookup the dungeon reward modals use, so a
 * quest payout reads like any other.
 */
function MaterialReward({
  id,
  qty,
  materialById,
}: {
  id: string
  qty: number
  materialById: Map<string, Material>
}) {
  const material = materialById.get(id)
  return (
    <span className="inline-flex items-center gap-1 text-ink-300">
      <MaterialIcon material={material} size={16} />
      <span>
        {material?.name ?? materialLabel(id)} ×{qty}
      </span>
    </span>
  )
}
