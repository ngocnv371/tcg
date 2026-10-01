# Runewatch — Quest Chain: *The Long Dark*

Design reference for the 100-quest story chain that replaces the current three starter quests
(`src/game/quests.ts`). It runs from **gathering mushrooms in a cave** (quest 1) to the
**Dark Lord's inner chamber** (quest 100), in ten acts of ten.

> **Status: extracted and scripted, importable.** `npm run quests:1:extract` writes this chain's two files from
> this document — `data/the-long-dark.quests.json` (the encounters) and
> `data/the-long-dark.enemies.csv` (its monsters), the second carrying **the exact hp/atk/def/spd
> written below**. `quests.test.ts` checks both against `data/quest-chain.schema.json` and loads them
> through `src/game/quests.ts`. `npm run quests:2:import` scans `data/` for `*.quests.json` and upserts
> them into `public.quests`; it skips any quest with an empty `intro`/`outro`, and every quest here is
> scripted now, so the whole chain imports. The scripts live in the JSON, not in this doc, and the
> extractor carries them across by quest id — so re-running it (which rewrites the encounters from
> here) never wipes the dialogue. (`data/quest-chain.json` + `data/enemies.csv`, the three starter
> quests and their six opponents, predate the `*.quests.json` convention and are not picked up.) This
> document is where the chain is *designed* — acts, hook lines, rosters, formulas — and for the stat
> lines below it is also the source: the extractor copies them, it does not re-derive them.

## Ground rules this chain obeys

- **Rewards are Cores only.** Every material id must come from `allCoreIds()` in `src/game/formulas.ts`
  (`tagCoreId(tag, variant)`), because `quests.test.ts` asserts it and the rank-up economy is built on Cores.
- **Enemies are catalog cards.** Each enemy's `id` is a card id and its art is its own (produced from the
  lore), so the creature can later be acquired as a card — but no enemy *borrows* an existing card's art.
  The encounter's `hp/atk/def/spd` stay authored here, so difficulty is tuned deliberately and never
  drifts when the catalog changes.
- **1–5 enemies per quest**, unique enemy ids within a quest, `hp > 0`, `atk > 0`, `def >= 0`, `spd > 0`
  (all asserted by `quests.test.ts`).
- **Every quest needs non-empty `intro` and `outro`** (`QuestLine[]`). The `Hook` line below is the
  intended intro seed; the outro should close that beat. Boss quests (every 10th) and their kin deserve
  a two- or three-line script. (The scripts themselves are authored in
  `data/the-long-dark.quests.json`, not in this document — the extractor carries them across.)
- **Ids are slugs** of the quest name (e.g. `mushroom_picking`) and must be stable — `quest_completions`
  references them.

## Numbers are provisional

`AGENTS.md` lists *the balance pass* as next up, so treat every stat and reward below as a first draft
shaped by a formula, not a tuned value. The formulas used to seed this table:

| Value | Formula | Notes |
| --- | --- | --- |
| Recommended power | `round5(80 * n^1.4)` | Advisory only; the server never gates a clear on it. |
| Gold (per clear) | `round10(150 * n^1.25)` | Roughly doubles every ~3 acts. |
| Core quantity | `1 + floor((n-1)/25)` | 1 → 4 across the chain, so later tiers drop more of the same grade. |
| Core grade | by act | I–II lesser, III–V greater, VI–VII mythic, VIII–X legendary. |
| Enemy HP | `round(P * 0.6 * w / Σw)`, elites `w = 1.8` | `P` = recommended power. |
| Enemy ATK / DEF | `round(P * 0.055)` / `round(P * 0.02)`; elites ×1.25 / ×1.3 | |
| Enemy SPD | `7 + hash(name) % 10` | Deterministic, so turn order is stable across builds. |
| First-clear gold | `round10(gold × 1.25)`, bosses ×1.5 | One-time, un-farmable (`first_cleared_at`). |
| First-clear Core | next grade up, ×1 (bosses ×2) | Points you at the grade the *following* tier needs. |

## Grade → Core mapping

| Act band | Core grade | Rank step it feeds |
| --- | --- | --- |
| I–II | Lesser | 1 → 2★ |
| III–V | Greater | 2 → 3★ |
| VI–VII | Mythic | 3 → 4★ |
| VIII–X | Legendary | 4 → 5★ |

## Acts at a glance

| Act | Name | Quests | Element tags | Core grade |
| --- | --- | --- | --- | --- |
| I | Roots and Rot | 1–10 | Grass, Earth | Lesser |
| II | The Overgrown Wilds | 11–20 | Grass, Dark | Lesser |
| III | The Sunken Coast | 21–30 | Water, Grass | Greater |
| IV | The Frozen Reaches | 31–40 | Ice | Greater |
| V | The Emberwilds | 41–50 | Fire, Earth | Mythic |
| VI | The Storm Peaks | 51–60 | Electric | Mythic |
| VII | The Underearth | 61–70 | Earth | Mythic |
| VIII | The Shadowed Marches | 71–80 | Dark | Legendary |
| IX | The Dragon's Spine | 81–90 | Dragon, Fire | Legendary |
| X | The Dark Lord's Citadel | 91–100 | Dark, Dragon | Legendary |

## Master index

| # | Quest | Act | Power | Enemies | Gold |
| --- | --- | --- | --- | --- | --- |
| 1 | Mushroom Picking | I. Roots and Rot | 80 | 2 | 150 |
| 2 | The Whispering Shaft | I. Roots and Rot | 210 | 2 | 360 |
| 3 | Gloomcap Hollow | I. Roots and Rot | 370 | 2 | 590 |
| 4 | The Mycelium Warren | I. Roots and Rot | 555 | 3 | 850 |
| 5 | The Capfather | I. Roots and Rot | 760 | 3 | 1,120 |
| 6 | Down the Rootwell | I. Roots and Rot | 985 | 2 | 1,410 |
| 7 | The Blindstream | I. Roots and Rot | 1,220 | 3 | 1,710 |
| 8 | Lantern Moss Grotto | I. Roots and Rot | 1,470 | 3 | 2,020 |
| 9 | The Fungal Throne | I. Roots and Rot | 1,735 | 3 | 2,340 |
| 10 | Mycelarch, the Rot Beneath | I. Roots and Rot | 2,010 | 4 | 2,670 |
| 11 | The Bramblegate | II. The Overgrown Wilds | 2,295 | 2 | 3,000 |
| 12 | Wolf of the Green Trail | II. The Overgrown Wilds | 2,595 | 2 | 3,350 |
| 13 | The Thornsinger's Grove | II. The Overgrown Wilds | 2,900 | 3 | 3,700 |
| 14 | Hornets of the High Meadow | II. The Overgrown Wilds | 3,220 | 2 | 4,060 |
| 15 | The Thicket Tyrant | II. The Overgrown Wilds | 3,545 | 3 | 4,430 |
| 16 | The Petrified Orchard | II. The Overgrown Wilds | 3,880 | 2 | 4,800 |
| 17 | Grove of the Hollow Stag | II. The Overgrown Wilds | 4,225 | 3 | 5,180 |
| 18 | The Antlered King's Hunt | II. The Overgrown Wilds | 4,575 | 3 | 5,560 |
| 19 | The Withering Bloom | II. The Overgrown Wilds | 4,935 | 3 | 5,950 |
| 20 | The Verdant Sovereign | II. The Overgrown Wilds | 5,305 | 5 | 6,340 |
| 21 | The Drowned Causeway | III. The Sunken Coast | 5,680 | 2 | 6,740 |
| 22 | Saltmarsh Stalker | III. The Sunken Coast | 6,060 | 2 | 7,150 |
| 23 | The Gilded Reef | III. The Sunken Coast | 6,450 | 3 | 7,560 |
| 24 | Tidehollow Grotto | III. The Sunken Coast | 6,845 | 2 | 7,970 |
| 25 | The Keeper of the Kelp | III. The Sunken Coast | 7,250 | 3 | 8,390 |
| 26 | The Sinking Village | III. The Sunken Coast | 7,655 | 3 | 8,810 |
| 27 | Blackwater Fen | III. The Sunken Coast | 8,070 | 3 | 9,230 |
| 28 | The Lure-Lights | III. The Sunken Coast | 8,495 | 3 | 9,660 |
| 29 | The Sunken Chapel | III. The Sunken Coast | 8,920 | 4 | 10,090 |
| 30 | The Leviathan of the Deep | III. The Sunken Coast | 9,355 | 5 | 10,530 |
| 31 | The Frostgate | IV. The Frozen Reaches | 9,795 | 2 | 10,970 |
| 32 | Whiteout Pass | IV. The Frozen Reaches | 10,240 | 2 | 11,420 |
| 33 | The Frozen Lake | IV. The Frozen Reaches | 10,690 | 3 | 11,860 |
| 34 | Rime Hollow | IV. The Frozen Reaches | 11,145 | 2 | 12,320 |
| 35 | The Ice-Warden | IV. The Frozen Reaches | 11,610 | 3 | 12,770 |
| 36 | The Glasswood | IV. The Frozen Reaches | 12,075 | 3 | 13,230 |
| 37 | The Howling Glacier | IV. The Frozen Reaches | 12,550 | 3 | 13,690 |
| 38 | The Cave of Frozen Birds | IV. The Frozen Reaches | 13,025 | 4 | 14,150 |
| 39 | The Wintering Court | IV. The Frozen Reaches | 13,510 | 3 | 14,620 |
| 40 | The Hoarfrost Queen | IV. The Frozen Reaches | 13,995 | 5 | 15,090 |
| 41 | Ashfall Field | V. The Emberwilds | 14,485 | 2 | 15,560 |
| 42 | The Cinder Wood | V. The Emberwilds | 14,985 | 3 | 16,040 |
| 43 | Magma Shallows | V. The Emberwilds | 15,485 | 3 | 16,520 |
| 44 | The Boiling Spring | V. The Emberwilds | 15,995 | 2 | 17,000 |
| 45 | The Forgebeast | V. The Emberwilds | 16,505 | 3 | 17,480 |
| 46 | The Obsidian Stair | V. The Emberwilds | 17,020 | 3 | 17,970 |
| 47 | The Ember Monkeys | V. The Emberwilds | 17,540 | 3 | 18,460 |
| 48 | The Cinder Carnival | V. The Emberwilds | 18,065 | 3 | 18,950 |
| 49 | The Caldera Rim | V. The Emberwilds | 18,595 | 3 | 19,450 |
| 50 | Pyroclast, the Mountain's Heart | V. The Emberwilds | 19,125 | 5 | 19,940 |
| 51 | Thunderclap Ridge | VI. The Storm Peaks | 19,665 | 2 | 20,440 |
| 52 | The Static Meadow | VI. The Storm Peaks | 20,205 | 3 | 20,950 |
| 53 | Voltstag's Herd | VI. The Storm Peaks | 20,755 | 3 | 21,450 |
| 54 | The Charged Chasm | VI. The Storm Peaks | 21,305 | 3 | 21,960 |
| 55 | The Stormherd Alpha | VI. The Storm Peaks | 21,855 | 3 | 22,470 |
| 56 | The Lightning Stair | VI. The Storm Peaks | 22,415 | 3 | 22,980 |
| 57 | The Besieged Beacon Tower | VI. The Storm Peaks | 22,980 | 4 | 23,490 |
| 58 | The Copper Aviary | VI. The Storm Peaks | 23,545 | 3 | 24,010 |
| 59 | The Conduit Spire | VI. The Storm Peaks | 24,115 | 4 | 24,530 |
| 60 | Skybreaker, the Storm's Crown | VI. The Storm Peaks | 24,690 | 5 | 25,050 |
| 61 | The Quarry Gate | VII. The Underearth | 25,265 | 2 | 25,570 |
| 62 | The Stonefall Gallery | VII. The Underearth | 25,850 | 3 | 26,100 |
| 63 | The Boulder Run | VII. The Underearth | 26,435 | 2 | 26,620 |
| 64 | The Termite Halls | VII. The Underearth | 27,025 | 3 | 27,150 |
| 65 | The Quarry Tyrant | VII. The Underearth | 27,615 | 3 | 27,680 |
| 66 | The Undergate Foundry | VII. The Underearth | 28,215 | 3 | 28,220 |
| 67 | The Court of Standing Stones | VII. The Underearth | 28,815 | 3 | 28,750 |
| 68 | The Grinding Deep | VII. The Underearth | 29,415 | 3 | 29,290 |
| 69 | The Earthheart Vault | VII. The Underearth | 30,025 | 3 | 29,830 |
| 70 | Terravore, the Root of Mountains | VII. The Underearth | 30,635 | 5 | 30,370 |
| 71 | The Grave Road | VIII. The Shadowed Marches | 31,250 | 2 | 30,910 |
| 72 | The Mist of the Marches | VIII. The Shadowed Marches | 31,870 | 2 | 31,460 |
| 73 | The Gallows Orchard | VIII. The Shadowed Marches | 32,490 | 3 | 32,010 |
| 74 | The Crypt of Candles | VIII. The Shadowed Marches | 33,115 | 3 | 32,560 |
| 75 | The Pale Rider | VIII. The Shadowed Marches | 33,740 | 3 | 33,110 |
| 76 | The Legion of the Hollow Choir | VIII. The Shadowed Marches | 34,375 | 3 | 33,660 |
| 77 | The Widow's Court | VIII. The Shadowed Marches | 35,010 | 4 | 34,210 |
| 78 | The Hunger Below | VIII. The Shadowed Marches | 35,645 | 3 | 34,770 |
| 79 | The Black Cathedral | VIII. The Shadowed Marches | 36,290 | 4 | 35,330 |
| 80 | Umbragore, the Shadow Sovereign | VIII. The Shadowed Marches | 36,935 | 5 | 35,890 |
| 81 | The Spine Road | IX. The Dragon's Spine | 37,580 | 2 | 36,450 |
| 82 | Scales on the Ridge | IX. The Dragon's Spine | 38,230 | 2 | 37,010 |
| 83 | The Hoard of Names | IX. The Dragon's Spine | 38,885 | 3 | 37,580 |
| 84 | The Wyrmsblood Fen | IX. The Dragon's Spine | 39,545 | 3 | 38,150 |
| 85 | The Wyrmling Broodmother | IX. The Dragon's Spine | 40,205 | 3 | 38,710 |
| 86 | The Cradle of Coils | IX. The Dragon's Spine | 40,870 | 3 | 39,280 |
| 87 | The Broken Sky Temple | IX. The Dragon's Spine | 41,535 | 4 | 39,860 |
| 88 | The Elder Wyrm's Court | IX. The Dragon's Spine | 42,205 | 3 | 40,430 |
| 89 | The Last Egg | IX. The Dragon's Spine | 42,880 | 4 | 41,000 |
| 90 | Voragrim, the Dragon's Spine | IX. The Dragon's Spine | 43,555 | 5 | 41,580 |
| 91 | The Citadel Gates | X. The Dark Lord's Citadel | 44,235 | 3 | 42,160 |
| 92 | The Ash Courtyard | X. The Dark Lord's Citadel | 44,915 | 3 | 42,740 |
| 93 | The Hall of Broken Oaths | X. The Dark Lord's Citadel | 45,600 | 3 | 43,320 |
| 94 | The Screaming Gallery | X. The Dark Lord's Citadel | 46,290 | 4 | 43,900 |
| 95 | The Warden of Nine Locks | X. The Dark Lord's Citadel | 46,980 | 3 | 44,490 |
| 96 | The Throne Antechamber | X. The Dark Lord's Citadel | 47,675 | 4 | 45,070 |
| 97 | The Court of Masks | X. The Dark Lord's Citadel | 48,370 | 4 | 45,660 |
| 98 | The Hollow Chancellor | X. The Dark Lord's Citadel | 49,070 | 4 | 46,250 |
| 99 | The Dark Lord's Shadow | X. The Dark Lord's Citadel | 49,770 | 5 | 46,840 |
| 100 | The Dark Lord's Inner Chamber | X. The Dark Lord's Citadel | 50,475 | 5 | 47,430 |

