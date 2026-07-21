import { FACTOR_MAX, SPECIAL_LEVELS, SYNERGY, TABLES, WEAPONS } from '../data/data.js';
import { normalizeTraitName, summonSubModifier } from '../data/game-catalog.js';
import { summarizeMastery } from './mastery-engine.js';
import { baseStatParts, calculateCrit, calculateHp, calculateStun, progressionStatParts } from './panel-engine.js';
import { calculateDefense } from './defense-engine.js';
import { progressionCapParts } from './progression-cap.js';
import { traitCurveValue } from '../save/save-progression.js';

const exactTrait = (levels, name, valueIndex, fallback) => {
  if (!(levels[name] > 0)) return 0;
  return traitCurveValue(name, levels[name], valueIndex) || fallback;
};

const CHAOFAN = new Set(['超凡强击', '超凡技艺', '超凡奥秘', '超凡破限']);
const SPECIAL_TABLES = {
  ecruAtk: [0, .26, .28, .30, .32, .34, .36, .38, .40, .41, .42, .43, .44, .45, .46, .50],
  ecruCap: [0, .5, .6, .7, .8, .9, 1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6],
  cardinalAtk: [0, .3, .3, .3, .3, .3, .35, .35, .35, .35, .35, .4],
  cardinalCap: [0, .8, .9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.9, 3.1],
  cobaltAtk: [0, .26, .28, .30, .32, .34, .36, .38, .40, .41, .42, .43, .44, .45, .46, .50],
  cobaltCap: [0, .6, .7, .8, .9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2, 2.3, 2.7],
  sageAtk: [0, .25, .25, .25, .25, .25, .3, .3, .3, .3, .3, .35],
  sageCap: [0, .9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2, 2.2, 2.4, 2.6, 2.8],
  supernovaAtk: [0, .12, .14, .16, .18, .2, .22, .24, .26, .28, .3, .32, .34, .36, .38, .4],
  supernovaCap: [0, 1.4, 1.5, 1.6, 1.7, 1.8, 2, 2.5, 3, 3.05, 3.1, 3.15, 3.2, 3.3, 3.4, 3.5],
  unboundMaster: [0, .005, .01, .015, .02, .025, .03, .035, .04, .045, .05, .055, .06, .065, .07, .075, .08, .085, .09, .095, .1, .105, .11, .115, .12, .125, .13, .135, .14, .145, .15, .155, .16, .165, .17, .175, .18, .185, .19, .195, .2, .205, .21, .215, .22, .225, .23, .235, .24, .245, .25, .3, .35, .4, .45, .5]
};
const HAVOC_ATK = [50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70];
const HAVOC_CAP = [100, 250, 400, 410, 420, 430, 440, 450, 460, 470, 500];
const HAVOC_HP = [45000, 110000, 120000, 130000, 140000, 150000, 160000, 170000, 180000, 190000, 200000];

const bounded = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const compact = value => Number(Number(value).toFixed(8));
const clampLevel = (name, value) => Math.min(FACTOR_MAX[name] || SPECIAL_LEVELS[name] || 15, Math.max(0, Math.round(Number(value) || 0)));
const lookup = (table, level) => table[Math.min(table.length - 1, Math.max(0, Math.round(Number(level) || 0)))] || 0;
const has = (levels, name) => (levels[name] || 0) > 0;
const lv = (levels, name) => levels[name] || 0;
const DIRECT_FIELDS = ['flatAttack', 'flatHp', 'critRatePct', 'normalCapPct', 'skillCapPct', 'sbaCapPct', 'skillDamagePct', 'sbaDamagePct', 'chainBurstDamagePct', 'healingCapPct', 'stunFlat', 'stunPct'];

function directModifiers(config) {
  const output = Object.fromEntries(DIRECT_FIELDS.map(field => [field, 0]));
  output.sources = [];
  const add = (field, value, source, kind) => {
    if (!DIRECT_FIELDS.includes(field) || !Number(value)) return;
    output[field] += Number(value);
    output.sources.push({ field, value: Number(value), source, kind });
  };
  (config.limitBonuses || []).forEach(item => add(item.kind, item.value, item.name || '未知效果', 'overmastery'));
  (config.summonStones || []).forEach(stone => {
    const modifier = summonSubModifier(stone?.subTrait);
    Object.entries(modifier).forEach(([field, value]) => add(field, value, stone?.name || '未命名召唤石', 'summon'));
  });
  return output;
}

