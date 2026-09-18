import { Panel, Planned, Screen } from '@/components/Screen'
import { useCollection } from '@/features/cards/api'
import { useProfile } from '@/features/profile/api'
import { RANK_META, partyPower, runSlotsForLevel } from '@/game/formulas'
import type { CardRank } from '@/types/db'

export function PartyBuilderScreen() {
  const { data: collection } = useCollection()
  const { data: profile } = useProfile()
  const slots = runSlotsForLevel(profile?.player_level ?? 1)

  const previewPower = partyPower(
    (collection ?? []).slice(0, 5).map((row) => ({ rank: row.rank as CardRank, level: row.level })),
  )

  return (
    <Screen
      title="Party Builder"
      week="Built in week 5"
      hint={`${slots} concurrent runs unlocked at level ${profile?.player_level ?? 1}`}
    >
      <div className="space-y-3">
        <Panel title="Loadout preview">
          <div className="grid grid-cols-5 gap-1.5">
            {[0, 1, 2, 3, 4].map((slot) => {
              const card = collection?.[slot]
              return (
                <div
                  key={slot}
                  className="grid aspect-3/4 place-items-center rounded-[8px] border border-dashed border-ink-700 bg-ink-850 text-center text-[10px] text-ink-400"
                >
                  {card ? `${card.rank}★ L${card.level}` : '+'}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-sm text-ink-200 tabular-nums">Power ≈ {previewPower}</p>
          <p className="text-xs text-ink-600">
            Preview uses the sample statistic formula; the server's <code>party_power()</code> is authoritative.
          </p>
        </Panel>

        <Panel title="Still to build">
          <Planned
            items={[
              'Drag-and-drop 5 slots + 3 saved loadouts',
              'Synergy preview (faction / role balance)',
              'Power delta when swapping a card',
              `Level caps in play: ${[1, 2, 3, 4, 5].map((r) => RANK_META[r as CardRank].levelCap).join('/')}`,
            ]}
          />
        </Panel>
      </div>
    </Screen>
  )
}