---

## Act I — Roots and Rot

*Element tags: Grass / Earth · Core grade: Lesser · Quests 1–10*

The caves under the village are full of edible mushrooms, and that is where our story begins: a foraging trip that goes one tunnel too deep. Something in the hill has been growing for a long time, and it has opinions about being harvested.

### 1. Mushroom Picking

- **id:** `mushroom_picking` · **power:** 80
- **Hook (intro seed):** Gather a basket of mushrooms from the cave mouth before supper. What could possibly go wrong?
- **Enemies:**
  - **Sporeling** `sporeling` — hp 24 / atk 4 / def 2 / spd 14
    - *A mushroom-capped crawler that puffs sleepy spores when startled; the villagers call them harmless, which is exactly how the trouble starts.*
  - **Cave Roach** `cave_roach` — hp 24 / atk 4 / def 2 / spd 15
    - *A boot-sized scavenger bold enough to steal mushrooms straight out of your basket and stare you down while it chews.*
- **Reward (per clear):** 150 gold · Lesser Grass Core ×1
- **First clear:** +190 gold · Greater Grass Core ×1

### 2. The Whispering Shaft

- **id:** `the_whispering_shaft` · **power:** 210
- **Hook (intro seed):** The shaft exhales a sound like whispered names. You go down to find out whose.
- **Enemies:**
  - **Whisper Bat** `whisper_bat` — hp 63 / atk 12 / def 4 / spd 16
    - *A leathery flier that repeats the last voice it heard, luring the curious deeper with words that were never its own.*
  - **Dust Skitter** `dust_skitter` — hp 63 / atk 12 / def 4 / spd 7
    - *A ball of grit and legs that rolls down the tunnel walls and uncurls only to bite.*
- **Reward (per clear):** 360 gold · Lesser Grass Core ×1
- **First clear:** +450 gold · Greater Grass Core ×1

### 3. Gloomcap Hollow

- **id:** `gloomcap_hollow` · **power:** 370
- **Hook (intro seed):** Where the light fails, the mushrooms glow — and so do the eyes watching them.
- **Enemies:**
  - **Gloomcap Sentinel** `gloomcap_sentinel` — hp 111 / atk 20 / def 7 / spd 11
    - *A bulbous guardian rooted at the hollow's mouth, its cap a lantern of sickly light that dims the instant before it strikes.*
  - **Pale Grub** `pale_grub` — hp 111 / atk 20 / def 7 / spd 15
    - *A blind, fat larva that chews through stone and the roots that hold it, leaving tunnels that collapse behind it.*
- **Reward (per clear):** 590 gold · Lesser Grass Core ×1
- **First clear:** +740 gold · Greater Grass Core ×1

### 4. The Mycelium Warren

- **id:** `the_mycelium_warren` · **power:** 555
- **Hook (intro seed):** The tunnel walls are threaded with white filaments — and the filaments are listening.
- **Enemies:**
  - **Mycelium Weaver** `mycelium_weaver` — hp 111 / atk 31 / def 11 / spd 14
    - *A pale horror that spins its webs from living fungus, stringing the warren with strands that drink the warmth from anything they touch.*
  - **Spore Spitter** `spore_spitter` — hp 111 / atk 31 / def 11 / spd 7
    - *A stalk that bends like a bow and looses bursts of choking spores at anything that moves.*
  - **Rotling** `rotling` — hp 111 / atk 31 / def 11 / spd 12
    - *A reeking little beast grown entirely out of the warren's rot, quick, hungry, and always in threes.*
- **Reward (per clear):** 850 gold · Lesser Grass Core ×1
- **First clear:** +1,060 gold · Greater Grass Core ×1

### 5. The Capfather

- **id:** `the_capfather` · **power:** 760
- **Hook (intro seed):** Something enormous stirs where the warren turns deepest. The mushrooms were only its fingers.
- **Enemies:**
  - **Capfather** `capfather` *(elite)* — hp 216 / atk 52 / def 20 / spd 7
    - *The warren's ancient heart: a mushroom the size of a barn that walks on roots like legs and calls its children with a hum you feel in your teeth.*
  - 2x **Rootling** `rootling` — hp 120 / atk 42 / def 15 / spd 8
    - *A sprout of the Capfather, half his size and twice as eager.*
- **Reward (per clear):** 1,120 gold · Lesser Grass Core ×1
- **First clear:** +1,400 gold · Greater Grass Core ×1

### 6. Down the Rootwell

- **id:** `down_the_rootwell` · **power:** 985
- **Hook (intro seed):** The cave's roots drop away into black water. You climb down anyway.
- **Enemies:**
  - **Root Gnawer** `root_gnawer` — hp 296 / atk 54 / def 20 / spd 11
    - *A dog-sized rodent that files its teeth on living roots and is furious at anything that interrupts the meal.*
  - **Blind Mole** `blind_mole` — hp 296 / atk 54 / def 20 / spd 15
    - *A furred boulder of a burrower that navigates entirely by sound and hates every noise you make.*
- **Reward (per clear):** 1,410 gold · Lesser Grass Core ×1
- **First clear:** +1,760 gold · Greater Grass Core ×1

### 7. The Blindstream

- **id:** `the_blindstream` · **power:** 1,220
- **Hook (intro seed):** A river runs under the hill, and it runs the wrong way.
- **Enemies:**
  - **Pale Crawfish** `pale_crawfish` — hp 244 / atk 67 / def 24 / spd 8
    - *A blind freshwater hunter with a spear for a snout, patrolling water it has never once seen.*
  - **Silt Crawler** `silt_crawler` — hp 244 / atk 67 / def 24 / spd 11
    - *A shelled bottom-feeder that rises in clouds of silt to swallow whatever sinks.*
  - **Drownmoss** `drownmoss` — hp 244 / atk 67 / def 24 / spd 9
    - *A drifting mat of weed that wraps an ankle and pulls, patiently, toward the deep.*
- **Reward (per clear):** 1,710 gold · Lesser Grass Core ×1
- **First clear:** +2,140 gold · Greater Grass Core ×1

### 8. Lantern Moss Grotto

- **id:** `lantern_moss_grotto` · **power:** 1,470
- **Hook (intro seed):** The grotto glows with fireflies that should not exist this far underground.
- **Enemies:**
  - **Cinderlantern Swarm** `cinderlantern_swarm` — hp 294 / atk 81 / def 29 / spd 14
    - *Grotto fireflies burning far too hot, their light a lure and their touch a brand.*
  - **Moss Lantern** `moss_lantern` — hp 294 / atk 81 / def 29 / spd 11
    - *A single firefly grown vast and slow, its abdomen a lantern that never dims and never cools.*
  - **Grotto Crawler** `grotto_crawler` — hp 294 / atk 81 / def 29 / spd 8
    - *A long-legged hunter that skates across the water's surface, drawn to the light like everything else down here.*
- **Reward (per clear):** 2,020 gold · Lesser Grass Core ×1
- **First clear:** +2,530 gold · Greater Grass Core ×1

### 9. The Fungal Throne

- **id:** `the_fungal_throne` · **power:** 1,735
- **Hook (intro seed):** The warren widens into a hall, and at its end sits a throne that was grown, not built.
- **Enemies:**
  - **Sporeguard** `sporeguard` — hp 347 / atk 95 / def 35 / spd 9
    - *Two-meter caps that march in step, their spores laying down a wall of choking dust ahead of them.*
  - **Cap Knight** `cap_knight` — hp 347 / atk 95 / def 35 / spd 8
    - *A serpent armored in bark and fungus that guarded the throne's steps once and never left.*
  - **Mycelium Priest** `mycelium_priest` — hp 347 / atk 95 / def 35 / spd 7
    - *A pale minister of the rot that sings to the warren and answers your blows with a chorus of spores.*
- **Reward (per clear):** 2,340 gold · Lesser Grass Core ×1
- **First clear:** +2,930 gold · Greater Grass Core ×1

### 10. Mycelarch, the Rot Beneath

- **id:** `mycelarch_the_rot_beneath` · **power:** 2,010 · **act boss**
- **Hook (intro seed):** The throne is occupied. The thing on it has been waiting for someone to reach it.
- **Enemies:**
  - **Mycelarch** `mycelarch` *(elite)* — hp 452 / atk 138 / def 52 / spd 7
    - *The mother of every mushroom in the hill, a vast pale crown of a creature that speaks through its children's minds and has already decided what you will become.*
  - 2x **Spore Sentinel** `spore_sentinel` — hp 251 / atk 111 / def 40 / spd 9
    - *A bodyguard woven from the Mycelarch's own threads.*
  - **Rot Herald** `rot_herald` — hp 251 / atk 111 / def 40 / spd 10
    - *The throne's speaker, whose hiss carries the Mycelarch's will down the hall.*
- **Reward (per clear):** 2,670 gold · Lesser Grass Core ×1 · Lesser Earth Core ×1
- **First clear:** +4,010 gold · Greater Grass Core ×2 · Greater Earth Core ×1

---

## Act II — The Overgrown Wilds

*Element tags: Grass / Dark · Core grade: Lesser · Quests 11–20*

Above the caves, the surface is wrong: the valley has grown over the roads in a single season, and the green has a will of its own. To leave the valley you have to cut through it, and the wilds have a sovereign who would rather you stayed as fertilizer.

### 11. The Bramblegate

- **id:** `the_bramblegate` · **power:** 2,295
- **Hook (intro seed):** The road out of the valley is a wall of thorns now, and the thorns are moving.
- **Enemies:**
  - **Bramble Hound** `bramble_hound` — hp 689 / atk 126 / def 46 / spd 12
    - *A lean hunter grown from hedge and hunger, its bark-plated hide cracking as it runs.*
  - **Thornling** `thornling` — hp 689 / atk 126 / def 46 / spd 16
    - *A fistful of briars that walks, pricking anything that comes near.*
- **Reward (per clear):** 3,000 gold · Lesser Grass Core ×1
- **First clear:** +3,750 gold · Greater Grass Core ×1

### 12. Wolf of the Green Trail

- **id:** `wolf_of_the_green_trail` · **power:** 2,595
- **Hook (intro seed):** Something has been eating the woodcutters' dogs, and it is not a dog.
- **Enemies:**
  - **Greenpelt Wolf** `greenpelt_wolf` — hp 779 / atk 143 / def 52 / spd 11
    - *A wolf so overgrown with moss it looks like a moving hill, swift despite all that green weight.*
  - **Yearling** `yearling` — hp 779 / atk 143 / def 52 / spd 14
    - *The pack's runt, quick and quiet and always the first to circle behind you.*
- **Reward (per clear):** 3,350 gold · Lesser Grass Core ×1
- **First clear:** +4,190 gold · Greater Grass Core ×1

### 13. The Thornsinger's Grove

- **id:** `the_thornsingers_grove` · **power:** 2,900
- **Hook (intro seed):** The grove hums, and every branch leans toward you like an ear.
- **Enemies:**
  - **Thornsinger** `thornsinger` — hp 580 / atk 160 / def 58 / spd 8
    - *A serpent whose scales are living bark; when it sings, the whole grove forgets which way is out.*
  - **Chorus Vine** `chorus_vine` — hp 580 / atk 160 / def 58 / spd 9
    - *A vine that answers the Thornsinger in a whisper of leaves and tightens when you answer back.*
  - **Grove Stalker** `grove_stalker` — hp 580 / atk 160 / def 58 / spd 10
    - *A deer that walks in the singer's shadow, patient until it is not.*