function weaponProfile(config) {
  const item = config.weaponItem;
  if (!item?.currentStats) return WEAPONS[config.weapon] || WEAPONS.觉醒武器;
  const character = config.characterStats || {};
  const skills = item.currentSkills || [];
  return {
    dynamic: true,
    base: {
      hp: (Number(character.hp) || 0) + (Number(item.currentStats.hp) || 0),
      atk: (Number(character.attack) || 0) + (Number(item.currentStats.attack) || 0),
      crit: (Number(character.critRate) || 0) + (Number(item.currentStats.critRate) || 0),
      stun: (Number(character.stun) || 0) + (Number(item.currentStats.stun) || 0)
    },
    factorEnhance: Number(skills.find(skill => normalizeTraitName(skill.name) === '因子强化')?.level) || 0,
    sub: [], skills
  };
}

function effectiveSubLevel(name, original, awaken) {
  if (!name || !original) return 0;
  if (name === '因子强化') return original;
  if (CHAOFAN.has(name)) return awaken >= 10 ? original : 0;
  return Math.max(0, Math.min(original, original - 10 + awaken));
}

function effectiveSkillLevel(name, original, awaken) {
  if (!name || !original || awaken <= 0) return 0;
  return Math.max(0, Math.min(original, original - 10 + awaken));
}

export function aggregateLevels(config) {
  const weapon = weaponProfile(config);
  const levels = {}, sources = {};
  const add = (name, value, boosted, source) => {
    if (!name || value <= 0) return;
    const fixed = SPECIAL_LEVELS[name];
    const amount = fixed || value + (boosted ? weapon.factorEnhance : 0);
    levels[name] = fixed ? amount : (levels[name] || 0) + amount;
    sources[name] = [...(sources[name] || []), { source, value: amount }];
  };
  if (weapon.dynamic) {
    weapon.skills.forEach(skill => add(normalizeTraitName(skill.name), Number(skill.level), false, '武器技能'));
  } else {
    weapon.sub.forEach(([name, value]) => add(name, effectiveSubLevel(name, value, config.awakenLevel), false, '武器'));
    [config.weaponSkill1, config.weaponSkill2].forEach((skill, index) => {
      if (!skill || !skill[0]) return;
      const original = Number(skill[1] || (index ? 10 : 25));
      add(skill[0], effectiveSkillLevel(skill[0], original, config.awakenLevel), false, '武器技能');
    });
  }
  (config.blessings || []).forEach(([name, value]) => add(name, value, false, '祝福'));
  (config.factorPairs || []).forEach((pair, index) => {
    add(pair[0], pair[1], true, `因子${index + 1}/1`);
    add(pair[2], pair[3], true, `因子${index + 1}/2`);
  });
  (config.summons || []).forEach(([name, value]) => add(normalizeTraitName(name), value, false, '召唤石'));
  const capped = {};
  Object.keys(levels).forEach(name => { capped[name] = clampLevel(name, levels[name]); });
  return { actual: levels, capped, sources, weapon };
}

export function countSynergy(config) {
  const count = { basic: 0, attack: 0, defense: 0 };
  (config.factorPairs || []).forEach(pair => {
    const name = Number(pair[1]) > 0 ? pair[0] : '';
    Object.keys(count).forEach(category => { if (SYNERGY[category].includes(name)) count[category] += 1; });
  });
  Object.keys(count).forEach(key => { count[key] = Math.min(5, count[key]); });
  return count;
}

function havoc(level) {
  if (level < 25) return null;
  const index = Math.min(35, level) - 25;
  return { atk: HAVOC_ATK[index], cap: HAVOC_CAP[index], hp: HAVOC_HP[index] };
}

function specialArrayValue(table, level) { return lookup(table, Math.min(level, table.length - 1)); }

