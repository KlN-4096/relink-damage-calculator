import { decodeCharacterProgression } from './save-progression.js';

const EMPTY_HASH = 0x887AE0B0;
const FACTOR_UNIT_START = 30_000;
const WEAPON_UNIT_START = 40_000;
const FACTOR_TRAIT_START = 120_000_000;
const WEAPON_TRAIT_START = 130_000_000;
const BLESSING_UNIT_START = 50_000;
const BLESSING_UNIT_END = 55_000;
const BLESSING_TRAIT_START = 140_000_000;
const OVERMASTERY_UNIT_BASE = 10_000_000;
const CHARACTER_UNIT_START = 10_000;
const ACTIVE_PARTY_LOADOUT_START = 104_000;
const ACTIVE_PARTY_LOADOUT_END = 104_004;
const unsigned = value => Number(value) >>> 0;
const first = (record, fallback = 0) => record?.values?.[0] ?? fallback;
const isPresentHash = value => unsigned(value) !== 0 && unsigned(value) !== EMPTY_HASH;

function indexRecords(records) {
  const byType = new Map();
  for (const record of records) {
    if (!byType.has(record.idType)) byType.set(record.idType, new Map());
    const units = byType.get(record.idType);
    if (!units.has(record.unitId)) units.set(record.unitId, record);
  }
  return byType;
}
const recordAt = (index, idType, unitId) => index.get(idType)?.get(unitId);
const valuesAt = (index, idType, unitId) => recordAt(index, idType, unitId)?.values || [];
const valueAt = (index, idType, unitId, fallback = 0) => first(recordAt(index, idType, unitId), fallback);

function catalogValue(catalog, hash, kind) {
  const key = unsigned(hash);
  const found = catalog?.get(key) || catalog?.get(hash);
  if (found) return { ...found, hash: key, unknown: false };
  const hex = `0x${key.toString(16).toUpperCase().padStart(8, '0')}`;
  return { id: hex, name: `未知${kind} ${hex}`, hash: key, unknown: true };
}
function traitAt(index, catalogs, unitId) {
  const hash = valueAt(index, 1701, unitId);
  if (!isPresentHash(hash)) return null;
  const trait = catalogValue(catalogs.traits, hash, '特性');
  return {
    ...trait,
    name: catalogs.normalizeTraitName?.(trait.name) || trait.name,
    level: Number(valueAt(index, 1702, unitId)) || 0
  };
}
function factorInventory(index, catalogs) {
  const rows = [];
  for (const [unitId, hashRecord] of index.get(2703) || []) {
    const hash = first(hashRecord);
    if (!isPresentHash(hash)) continue;
    const inventoryIndex = unitId - FACTOR_UNIT_START;
    const traitBase = FACTOR_TRAIT_START + inventoryIndex * 100;
    rows.push({
      ...catalogValue(catalogs.sigils, hash, '因子'),
      unitId,
      slot: Number(valueAt(index, 2702, unitId)) || 0,
      level: Number(valueAt(index, 2704, unitId)) || 0,
      ownerHash: unsigned(valueAt(index, 2706, unitId)),
      flags: Number(valueAt(index, 2707, unitId)) || 0,
      traits: [traitAt(index, catalogs, traitBase), traitAt(index, catalogs, traitBase + 1)].filter(Boolean)
    });
  }
  return rows;
}

function weaponInventory(index, catalogs) {
  const rows = [];
  for (const [unitId, hashRecord] of index.get(2803) || []) {
    const hash = first(hashRecord);
    if (!isPresentHash(hash)) continue;
    const inventoryIndex = unitId - WEAPON_UNIT_START;
    const traitBase = WEAPON_TRAIT_START + inventoryIndex * 100;
    const item = {
      ...catalogValue(catalogs.weapons, hash, '武器'),
      unitId,
      slot: Number(valueAt(index, 2802, unitId)) || 0,
      xp: Number(valueAt(index, 2804, unitId)) || 0,
      uncap: Number(valueAt(index, 2805, unitId)) || 0,
      plusMarks: Number(valueAt(index, 2806, unitId)) || 0,
      awakenLevel: Number(valueAt(index, 2807, unitId)) || 0,
      transcendence: Number(valueAt(index, 2817, unitId)) || 0,
      blessingHash: unsigned(valueAt(index, 2816, unitId)),
      currentSkillHashes: valuesAt(index, 2818, unitId).map(unsigned).filter(isPresentHash),
      blessings: [0, 1, 2].map(lane => traitAt(index, catalogs, traitBase + lane)).filter(Boolean)
    };
    rows.push(catalogs.resolveWeaponItem?.(item) || item);
  }
  return rows;
}