- **Reward (per clear):** 3,700 gold · Lesser Grass Core ×1
- **First clear:** +4,630 gold · Greater Grass Core ×1

### 14. Hornets of the High Meadow

- **id:** `hornets_of_the_high_meadow` · **power:** 3,220
- **Hook (intro seed):** The meadow's hornets have grown, and they have started keeping prisoners.
- **Enemies:**
  - **Meadow Hornet** `meadow_hornet` — hp 966 / atk 177 / def 64 / spd 8
    - *An armored wasp the length of your arm, its blade grown long and its temper longer.*
  - **Paper Warden** `paper_warden` — hp 966 / atk 177 / def 64 / spd 12
    - *A hornet that never leaves the nest, patient as a held breath and just as sudden.*
- **Reward (per clear):** 4,060 gold · Lesser Grass Core ×1
- **First clear:** +5,080 gold · Greater Grass Core ×1

### 15. The Thicket Tyrant

- **id:** `the_thicket_tyrant` · **power:** 3,545
- **Hook (intro seed):** The thicket has a master. You can hear it breathing from the road.
- **Enemies:**
  - **Thicket Tyrant** `thicket_tyrant` *(elite)* — hp 1008 / atk 244 / def 92 / spd 7
    - *A boar gone feral and green, its tusks wound through with thorn-vines, charging down anything that crosses its clearing.*
  - 2x **Thorn Guard** `thorn_guard` — hp 560 / atk 195 / def 71 / spd 16
    - *A brute of the thicket that fights on its knuckles and settles every argument with the nearest tree.*
- **Reward (per clear):** 4,430 gold · Lesser Grass Core ×1
- **First clear:** +5,540 gold · Greater Grass Core ×1

### 16. The Petrified Orchard

- **id:** `the_petrified_orchard` · **power:** 3,880
- **Hook (intro seed):** The orchard's trees turned to stone overnight. One thing in it didn't.
- **Enemies:**
  - **Orchard Sentinel** `orchard_sentinel` — hp 1164 / atk 213 / def 78 / spd 10
    - *An orchard that grew a mind and then a body, lumbering between the stone trunks it used to be.*
  - **Fruit Wasp** `fruit_wasp` — hp 1164 / atk 213 / def 78 / spd 12
    - *A wasp that nests in the petrified fruit and takes the orchard personally.*
- **Reward (per clear):** 4,800 gold · Lesser Grass Core ×1
- **First clear:** +6,000 gold · Greater Grass Core ×1

### 17. Grove of the Hollow Stag

- **id:** `grove_of_the_hollow_stag` · **power:** 4,225
- **Hook (intro seed):** The stag's antlers are full of eyes, and every one is looking at you.
- **Enemies:**
  - **Hollow Stag** `hollow_stag` — hp 845 / atk 232 / def 85 / spd 7
    - *A stag whose antlers flower and rot in the same breath, its shadow walking half a step behind it.*
  - **Eye-Bloom** `eye_bloom` — hp 845 / atk 232 / def 85 / spd 8
    - *A bloom that opens only when watched, and watches back.*
  - **Shadow Fawn** `shadow_fawn` — hp 845 / atk 232 / def 85 / spd 9
    - *The stag's shadow, given a shape and a temper of its own.*
- **Reward (per clear):** 5,180 gold · Lesser Grass Core ×1
- **First clear:** +6,480 gold · Greater Grass Core ×1

### 18. The Antlered King's Hunt

- **id:** `the_antlered_kings_hunt` · **power:** 4,575
- **Hook (intro seed):** You are the quarry now, and the hunt has already begun.
- **Enemies:**
  - **Antlered Huntsman** `antlered_huntsman` — hp 915 / atk 252 / def 92 / spd 10
    - *The stag's herald, a crowned beast that runs its prey to exhaustion and is never once out of breath.*
  - 2x **Pack Thorn** `pack_thorn` — hp 915 / atk 252 / def 92 / spd 10
    - *A hound of the hunt, quick through the brush and quicker to call the others.*
- **Reward (per clear):** 5,560 gold · Lesser Grass Core ×1
- **First clear:** +6,950 gold · Greater Grass Core ×1

### 19. The Withering Bloom

- **id:** `the_withering_bloom` · **power:** 4,935
- **Hook (intro seed):** Where the bloom passes, the green goes grey.
- **Enemies:**
  - **Witherbloom** `witherbloom` — hp 987 / atk 271 / def 99 / spd 11
    - *A vast flower crowned like a lion that drains the color out of whatever it faces.*
  - **Blight Crawler** `blight_crawler` — hp 987 / atk 271 / def 99 / spd 11
    - *A pale crawler that spreads the wither wherever it walks.*
  - **Grey Gardener** `grey_gardener` — hp 987 / atk 271 / def 99 / spd 14
    - *A beast that tends the blight like a crop and resents the harvest being interrupted.*
- **Reward (per clear):** 5,950 gold · Lesser Grass Core ×1
- **First clear:** +7,440 gold · Greater Grass Core ×1

### 20. The Verdant Sovereign

- **id:** `the_verdant_sovereign` · **power:** 5,305 · **act boss**
- **Hook (intro seed):** The wilds have a king, and he does not want subjects. He wants soil.
- **Enemies:**
  - **Verdant Sovereign** `verdant_sovereign` *(elite)* — hp 988 / atk 365 / def 138 / spd 9
    - *The crowned spirit of the overgrowth, a lion of leaf and bloom that speaks for every root in the valley and buries its enemies to feed them.*
  - 2x **Court of Thorns** `court_of_thorns` — hp 549 / atk 292 / def 106 / spd 12
    - *A rank of briars that closes like a door when the Sovereign commands.*
  - **Sovereign's Herald** `sovereigns_herald` — hp 549 / atk 292 / def 106 / spd 11
    - *The court's crier, whose song is the sentence and whose bite is the sentence carried out.*
  - **Bloomguard** `bloomguard` — hp 549 / atk 292 / def 106 / spd 13
    - *A walking grove that shields the Sovereign with its own grown body.*
- **Reward (per clear):** 6,340 gold · Lesser Grass Core ×1 · Lesser Dark Core ×1
- **First clear:** +9,510 gold · Greater Grass Core ×2 · Greater Dark Core ×1

---

## Act III — The Sunken Coast

*Element tags: Water / Grass · Core grade: Greater · Quests 21–30*

The valley road reaches the sea, and the sea has been coming up: the causeway is drowned, the villages are going under a house at a time, and something on the deep shelf considers the whole coastline its garden.

### 21. The Drowned Causeway

- **id:** `the_drowned_causeway` · **power:** 5,680
- **Hook (intro seed):** The old coast road is underwater now. So are the things that walk it.
- **Enemies:**
  - **Mudback Crab** `mudback_crab` — hp 1704 / atk 312 / def 114 / spd 10
    - *A crab the size of a cart, armored in mud and the coins of everyone who tried the crossing.*
  - **Drown Walker** `drown_walker` — hp 1704 / atk 312 / def 114 / spd 15
    - *A dog that went into the water and came back wrong, still fetching something no one threw.*
- **Reward (per clear):** 6,740 gold · Greater Water Core ×1
- **First clear:** +8,430 gold · Mythic Water Core ×1

### 22. Saltmarsh Stalker

- **id:** `saltmarsh_stalker` · **power:** 6,060
- **Hook (intro seed):** The reeds move against the wind.
- **Enemies:**
  - **Saltmarsh Stalker** `saltmarsh_stalker` — hp 1818 / atk 333 / def 121 / spd 8
    - *A serpent the color of reeds that has eaten a hundred careless travelers and remembers none of them.*
  - **Reed Lurker** `reed_lurker` — hp 1818 / atk 333 / def 121 / spd 12
    - *A mat of razor sedge that lies level with the water and waits.*
- **Reward (per clear):** 7,150 gold · Greater Water Core ×1
- **First clear:** +8,940 gold · Mythic Water Core ×1

### 23. The Gilded Reef

- **id:** `the_gilded_reef` · **power:** 6,450
- **Hook (intro seed):** A reef of treasure and teeth, and the tide is going out.
- **Enemies:**
  - **Reef Warden** `reef_warden` — hp 1290 / atk 355 / def 129 / spd 14
    - *A crystal-shelled guardian that has watched the reef for an age and brooks no visitors.*
  - **Gilded Eel** `gilded_eel` — hp 1290 / atk 355 / def 129 / spd 12
    - *An eel scaled in stolen gold that strikes like a thrown spear.*
  - **Coral Crab** `coral_crab` — hp 1290 / atk 355 / def 129 / spd 12
    - *A squat crab whose coral growths make it look like part of the reef, which is the point.*
- **Reward (per clear):** 7,560 gold · Greater Water Core ×1
- **First clear:** +9,450 gold · Mythic Water Core ×1

### 24. Tidehollow Grotto

- **id:** `tidehollow_grotto` · **power:** 6,845
- **Hook (intro seed):** The cave fills with the tide. You have until it does.
- **Enemies:**
  - **Tidehollow Horror** `tidehollow_horror` — hp 2054 / atk 376 / def 137 / spd 16
    - *A jellyfish grown vast in the dark, its lights spelling out patterns meant to be read and never worth reading.*
  - **Grotto Newt** `grotto_newt` — hp 2054 / atk 376 / def 137 / spd 12
    - *A newt that swims in the rising water and waits for it to do the work for it.*
- **Reward (per clear):** 7,970 gold · Greater Water Core ×1
- **First clear:** +9,960 gold · Mythic Water Core ×1

### 25. The Keeper of the Kelp

- **id:** `the_keeper_of_the_kelp` · **power:** 7,250
- **Hook (intro seed):** The kelp forest has a keeper, and it is very old.
- **Enemies:**
  - **Keeper of the Kelp** `keeper_of_the_kelp` *(elite)* — hp 2061 / atk 498 / def 189 / spd 7
    - *An ancient tortoise that tends the kelp like a garden and strangles intruders like weeds.*
  - 2x **Kelp Shade** `kelp_shade` — hp 1145 / atk 399 / def 145 / spd 15
    - *A drifting guardian that floats between the stalks where nothing should be able to see it.*
- **Reward (per clear):** 8,390 gold · Greater Water Core ×1
- **First clear:** +10,490 gold · Mythic Water Core ×1

### 26. The Sinking Village

- **id:** `the_sinking_village` · **power:** 7,655
- **Hook (intro seed):** The village is going under, one house at a time.
- **Enemies:**
  - **Flooded Villager** `flooded_villager` — hp 1531 / atk 421 / def 153 / spd 12
    - *Someone who stayed below the waterline too long, still polite, still drowning.*
  - **Waterlogged Hound** `waterlogged_hound` — hp 1531 / atk 421 / def 153 / spd 10
    - *The village dog, which never stopped guarding a house that is no longer there.*
  - **Silt Wretch** `silt_wretch` — hp 1531 / atk 421 / def 153 / spd 12
    - *A shelled thing that has moved into the flooded cellars and does not intend to leave.*
- **Reward (per clear):** 8,810 gold · Greater Water Core ×2
- **First clear:** +11,010 gold · Mythic Water Core ×1

### 27. Blackwater Fen

- **id:** `blackwater_fen` · **power:** 8,070
- **Hook (intro seed):** The fen water is black and does not reflect you. That should worry you.
- **Enemies:**
  - **Blackwater Lurker** `blackwater_lurker` — hp 1614 / atk 444 / def 161 / spd 12
    - *A toad of the fen whose croak sounds like a person calling for help from very far away.*
  - **Fen Wisp** `fen_wisp` — hp 1614 / atk 444 / def 161 / spd 9
    - *A drifting light that leads travelers off the path and into the peat, where the fen keeps what it takes.*
  - **Mire Crawler** `mire_crawler` — hp 1614 / atk 444 / def 161 / spd 16
    - *A blood-drinker of the stagnant water, grown large on whatever the fen drowns.*
- **Reward (per clear):** 9,230 gold · Greater Water Core ×2
- **First clear:** +11,540 gold · Mythic Water Core ×1

### 28. The Lure-Lights

- **id:** `the_lure_lights` · **power:** 8,495
- **Hook (intro seed):** The lights on the water are beautiful. They are also a trap.
- **Enemies:**
  - **Deepseeker** `deepseeker` — hp 1699 / atk 467 / def 170 / spd 8
    - *A jellyfish that scatters lights like coins across the surface, patient as a fisherman and just as fond of hooks.*
  - 2x **Hook-Mouth** `hook_mouth` — hp 1699 / atk 467 / def 170 / spd 13
    - *A hunter that waits beneath the lights for whatever comes to gawk.*
- **Reward (per clear):** 9,660 gold · Greater Water Core ×2
- **First clear:** +12,080 gold · Mythic Water Core ×1

### 29. The Sunken Chapel

- **id:** `the_sunken_chapel` · **power:** 8,920
- **Hook (intro seed):** A chapel sank with its congregation. The bells still ring.
- **Enemies:**
  - **Bell-Ringer** `bell_ringer` — hp 1338 / atk 491 / def 178 / spd 10
    - *A drowned thing that rings the sunken bell, and every toll calls another of its kind.*
  - 2x **Drowned Acolyte** `drowned_acolyte` — hp 1338 / atk 491 / def 178 / spd 8
    - *A worshipper who never left the pews, still kneeling in the green dark.*
  - **Nave Guardian** `nave_guardian` — hp 1338 / atk 491 / def 178 / spd 14
    - *The chapel's old guardian, whose shell has become part of the altar.*
- **Reward (per clear):** 10,090 gold · Greater Water Core ×2
- **First clear:** +12,610 gold · Mythic Water Core ×1

### 30. The Leviathan of the Deep