function calculateAttack(levels, synergy, config, weapon, hp, crit, context, nodeMastery, direct) {
  const legacy = config.mastery || {};
  const progression = config.progression?.valid ? config.progression : null;
  const progressionAttack = progression
    ? (Number(progression.stats?.attack) || 0) + (Number(progression.master?.attack) || 0) + (Number(progression.fate?.attack) || 0)
    : 0;
  const attackTrait = lookup(TABLES.atk, lv(levels, '攻击'));
  const crabFlat = has(levels, '钳蟹的共鸣') ? 1000 : 0;
  const flat = progressionAttack + attackTrait + crabFlat
    + nodeMastery.flatAttack + direct.flatAttack;
  const legacyAttack = bounded(legacy.atk, 0, 3) * 20 + bounded(legacy.atk30, 0, 2) * 30;
  const legacySynergy = synergy.attack * bounded(legacy.synAtk, 0, 2) * 10;
  const group1 = legacyAttack + legacySynergy + nodeMastery.attackPct;
  const applied = [];
  if (has(levels, '攻击')) applied.push('攻击');
  if (has(levels, '钳蟹的共鸣')) applied.push('钳蟹的共鸣');
  let group2 = 1, panelGroup2 = 1;
  const panelFactors = [];
  const add = (name, value, visibleOnPanel = true) => {
    if (!has(levels, name)) return;
    group2 *= 1 + value / 100;
    if (visibleOnPanel) {
      panelGroup2 *= 1 + value / 100;
      panelFactors.push({ label: name, value: 1 + value / 100, unit: '×' });
    }
    applied.push(name);
  };
  add('天星之煌', lookup(TABLES.star, lv(levels, '天星之煌')), false);
  add('浪迹天涯', lookup(TABLES.wanderer, lv(levels, '浪迹天涯')), false);
  add('奋不顾身', lookup(TABLES.percent, lv(levels, '奋不顾身')));
  add('暴君', lookup(TABLES.percent, lv(levels, '暴君')));
  add('修罗', Math.min(30, lv(levels, '修罗')));
  add('刀上舞', lookup(TABLES.blade, lv(levels, '刀上舞')));
  add('穷寇心', lookup(TABLES.desperate, lv(levels, '穷寇心')));
  const havocInfo = havoc(lv(levels, '浩劫新星'));
  if (havocInfo && hp.final <= havocInfo.hp) add('浩劫新星', havocInfo.atk);
  if (!havocInfo && has(levels, '浩劫') && hp.final <= 45000) add('浩劫', exactTrait(levels, '浩劫', 0, 50));
  const ecru = lv(levels, '伤害上限轰天');
  if (ecru && hp.final >= 115000) add('伤害上限轰天', specialArrayValue(SPECIAL_TABLES.ecruAtk, ecru) * 100 - Math.max(0, 10 * (200000 - hp.final) / 85000));
  const cardinal = lv(levels, '伤害上限红天'); if (cardinal) add('伤害上限红天', specialArrayValue(SPECIAL_TABLES.cardinalAtk, cardinal) * 100);
  const cobalt = lv(levels, '伤害上限苍天'); if (cobalt && crit.raw >= 100) add('伤害上限苍天', specialArrayValue(SPECIAL_TABLES.cobaltAtk, cobalt) * 100 - Math.max(0, .1 * (200 - crit.raw)));
  const sage = lv(levels, '伤害上限疾天'); if (sage) add('伤害上限疾天', specialArrayValue(SPECIAL_TABLES.sageAtk, sage) * 100);
  const supernova = lv(levels, '超新星'); if (supernova) add('超新星', specialArrayValue(SPECIAL_TABLES.supernovaAtk, supernova) * 100);
  const base = weapon.base.atk + flat;
  const rawPanel = base * (1 + group1 / 100) * panelGroup2;
  const panel = Math.max(0, Math.round(rawPanel));
  const combat = Math.max(0, Math.round(base * (1 + group1 / 100) * group2));
  const addends = [
    ...baseStatParts(config, weapon, 'attack'), ...progressionStatParts(config, 'attack'),
    { label: '攻击因子/武器技能', value: attackTrait }, { label: '钳蟹的共鸣', value: crabFlat },
    { label: '专精固定攻击', value: nodeMastery.flatAttack }, { label: '超限/召唤石副词条', value: direct.flatAttack }
  ].filter(part => Number(part.value));
  const additiveParts = [
    { label: '旧版攻击专精', value: legacyAttack, unit: '%' },
    { label: '旧版攻击联动', value: legacySynergy, unit: '%' },
    { label: '专精攻击', value: nodeMastery.attackPct, unit: '%' }
  ].filter(part => Number(part.value));
  const derivation = {
    status: 'observed', evidence: '2.0.2 游戏表；菲迪埃尔当前存档面板实测吻合，其他角色仍待面板对照',
    groups: [
      { label: '基础加算', operator: '+', parts: addends, result: base },
      { label: '攻击加算乘区', operator: '+', parts: additiveParts, result: group1, resultUnit: '%' },
      { label: '面板独立乘区', operator: '×', parts: panelFactors, result: compact(panelGroup2), resultUnit: '×' }
    ],
    formula: `round(${compact(base)} × ${compact(1 + group1 / 100)} × ${compact(panelGroup2)}) = round(${compact(rawPanel)}) = ${panel}`
  };
  return { base, flat, group1, group2, panelGroup2, final: panel, outOfCombat: panel, combat, havoc: havocInfo, applied, derivation };
}

