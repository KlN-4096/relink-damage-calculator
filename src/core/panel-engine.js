import { TABLES } from '../data/data.js';
import { traitCurveValue } from '../save/save-progression.js';

const bounded = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const lookup = (table, level) => table[Math.min(table.length - 1, Math.max(0, Math.round(Number(level) || 0)))] || 0;
const has = (levels, name) => (levels[name] || 0) > 0;
const lv = (levels, name) => levels[name] || 0;
const interp = (level, a, av, b, bv) => level <= a ? av * level / a : level >= b ? bv : av + (level - a) * (bv - av) / (b - a);
const compact = value => Number(Number(value).toFixed(8));
const present = parts => parts.filter(part => Number(part.value));
const part = (label, value, unit = '') => ({ label, value: Number(value) || 0, unit });
const PANEL_EVIDENCE = '2.0.2 游戏表；菲迪埃尔当前存档面板实测吻合，其他角色仍待面板对照';

const STAT_FIELDS = {
  hp: ['hp', 'hp', 'hp'],
  attack: ['atk', 'attack', 'attack'],
  critRate: ['crit', 'critRate', 'critRate'],
  stun: ['stun', 'stun', 'stun']
};

function progression(config) {
  return config.progression?.valid ? config.progression : null;
}

export function progressionStatParts(config, field) {
  const current = progression(config);
  if (!current) return [];
  return present([
    part('角色强化', current.stats?.[field]),
    part('Master 等级', current.master?.[field]),
    part('角色篇章', current.fate?.[field])
  ]);
}

function progressionValue(config, field) {
  return progressionStatParts(config, field).reduce((sum, item) => sum + item.value, 0);
}

export function baseStatParts(config, weapon, field, scale = 1) {
  const [baseField, characterField, itemField] = STAT_FIELDS[field];
  if (!weapon.dynamic) return [part('角色与武器模板', (Number(weapon.base[baseField]) || 0) * scale)];
  return present([
    part('角色基础', (Number(config.characterStats?.[characterField]) || 0) * scale),
    part('武器', (Number(config.weaponItem?.currentStats?.[itemField]) || 0) * scale)
  ]);
}

function exactTrait(levels, name, valueIndex, fallback) {
  if (!has(levels, name)) return 0;
  const exact = traitCurveValue(name, lv(levels, name), valueIndex);
  return exact || fallback;
}

function formula(status, evidence, groups, expression) {
  return { status, evidence, groups, formula: expression };
}

export function calculateHp(options) {
  const { levels, synergy, config, weapon, mastery, direct } = options;
  const legacy = config.mastery || {};
  const vitality = exactTrait(levels, '体力', 0, lookup(TABLES.hp, lv(levels, '体力')));
  const legacyHp = bounded(legacy.hp, 0, 4) * 15000;
  const synergyHp = synergy.defense * bounded(legacy.synDef, 0, 1) * 10000;
  const flat = progressionValue(config, 'hp') + vitality + legacyHp + synergyHp + mastery.flatHp + direct.flatHp;
  const addends = present([
    ...baseStatParts(config, weapon, 'hp'), ...progressionStatParts(config, 'hp'),
    part('体力', vitality), part('旧版专精', legacyHp), part('旧版防御联动', synergyHp),
    part('专精', mastery.flatHp), part('超限/召唤石副词条', direct.flatHp)
  ]);
  const applied = vitality ? ['体力'] : [];
  const multipliers = [];
  let multiplier = 1;
  const multiply = (name, value) => {
    if (!has(levels, name)) return;
    multiplier *= value;
    multipliers.push(part(name, value, '×'));
    applied.push(name);
  };
  const guard = exactTrait(levels, '守护', 0, lookup(TABLES.guard, lv(levels, '守护')));
  const diamond = exactTrait(levels, '金刚', 0, interp(lv(levels, '金刚'), 15, 50, 30, 80));
  multiply('守护', 1 + guard / 100);
  multiply('金刚', 1 + diamond / 100);
  multiply('钳蟹的报恩', 1.2);
  multiply('小钳蟹召唤石', 1 + exactTrait(levels, '小钳蟹召唤石', 1, 0) / 100);
  multiply('天星之界', 1 - exactTrait(levels, '天星之界', 0, 30) / 100);
  multiply('暴君', 1 - exactTrait(levels, '暴君', 0, 20) / 100);
  const masteryMultiplier = 1 + Math.max(-100, Number(mastery.hpPct) || 0) / 100;
  multiplier *= masteryMultiplier;
  if (masteryMultiplier !== 1) multipliers.push(part('专精 HP', masteryMultiplier, '×'));
  const base = weapon.base.hp + flat;
  const raw = base * multiplier;
  const final = Math.max(0, Math.round(raw));
  const groups = [
    { label: '基础加算', operator: '+', parts: addends, result: base },
    { label: 'HP 乘区', operator: '×', parts: multipliers, result: compact(multiplier), resultUnit: '×' }
  ];
  return {
    final, base, flat, multiplier, applied,
    derivation: formula('observed', PANEL_EVIDENCE, groups,
      `round(${compact(base)} × ${compact(multiplier)}) = round(${compact(raw)}) = ${final}`)
  };
}