- **id:** `the_leviathan_of_the_deep` · **power:** 9,355 · **act boss**
- **Hook (intro seed):** The coast has one master, and the tide goes where it is told.
- **Enemies:**
  - **Leviathan** `leviathan` *(elite)* — hp 1742 / atk 643 / def 243 / spd 11
    - *An ancient serpent-turtle of the deep shelf that has sunk fleets for their glitter and holds the whole coastline in its slow patience.*
  - **Tide Herald** `tide_herald` — hp 968 / atk 515 / def 187 / spd 11
    - *The Leviathan's herald, whose wake is the signal to flee.*
  - 2x **Reef Horror** `reef_horror` — hp 968 / atk 515 / def 187 / spd 16
    - *A light that has drifted up from the deep trench, cold and wrong and enormous.*
  - **Drowned Choir** `drowned_choir` — hp 968 / atk 515 / def 187 / spd 13
    - *A chorus of the drowned, singing the Leviathan's coming.*
- **Reward (per clear):** 10,530 gold · Greater Water Core ×2 · Greater Grass Core ×2
- **First clear:** +15,800 gold · Mythic Water Core ×2 · Mythic Grass Core ×1

---

## Act IV — The Frozen Reaches

*Element tags: Ice · Core grade: Greater · Quests 31–40*

The road turns north into a winter that never ended. The pass is closed by ice that grows as you watch, the lakes are solid over something sleeping, and a crowned queen keeps the cold like a court keeps its courtiers.

### 31. The Frostgate

- **id:** `the_frostgate` · **power:** 9,795
- **Hook (intro seed):** The pass is closed by ice that grows while you watch.
- **Enemies:**
  - **Frostguard** `frostguard` — hp 2939 / atk 539 / def 196 / spd 14
    - *A soldier of packed snow who has stood at the gate so long the gate grew up around it.*
  - **Frostplume Sentry** `frostplume_sentry` — hp 2939 / atk 539 / def 196 / spd 7
    - *A bird of ice that struts the wall, its crow loud enough to start the avalanches it relies on.*
- **Reward (per clear):** 10,970 gold · Greater Ice Core ×2
- **First clear:** +13,710 gold · Mythic Ice Core ×1

### 32. Whiteout Pass

- **id:** `whiteout_pass` · **power:** 10,240
- **Hook (intro seed):** In the whiteout you will meet yourself. Do not trust it.
- **Enemies:**
  - **Whiteout Shade** `whiteout_shade` — hp 3072 / atk 563 / def 205 / spd 11
    - *A shape of snow and antler that wears the face of whoever enters the storm.*
  - **Rime Crawler** `rime_crawler` — hp 3072 / atk 563 / def 205 / spd 16
    - *A pale spider that walks the whiteout on frozen points, silent and very fast.*
- **Reward (per clear):** 11,420 gold · Greater Ice Core ×2
- **First clear:** +14,280 gold · Mythic Ice Core ×1

### 33. The Frozen Lake

- **id:** `the_frozen_lake` · **power:** 10,690
- **Hook (intro seed):** The lake is solid. Something big is sleeping underneath it.
- **Enemies:**
  - **Lake Wyrm** `lake_wyrm` — hp 2138 / atk 588 / def 214 / spd 11
    - *A serpent of clear ice whose coils are visible through the floor you are standing on.*
  - **Ice Skater** `ice_skater` — hp 2138 / atk 588 / def 214 / spd 10
    - *A spider that glides the lake's face, hunting anything that cracks the surface.*
  - **Frozen Herd** `frozen_herd` — hp 2138 / atk 588 / def 214 / spd 14
    - *The lake's drowned herd, walking the bottom in a slow, endless migration.*
- **Reward (per clear):** 11,860 gold · Greater Ice Core ×2
- **First clear:** +14,830 gold · Mythic Ice Core ×1

### 34. Rime Hollow

- **id:** `rime_hollow` · **power:** 11,145
- **Hook (intro seed):** Every breath hangs in the air here, frozen mid-cloud.
- **Enemies:**
  - **Rime Wretch** `rime_wretch` — hp 3344 / atk 613 / def 223 / spd 7
    - *A shape of frost and old cloth that moves only when you exhale.*
  - **Hollow Stag of Ice** `hollow_stag_of_ice` — hp 3344 / atk 613 / def 223 / spd 7
    - *A stag of clear ice that has stood in the hollow so long it has forgotten the way out.*
- **Reward (per clear):** 12,320 gold · Greater Ice Core ×2
- **First clear:** +15,400 gold · Mythic Ice Core ×1

### 35. The Ice-Warden

- **id:** `the_ice_warden` · **power:** 11,610
- **Hook (intro seed):** The Warden keeps the cold in — or keeps something else in with it.
- **Enemies:**
  - **Ice-Warden** `ice_warden` *(elite)* — hp 3300 / atk 798 / def 302 / spd 14
    - *A colossus of blue ice that carries the pass on its shoulders and crushes trespassers down into the permafrost.*
  - 2x **Warden's Hound** `wardens_hound` — hp 1833 / atk 639 / def 232 / spd 7
    - *A spider of the Warden's leash, skating out to meet anything that moves.*
- **Reward (per clear):** 12,770 gold · Greater Ice Core ×2
- **First clear:** +15,960 gold · Mythic Ice Core ×1

### 36. The Glasswood

- **id:** `the_glasswood` · **power:** 12,075
- **Hook (intro seed):** The trees are glass, and they are full of trapped things.
- **Enemies:**
  - **Glasswood Stalker** `glasswood_stalker` — hp 2415 / atk 664 / def 242 / spd 12
    - *A predator that hunts by the cracking of glass, hearing you long before it sees you.*
  - **Shard Beaver** `shard_beaver` — hp 2415 / atk 664 / def 242 / spd 14
    - *A beaver whose tail is a slab of crystal and whose dam is a wall of prisms.*
  - **Prism Wasp** `prism_wasp` — hp 2415 / atk 664 / def 242 / spd 13
    - *A wasp of frozen light that refracts into a dozen copies as it dives.*
- **Reward (per clear):** 13,230 gold · Greater Ice Core ×2
- **First clear:** +16,540 gold · Mythic Ice Core ×1

### 37. The Howling Glacier

- **id:** `the_howling_glacier` · **power:** 12,550
- **Hook (intro seed):** The glacier howls, and the howl is getting closer.
- **Enemies:**
  - **Glacier Howler** `glacier_howler` — hp 2510 / atk 690 / def 251 / spd 9
    - *A wolf of the ice that howls down through the glacier's cracks and is answered by the whole mountain.*
  - 2x **Frozen Pack** `frozen_pack` — hp 2510 / atk 690 / def 251 / spd 15
    - *The pack's cousins, walking the white emptiness where the sun is only a rumor.*
- **Reward (per clear):** 13,690 gold · Greater Ice Core ×2
- **First clear:** +17,110 gold · Mythic Ice Core ×1

### 38. The Cave of Frozen Birds

- **id:** `the_cave_of_frozen_birds` · **power:** 13,025
- **Hook (intro seed):** Hundreds of birds hang frozen in the cave, and one of them just blinked.
- **Enemies:**
  - **Frozen Falcon** `frozen_falcon` — hp 1954 / atk 716 / def 261 / spd 12
    - *A bird that has hung in the ice for a century and is not, despite appearances, dead.*
  - 2x **Icicle Chicken** `icicle_chicken` — hp 1954 / atk 716 / def 261 / spd 12
    - *A bird that lays frozen eggs and defends them with a comb of spikes.*
  - **Cave Hermit** `cave_hermit` — hp 1954 / atk 716 / def 261 / spd 9
    - *A bear that slept through the freeze and woke up considerably grumpier than it went to sleep.*
- **Reward (per clear):** 14,150 gold · Greater Ice Core ×2
- **First clear:** +17,690 gold · Mythic Ice Core ×1

### 39. The Wintering Court

- **id:** `the_wintering_court` · **power:** 13,510
- **Hook (intro seed):** The frozen court holds session, and the courtiers have been waiting a very long time.
- **Enemies:**
  - **Courtier of Rime** `courtier_of_rime` — hp 2702 / atk 743 / def 270 / spd 16
    - *A noble of the winter court, elegant as a snowdrift and just as lethal to anything warm.*
  - **Frozen Herald** `frozen_herald` — hp 2702 / atk 743 / def 270 / spd 9
    - *The court's crier, whose crow opens the session and closes the doors.*
  - **Statue Guard** `statue_guard` — hp 2702 / atk 743 / def 270 / spd 8
    - *A guard so still the court forgot it was ever alive.*
- **Reward (per clear):** 14,620 gold · Greater Ice Core ×2
- **First clear:** +18,280 gold · Mythic Ice Core ×1

### 40. The Hoarfrost Queen

- **id:** `the_hoarfrost_queen` · **power:** 13,995 · **act boss**
- **Hook (intro seed):** Winter is not a season here. It is a ruler, and she has noticed you.
- **Enemies:**
  - **Hoarfrost Queen** `hoarfrost_queen` *(elite)* — hp 2606 / atk 962 / def 364 / spd 11
    - *The crowned sovereign of the eternal winter, whose displeasure is measured in blizzards and whose mercy is measured in none.*
  - 2x **Queen's Guard** `queens_guard` — hp 1448 / atk 770 / def 280 / spd 7
    - *A colossus of the Queen's own cold, standing where she will not be touched.*
  - **Crown Herald** `crown_herald` — hp 1448 / atk 770 / def 280 / spd 12
    - *The Queen's voice, sharp enough to freeze a word in the air.*
  - **Winter Shade** `winter_shade` — hp 1448 / atk 770 / def 280 / spd 7
    - *The Queen's whisper, crawling out of the drifts when the court grows quiet.*
- **Reward (per clear):** 15,090 gold · Greater Ice Core ×2
- **First clear:** +22,640 gold · Mythic Ice Core ×2

---

## Act V — The Emberwilds

*Element tags: Fire / Earth · Core grade: Mythic · Quests 41–50*

South of the ice, the land turns to ash and cinder: a forest that burned a decade ago and never stopped, a shore where the water boils, and a mountain whose heart beats under your feet. The cold and the fire are two ends of the same wound.

### 41. Ashfall Field

- **id:** `ashfall_field` · **power:** 14,485
- **Hook (intro seed):** Ash falls like grey snow, and beneath it the ground is warm.
- **Enemies:**
  - **Ash Hound** `ash_hound` — hp 4346 / atk 797 / def 290 / spd 13
    - *A wolf of banked embers that shakes sparks loose as it runs, its coat always smoldering.*
  - **Cinder Flea** `cinder_flea` — hp 4346 / atk 797 / def 290 / spd 12
    - *A squirrel-sized nuisance that hoards coals and throws them at anything that gets close.*
- **Reward (per clear):** 15,560 gold · Mythic Fire Core ×2
- **First clear:** +19,450 gold · Legendary Fire Core ×1

### 42. The Cinder Wood

- **id:** `the_cinder_wood` · **power:** 14,985
- **Hook (intro seed):** The forest burned years ago and simply never stopped.
- **Enemies:**
  - **Emberpelt Prowler** `emberpelt_prowler` — hp 2997 / atk 824 / def 300 / spd 14
    - *A tiger whose stripes are seams of molten ember; the burned trunks lean inward when it passes.*
  - **Smoldering Snag** `smoldering_snag` — hp 2997 / atk 824 / def 300 / spd 16
    - *A cloud of fireflies nesting in a dead trunk, hot enough to set it burning again.*
  - **Ash Crawler** `ash_crawler` — hp 2997 / atk 824 / def 300 / spd 13
    - *A hound of the ash flats that has learned to walk on the crust without breaking through.*
- **Reward (per clear):** 16,040 gold · Mythic Fire Core ×2
- **First clear:** +20,050 gold · Legendary Fire Core ×1

### 43. Magma Shallows

- **id:** `magma_shallows` · **power:** 15,485
- **Hook (intro seed):** The shallow water is boiling, and something is swimming in it.
- **Enemies:**
  - **Magma Pup** `magma_pup` — hp 3097 / atk 852 / def 310 / spd 11
    - *A young crocodile of cooling basalt, its mouth a furnace and its temper worse.*
  - **Scald Newt** `scald_newt` — hp 3097 / atk 852 / def 310 / spd 10
    - *A tortoise whose shell is a small caldera, venting steam and quite at home.*
  - **Boil Hound** `boil_hound` — hp 3097 / atk 852 / def 310 / spd 9
    - *A hound that hunts the boil line, where the water hides what the fire cooks.*
- **Reward (per clear):** 16,520 gold · Mythic Fire Core ×2
- **First clear:** +20,650 gold · Legendary Fire Core ×1

### 44. The Boiling Spring

- **id:** `the_boiling_spring` · **power:** 15,995
- **Hook (intro seed):** The spring runs hot enough to strip bone, and something lives in it happily.
- **Enemies:**
  - **Spring Horror** `spring_horror` — hp 4799 / atk 880 / def 320 / spd 12
    - *An old turtle crusted with mineral terraces, as much hot spring as beast.*
  - **Scalded Wretch** `scalded_wretch` — hp 4799 / atk 880 / def 320 / spd 8
    - *A monkey that fell in and came out cooked and furious.*
- **Reward (per clear):** 17,000 gold · Mythic Fire Core ×2
- **First clear:** +21,250 gold · Legendary Fire Core ×1

### 45. The Forgebeast

- **id:** `the_forgebeast` · **power:** 16,505
- **Hook (intro seed):** The forge never stopped, and neither did what feeds it.
- **Enemies:**
  - **Forgebeast** `forgebeast` *(elite)* — hp 4691 / atk 1135 / def 429 / spd 13
    - *A ram whose fleece is molten and whose horns are forge-hot; it feeds the mountain's fires and charges anything that interrupts the smithing.*
  - 2x **Bellows Fiend** `bellows_fiend` — hp 2606 / atk 908 / def 330 / spd 8
    - *A monkey that works the great bellows and throws the coals it can't use.*