function hpDependentMultiplier(levels, hpRatio) {
  const stamina = lookup(TABLES.stamina, lv(levels, '热血')) / 100;
  const enmity = lookup(TABLES.enmity, lv(levels, '背水')) / 100;
  const p = Math.min(1, Math.max(0, hpRatio));
  const staminaMod = p < .25 ? 1 : 1 + stamina / (2 ** (Math.min(1 - p, .5) / .25) * (p < .5 ? (5 / 3) ** (Math.min(.5 - p, .25) / .25) : 1));
  const x = Math.min((1 - p) / .99, 1);
  const enmityMod = 1 + enmity * (1 / 3) * ((1 + 2 * x) * x);
  return { multiplier: staminaMod * enmityMod, staminaMod, enmityMod };
}

function calculateActionMultiplier(levels, context, mastery, direct) {
  const action = context.action || { tags: [] }, tags = action.tags || [];
  const hpModifiers = hpDependentMultiplier(levels, Number(context.hpRatio ?? 1));
  let multiplier = hpModifiers.multiplier;
  const applied = [];
  if (has(levels, '热血') && hpModifiers.staminaMod !== 1) applied.push('热血');
  if (has(levels, '背水') && hpModifiers.enmityMod !== 1) applied.push('背水');
  const add = (name, table, enabled) => { if (enabled && has(levels, name)) { multiplier *= 1 + lookup(table, lv(levels, name)) / 100; applied.push(name); } };
  add('弱点攻击', TABLES.weak, context.weakPoint);
  add('集中炮火', TABLES.percent, tags.includes('ranged'));
  add('能力伤害', TABLES.throw, tags.includes('skill'));
  add('蓄力攻击', TABLES.percent, tags.includes('charged'));
  add('连击收招', TABLES.percent, tags.includes('finisher'));
  add('投掷', TABLES.throw, tags.includes('throw'));
  if (has(levels, '连击加成') && context.comboActive) { multiplier *= 1 + lookup(TABLES.combo, lv(levels, '连击加成')) / 100; applied.push('连击加成'); }
  const skillCount = bounded(Number.isFinite(Number(context.skillCount)) ? context.skillCount : 4, 0, 4);
  const less = lookup(TABLES.less, lv(levels, '身无长技')) * (4 - skillCount);
  if (less) { multiplier *= 1 + less / 100; applied.push('身无长技'); }
  const manual = Number.isFinite(Number(context.actionMultiplier)) ? Number(context.actionMultiplier) : 1;
  const tagsSet = new Set(tags);
  const masteryPct = mastery.actionDamagePct + mastery.weakPointDamagePct
    + (tagsSet.has('skill') ? mastery.skillDamagePct + direct.skillDamagePct : 0)
    + (tagsSet.has('sba') ? mastery.sbaDamagePct + direct.sbaDamagePct : 0);
  multiplier *= Math.max(0, manual) * Math.max(0, 1 + masteryPct / 100);
  return { multiplier, applied };
}

