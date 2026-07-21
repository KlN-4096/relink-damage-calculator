import { GAME_CATALOG_DATA } from './game-catalog-data.js';
import { groupByMap } from '../shared/collections.js';

const EMPTY_HASH = 0x887AE0B0;
const AWAKEN_THRESHOLDS = [3, 5, 7, 10];
const LIMIT_EFFECTS = new Map([
  [0xC4925BD7, ['攻击力', 'flatAttack']], [0xD75B92C4, ['攻击力', 'flatAttack']],
  [0x68B39018, ['奥义连锁伤害', 'chainBurstDamagePct']], [0x1890B368, ['奥义连锁伤害', 'chainBurstDamagePct']],
  [0x45C65767, ['暴击率', 'critRatePct']], [0x6757C645, ['暴击率', 'critRatePct']],
  [0x54929589, ['回复上限', 'healingCapPct']], [0x89959254, ['回复上限', 'healingCapPct']],
  [0x52A207B5, ['最大 HP', 'flatHp']], [0xB507A252, ['最大 HP', 'flatHp']],
  [0x43B7581D, ['普通攻击伤害上限', 'normalCapPct']], [0x1D58B743, ['普通攻击伤害上限', 'normalCapPct']],
  [0x4A4C093D, ['奥义伤害上限', 'sbaCapPct']], [0x3D094C4A, ['奥义伤害上限', 'sbaCapPct']],
  [0x4E42646B, ['奥义伤害', 'sbaDamagePct']], [0x6B64424E, ['奥义伤害', 'sbaDamagePct']],
  [0x9C555433, ['能力伤害上限', 'skillCapPct']], [0x3354559C, ['能力伤害上限', 'skillCapPct']],
  [0x9A97C049, ['能力伤害', 'skillDamagePct']], [0x49C0979A, ['能力伤害', 'skillDamagePct']],
  [0x6CB38EF3, ['昏厥值', 'stunFlat']], [0xF38EB36C, ['昏厥值', 'stunFlat']]
]);
const SUMMON_MODIFIERS = {
  400: 'flatAttack', 401: 'flatHp', 402: 'critRatePct', 403: 'stunFlat',
  404: 'skillDamagePct', 405: 'sbaDamagePct', 406: 'chainBurstDamagePct',
  407: 'normalCapPct', 408: 'skillCapPct', 409: 'sbaCapPct', 416: 'healingCapPct'
};
const TRAIT_ALIASES = new Map([
  ['攻击力', '攻击'], ['最大HP', '体力'], ['最大 HP', '体力'], ['普通攻击伤害上限', '普攻伤害上限'],
  ['SKILL_141_00', '小钳蟹召唤石']
]);

const unsigned = value => Number(value) >>> 0;
const byHash = rows => new Map(rows.map(row => [unsigned(row.hash), row]));
const byId = rows => new Map(rows.map(row => [row.id, row]));
const rowsAt = (rows, level) => (rows || []).filter(row => Number(row[0]) <= level);

// Game text templates keep "{0}" placeholders and "<d>" style markup; fill the
// placeholders with the node's own effect values so the UI shows real numbers.
const compactNumber = value => Number.isFinite(Number(value)) ? String(Number(value)) : String(value);