- **Reward (per clear):** 17,480 gold · Mythic Fire Core ×2
- **First clear:** +21,850 gold · Legendary Fire Core ×1

### 46. The Obsidian Stair

- **id:** `the_obsidian_stair` · **power:** 17,020
- **Hook (intro seed):** A stair of black glass climbs into the smoke, and something is climbing down.
- **Enemies:**
  - **Obsidian Stalker** `obsidian_stalker` — hp 3404 / atk 936 / def 340 / spd 14
    - *A cat of black glass whose edges are sharp enough to cut the heat itself.*
  - **Stair Wisp** `stair_wisp` — hp 3404 / atk 936 / def 340 / spd 13
    - *A drifting coal-spirit that lights the steps and betrays them.*
  - **Shard Ram** `shard_ram` — hp 3404 / atk 936 / def 340 / spd 15
    - *A ram of cooled lava plates that headbutts the stair until it falls on those below.*
- **Reward (per clear):** 17,970 gold · Mythic Fire Core ×2
- **First clear:** +22,460 gold · Legendary Fire Core ×1

### 47. The Ember Monkeys

- **id:** `the_ember_monkeys` · **power:** 17,540
- **Hook (intro seed):** The ember monkeys stole your supplies and are laughing about it.
- **Enemies:**
  - **Ember Monkey** `ember_monkey` — hp 3508 / atk 965 / def 351 / spd 7
    - *A mischief of monkeys juggling stolen coals, delighted with everything and sorry about nothing.*
  - **Tallow Ape** `tallow_ape` — hp 3508 / atk 965 / def 351 / spd 14
    - *The biggest of the troop, its tail a torch and its grin a warning.*
  - **Sparrowcinder** `sparrowcinder` — hp 3508 / atk 965 / def 351 / spd 16
    - *A squirrel that buries burning acorns and forgets every single cache.*
- **Reward (per clear):** 18,460 gold · Mythic Fire Core ×2
- **First clear:** +23,080 gold · Legendary Fire Core ×1

### 48. The Cinder Carnival

- **id:** `the_cinder_carnival` · **power:** 18,065
- **Hook (intro seed):** Someone built a carnival in the lava fields, and the rides are still running.
- **Enemies:**
  - **Ringmaster of Sparks** `ringmaster_of_sparks` — hp 3613 / atk 994 / def 361 / spd 14
    - *A showman ape in a scorched coat who insists the games are fair and the exits are all closed.*
  - **Cannon Chicken** `cannon_chicken` — hp 3613 / atk 994 / def 361 / spd 7
    - *A barnyard bird loaded into a brass tube and fired at the audience, cackling the whole way.*
  - **Puppet of Ash** `puppet_of_ash` — hp 3613 / atk 994 / def 361 / spd 16
    - *A beast that dances on strings of ember and only stops when the music does.*
- **Reward (per clear):** 18,950 gold · Mythic Fire Core ×2
- **First clear:** +23,690 gold · Legendary Fire Core ×1

### 49. The Caldera Rim

- **id:** `the_caldera_rim` · **power:** 18,595
- **Hook (intro seed):** The rim is the only solid ground for miles, and it is cracking.
- **Enemies:**
  - **Caldera Sentinel** `caldera_sentinel` — hp 3719 / atk 1023 / def 372 / spd 7
    - *A crocodile of lava that patrols the rim, patient as the stone and twice as heavy.*
  - **Rim Crawler** `rim_crawler` — hp 3719 / atk 1023 / def 372 / spd 15
    - *A tortoise that has crossed the rim so many times it has worn a path to the edge.*
  - **Eruption Hound** `eruption_hound` — hp 3719 / atk 1023 / def 372 / spd 13
    - *A hound that runs the rim just ahead of the next vent's opening.*
- **Reward (per clear):** 19,450 gold · Mythic Fire Core ×2
- **First clear:** +24,310 gold · Legendary Fire Core ×1

### 50. Pyroclast, the Mountain's Heart

- **id:** `pyroclast_the_mountains_heart` · **power:** 19,125 · **act boss**
- **Hook (intro seed):** The mountain has a heart, and it has been beating for a thousand years. Tonight it wakes.
- **Enemies:**
  - **Pyroclast** `pyroclast` *(elite)* — hp 3561 / atk 1315 / def 497 / spd 8
    - *The living core of the volcano, a beast of magma and cinder that is the mountain's temper made flesh; when it wakes, the sky rains glass.*
  - **Caldera Guard** `caldera_guard` — hp 1978 / atk 1052 / def 383 / spd 12
    - *A crocodile grown in the caldera, armored in the mountain's own cooling skin.*
  - 2x **Ember Ape** `ember_ape` — hp 1978 / atk 1052 / def 383 / spd 13
    - *A troop-ape that followed the heat down and never came back up.*
  - **Magma Herald** `magma_herald` — hp 1978 / atk 1052 / def 383 / spd 14
    - *The heart's herald, whose shell cracks wider with every beat.*
- **Reward (per clear):** 19,940 gold · Mythic Fire Core ×2 · Mythic Earth Core ×2
- **First clear:** +29,910 gold · Legendary Fire Core ×2 · Legendary Earth Core ×1

---

## Act VI — The Storm Peaks

*Element tags: Electric · Core grade: Mythic · Quests 51–60*

The road climbs into a range where the storms never break. Every step throws a spark, the meadows stand on end, and a crowned keeper rides the peak's eternal thunderhead, deciding who may pass.

### 51. Thunderclap Ridge

- **id:** `thunderclap_ridge` · **power:** 19,665
- **Hook (intro seed):** Every step on the ridge throws a spark, and something is walking the same path.
- **Enemies:**
  - **Spark Hound** `spark_hound` — hp 5900 / atk 1082 / def 393 / spd 12
    - *A lean wolf of static charge that runs ahead of the thunder and waits for it to catch up.*
  - **Ridge Gnat** `ridge_gnat` — hp 5900 / atk 1082 / def 393 / spd 14
    - *A mouse-sized nuisance that arcs between your feet and giggles in static.*
- **Reward (per clear):** 20,440 gold · Mythic Electric Core ×3
- **First clear:** +25,550 gold · Legendary Electric Core ×1

### 52. The Static Meadow

- **id:** `the_static_meadow` · **power:** 20,205
- **Hook (intro seed):** The grass stands on end, and it stands on end because something is near.
- **Enemies:**
  - **Static Stag** `static_stag` — hp 4041 / atk 1111 / def 404 / spd 14
    - *A stag whose antlers are live wires; the meadow's hush comes from everything hiding.*
  - **Charge Hare** `charge_hare` — hp 4041 / atk 1111 / def 404 / spd 9
    - *A hare that carries a charge in its fur and startles easily, to everyone's cost.*
  - **Field Mouse** `field_mouse` — hp 4041 / atk 1111 / def 404 / spd 14
    - *A whole field of mice, all charged, all watching.*
- **Reward (per clear):** 20,950 gold · Mythic Electric Core ×3
- **First clear:** +26,190 gold · Legendary Electric Core ×1

### 53. Voltstag's Herd

- **id:** `voltstags_herd` · **power:** 20,755
- **Hook (intro seed):** The herd moves as one animal, and one animal is looking at you.
- **Enemies:**
  - **Herd Bull** `herd_bull` — hp 4151 / atk 1142 / def 415 / spd 15
    - *The herd's enforcer, a stallion of forked lightning that runs the meadow's edge and turns trespassers back with their fur smoking.*
  - 2x **Volt Doe** `volt_doe` — hp 4151 / atk 1142 / def 415 / spd 15
    - *A doe whose antlers hum, one of a hundred that move as one.*
- **Reward (per clear):** 21,450 gold · Mythic Electric Core ×3
- **First clear:** +26,810 gold · Legendary Electric Core ×1

### 54. The Charged Chasm

- **id:** `the_charged_chasm` · **power:** 21,305
- **Hook (intro seed):** The chasm hums with current, and the bridge across it is a single copper wire.
- **Enemies:**
  - **Chasm Weaver** `chasm_weaver` — hp 4261 / atk 1172 / def 426 / spd 9
    - *A beaver that dammed a thunderstorm instead of a river, its tail a bar of blue-white current.*
  - **Arc Crawler** `arc_crawler` — hp 4261 / atk 1172 / def 426 / spd 7
    - *A crawler that walks the copper wire and lights it as it goes.*
  - **Wire Hound** `wire_hound` — hp 4261 / atk 1172 / def 426 / spd 16
    - *A hound that paces the far edge, waiting to see whether you fall.*
- **Reward (per clear):** 21,960 gold · Mythic Electric Core ×3
- **First clear:** +27,450 gold · Legendary Electric Core ×1

### 55. The Stormherd Alpha

- **id:** `the_stormherd_alpha` · **power:** 21,855
- **Hook (intro seed):** The herd has an alpha, and it has been saving the charge for you.
- **Enemies:**
  - **Stormherd Alpha** `stormherd_alpha` *(elite)* — hp 6211 / atk 1503 / def 568 / spd 7
    - *The first of the storm-herd, a stallion born of a lightning strike that leads the herd and the weather both.*
  - 2x **Herd Runner** `herd_runner` — hp 3451 / atk 1202 / def 437 / spd 15
    - *The alpha's outriders, moving as one animal at the herd's flanks.*
- **Reward (per clear):** 22,470 gold · Mythic Electric Core ×3
- **First clear:** +28,090 gold · Legendary Electric Core ×1

### 56. The Lightning Stair

- **id:** `the_lightning_stair` · **power:** 22,415
- **Hook (intro seed):** A stair of frozen bolts climbs into the clouds, and it does not look safe.
- **Enemies:**
  - **Bolt Sentinel** `bolt_sentinel` — hp 4483 / atk 1233 / def 448 / spd 14
    - *A creature of frost and current that guards the stair, its quills crackling between shards of ice.*
  - **Climb Crawler** `climb_crawler` — hp 4483 / atk 1233 / def 448 / spd 16
    - *A crawler that nests in the stair's cracks and lights them from below.*
  - **Thunder Wisp** `thunder_wisp` — hp 4483 / atk 1233 / def 448 / spd 8
    - *A dam-keeper that has dammed the stair itself and charges a toll in sparks.*
- **Reward (per clear):** 22,980 gold · Mythic Electric Core ×3
- **First clear:** +28,730 gold · Legendary Electric Core ×1

### 57. The Besieged Beacon Tower

- **id:** `the_besieged_beacon_tower` · **power:** 22,980
- **Hook (intro seed):** The tower's beacon has been dark for days. Someone took it, and someone is holding it.
- **Enemies:**
  - **Beacon Thief** `beacon_thief` — hp 3447 / atk 1264 / def 460 / spd 9
    - *A wolf that swallowed the tower's light and glows with the stolen flame, more beacon than beast.*
  - 2x **Tower Wretch** `tower_wretch` — hp 3447 / atk 1264 / def 460 / spd 14
    - *A swarm that moved into the dark tower and made it their nest.*
  - **Warden of Currents** `warden_of_currents` — hp 3447 / atk 1264 / def 460 / spd 7
    - *The tower's old warden, still drawing power from a beacon that is no longer there.*
- **Reward (per clear):** 23,490 gold · Mythic Electric Core ×3
- **First clear:** +29,360 gold · Legendary Electric Core ×1

### 58. The Copper Aviary

- **id:** `the_copper_aviary` · **power:** 23,545
- **Hook (intro seed):** A cage of copper wire hangs from the peak, and inside it, birds of lightning.
- **Enemies:**
  - **Copper Falcon** `copper_falcon` — hp 4709 / atk 1295 / def 471 / spd 11
    - *A raptor whose wings trail sparks, and whose cage is its own idea.*
  - **Voltaic Hen** `voltaic_hen` — hp 4709 / atk 1295 / def 471 / spd 14
    - *A bird that lays sparks instead of eggs and fusses if you take them.*
  - **Wire Weaver** `wire_weaver` — hp 4709 / atk 1295 / def 471 / spd 14
    - *A beaver that builds the aviary's cage from live wire and never gets bitten.*
- **Reward (per clear):** 24,010 gold · Mythic Electric Core ×3
- **First clear:** +30,010 gold · Legendary Electric Core ×1

### 59. The Conduit Spire

- **id:** `the_conduit_spire` · **power:** 24,115
- **Hook (intro seed):** The spire drinks the storm and stores it. There's a sound like a held breath.
- **Enemies:**
  - **Conduit Warden** `conduit_warden` — hp 3617 / atk 1326 / def 482 / spd 14
    - *A warden grown into the spire's conduits, its body a living coil that discharges when disturbed.*
  - 2x **Arc Servant** `arc_servant` — hp 3617 / atk 1326 / def 482 / spd 11
    - *A servant of the spire, running its charge from room to room.*
  - **Spire Howler** `spire_howler` — hp 3617 / atk 1326 / def 482 / spd 9
    - *A howler that can hear the charged air thin before the spire releases.*
- **Reward (per clear):** 24,530 gold · Mythic Electric Core ×3
- **First clear:** +30,660 gold · Legendary Electric Core ×1

### 60. Skybreaker, the Storm's Crown