function calculateCap(levels, actualLevels, sources, synergy, config, weapon, hp, crit, context, mastery, direct) {
  const action = context.action || { tags: [] }, tags = action.tags || [];
  const equipmentSource = name => {
    const entries = sources[name] || [];
    if (!entries.length) return '';
    const actual = Number(actualLevels[name]) || 0;
    const capped = lv(levels, name);
    const level = actual === capped ? `Lv.${capped}` : `Lv.${actual} → 生效上限 Lv.${capped}`;
    return `${level}；${entries.map(item => `${item.source} Lv.${item.value}`).join('、')}`;
  };
  const genericCap = lookup(TABLES.cap, lv(levels, '伤害上限'));
  const parts = progressionCapParts(config, tags);
  let pct = parts.reduce((sum, part) => sum + part.value, 0) + genericCap;
  if (genericCap) parts.push({ name: '伤害上限', value: genericCap, source: equipmentSource('伤害上限') });
  const applied = has(levels, '伤害上限') ? ['伤害上限'] : [];
  const add = (name, value, source = equipmentSource(name)) => {
    if (!value) return;
    pct += value;
    parts.push({ name, value, source });
    if (has(levels, name)) applied.push(name);
  };
  const addTypedCaps = ({ field, masteryValue, label }) => {
    add(`角色专精 · ${label}`, masteryValue, '角色专精');
    direct.sources.filter(item => item.field === field).forEach(item => {
      const prefix = item.kind === 'summon' ? '召唤石' : '超限专精';
      const source = item.kind === 'summon' ? '召唤石副词条' : '角色超限专精';
      add(`${prefix} · ${item.source}`, item.value, source);
    });
  };
  if (has(levels, '天星之煌')) add('天星之煌', exactTrait(levels, '天星之煌', 1, 70));
  if (has(levels, '天星之界')) add('天星之界', exactTrait(levels, '天星之界', 1, 70));
  if (has(levels, '浪迹天涯')) add('浪迹天涯', exactTrait(levels, '浪迹天涯', 2, 50));
  if (has(levels, '刀上舞')) add('刀上舞', 30);
  add('基础能力联动', synergy.basic * bounded(config.mastery?.synBasic, 0, 2) * 20, '角色强化：基础能力联动');
  const ecru = lv(levels, '伤害上限轰天');
  if (ecru && hp.final >= 115000) add('伤害上限轰天', Math.max(0, specialArrayValue(SPECIAL_TABLES.ecruCap, ecru) * 100 - Math.max(0, 60 * (200000 - hp.final) / 85000)));
  const cardinal = lv(levels, '伤害上限红天'); if (cardinal) add('伤害上限红天', specialArrayValue(SPECIAL_TABLES.cardinalCap, cardinal) * 100);
  const cobalt = lv(levels, '伤害上限苍天'); if (cobalt && crit.raw >= 100) add('伤害上限苍天', specialArrayValue(SPECIAL_TABLES.cobaltCap, cobalt) * 100 - Math.max(0, .5 * (200 - crit.raw)));
  const sage = lv(levels, '伤害上限疾天'); if (sage) add('伤害上限疾天', specialArrayValue(SPECIAL_TABLES.sageCap, sage) * 100);
  if (has(levels, '超凡破限')) add('超凡破限', specialArrayValue(SPECIAL_TABLES.unboundMaster, lv(levels, '超凡破限')) * 100);
  if (has(levels, '超凡强击') && tags.includes('normal')) add('超凡强击', 15);
  if (has(levels, '超凡技艺') && tags.includes('skill')) add('超凡技艺', 15);
  if (has(levels, '超凡奥秘') && tags.includes('sba')) add('超凡奥秘', 15);
  if (has(levels, 'α秘纹') && tags.includes('normal')) add('α秘纹', lookup(TABLES.alpha, lv(levels, 'α秘纹')));
  if (has(levels, 'β秘纹') && tags.includes('skill')) add('β秘纹', lookup(TABLES.beta, lv(levels, 'β秘纹')));
  if (has(levels, 'γ秘纹')) add('γ秘纹', lookup(TABLES.gamma, lv(levels, 'γ秘纹')));
  const supernova = lv(levels, '超新星'); if (supernova) add('超新星', specialArrayValue(SPECIAL_TABLES.supernovaCap, supernova) * 100);
  const havocInfo = havoc(lv(levels, '浩劫新星')); if (havocInfo && hp.final <= havocInfo.hp) add('浩劫新星', havocInfo.cap);
  if (!havocInfo && has(levels, '浩劫') && hp.final <= 45000) add('浩劫', exactTrait(levels, '浩劫', 1, 100));
  if (tags.includes('normal')) add('普通攻击专精', Number(context.normalCapPct) || 0, '技能页普通攻击专精设置');
  add('专精通用上限', mastery.genericCapPct, '角色专精');
  if (tags.includes('normal')) addTypedCaps({ field: 'normalCapPct', masteryValue: mastery.normalCapPct, label: '普通攻击上限' });
  if (tags.includes('skill')) addTypedCaps({ field: 'skillCapPct', masteryValue: mastery.skillCapPct, label: '能力伤害上限' });
  if (tags.includes('sba')) addTypedCaps({ field: 'sbaCapPct', masteryValue: mastery.sbaCapPct, label: '奥义伤害上限' });
  add('专精动作上限', mastery.actionCapPct, '当前动作对应的角色专精');
  add('动作额外上限', Number(context.actionCapPct) || 0, '技能页“手动上限”');
  const external = Number.isFinite(Number(context.externalCapMultiplier)) ? Number(context.externalCapMultiplier) : 1;
  const warElemental = has(levels, '属性克制转换');
  if (warElemental) applied.push('属性克制转换');
  const outsideParts = [];
  if (warElemental) outsideParts.push({ name: '属性克制转换', multiplier: 1.2, source: equipmentSource('属性克制转换') });
  if (external !== 1) outsideParts.push({ name: '手动上限外乘区', multiplier: Math.max(0, external), source: '技能页“上限外乘区”' });
  const outside = (warElemental ? 1.2 : 1) * Math.max(0, external);
  return { additivePct: pct, parts, outside, outsideParts, tags, applied };
}

