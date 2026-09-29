import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import { materialLabel } from '@/features/dungeons/format'
import type { VictoryPartyCard } from '@/features/dungeons/RunVictoryAnimation'
import { useParties, type PartyLoadout } from '@/features/party/api'
import { QuestBattle, type BattleResult } from '@/features/quests/QuestBattle'
import { QuestDialogue } from '@/features/quests/QuestDialogue'
import { QuestPartyPicker } from '@/features/quests/QuestPartyPicker'
import { QuestResultOverlay } from '@/features/quests/QuestResultOverlay'
import { QuestVictoryOverlay } from '@/features/quests/QuestVictoryOverlay'
import { useCompleteQuest, useQuestCompletions, useQuests, type QuestClear } from '@/features/quests/api'
import { partyMembers } from '@/features/quests/combat'
import type { Quest } from '@/types/db'

/** The journey one quest takes: context → party → fight → (win) celebration → outro → payout. */
type Phase = 'intro' | 'party' | 'battle' | 'victory' | 'outro' | 'result'

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
  const completeQuest = useCompleteQuest()

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

      <ul className="space-y-2.5">
        {(quests ?? []).map((entry) => {
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

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.enemies.map((enemy) => (
                    <span
                      key={enemy.id}
                      className="rounded-card bg-ink-850 px-2 py-0.5 text-[11px] text-ink-300"
                    >
                      <span aria-hidden>{enemy.icon}</span> {enemy.name}
                    </span>
                  ))}
                </div>

                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span className="text-gold-300">
                    💰 {entry.gold.toLocaleString('en-US')} gold
                  </span>
                  {Object.entries(entry.materials).map(([materialId, qty]) => (
                    <span key={materialId} className="text-ink-300">
                      {materialLabel(materialId)} ×{qty}
                    </span>
                  ))}
                </div>
                {!completion ? (
                  <p className="mt-1 text-[11px] text-ink-400">
                    First clear: +{entry.first_clear_gold.toLocaleString('en-US')} gold
                    {Object.entries(entry.first_clear_materials).map(([materialId, qty]) => (
                      <span key={materialId}>
                        {' '}
                        · {materialLabel(materialId)} ×{qty}
                      </span>
                    ))}
                  </p>
                ) : null}

                <button
                  type="button"
                  className="mt-3 w-full rounded-card border border-gold-600 px-3 py-2 text-xs text-gold-300 hover:border-gold-500"
                  onClick={() => begin(entry)}
                >
                  Embark
                </button>
              </Panel>
            </li>
          )
        })}
      </ul>

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