- **id:** `skybreaker_the_storms_crown` · **power:** 24,690 · **act boss**
- **Hook (intro seed):** The storm has a crown, and the crown has a keeper. The keeper is coming down.
- **Enemies:**
  - **Skybreaker** `skybreaker` *(elite)* — hp 4597 / atk 1697 / def 642 / spd 10
    - *The crowned keeper of the peak's eternal storm, a stallion wreathed in silent lightning that splits the sky when it displeases him.*
  - 2x **Crown Guard** `crown_guard` — hp 2554 / atk 1358 / def 494 / spd 14
    - *A guard of frost and charge, standing where the crown will not be touched.*
  - **Thunder Herald** `thunder_herald` — hp 2554 / atk 1358 / def 494 / spd 11
    - *The crown's herald, running the storm's edge to call the strike in.*
  - **Arc Choir** `arc_choir` — hp 2554 / atk 1358 / def 494 / spd 8
    - *A thousand small voices, all humming the same note, all charged.*
- **Reward (per clear):** 25,050 gold · Mythic Electric Core ×3
- **First clear:** +37,580 gold · Legendary Electric Core ×2

---

## Act VII — The Underearth

*Element tags: Earth · Core grade: Mythic · Quests 61–70*

Beneath the peaks lies the old quarry country: galleries that chew themselves wider each night, a foundry that never cooled, and a vault at the root of the mountain where its slow, patient will is kept.

### 61. The Quarry Gate

- **id:** `the_quarry_gate` · **power:** 25,265
- **Hook (intro seed):** The quarry closed decades ago. Today the gate is open.
- **Enemies:**
  - **Quarry Guard** `quarry_guard` — hp 7580 / atk 1390 / def 505 / spd 12
    - *A troll of stacked stone that never got the order to stand down.*
  - **Grit Hound** `grit_hound` — hp 7580 / atk 1390 / def 505 / spd 15
    - *A hedgehog of sharp slate that rolls the trails and takes a toll in ankles.*
- **Reward (per clear):** 25,570 gold · Mythic Earth Core ×3
- **First clear:** +31,960 gold · Legendary Earth Core ×1

### 62. The Stonefall Gallery

- **id:** `the_stonefall_gallery` · **power:** 25,850
- **Hook (intro seed):** The gallery ceilings shift every night, as if the mountain is chewing.
- **Enemies:**
  - **Stonefall Stalker** `stonefall_stalker` — hp 5170 / atk 1422 / def 517 / spd 11
    - *A cat of loose rock that walks the gallery ceilings and drops what it doesn't need on whoever is below.*
  - **Pit Wretch** `pit_wretch` — hp 5170 / atk 1422 / def 517 / spd 11
    - *A digger of the pits that has made peace with the dark and war with everything else.*
  - **Dust Mite** `dust_mite` — hp 5170 / atk 1422 / def 517 / spd 14
    - *A wasp that nests in the rubble and stings like a falling chisel.*
- **Reward (per clear):** 26,100 gold · Mythic Earth Core ×3
- **First clear:** +32,630 gold · Legendary Earth Core ×1

### 63. The Boulder Run

- **id:** `the_boulder_run` · **power:** 26,435
- **Hook (intro seed):** A rolling boulder has run this track for a century, and it has learned to aim.
- **Enemies:**
  - **Boulder Run Runner** `boulder_run_runner` — hp 7931 / atk 1454 / def 529 / spd 11
    - *A boulder that has been rolling so long it grew opinions, and its opinion is that you should move.*
  - **Pebbleback** `pebbleback` — hp 7931 / atk 1454 / def 529 / spd 14
    - *A smaller relation of the boulder, faster, meaner, and far more numerous.*
- **Reward (per clear):** 26,620 gold · Mythic Earth Core ×3
- **First clear:** +33,280 gold · Legendary Earth Core ×1

### 64. The Termite Halls

- **id:** `the_termite_halls` · **power:** 27,025
- **Hook (intro seed):** The halls were carved by things with appetites bigger than their bodies.
- **Enemies:**
  - **Hall Termite** `hall_termite` — hp 5405 / atk 1486 / def 541 / spd 14
    - *A pale workman of the deep that builds with stone and eats with it too.*
  - **Soldier Termite** `soldier_termite` — hp 5405 / atk 1486 / def 541 / spd 11
    - *A soldier with a head like a hammer and a grudge like a load-bearing wall.*
  - **Tunnel Grub** `tunnel_grub` — hp 5405 / atk 1486 / def 541 / spd 9
    - *A grub that widens the halls a mouthful at a time and is always hungry.*
- **Reward (per clear):** 27,150 gold · Mythic Earth Core ×3
- **First clear:** +33,940 gold · Legendary Earth Core ×1

### 65. The Quarry Tyrant

- **id:** `the_quarry_tyrant` · **power:** 27,615
- **Hook (intro seed):** Something runs the quarry. The workers left in a hurry and never came back.
- **Enemies:**
  - **Quarry Tyrant** `quarry_tyrant` *(elite)* — hp 7848 / atk 1899 / def 718 / spd 15
    - *The foreman of a quarry abandoned a century ago, still shouting orders at a crew of one.*
  - 2x **Slate Brute** `slate_brute` — hp 4360 / atk 1519 / def 552 / spd 13
    - *A boulder-picker the Tyrant set to guard the shaft mouth.*
- **Reward (per clear):** 27,680 gold · Mythic Earth Core ×3
- **First clear:** +34,600 gold · Legendary Earth Core ×1

### 66. The Undergate Foundry

- **id:** `the_undergate_foundry` · **power:** 28,215
- **Hook (intro seed):** Below the quarry is a foundry, and its furnaces are still warm.
- **Enemies:**
  - **Foundry Golem** `foundry_golem` — hp 5643 / atk 1552 / def 564 / spd 12
    - *A furnace given legs and a mouth, its belly full of molten metal.*
  - **Slag Crawler** `slag_crawler` — hp 5643 / atk 1552 / def 564 / spd 10
    - *A tortoise of cooled slag that carries the foundry's waste and its temper.*
  - **Anvil Ape** `anvil_ape` — hp 5643 / atk 1552 / def 564 / spd 13
    - *A smith-ape that beats metal all day and anything else at night.*
- **Reward (per clear):** 28,220 gold · Mythic Earth Core ×3
- **First clear:** +35,280 gold · Legendary Earth Core ×1

### 67. The Court of Standing Stones

- **id:** `the_court_of_standing_stones` · **power:** 28,815
- **Hook (intro seed):** The stones were set in a circle long ago. Tonight they have turned slightly.
- **Enemies:**
  - **Standing Stone** `standing_stone` — hp 5763 / atk 1585 / def 576 / spd 14
    - *A monolith that has stood for an age and, this evening, decided to walk.*
  - 2x **Circle Warden** `circle_warden` — hp 5763 / atk 1585 / def 576 / spd 7
    - *A warden of the circle that has counted the stones every night and found the count wrong.*
- **Reward (per clear):** 28,750 gold · Mythic Earth Core ×3
- **First clear:** +35,940 gold · Legendary Earth Core ×1

### 68. The Grinding Deep

- **id:** `the_grinding_deep` · **power:** 29,415
- **Hook (intro seed):** The deep grinds its teeth, and the sound never stops.
- **Enemies:**
  - **Grind Maw** `grind_maw` — hp 5883 / atk 1618 / def 588 / spd 12
    - *A crocodile of granite plates that swallows the tunnel behind it as it advances.*
  - **Deep Crawler** `deep_crawler` — hp 5883 / atk 1618 / def 588 / spd 11
    - *A toad that sits so still the tunnel grew around it, and now it is the tunnel.*
  - **Cave Brute** `cave_brute` — hp 5883 / atk 1618 / def 588 / spd 16
    - *A brute that has made itself at home in a place that has no home in it.*
- **Reward (per clear):** 29,290 gold · Mythic Earth Core ×3
- **First clear:** +36,610 gold · Legendary Earth Core ×1

### 69. The Earthheart Vault

- **id:** `the_earthheart_vault` · **power:** 30,025
- **Hook (intro seed):** The vault door is a mountain's face, and the mountain is frowning.
- **Enemies:**
  - **Vault Guardian** `vault_guardian` — hp 6005 / atk 1651 / def 601 / spd 14
    - *A stallion of clay and standing stone, the vault's last defense and its first thought.*
  - **Vault Keeper** `vault_keeper` — hp 6005 / atk 1651 / def 601 / spd 7
    - *A keeper whose amber eyes have watched the vault since before the quarry.*
  - **Geo Wasp** `geo_wasp` — hp 6005 / atk 1651 / def 601 / spd 13
    - *A wasp that mines the vault's seam and defends it to the last.*
- **Reward (per clear):** 29,830 gold · Mythic Earth Core ×3
- **First clear:** +37,290 gold · Legendary Earth Core ×1

### 70. Terravore, the Root of Mountains

- **id:** `terravore_the_root_of_mountains` · **power:** 30,635 · **act boss**
- **Hook (intro seed):** The mountain's roots have a heart. Break it, and the mountain falls.
- **Enemies:**
  - **Terravore** `terravore` *(elite)* — hp 5704 / atk 2106 / def 797 / spd 11
    - *The buried heart of the underearth, a toad of boulders and ore that is the mountain's slow, patient will given a mouth.*
  - **Ore Hound** `ore_hound` — hp 3169 / atk 1685 / def 613 / spd 13
    - *A hound of ore that rolls down the vault's throat to meet intruders.*
  - **Stone Herald** `stone_herald` — hp 3169 / atk 1685 / def 613 / spd 12
    - *The heart's herald, whose tread is the mountain shifting in its sleep.*
  - **Vault Shade** `vault_shade` — hp 3169 / atk 1685 / def 613 / spd 8
    - *The vault's shadow, which has kept the same watch as the keeper and never blinked.*
  - **Grinding Deep** `grinding_deep` — hp 3169 / atk 1685 / def 613 / spd 9
    - *The deep's own warden, drawn up to the heart to defend it.*
- **Reward (per clear):** 30,370 gold · Mythic Earth Core ×3
- **First clear:** +45,560 gold · Legendary Earth Core ×2

---

## Act VIII — The Shadowed Marches

*Element tags: Dark · Core grade: Legendary · Quests 71–80*

The road turns toward the citadel through land that has already fallen: a grave-road lined with opening graves, a fen of mist that walks, and a black cathedral where the shadow sovereign holds a court of everyone who came before you.

### 71. The Grave Road

- **id:** `the_grave_road` · **power:** 31,250
- **Hook (intro seed):** The road to the citadel is lined with graves, and the graves are opening.
- **Enemies:**
  - **Grave Hound** `grave_hound` — hp 9375 / atk 1719 / def 625 / spd 10
    - *A hound that kept a gate in life and keeps it still, its ribs showing through smoke.*
  - **Riser** `riser` — hp 9375 / atk 1719 / def 625 / spd 14
    - *A farm bird that would not stay buried, strutting the road with a comb like cooling ash.*
- **Reward (per clear):** 30,910 gold · Legendary Dark Core ×3
- **First clear:** +38,640 gold · Legendary Dark Core ×1

### 72. The Mist of the Marches

- **id:** `the_mist_of_the_marches` · **power:** 31,870
- **Hook (intro seed):** The mist is thick enough to walk on. It is also walking.
- **Enemies:**
  - **Mist Stalker** `mist_stalker` — hp 9561 / atk 1753 / def 637 / spd 8
    - *A cat of mist that has no outline of its own, only the suggestion of one.*
  - **Fog Wretch** `fog_wretch` — hp 9561 / atk 1753 / def 637 / spd 14
    - *A smudge of soot between the milestones that keeps the road tidy and its travelers tidier.*
- **Reward (per clear):** 31,460 gold · Legendary Dark Core ×3
- **First clear:** +39,330 gold · Legendary Dark Core ×1

### 73. The Gallows Orchard

- **id:** `the_gallows_orchard` · **power:** 32,490
- **Hook (intro seed):** The orchard's fruit hangs heavy, and none of it is fruit.
- **Enemies:**
  - **Gallows Keeper** `gallows_keeper` — hp 6498 / atk 1787 / def 650 / spd 12
    - *An owl that keeps a ledger of everyone who passes beneath the dead branches, and it has your name.*
  - **Carrion Crow** `carrion_crow` — hp 6498 / atk 1787 / def 650 / spd 8
    - *A bird that has grown fat on the orchard's harvest and does not share.*
  - **Bough Crawler** `bough_crawler` — hp 6498 / atk 1787 / def 650 / spd 10
    - *A drinker that nests in the high branches and drops on the unwary.*
- **Reward (per clear):** 32,010 gold · Legendary Dark Core ×3
- **First clear:** +40,010 gold · Legendary Dark Core ×1

### 74. The Crypt of Candles

- **id:** `the_crypt_of_candles` · **power:** 33,115
- **Hook (intro seed):** The crypt is lit by candles that gutter when you lie.
- **Enemies:**
  - **Candle Wretch** `candle_wretch` — hp 6623 / atk 1821 / def 662 / spd 13
    - *A vault keeper that has tidied the candles for a thousand years and resents every visitor.*
  - **Guttering Shade** `guttering_shade` — hp 6623 / atk 1821 / def 662 / spd 7
    - *A light that drifts between the coffins, dimming whenever it is looked at.*
  - **Crypt Hound** `crypt_hound` — hp 6623 / atk 1821 / def 662 / spd 9
    - *A hound that guards a house of the dead and takes its duty very seriously.*
- **Reward (per clear):** 32,560 gold · Legendary Dark Core ×3
- **First clear:** +40,700 gold · Legendary Dark Core ×1

### 75. The Pale Rider

- **id:** `the_pale_rider` · **power:** 33,740
- **Hook (intro seed):** Something rides the march on a horse of smoke, and it is looking for a mount.
- **Enemies:**
  - **Pale Rider** `pale_rider` *(elite)* — hp 9589 / atk 2320 / def 877 / spd 7
    - *A riderless horror of the marches that has broken a hundred horses and is now shopping for a new one.*
  - 2x **Rider's Hound** `riders_hound` — hp 5327 / atk 1856 / def 675 / spd 10
    - *A hound of the Rider's hunt, running the march's edge.*