export function calculateBuild(config, context = {}) {
  const aggregated = aggregateLevels(config), levels = aggregated.capped, synergy = countSynergy(config);
  const mastery = summarizeMastery(config.masteryNodes, { ...context, synergy });
  const direct = directModifiers(config);
  const hp = calculateHp({ levels, synergy, config, weapon: aggregated.weapon, mastery, direct });
  const crit = calculateCrit({ levels, config, weapon: aggregated.weapon, context, mastery, direct });
  const attack = calculateAttack(levels, synergy, config, aggregated.weapon, hp, crit, context, mastery, direct);
  const cap = calculateCap(levels, aggregated.actual, aggregated.sources, synergy, config, aggregated.weapon, hp, crit, context, mastery, direct);
  const stun = calculateStun({ levels, config, weapon: aggregated.weapon, mastery, direct });
  const action = calculateActionMultiplier(levels, context, mastery, direct);
  const supplementaryRate = lv(levels, '追击') > 0 ? Math.min(1, .10 + lv(levels, '追击') * .02) : 0;
  const berserkerEcho = has(levels, '狂战士') ? Math.min(1, Math.max(0, (attack.combat - 20000) / 5000)) : 0;
  const spartanEcho = has(levels, '斯巴达') ? Math.min(1, Math.max(0, (hp.final - 50000) / 30000)) : 0;
  const active = new Set([...hp.applied, ...attack.applied, ...crit.applied, ...cap.applied, ...action.applied]);
  if (supplementaryRate) active.add('追击');
  if (berserkerEcho) active.add('狂战士');
  if (spartanEcho) active.add('斯巴达');
  const defense = calculateDefense({ levels, mastery, config, context });
  const damageTakenMultiplier = defense.damageTakenMultiplier;
  const effectiveHp = damageTakenMultiplier > 0 ? hp.final / damageTakenMultiplier : Number.POSITIVE_INFINITY;
  return { levels, actualLevels: aggregated.actual, sources: aggregated.sources, synergy, mastery, directModifiers: direct, hp, attack, crit, stun, cap, actionMultiplier: action.multiplier, supplementaryRate, echoLayers: berserkerEcho + spartanEcho, defense, defensePct: defense.reductionPct, damageTakenMultiplier, effectiveHp, activeFactors: [...active] };
}
