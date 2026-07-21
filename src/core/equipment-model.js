import { cloneValue } from './state-model.js';

export const LIMIT_NAMES = Object.freeze({
  flatAttack: '攻击力',
  normalCapPct: '普通攻击伤害上限',
  skillCapPct: '能力伤害上限',
  critRatePct: '暴击率',
  flatHp: '最大 HP',
  skillDamagePct: '能力伤害',
  sbaCapPct: '奥义伤害上限',
  sbaDamagePct: '奥义伤害',
  stunPct: '昏厥值'
});

export const SUMMON_PARAMS = Object.freeze([
  [400, '攻击力'],
  [401, 'HP'],
  [402, '暴击率'],
  [403, '昏厥值'],
  [404, '能力伤害'],
  [405, '奥义伤害'],
  [406, '奥义连锁伤害'],
  [407, '普通攻击伤害上限'],
  [408, '能力伤害上限'],
  [409, '奥义伤害上限'],
  [416, 'HP回复上限']
]);

const SUMMON_PARAM_NAMES = new Map(SUMMON_PARAMS);
const FACTOR_SLOTS = 12;
const SUMMON_SLOTS = 4;

const numberValue = value => Number(value) || 0;
const markModified = item => {
  if (item) item.modified = true;
  return item;
};

function updateFactor(target, build) {
  const token = target.dataset.factorName ?? target.dataset.factorLevel;
  if (token === undefined) return false;
  const [index, field] = token.split(':').map(Number);
  build.factorPairs[index] ||= ['', 0, '', 0];
  build.factorPairs[index][field] = target.dataset.factorLevel === undefined
    ? target.value
    : numberValue(target.value);
  const item = markModified(build.factorItems[index] || {
    id: `virtual-factor-${Date.now()}-${index}`,
    name: '自定义因子',
    virtual: true
  });
  const pair = build.factorPairs[index];
  item.traits = [
    { name: pair[0], level: pair[1] },
    { name: pair[2], level: pair[3] }
  ].filter(trait => trait.name);
  build.factorItems[index] = item;
  return true;
}

function updateBlessing(target, build) {
  const rawIndex = target.dataset.blessingName ?? target.dataset.blessingLevel;
  if (rawIndex === undefined) return false;
  const index = Number(rawIndex);
  build.blessings[index] ||= ['', 0];
  if (target.dataset.blessingName !== undefined) build.blessings[index][0] = target.value;
  else build.blessings[index][1] = numberValue(target.value);
  build.blessingItem ||= {
    id: `virtual-blessing-${Date.now()}`,
    name: '自定义祝福',
    virtual: true,
    traits: []
  };
  markModified(build.blessingItem);
  build.blessingItem.traits = build.blessings.map(([name, level]) => ({ name, level }));
  return true;
}

function updateSummon(target, summons) {
  const fields = ['summonName', 'summonMain', 'summonMainLevel', 'summonParam', 'summonValue'];
  const field = fields.find(name => target.dataset[name] !== undefined);
  if (!field) return false;
  const item = markModified(summons[Number(target.dataset[field])]);
  if (!item) return false;
  item.mainTrait ||= { name: '', level: 0 };
  item.subTrait ||= { name: '', paramId: 400, value: 0, level: 1 };
  if (field === 'summonName') item.name = target.value;
  if (field === 'summonMain') item.mainTrait.name = target.value;
  if (field === 'summonMainLevel') item.mainTrait.level = numberValue(target.value);
  if (field === 'summonParam') {
    item.subTrait.paramId = Number(target.value);
    item.subTrait.name = SUMMON_PARAM_NAMES.get(item.subTrait.paramId) || `副词条 ${item.subTrait.paramId}`;
  }
  if (field === 'summonValue') item.subTrait.value = numberValue(target.value);
  return true;
}

function updateMastery(target, build, catalogNodes) {
  if (target.dataset.masteryKey === undefined) return false;
  const key = target.dataset.masteryKey;
  if (target.checked) {
    const node = catalogNodes.find(item => item.key === key);
    if (node && !build.masteryNodes.some(item => item.key === key)) build.masteryNodes.push(cloneValue(node));
  } else {
    build.masteryNodes = build.masteryNodes.filter(item => item.key !== key);
  }
  return true;
}

function updateLimit(target, build) {
  const rawIndex = target.dataset.limitKind ?? target.dataset.limitValue;
  if (rawIndex === undefined) return false;
  const index = Number(rawIndex);
  build.limitBonuses[index] ||= {
    kind: 'normalCapPct',
    name: LIMIT_NAMES.normalCapPct,
    value: 0,
    virtual: true
  };
  const item = markModified(build.limitBonuses[index]);
  if (target.dataset.limitKind !== undefined) {
    item.kind = target.value;
    item.name = LIMIT_NAMES[target.value] || target.value;
  } else {
    item.value = numberValue(target.value);
  }
  return true;
}