function fillEffectTemplate(text, parts) {
  const values = parts?.[0]?.values || [];
  return String(text || '')
    .replace(/<[^<>\n]{1,16}>/g, '')
    .replace(/\{(\d)\}/g, (token, index) => {
      const value = values[Number(index)];
      return value === undefined || value === null ? token : compactNumber(value);
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAbilityRefs(part, abilitiesByHash) {
  const abilityIds = (part.abilityIds || []).map(reference => {
    const raw = String(reference);
    if (raw.startsWith('AB_')) return raw;
    const ability = abilitiesByHash.get(Number.parseInt(raw, 16) >>> 0);
    return ability ? ability.id : raw;
  });
  return { ...part, abilityIds };
}

const ABILITIES_BY_HASH = byHash(GAME_CATALOG_DATA.abilities);
const MASTERY_NODES = GAME_CATALOG_DATA.mastery.map(node => {
  const parts = (node.parts || []).map(part => normalizeAbilityRefs(part, ABILITIES_BY_HASH));
  return {
    ...node,
    parts,
    name: fillEffectTemplate(node.name, parts),
    description: fillEffectTemplate(node.description, parts)
  };
});

function lastStatRow(rows, level) {
  const eligible = rowsAt(rows, level);
  return eligible.at(-1) || [level, 0, 0, 0, 0];
}

function sumStatRows(rows, level) {
  return rowsAt(rows, level).reduce((total, row) => {
    for (let index = 1; index <= 4; index += 1) total[index] += Number(row[index]) || 0;
    return total;
  }, [level, 0, 0, 0, 0]);
}

function addStats(...rows) {
  return rows.reduce((total, row) => {
    for (let index = 1; index <= 4; index += 1) total[index] += Number(row[index]) || 0;
    return total;
  }, [rows[0]?.[0] || 0, 0, 0, 0, 0]);
}

export function normalizeTraitName(name) {
  const value = String(name || '').trim();
  return TRAIT_ALIASES.get(value) || value;
}

export function weaponLevelFromXp(xp) {
  const value = Math.max(0, Number(xp) || 0);
  let level = 1;
  for (let index = 0; index < GAME_CATALOG_DATA.weaponExp.length; index += 1) {
    if (value < GAME_CATALOG_DATA.weaponExp[index]) break;
    level = index + 1;
  }
  return level;
}

export function characterStatsAt(characterId, level = 100) {
  const character = GAME_CATALOG.characterById.get(characterId);
  const safeLevel = Math.max(1, Math.round(Number(level) || 1));
  const row = lastStatRow(character?.stats, safeLevel);
  return { level: safeLevel, hp: row[1], attack: row[2], critRate: row[3], stun: row[4] };
}

function skillEntry(skillId, level, hash = null) {
  const trait = hash === null ? GAME_CATALOG.traitById.get(skillId) : GAME_CATALOG.traits.get(unsigned(hash));
  return {
    id: trait?.id || skillId || `0x${unsigned(hash).toString(16).toUpperCase().padStart(8, '0')}`,
    hash: trait?.hash ?? (hash === null ? null : unsigned(hash)),
    name: normalizeTraitName(trait?.name || skillId || '未知武器技能'),
    level: Number(level) || 0
  };
}

function rebuiltSkills(weapon, item) {
  const current = item.currentSkillHashes || [];
  const rank = Math.max(0, Math.round(Number(item.transcendence) || 0));
  return weapon.rebuildSkills.slice().sort((a, b) => a.slot - b.slot).map(slot => {
    const hash = current[slot.slot - 1];
    const trait = GAME_CATALOG.traits.get(unsigned(hash));
    const option = slot.options.find(candidate => candidate.skill === trait?.id) || slot.options[0];
    const level = option?.levels?.[Math.min(rank, option.levels.length - 1)] || 0;
    return skillEntry(option?.skill, level, hash);
  }).filter(skill => skill.level > 0);
}

function standardSkills(weapon, item) {
  const uncap = Math.max(0, Math.round(Number(item.uncap) || 0));
  const awaken = Math.max(0, Math.round(Number(item.awakenLevel) || 0));
  return weapon.skills.map(skill => {
    const base = Number(skill.uncap[Math.min(uncap, skill.uncap.length - 1)]) || 0;
    const extra = skill.awake.reduce((total, value, index) => total + (awaken >= AWAKEN_THRESHOLDS[index] ? Number(value) || 0 : 0), 0);
    return skillEntry(skill.skill, base + extra);
  }).filter(skill => skill.level > 0);
}

export function resolveWeaponItem(rawItem = {}) {
  const hash = unsigned(rawItem.hash);
  const weapon = GAME_CATALOG.weapons.get(hash);
  if (!weapon) return { ...rawItem, hash };
  const level = weaponLevelFromXp(rawItem.xp);
  const base = lastStatRow(weapon.status, level);
  const plus = sumStatRows(weapon.plusStats, Math.max(0, Number(rawItem.plusMarks) || 0));
  const awake = sumStatRows(weapon.awakeStats, Math.max(0, Number(rawItem.awakenLevel) || 0));
  const rebuild = sumStatRows(weapon.rebuildStats, Math.max(0, Number(rawItem.transcendence) || 0));
  const stats = addStats(base, plus, awake, rebuild);
  const currentSkills = weapon.rebuildSkills.length ? rebuiltSkills(weapon, rawItem) : standardSkills(weapon, rawItem);
  return {
    ...weapon, ...rawItem, hash, catalogId: weapon.id, name: weapon.name,
    currentStats: { level, hp: stats[1], attack: stats[2], critRate: stats[3], stun: stats[4] },
    currentSkills
  };
}

function decodedPercent(rawValue) {
  const raw = Math.max(0, Number(rawValue) || 0);
  if (raw <= 512) return raw / 512 * 20;
  return 20 + Math.min(511, raw - 512) / 511 * 60;
}

export function decodeLimitBonus(effectHash, rawValue) {
  const hash = unsigned(effectHash);
  const [name, kind] = LIMIT_EFFECTS.get(hash) || [`未知超限专精 0x${hash.toString(16).toUpperCase().padStart(8, '0')}`, 'unknown'];
  const percent = decodedPercent(rawValue);
  const value = kind === 'flatAttack' ? percent * 50 : kind === 'flatHp' ? percent * 100 : percent;
  return { effectHash: hash, rawValue: Number(rawValue) || 0, name, kind, value };
}

export function summonSubModifier(subTrait) {
  const key = SUMMON_MODIFIERS[Number(subTrait?.paramId)];
  return key ? { [key]: Number(subTrait.value) || 0 } : {};
}

export const GAME_CATALOG = {
  version: GAME_CATALOG_DATA.version,
  characters: byHash(GAME_CATALOG_DATA.characters),
  characterById: byId(GAME_CATALOG_DATA.characters),
  traits: byHash(GAME_CATALOG_DATA.traits),
  traitById: byId(GAME_CATALOG_DATA.traits),
  sigils: byHash(GAME_CATALOG_DATA.sigils),
  weapons: byHash(GAME_CATALOG_DATA.weapons),
  weaponById: byId(GAME_CATALOG_DATA.weapons),
  abilities: byHash(GAME_CATALOG_DATA.abilities),
  abilityById: byId(GAME_CATALOG_DATA.abilities),
  mastery: byHash(MASTERY_NODES),
  masteryByKey: new Map(MASTERY_NODES.map(node => [node.key, node])),
  masteryByCharacter: groupByMap(MASTERY_NODES, node => node.characterId),
  summons: byHash(GAME_CATALOG_DATA.summons),
  summonParams: byHash(GAME_CATALOG_DATA.summonParams),
  characterStatsAt,
  normalizeTraitName,
  limitBonus: decodeLimitBonus,
  resolveWeaponItem
};

export { EMPTY_HASH };