export function calculateCrit(options) {
  const { levels, config, weapon, context, mastery, direct } = options;
  const trait = lookup(TABLES.crit, lv(levels, '暴击率'));
  const addends = present([
    ...baseStatParts(config, weapon, 'critRate'), ...progressionStatParts(config, 'critRate'),
    part('暴击率因子', trait), part('战斗条件', context.critBonusPct),
    part('专精', mastery.critRatePct), part('超限/召唤石副词条', direct.critRatePct)
  ]);
  const raw = addends.reduce((sum, item) => sum + item.value, 0);
  const probability = Math.min(1, Math.max(0, raw / 100));
  const multiplier = 2 + lookup(TABLES.critDamage, lv(levels, '暴击伤害')) / 100
    + (Number(context.critDamageBonusPct) || 0) / 100 + mastery.critDamagePct / 100;
  const applied = ['暴击率', '暴击伤害'].filter(name => has(levels, name));
  const groups = [{ label: '暴击率加算', operator: '+', parts: addends, result: raw, resultUnit: '%' }];
  return {
    raw, probability, multiplier, applied,
    derivation: formula('observed', PANEL_EVIDENCE, groups, `暴击率 = ${compact(raw)}%`)
  };
}

export function calculateStun(options) {
  const { levels, config, weapon, mastery, direct } = options;
  const baseParts = baseStatParts(config, weapon, 'stun', 10);
  const progressionParts = progressionStatParts(config, 'stun');
  const trait = exactTrait(levels, '昏厥', 0, 0) * 10;
  const masteryFlat = (Number(mastery.stunFlat) || 0) * 10;
  const addends = present([
    ...baseParts, ...progressionParts, part('昏厥因子/祝福', trait),
    part('专精', masteryFlat), part('超限/召唤石副词条', direct.stunFlat)
  ]);
  const base = baseParts.reduce((sum, item) => sum + item.value, 0)
    + progressionParts.reduce((sum, item) => sum + item.value, 0);
  const flat = trait + masteryFlat + (Number(direct.stunFlat) || 0);
  const pct = (Number(mastery.stunPct) || 0) + (Number(direct.stunPct) || 0);
  const subtotal = base + flat, multiplier = 1 + pct / 100;
  const final = Math.max(0, Math.round(subtotal * multiplier));
  const groups = [
    { label: '昏厥值加算', operator: '+', parts: addends, result: subtotal },
    { label: '百分比修正', operator: '×', parts: [part('昏厥倍率', multiplier, '×')], result: multiplier, resultUnit: '×' }
  ];
  return {
    final, base, flat, pct, applied: trait ? ['昏厥'] : [],
    derivation: formula('observed', `${PANEL_EVIDENCE}；基础昏厥按面板 10 倍显示`, groups,
      `round(${compact(subtotal)} × ${compact(multiplier)}) = ${final}`)
  };
}
