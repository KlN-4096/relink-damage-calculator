import { UPGRADE_DATA } from '../data/game-upgrade-data.js';

const SLOT_COUNT = 400;
const PAGE_KEYS = ['attack', 'hpResistance', 'weaponCollection', 'weaponTranscendence'];
const EMPTY_HASH = 0x887AE0B0;
const unsigned = value => Number(value) >>> 0;
const first = record => record?.values?.[0];

function progressionBase(characterUnitId) {
  return 10_000_000 + (Number(characterUnitId) - 10_000) * 1000;
}

function slotsByHash(index, base) {
  const slots = new Map();
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    const hash = unsigned(first(index.get(1601)?.get(base + slot)));
    if (!hash || hash === EMPTY_HASH) continue;
    const matches = slots.get(hash) || [];
    matches.push(slot);
    slots.set(hash, matches);
  }
  return slots;
}

function emptyPages() {
  return Object.fromEntries(PAGE_KEYS.map((key, index) => [key, {
    label: UPGRADE_DATA.pageLabels[index], totalNodes: 0, learnedNodes: 0,
    rawCategories: {}, status: 'complete'
  }]));
}

function addParameter({ stats, rawCategories, pageCategories, parameter, nodeIndex }) {
  const [category, scale, values] = parameter;
  const raw = Number(values?.[nodeIndex]) || 0;
  rawCategories[category] = (rawCategories[category] || 0) + raw;
  pageCategories[category] = (pageCategories[category] || 0) + raw;
  if (category === 0) stats.attack += raw;
  if (category === 1) stats.hp += raw;
  if (category === 2) stats.critRate += raw;
  if (category === 3) stats.stun += raw * (Number(scale) || 1);
}

function masterLevelData(level) {
  const row = UPGRADE_DATA.mlv[Math.max(0, level - 1)] || [0, 0, 0];
  return { level, hp: Number(row[0]) || 0, attack: Number(row[1]) || 0, damageCapPct: Number(row[2]) || 0 };
}

export function decodeCharacterProgression(options) {
  const { index, characterId, characterUnitId, masteryHashes = [] } = options;
  const model = UPGRADE_DATA.characters[characterId];
  const warnings = [];
  const pages = emptyPages();
  const stats = { hp: 0, attack: 0, critRate: 0, stun: 0 };
  const rawCategories = {};
  const base = progressionBase(characterUnitId);
  if (!model) {
    return { version: UPGRADE_DATA.version, characterId, base, valid: false, pages, stats: null, warnings: [
      { code: 'missingCharacterProgressionCatalog', characterId, characterUnitId }
    ] };
  }

  const slots = slotsByHash(index, base);
  for (const [effectHash, pageIndex, parameterRefs, nodeIndexes] of model.effects) {
    const page = pages[PAGE_KEYS[pageIndex]];
    page.totalNodes += nodeIndexes.length;
    const matches = slots.get(unsigned(effectHash)) || [];
    if (matches.length !== 1) {
      page.status = 'ambiguous';
      warnings.push({
        code: 'characterProgressionSlotMatch', characterId, characterUnitId,
        effectHash: unsigned(effectHash), matchCount: matches.length
      });
      continue;
    }
    const stateRecord = index.get(1602)?.get(base + matches[0]);
    if (!stateRecord) {
      page.status = 'ambiguous';
      warnings.push({
        code: 'missingCharacterProgressionState', characterId, characterUnitId,
        effectHash: unsigned(effectHash), slot: matches[0]
      });
      continue;
    }
    const state = unsigned(first(stateRecord));
    for (const nodeIndex of nodeIndexes) {
      if (!(state & (1 << nodeIndex))) continue;
      page.learnedNodes += 1;
      for (const parameterRef of parameterRefs) {
        addParameter({
          stats,
          rawCategories,
          pageCategories: page.rawCategories,
          parameter: UPGRADE_DATA.params[parameterRef],
          nodeIndex
        });
      }
    }
  }

  const masterLevel = Math.min(UPGRADE_DATA.mlv.length, masteryHashes.filter(hash => {
    const value = unsigned(hash);
    return value && value !== EMPTY_HASH;
  }).length);
  const master = masterLevelData(masterLevel);
  const fateRow = UPGRADE_DATA.fate[model.canonical] || [0, 0];
  const fate = { hp: Number(fateRow[0]) || 0, attack: Number(fateRow[1]) || 0 };
  const valid = warnings.length === 0;
  return {
    version: UPGRADE_DATA.version,
    characterId,
    base,
    valid,
    pages,
    stats: valid ? stats : null,
    rawCategories: valid ? rawCategories : null,
    master,
    fate,
    warnings
  };
}

export function traitCurveValue(name, level, valueIndex = 0) {
  const row = UPGRADE_DATA.curves[name]?.[Math.max(0, Math.round(Number(level) || 0))];
  return Number(row?.[valueIndex]) || 0;
}