function blessingInventory(index, catalogs) {
  const rows = [];
  for (const [unitId, hashRecord] of index.get(2102) || []) {
    if (unitId < BLESSING_UNIT_START || unitId >= BLESSING_UNIT_END) continue;
    const hash = unsigned(first(hashRecord));
    if (!isPresentHash(hash)) continue;
    const slot = unitId - BLESSING_UNIT_START;
    const traitBase = BLESSING_TRAIT_START + slot * 100;
    const traits = [0, 1, 2].map(lane => traitAt(index, catalogs, traitBase + lane)).filter(Boolean);
    if (!traits.length) continue;
    rows.push({
      id: `blessing-${slot}`, name: `祝福 #${slot + 1}`, hash, unitId, slot,
      serial: Number(valueAt(index, 2103, unitId)) || 0,
      active: Boolean(valueAt(index, 2104, unitId)),
      flags: Number(valueAt(index, 2105, unitId)) || 0,
      traits
    });
  }
  return rows;
}

function summonInventory(index, catalogs) {
  const rows = [];
  for (const [unitId, idRecord] of index.get(1456) || []) {
    const rank = Number(valueAt(index, 1460, unitId)) || 0;
    if (rank <= 0) continue;
    const summonId = Number(first(idRecord)) || 0;
    const hash = valueAt(index, 1457, unitId);
    const params = valuesAt(index, 1458, unitId);
    const levels = valuesAt(index, 1459, unitId);
    const mainTraitRaw = isPresentHash(params[0])
      ? { ...catalogValue(catalogs.traits, params[0], '召唤石主词条'), level: Number(levels[0]) || 0 }
      : null;
    const mainTrait = mainTraitRaw
      ? { ...mainTraitRaw, name: catalogs.normalizeTraitName?.(mainTraitRaw.name) || mainTraitRaw.name }
      : null;
    const subCatalog = isPresentHash(params[1]) ? catalogValue(catalogs.summonParams, params[1], '召唤石副词条') : null;
    const subLevelIndex = Math.max(0, Number(levels[1]) || 0);
    const subTrait = subCatalog ? {
      ...subCatalog,
      levelIndex: subLevelIndex,
      level: subLevelIndex + 1,
      value: subCatalog.values?.[subLevelIndex] ?? subLevelIndex
    } : null;
    rows.push({
      ...catalogValue(catalogs.summons, hash, '召唤石'),
      unitId,
      summonId,
      rank,
      mainTrait,
      subTrait
    });
  }
  return rows;
}

const factorPairs = items => items.map(item => {
    const [main, sub] = item.traits;
    return [main?.name || '', main?.level || item.level || 0, sub?.name || '', sub?.level || 0];
  });

const summonPairs = items => items.filter(item => item.mainTrait)
  .map(item => [item.mainTrait.name, item.mainTrait.level]);

function abilityInventory(index, catalogs) {
  const rows = [];
  for (const [unitId, hashRecord] of index.get(3903) || []) {
    const hash = first(hashRecord);
    if (!isPresentHash(hash)) continue;
    rows.push({
      ...catalogValue(catalogs.abilities, hash, '能力'),
      unitId,
      flags: Number(valueAt(index, 3904, unitId)) || 0
    });
  }
  return rows;
}

function limitBonuses(index, catalogs, characterUnitId) {
  const groupIndex = characterUnitId - CHARACTER_UNIT_START;
  if (groupIndex < 0 || groupIndex >= 40) return [];
  return [0, 1, 2, 3].map(lane => {
    const unitId = OVERMASTERY_UNIT_BASE + groupIndex * 1000 + lane;
    const effectHash = unsigned(valueAt(index, 1606, unitId));
    if (!isPresentHash(effectHash)) return null;
    const rawValue = Number(valueAt(index, 1607, unitId)) || 0;
    return {
      ...(catalogs.limitBonus?.(effectHash, rawValue) || catalogValue(catalogs.limitBonuses, effectHash, '超限专精')),
      unitId,
      lane: lane + 1,
      effectHash,
      rawValue
    };
  }).filter(Boolean);
}

function masteryLoadout(index, characterHash, weaponSlot, factorSlots) {
  let best = null;
  let bestScore = -1;
  for (const [unitId, record] of index.get(3003) || []) {
    if (unsigned(first(record)) !== characterHash) continue;
    const candidateWeapon = Number(valueAt(index, 1402, unitId));
    const candidateFactors = valuesAt(index, 1403, unitId).filter(Boolean);
    const activeParty = unitId >= ACTIVE_PARTY_LOADOUT_START && unitId < ACTIVE_PARTY_LOADOUT_END;
    const score = (activeParty ? 1_000 : 0)
      + (candidateWeapon === weaponSlot ? 100 : 0)
      + candidateFactors.filter(slot => factorSlots.includes(Number(slot))).length;
    if (score <= bestScore) continue;
    bestScore = score;
    best = { unitId, nodeHashes: valuesAt(index, 3007, unitId) };
  }
  return best;
}

const masteryNodes = (hashes, catalogs, characterId) => hashes.filter(isPresentHash).map(hash => ({
    ...catalogValue(catalogs.mastery, hash, '专精节点'),
    characterId
  }));