- **Reward (per clear):** 33,110 gold · Legendary Dark Core ×3
- **First clear:** +41,390 gold · Legendary Dark Core ×1

### 76. The Legion of the Hollow Choir

- **id:** `the_legion_of_the_hollow_choir` · **power:** 34,375
- **Hook (intro seed):** You can hear them singing from a mile off. You should not be able to.
- **Enemies:**
  - **Hollow Chorister** `hollow_chorister` — hp 6875 / atk 1891 / def 688 / spd 15
    - *A congregation that sings without mouths, the sound hollow and patient and wrong.*
  - **Choir Warden** `choir_warden` — hp 6875 / atk 1891 / def 688 / spd 9
    - *A warden that keeps the choir's time and punishes those who break it.*
  - **Silent Brother** `silent_brother` — hp 6875 / atk 1891 / def 688 / spd 8
    - *The one who does not sing, and is therefore the one to fear.*
- **Reward (per clear):** 33,660 gold · Legendary Dark Core ×4
- **First clear:** +42,080 gold · Legendary Dark Core ×1

### 77. The Widow's Court

- **id:** `the_widows_court` · **power:** 35,010
- **Hook (intro seed):** The widow holds court in the dark, and her courtiers have all stopped moving.
- **Enemies:**
  - **The Widow** `the_widow` — hp 5252 / atk 1926 / def 700 / spd 10
    - *The pale lady of the marches, whose veil is smoke and whose court is whoever was too slow to leave.*
  - 2x **Veiled Attendant** `veiled_attendant` — hp 5252 / atk 1926 / def 700 / spd 16
    - *A courtier who attends the Widow still, long after the attending stopped mattering.*
  - **Court Shade** `court_shade` — hp 5252 / atk 1926 / def 700 / spd 9
    - *The court's enforcer, which has no shape but a great deal of intent.*
- **Reward (per clear):** 34,210 gold · Legendary Dark Core ×4
- **First clear:** +42,760 gold · Legendary Dark Core ×1

### 78. The Hunger Below

- **id:** `the_hunger_below` · **power:** 35,645
- **Hook (intro seed):** Something under the march is always hungry, and it has smelled you for miles.
- **Enemies:**
  - **The Hunger** `the_hunger` — hp 7129 / atk 1960 / def 713 / spd 15
    - *A vast mosquito-thing fed on a swamp that was fed on something worse; its needle is longer than a spear.*
  - **Ravenous Crawler** `ravenous_crawler` — hp 7129 / atk 1960 / def 713 / spd 10
    - *A crawler that follows the Hunger's scent and finishes what it leaves.*
  - **Gorge Wretch** `gorge_wretch` — hp 7129 / atk 1960 / def 713 / spd 10
    - *A hound of the hunger, ribs showing, still eating.*
- **Reward (per clear):** 34,770 gold · Legendary Dark Core ×4
- **First clear:** +43,460 gold · Legendary Dark Core ×1

### 79. The Black Cathedral

- **id:** `the_black_cathedral` · **power:** 36,290
- **Hook (intro seed):** The cathedral was built to something, and it is still open for worship.
- **Enemies:**
  - **Black Choir** `black_choir` — hp 5444 / atk 1996 / def 726 / spd 7
    - *A choir of owls that sings the cathedral's hymns and descends on any who interrupt.*
  - **Cathedral Guardian** `cathedral_guardian` — hp 5444 / atk 1996 / def 726 / spd 14
    - *A guardian of the nave that has no body to bury and no patience to spare.*
  - **Bishop of Ash** `bishop_of_ash` — hp 5444 / atk 1996 / def 726 / spd 11
    - *The cathedral's shepherd, whose flock is the whole march and whose sermon is the dark.*
  - **Nave Crawler** `nave_crawler` — hp 5444 / atk 1996 / def 726 / spd 13
    - *A drifting light of the nave, cold and wrong and enormous.*
- **Reward (per clear):** 35,330 gold · Legendary Dark Core ×4
- **First clear:** +44,160 gold · Legendary Dark Core ×1

### 80. Umbragore, the Shadow Sovereign

- **id:** `umbragore_the_shadow_sovereign` · **power:** 36,935 · **act boss**
- **Hook (intro seed):** The marches have a sovereign, and he has been expecting you since the grave road.
- **Enemies:**
  - **Umbragore** `umbragore` *(elite)* — hp 6878 / atk 2539 / def 960 / spd 9
    - *The shadow sovereign of the marches, a lion of black smoke and silent lightning whose mane is a standing storm and whose reign is measured in graves.*
  - **Shadow Herald** `shadow_herald` — hp 3821 / atk 2031 / def 739 / spd 15
    - *The sovereign's herald, whose pounce is the herald's only announcement.*
  - 2x **Court of Ash** `court_of_ash` — hp 3821 / atk 2031 / def 739 / spd 8
    - *The sovereign's court, still bowing, still marching.*
  - **Legion Shade** `legion_shade` — hp 3821 / atk 2031 / def 739 / spd 10
    - *A legion of the sovereign's risen, strutting in the sovereign's shadow.*
- **Reward (per clear):** 35,890 gold · Legendary Dark Core ×4
- **First clear:** +53,840 gold · Legendary Dark Core ×2

---

## Act IX — The Dragon's Spine

*Element tags: Dragon / Fire · Core grade: Legendary · Quests 81–90*

The last road to the citadel is not a road at all: it is the fossilized spine of an ancient drake, and it is not as dead as it looks. Scales litter the ridge, the hoard counts its coins by name, and at the far end an elder wyrm still keeps the last egg.

### 81. The Spine Road

- **id:** `the_spine_road` · **power:** 37,580
- **Hook (intro seed):** The road rides a dragon's spine, and the dragon is not as dead as it looks.
- **Enemies:**
  - **Spine Crawler** `spine_crawler` — hp 11274 / atk 2067 / def 752 / spd 10
    - *A crocodile of black basalt that walks the spine's vertebrae and eats whatever stops to admire the view.*
  - **Scale Hound** `scale_hound` — hp 11274 / atk 2067 / def 752 / spd 7
    - *A hound that dens in the fallen scales and considers the spine its hoard.*
- **Reward (per clear):** 36,450 gold · Legendary Dragon Core ×4
- **First clear:** +45,560 gold · Legendary Dragon Core ×1

### 82. Scales on the Ridge

- **id:** `scales_on_the_ridge` · **power:** 38,230
- **Hook (intro seed):** The ridge sheds scales like leaves, and each one is bigger than a shield.
- **Enemies:**
  - **Ridge Wyrm** `ridge_wyrm` — hp 11469 / atk 2103 / def 765 / spd 11
    - *A wolf-sized wyrm that burrows in the fallen scales and hunts the ridge at dusk.*
  - **Scale Hoarder** `scale_hoarder` — hp 11469 / atk 2103 / def 765 / spd 16
    - *A squirrel-thing that buries scales like acorns and defends the cache with a hoard's fury.*
- **Reward (per clear):** 37,010 gold · Legendary Dragon Core ×4
- **First clear:** +46,260 gold · Legendary Dragon Core ×1

### 83. The Hoard of Names

- **id:** `the_hoard_of_names` · **power:** 38,885
- **Hook (intro seed):** A hoard of coins, and every coin has a name on it. Yours is in there somewhere.
- **Enemies:**
  - **Hoard Warden** `hoard_warden` — hp 7777 / atk 2139 / def 778 / spd 12
    - *The hoard's keeper, a lion of storm and shadow that counts the coins by name and takes offense at theft.*
  - **Coin Mimic** `coin_mimic` — hp 7777 / atk 2139 / def 778 / spd 7
    - *A chest of coins that is not a chest of coins, and resents the confusion.*
  - **Hoard Howler** `hoard_howler` — hp 7777 / atk 2139 / def 778 / spd 8
    - *A hound that guards the hoard's edge and howls at anything that glitters.*
- **Reward (per clear):** 37,580 gold · Legendary Dragon Core ×4
- **First clear:** +46,980 gold · Legendary Dragon Core ×1

### 84. The Wyrmsblood Fen

- **id:** `the_wyrmsblood_fen` · **power:** 39,545
- **Hook (intro seed):** The fen runs red where the old wyrms bled, and it never dried.
- **Enemies:**
  - **Bloodfen Wyrm** `bloodfen_wyrm` — hp 7909 / atk 2175 / def 791 / spd 9
    - *A crocodile-wyrm fattened on the fen's old blood, sluggish and enormous and immortal.*
  - 2x **Fen Hatchling** `fen_hatchling` — hp 7909 / atk 2175 / def 791 / spd 9
    - *A hatchling that has never left the fen and thinks it is the whole world.*
- **Reward (per clear):** 38,150 gold · Legendary Dragon Core ×4
- **First clear:** +47,690 gold · Legendary Dragon Core ×1

### 85. The Wyrmling Broodmother

- **id:** `the_wyrmling_broodmother` · **power:** 40,205
- **Hook (intro seed):** The eggs are hatching, and the mother is right behind you.
- **Enemies:**
  - **Broodmother** `broodmother` *(elite)* — hp 11427 / atk 2764 / def 1045 / spd 14
    - *The broodmother of the wyrms, a tiger-drake whose molten stripes mark each egg she guards and each foe she has buried.*
  - 2x **Wyrmling** `wyrmling` — hp 6348 / atk 2211 / def 804 / spd 9
    - *A new-hatched drake, hungry and already armored.*
- **Reward (per clear):** 38,710 gold · Legendary Dragon Core ×4
- **First clear:** +48,390 gold · Legendary Dragon Core ×1

### 86. The Cradle of Coils

- **id:** `the_cradle_of_coils` · **power:** 40,870
- **Hook (intro seed):** The cradle is a pit of coils, and they are all awake.
- **Enemies:**
  - **Cradle Coil** `cradle_coil` — hp 8174 / atk 2248 / def 817 / spd 7
    - *A coil of the cradle that never sleeps, tightening around anything that enters the pit.*
  - **Cradle Keeper** `cradle_keeper` — hp 8174 / atk 2248 / def 817 / spd 10
    - *A keeper that has guarded the cradle since the spine was alive.*
  - **Shell Drake** `shell_drake` — hp 8174 / atk 2248 / def 817 / spd 10
    - *A drake that carries the cradle's old shell and the patience that comes with it.*
- **Reward (per clear):** 39,280 gold · Legendary Dragon Core ×4
- **First clear:** +49,100 gold · Legendary Dragon Core ×1

### 87. The Broken Sky Temple

- **id:** `the_broken_sky_temple` · **power:** 41,535
- **Hook (intro seed):** The temple was built to hold the sky up, its roof is gone, and the sky is falling.
- **Enemies:**
  - **Sky Warden** `sky_warden` — hp 6230 / atk 2284 / def 831 / spd 9
    - *A guardian of storm and shadow that catches the falling sky and hurls it back.*
  - 2x **Temple Coil** `temple_coil` — hp 6230 / atk 2284 / def 831 / spd 10
    - *A coil that has wrapped the temple's broken pillars and never let go.*
  - **Ruin Drake** `ruin_drake` — hp 6230 / atk 2284 / def 831 / spd 10
    - *A drake that took the temple as its den and the falling sky as its weather.*
- **Reward (per clear):** 39,860 gold · Legendary Dragon Core ×4
- **First clear:** +49,830 gold · Legendary Dragon Core ×1

### 88. The Elder Wyrm's Court

- **id:** `the_elder_wyrms_court` · **power:** 42,205
- **Hook (intro seed):** The elder wyrm holds court, and its courtiers are the bones of everyone who has ever visited.
- **Enemies:**
  - **Elder Wyrm** `elder_wyrm` *(elite)* — hp 11995 / atk 2902 / def 1097 / spd 12
    - *The eldest of the spine's wyrms, a crocodile of molten rock and old gold that has outlived every knight sent to kill it.*
  - **Court Coil** `court_coil` — hp 6664 / atk 2321 / def 844 / spd 15
    - *A coil of the court, draped across the throne's arm like a favorite ribbon.*
  - **Bone Herald** `bone_herald` — hp 6664 / atk 2321 / def 844 / spd 9
    - *The court's crier, armored in the remains of the last herald.*
- **Reward (per clear):** 40,430 gold · Legendary Dragon Core ×4
- **First clear:** +50,540 gold · Legendary Dragon Core ×1

### 89. The Last Egg

- **id:** `the_last_egg` · **power:** 42,880
- **Hook (intro seed):** One egg remains, and it is warm. Something wants it back.
- **Enemies:**
  - **Egg Guardian** `egg_guardian` — hp 6432 / atk 2358 / def 858 / spd 15
    - *The last guardian of the last egg, holding the line with storm in its mane and shadow at its heels.*
  - 2x **Clutch Thief** `clutch_thief` — hp 6432 / atk 2358 / def 858 / spd 11
    - *A drake that has been trying to steal the last egg since it was laid.*
  - **Spine Wyrm** `spine_wyrm` — hp 6432 / atk 2358 / def 858 / spd 11
    - *The spine's own wyrm, woken by the warmth of the last egg.*
- **Reward (per clear):** 41,000 gold · Legendary Dragon Core ×4
- **First clear:** +51,250 gold · Legendary Dragon Core ×1

### 90. Voragrim, the Dragon's Spine