export function updateEquipmentInput({ target, build, summons, catalogNodes = [] }) {
  return updateFactor(target, build)
    || updateBlessing(target, build)
    || updateSummon(target, summons)
    || updateMastery(target, build, catalogNodes)
    || updateLimit(target, build);
}

function requestedSlot(target, rows, limit, isEmpty) {
  const value = target === null || target === undefined || target === '' ? null : Number(target);
  if (Number.isInteger(value) && value >= 0 && value < limit) return value;
  const index = Array.from({ length: limit }, (_, slot) => slot).find(slot => isEmpty(rows[slot]));
  return index === undefined ? -1 : index;
}

function weaponBlessing(item) {
  return {
    id: `equipped-blessing-${item.unitId ?? item.id}`,
    name: '当前武器祝福',
    weaponUnitId: item.unitId,
    hash: item.blessingHash ?? null,
    traits: cloneValue(item.blessings || []),
    virtual: false,
    equipped: true
  };
}

export function applyInventoryItem({ type, item, target = null, build, summons }) {
  if (type === 'weapons') {
    build.weaponItem = cloneValue(item);
    build.weapon = item.archetype || item.name;
    build.awakenLevel = item.awakenLevel || 0;
    build.weaponSkill1 = item.currentSkills?.[0] ? [item.currentSkills[0].name, item.currentSkills[0].level] : null;
    build.weaponSkill2 = item.currentSkills?.[1] ? [item.currentSkills[1].name, item.currentSkills[1].level] : null;
    build.blessings = (item.blessings || []).map(trait => [trait.name, trait.level]);
    build.blessingItem = weaponBlessing(item);
    return { ok: true };
  }
  if (type === 'factors') {
    const slot = requestedSlot(target, build.factorPairs, FACTOR_SLOTS, pair => !pair?.[0]);
    if (slot < 0) return { ok: false, message: '12 个因子槽已满，请先清空一个槽位。' };
    const [main, sub] = item.traits || [];
    build.factorItems[slot] = cloneValue(item);
    build.factorPairs[slot] = [main?.name || '', main?.level || item.level || 0, sub?.name || '', sub?.level || 0];
    return { ok: true, slot };
  }
  if (type === 'blessings') {
    build.blessingItem = cloneValue(item);
    build.blessings = (item.traits || []).map(trait => [trait.name, trait.level]);
    return { ok: true };
  }
  if (type === 'summons') {
    const slot = requestedSlot(target, summons, SUMMON_SLOTS, stone => !stone);
    if (slot < 0) return { ok: false, message: '4 个召唤石槽已满，请指定要替换的槽位。' };
    summons[slot] = cloneValue(item);
    return { ok: true, slot };
  }
  return { ok: false, message: '无法识别的库存类型。' };
}

export function createVirtualEquipment({ type, target = null, build, summons, now = Date.now() }) {
  if (type === 'factor') {
    const slot = requestedSlot(target, build.factorPairs, FACTOR_SLOTS, pair => !pair?.[0]);
    if (slot < 0) return { ok: false, message: '12 个因子槽已满，请先清空一个槽位。' };
    build.factorPairs[slot] = ['攻击', 15, '伤害上限', 15];
    build.factorItems[slot] = {
      id: `virtual-factor-${now}-${slot}`,
      name: '虚拟因子',
      virtual: true,
      traits: [{ name: '攻击', level: 15 }, { name: '伤害上限', level: 15 }]
    };
    return { ok: true, slot, tab: 'factors' };
  }
  if (type === 'blessing') {
    build.blessings = [['攻击', 20], ['伤害上限', 15], ['体力', 10]];
    build.blessingItem = {
      id: `virtual-blessing-${now}`,
      name: '虚拟祝福',
      virtual: true,
      traits: build.blessings.map(([name, level]) => ({ name, level }))
    };
    return { ok: true, tab: 'blessing' };
  }
  if (type === 'summon') {
    const slot = requestedSlot(target, summons, SUMMON_SLOTS, stone => !stone);
    if (slot < 0) return { ok: false, message: '4 个召唤石槽已满，请先清空一颗。' };
    summons[slot] = {
      id: `virtual-summon-${now}-${slot}`,
      name: '虚拟召唤石',
      virtual: true,
      rank: 3,
      mainTrait: { name: '攻击', level: 15 },
      subTrait: { name: '普通攻击伤害上限', paramId: 407, value: 40, level: 1 }
    };
    return { ok: true, slot, tab: 'summons' };
  }
  return { ok: false, message: '无法识别的虚拟装备类型。' };
}