function selectedFactors(inventory, slots, characterHash) {
  return slots.map(slot => inventory.find(item => item.slot === slot && item.ownerHash === characterHash)
    || inventory.find(item => item.slot === slot)).filter(Boolean);
}

function characterEntries(index, catalogs, inventory, equippedSummonIds, warnings) {
  const characters = {};
  const equippedSummons = equippedSummonIds.map(id => inventory.summons.find(item => item.summonId === id)).filter(Boolean);
  for (const [unitId, hashRecord] of index.get(1301) || []) {
    const characterHash = unsigned(first(hashRecord));
    if (!isPresentHash(characterHash)) continue;
    if (catalogs.characters && !catalogs.characters.get(characterHash)) continue;
    const character = catalogValue(catalogs.characters, characterHash, '角色');
    const weaponSlot = Number(valueAt(index, 1402, unitId)) || 0;
    const equippedWeapon = inventory.weapons.find(item => item.slot === weaponSlot) || null;
    const slots = valuesAt(index, 1403, unitId).map(Number).filter(Boolean);
    const equippedFactors = selectedFactors(inventory.factors, slots, characterHash);
    const loadout = masteryLoadout(index, characterHash, weaponSlot, slots);
    const nodes = masteryNodes(loadout?.nodeHashes || [], catalogs, character.id);
    const progression = decodeCharacterProgression({
      index,
      characterId: character.id,
      characterUnitId: unitId,
      masteryHashes: loadout?.nodeHashes || []
    });
    warnings.push(...progression.warnings);
    const equippedAbilities = valuesAt(index, 1404, unitId).filter(isPresentHash)
      .map(hash => catalogValue(catalogs.abilities, hash, '能力'));
    const abilities = inventory.abilities.filter(item => item.characterId === character.id);
    const bonuses = limitBonuses(index, catalogs, unitId);
    const level = Number(valueAt(index, 1308, unitId)) || 0;
    const staticStats = catalogs.characterStatsAt?.(character.id, level);
    const characterStats = {
      level,
      hp: Number(valueAt(index, 1309, unitId)) || 0,
      attack: Number(valueAt(index, 1310, unitId)) || 0,
      stun: Number(staticStats?.stun ?? valueAt(index, 1311, unitId)) || 0,
      critRate: Number(valueAt(index, 1313, unitId)) || 0
    };
    characters[character.id] = {
      id: character.id,
      name: character.name,
      hash: characterHash,
      level: characterStats.level,
      unitId,
      abilities,
      equippedAbilities,
      build: {
        weapon: equippedWeapon?.archetype || equippedWeapon?.name || '觉醒武器',
        weaponItem: equippedWeapon,
        awakenLevel: equippedWeapon?.awakenLevel || 0,
        weaponSkill1: equippedWeapon?.currentSkills?.[0] ? [equippedWeapon.currentSkills[0].name, equippedWeapon.currentSkills[0].level] : null,
        weaponSkill2: equippedWeapon?.currentSkills?.[1] ? [equippedWeapon.currentSkills[1].name, equippedWeapon.currentSkills[1].level] : null,
        mastery: {},
        masteryNodes: nodes,
        limitBonuses: bonuses,
        blessings: (equippedWeapon?.blessings || []).map(trait => [trait.name, trait.level]),
        blessingItem: equippedWeapon ? {
          id: `equipped-blessing-${equippedWeapon.unitId}`,
          name: '当前武器祝福',
          weaponUnitId: equippedWeapon.unitId,
          hash: equippedWeapon.blessingHash,
          traits: equippedWeapon.blessings || [],
          virtual: false,
          equipped: true
        } : null,
        factorPairs: factorPairs(equippedFactors),
        factorItems: equippedFactors,
        summonStones: equippedSummons,
        summons: summonPairs(equippedSummons),
        abilities,
        equippedAbilityIds: equippedAbilities.map(item => item.id),
        characterStats,
        progression,
        source: { kind: 'save', itemId: unitId, virtual: false }
      }
    };
  }
  return characters;
}

export function mapSaveRecords(records, catalogs = {}, options = {}) {
  const index = indexRecords(records);
  const warnings = [];
  const inventory = {
    weapons: weaponInventory(index, catalogs),
    factors: factorInventory(index, catalogs),
    blessings: blessingInventory(index, catalogs),
    summons: summonInventory(index, catalogs),
    abilities: abilityInventory(index, catalogs)
  };
  const equippedSummonIds = valuesAt(index, 1451, 0).map(Number).filter(Boolean);
  return {
    format: 'GBFR-SaveData',
    readOnly: true,
    fileName: String(options.fileName || 'SaveData1.dat'),
    importedAt: options.importedAt || new Date().toISOString(),
    gameVersion: options.gameVersion || null,
    hashValid: options.hashValid ?? null,
    characters: characterEntries(index, catalogs, inventory, equippedSummonIds, warnings),
    inventory,
    equippedSummonIds,
    warnings
  };
}