- **id:** `voragrim_the_dragons_spine` · **power:** 43,555 · **act boss**
- **Hook (intro seed):** The spine is not a road. It is a dragon, and it has been waiting for the citadel's call.
- **Enemies:**
  - **Voragrim** `voragrim` *(elite)* — hp 8110 / atk 2994 / def 1132 / spd 16
    - *The great drake whose spine is the road you walked, woken at last; its stripes are lava veins and its roar cracks the citadel's walls.*
  - **Spine Herald** `spine_herald` — hp 4506 / atk 2396 / def 871 / spd 12
    - *The drake's herald, carrying its roar down the ridge.*
  - 2x **Wyrm Guard** `wyrm_guard` — hp 4506 / atk 2396 / def 871 / spd 14
    - *A guard of storm and shadow, standing where the drake will not be touched.*
  - **Drake Choir** `drake_choir` — hp 4506 / atk 2396 / def 871 / spd 7
    - *The dragon's chorus, humming the note that wakes the mountain.*
- **Reward (per clear):** 41,580 gold · Legendary Dragon Core ×4 · Legendary Fire Core ×4
- **First clear:** +62,370 gold · Legendary Dragon Core ×2 · Legendary Fire Core ×1

---

## Act X — The Dark Lord's Citadel

*Element tags: Dark / Dragon · Core grade: Legendary · Quests 91–100*

The citadel opens its gates and dares you in. Through the ash courtyard, the hall of broken oaths, the screaming gallery, and the nine locks of the inner keep, the dark lord waits — and he has already sent his shadow to meet you first.

### 91. The Citadel Gates

- **id:** `the_citadel_gates` · **power:** 44,235
- **Hook (intro seed):** The gates open as you approach. That is not a welcome; it is a dare.
- **Enemies:**
  - **Gate Warden** `gate_warden` — hp 8847 / atk 2433 / def 885 / spd 13
    - *The citadel's gate warden, a lion of storm and shadow that has never once let anyone leave.*
  - 2x **Gate Hound** `gate_hound` — hp 8847 / atk 2433 / def 885 / spd 9
    - *A hound of the gate that keeps a ledger of arrivals and a shorter list of departures.*
- **Reward (per clear):** 42,160 gold · Legendary Dark Core ×4
- **First clear:** +52,700 gold · Legendary Dark Core ×1

### 92. The Ash Courtyard

- **id:** `the_ash_courtyard` · **power:** 44,915
- **Hook (intro seed):** The courtyard is ankle-deep in ash, and the ash remembers being people.
- **Enemies:**
  - **Ash Revenant** `ash_revenant` — hp 8983 / atk 2470 / def 898 / spd 8
    - *A courtier of the citadel reduced to ash and grief, still bowing to a throne that has moved on.*
  - **Courtyard Crawler** `courtyard_crawler` — hp 8983 / atk 2470 / def 898 / spd 16
    - *A crawler that feeds on the courtyard's ash and whatever it is made of.*
  - **Ash Hound** `ash_hound` — hp 8983 / atk 2470 / def 898 / spd 13
    - *A hound that patrols the courtyard's edge, sniffing out anyone who still has a heartbeat.*
- **Reward (per clear):** 42,740 gold · Legendary Dark Core ×4
- **First clear:** +53,430 gold · Legendary Dark Core ×1

### 93. The Hall of Broken Oaths

- **id:** `the_hall_of_broken_oaths` · **power:** 45,600
- **Hook (intro seed):** Every oath sworn in this hall broke, and the hall kept the pieces.
- **Enemies:**
  - **Oathbreaker** `oathbreaker` — hp 9120 / atk 2508 / def 912 / spd 15
    - *What remains of a knight who swore to the dark lord and kept the oath too well.*
  - **Broken Warden** `broken_warden` — hp 9120 / atk 2508 / def 912 / spd 7
    - *A warden that broke its oath and now breaks anyone who reminds it.*
  - **Pledge Shade** `pledge_shade` — hp 9120 / atk 2508 / def 912 / spd 7
    - *A shade of the pledged, still keeping a promise no one remembers making.*
- **Reward (per clear):** 43,320 gold · Legendary Dark Core ×4
- **First clear:** +54,150 gold · Legendary Dark Core ×1

### 94. The Screaming Gallery

- **id:** `the_screaming_gallery` · **power:** 46,290
- **Hook (intro seed):** The paintings scream. Do not look at them.
- **Enemies:**
  - **Gallery Shade** `gallery_shade` — hp 6944 / atk 2546 / def 926 / spd 14
    - *A portrait that left its frame and has been looking for a body ever since.*
  - 2x **Screaming Coil** `screaming_coil` — hp 6944 / atk 2546 / def 926 / spd 16
    - *A coil of the gallery that screams in a voice the paintings all borrowed.*
  - **Framed Horror** `framed_horror` — hp 6944 / atk 2546 / def 926 / spd 16
    - *A light that escaped a canvas and drifts the gallery's dark, looking for a way back in.*
- **Reward (per clear):** 43,900 gold · Legendary Dark Core ×4
- **First clear:** +54,880 gold · Legendary Dark Core ×1

### 95. The Warden of Nine Locks

- **id:** `the_warden_of_nine_locks` · **power:** 46,980
- **Hook (intro seed):** Nine locks guard the inner keep. One warden guards the locks.
- **Enemies:**
  - **Warden of Nine Locks** `warden_of_nine_locks` *(elite)* — hp 13352 / atk 3230 / def 1221 / spd 7
    - *The citadel's jailer, a beast of nine chains, one for each lock it has never let anyone pass.*
  - 2x **Lock Hound** `lock_hound` — hp 7418 / atk 2584 / def 940 / spd 7
    - *A hound on the Warden's chain, one of nine.*
- **Reward (per clear):** 44,490 gold · Legendary Dark Core ×4
- **First clear:** +55,610 gold · Legendary Dark Core ×1

### 96. The Throne Antechamber

- **id:** `the_throne_antechamber` · **power:** 47,675
- **Hook (intro seed):** The dark lord's throne is through the next door, and the antechamber is full of everyone who reached it first.
- **Enemies:**
  - **Antechamber Guard** `antechamber_guard` — hp 7151 / atk 2622 / def 954 / spd 12
    - *A guard of shadow that has stood so long it has forgotten what it guards, only that it does.*
  - **Throne Herald** `throne_herald` — hp 7151 / atk 2622 / def 954 / spd 15
    - *The throne's herald, whose bow is the last courtesy you will be shown.*
  - 2x **Court Revenant** `court_revenant` — hp 7151 / atk 2622 / def 954 / spd 14
    - *A revenant of the court, still dressed for a session that ended long ago.*
- **Reward (per clear):** 45,070 gold · Legendary Dark Core ×4
- **First clear:** +56,340 gold · Legendary Dark Core ×1

### 97. The Court of Masks

- **id:** `the_court_of_masks` · **power:** 48,370
- **Hook (intro seed):** Everyone at court wears a mask, and none of the masks are empty.
- **Enemies:**
  - **Masked Noble** `masked_noble` — hp 7256 / atk 2660 / def 967 / spd 12
    - *A courtier whose mask is the only part of it left, and it is very attached to the part.*
  - **Mask Bearer** `mask_bearer` — hp 7256 / atk 2660 / def 967 / spd 8
    - *A bearer who carries the masks the nobles have outgrown.*
  - **Masquerade Shade** `masquerade_shade` — hp 7256 / atk 2660 / def 967 / spd 16
    - *A shade in the shape of whoever it is standing next to.*
  - **Court Coil** `court_coil` — hp 7256 / atk 2660 / def 967 / spd 15
    - *A coil of the court, draped across the mask-rack like a guest who never left.*
- **Reward (per clear):** 45,660 gold · Legendary Dark Core ×4
- **First clear:** +57,080 gold · Legendary Dark Core ×1

### 98. The Hollow Chancellor

- **id:** `the_hollow_chancellor` · **power:** 49,070
- **Hook (intro seed):** The dark lord's chancellor is a hollow suit of armor, and something is wearing it.
- **Enemies:**
  - **Hollow Chancellor** `hollow_chancellor` *(elite)* — hp 11041 / atk 3374 / def 1276 / spd 7
    - *The dark lord's chancellor, a voice with no body and a crown with no king, ruling the court while its master watches.*
  - 2x **Chancellor's Guard** `chancellors_guard` — hp 6134 / atk 2699 / def 981 / spd 16
    - *A guard of the chancellor's court, standing nearer the throne than anything should.*
  - **Hollow Herald** `hollow_herald` — hp 6134 / atk 2699 / def 981 / spd 10
    - *The chancellor's herald, made of the same emptiness as its master.*
- **Reward (per clear):** 46,250 gold · Legendary Dark Core ×4
- **First clear:** +57,810 gold · Legendary Dark Core ×1

### 99. The Dark Lord's Shadow

- **id:** `the_dark_lords_shadow` · **power:** 49,770
- **Hook (intro seed):** The dark lord's shadow got here first, and it is bigger than he is.
- **Enemies:**
  - **The Dark Lord's Shadow** `the_dark_lords_shadow` *(elite)* — hp 9268 / atk 3422 / def 1294 / spd 7
    - *The shadow the dark lord casts, cut loose and grown vast, holding the inner chamber until its master is ready.*
  - 3x **Shadow Legion** `shadow_legion` — hp 5149 / atk 2737 / def 995 / spd 14
    - *A legion of the shadow's making, each one a lesser dark lord.*
  - **Wing of Ash** `wing_of_ash` — hp 5149 / atk 2737 / def 995 / spd 13
    - *The shadow's eye, circling the chamber and reporting your every breath.*
- **Reward (per clear):** 46,840 gold · Legendary Dark Core ×4
- **First clear:** +58,550 gold · Legendary Dark Core ×1

### 100. The Dark Lord's Inner Chamber

- **id:** `the_dark_lords_inner_chamber` · **power:** 50,475 · **act boss**
- **Hook (intro seed):** The door closes behind you, the throne turns, and the dark lord has been waiting a very long time.
- **Enemies:**
  - **The Dark Lord** `the_dark_lord` *(elite)* — hp 9399 / atk 3470 / def 1312 / spd 7
    - *The master of the citadel and the shadow over every road you walked: a lord of storm, shadow, and dragonfire who does not intend to lose the last room.*
  - **Dragonfire Herald** `dragonfire_herald` — hp 5222 / atk 2776 / def 1010 / spd 16
    - *The dark lord's herald, whose stripes are the drake-fire of the spine road.*
  - 2x **Shadow Legion** `shadow_legion` — hp 5222 / atk 2776 / def 1010 / spd 14
    - *The last of the shadow's legion, risen for the final session.*
  - **Bloodsworn Guard** `bloodsworn_guard` — hp 5222 / atk 2776 / def 1010 / spd 13
    - *A guard sworn in dragon's blood and armored in the mountain's own skin.*
- **Reward (per clear):** 47,430 gold · Legendary Dark Core ×4 · Legendary Dragon Core ×4
- **First clear:** +71,150 gold · Legendary Dark Core ×2 · Legendary Dragon Core ×1

---

## Implementation notes

- **This chain is two files, both written by `npm run quests:1:extract`.**
  `data/the-long-dark.quests.json` holds the encounters — one object each: `id`, `order`, `name`,
  `act`, `boss`, `power`, an enemy line-up, `reward` / `firstClear`, and the `intro` / `outro`
  beats — and `data/the-long-dark.enemies.csv` holds the monsters. The script reads the act headers,
  the quest headers, the rosters and the reward lines below, checks them, and writes both, so
  change the *prose and the design* here and re-run it rather than hand-editing either file.
  `data/quest-chain.schema.json` is the contract, and `quests.test.ts` re-checks the invariants on
  every `npm test`. Each quest file names its own bestiary (`bestiary` in the JSON), which is how
  the chain and the starter quests keep separate monster lists.
- **The chain is not seeded yet.** `data/quest-chain.json` still holds the three starter quests, and
  that is the file the loader seeds. Its `intro` / `outro` scripts are still Hook lines below, and
  that is the only thing left standing between the chain and `npm run seed:build`.
- **An enemy line names a bestiary id and counts its copies.** `{ "cardId": "rootling", "count": 2 }`
  is the "2x Rootling" above — the copies are identical, so they share one line, and the loader gives
  each a derived battle key (`rootling#1`, `rootling#2`) because `battle.ts` keys a combatant by id.
- **Every stat line below is copied verbatim into the chain's bestiary.** One row per monster, the
  numbers exactly as written here, taken from the first quest that fields it — so a monster re-used
  by a later quest keeps one row, and the second encounter's numbers above are flavour rather than
  data. Nothing scales or re-derives them. `tags` and `design` are not in this document, so they are
  carried over from the bestiary file itself. A quest's `power` is advisory only (the
  recommended-power figure on its card), and a line's `threat` is an optional multiplier for an
  encounter that wants to sit off its row.
- Each quest's **Hook** line is carried into the data as `hook` (the seed its `intro` grows from),
  and the `intro` / `outro` beats are still written here, in prose, until they become scripts. Write
  the outro to pay the hook off; boss quests (10, 20, … 100) should carry the biggest scripts.
- After editing a roster or a reward, run `npm run quests:1:extract` and then `npm test` (the content
  test). `npm run seed:build` and `bash scripts/verify-db.sh` apply once the chain is wired up.
- **Enemies are already in the bestiary.** Every distinct enemy above (269 of them, after collapsing the
  per-quest duplicates) is a row in `data/enemies.csv`, one per `id`, with its base stats, its element in
  `tags` and its own `design` prompt. Its `type` column already marks it a card, so an enemy met in a
  quest is, once its art is rendered, acquirable as a card of the same name and art. Note this is *not*
  `data/assets.csv`, which carries no battle stats — the two are separate catalogs today, and the six
  opponents of the starter quests were added to the bestiary so they resolve like any other enemy.
- **`QuestEnemy.cardId` is that bestiary/card id.** The card supplies the art and the display name,
  the bestiary supplies the stats, and a line's `name` is an optional override for the window before
  the catalog is imported. There is no emoji fallback — an opponent is always drawn as its card — and
  a dialogue line carries no avatar, because every speaker shares one stand-in until they get their
  own portraits.

