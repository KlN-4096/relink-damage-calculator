const NUMERIC_FIELDS = [
  'flatHp', 'flatAttack', 'attackPct', 'hpPct', 'defensePct', 'critRatePct',
  'critDamagePct', 'genericCapPct', 'normalCapPct', 'skillCapPct', 'sbaCapPct',
  'actionDamagePct', 'actionCapPct', 'skillDamagePct', 'sbaDamagePct',
  'weakElementDamagePct', 'stunFlat', 'stunPct'
];

// Nodes whose effects never enter the stat panel (cooldowns, resistances,
// utility unlocks); they are reported separately instead of as "unmodeled".
// Nodes that also mention damage-type effects stay "unmodeled" so mixed
// utility+damage nodes are never hidden as harmless.
const NON_STAT_PATTERN = /冷却时间|持续时间|移动速度|抗性|获得|药水|复活|金币|经验|次数|发动|解锁/;
const DAMAGE_TEXT_PATTERN = /伤害|攻击力|上限|暴击/;

function emptySummary() {
  return {
    ...Object.fromEntries(NUMERIC_FIELDS.map(field => [field, 0])),
    applied: [], inactive: [], notApplicable: [], nonStat: [], unmodeled: []
  };
}

const nodeLabel = node => node.name || node.description || node.key;

function add(summary, field, value, node, reason = '') {
  const amount = Number(value) || 0;
  if (!amount || !NUMERIC_FIELDS.includes(field)) return false;
  summary[field] += amount;
  summary.applied.push({ nodeKey: node.key, name: nodeLabel(node), field, value: amount, reason });
  return 'applied';
}

function actionMatches(node, part, action = {}) {
  const tags = new Set(action.tags || []);
  const abilityIds = (part.abilityIds || []).filter(Boolean);
  // Nodes tied to specific abilities only apply to exactly those abilities;
  // unresolved references must not silently apply to every skill.
  if (abilityIds.length) return abilityIds.includes(action.abilityId);
  const text = `${node.name || ''} ${node.description || ''}`;
  if (part.targetGroup === 10 || text.includes('能力')) return tags.has('skill');
  if (text.includes('连击收招')) return tags.has('finisher');
  if (text.includes('蓄力')) return tags.has('charged');
  if (text.includes('普通攻击')) return tags.has('normal');
  if (text.includes('奥义')) return tags.has('sba');
  if (part.targetGroup) return (action.targetGroups || []).includes(part.targetGroup);
  return true;
}

function applySynergy(summary, node, part, synergy) {
  const value = Number(part.values?.[0]) || 0;
  const maximum = Math.max(0, Number(part.values?.[1]) || 0);
  const countByType = { 0: synergy.attack, 1: synergy.basic, 2: synergy.defense, 3: synergy.defense };
  const count = Math.min(maximum || 5, Math.max(0, Number(countByType[part.subType]) || 0));
  if (!value) return false;
  if (!count) return 'inactive:相应联动因子为 0 个';
  if (part.subType === 0) return add(summary, 'attackPct', value * count, node, `攻击类因子 ${count}`);
  if (part.subType === 1) return add(summary, 'genericCapPct', value * count, node, `基础类因子 ${count}`);
  if (part.subType === 2) return add(summary, 'defensePct', value * count, node, `防御/支援类因子 ${count}`);
  if (part.subType === 3) return add(summary, 'flatHp', value * count, node, `防御/支援类因子 ${count}`);
  return false;
}

function applyBaseStat(summary, node, part) {
  const value = Number(part.values?.[0]) || 0;
  const text = `${node.name || ''} ${node.description || ''}`;
  if (part.subType === 0 && (text.includes('HP') || value >= 5000)) return add(summary, 'flatHp', value, node);
  if (part.subType === 0 && text.includes('攻击力')) return add(summary, 'flatAttack', value, node);
  if (part.subType === 2) return add(summary, 'defensePct', value, node);
  if (part.subType === 4) return add(summary, 'attackPct', value, node);
  if (part.subType === 6) return add(summary, 'critRatePct', value, node);
  if (part.subType === 8) return add(summary, 'stunFlat', value, node);
  return false;
}

function applyGeneric(summary, node, part, context) {
  const value = Number(part.values?.[0]) || 0;
  if (part.subType === 1) return add(summary, 'genericCapPct', value, node);
  if (part.subType === 12) return add(summary, 'critDamagePct', value, node);
  if (part.subType === 14) {
    // EX 阶专精技能“对弱点属性敌人造成的伤害+10%”：属性克制条件，非弱点部位。
    if (!value) return false;
    if (!context.weakElement) return 'inactive:敌人非弱点属性（装备属性克制转换后恒定生效）';
    return add(summary, 'weakElementDamagePct', value, node);
  }
  return false;
}

function applyTargeted(summary, node, part, context) {
  if (!actionMatches(node, part, context.action)) return 'not-applicable';
  const first = Number(part.values?.[0]) || 0;
  const second = Number(part.values?.[1]) || 0;
  const tags = new Set(context.action?.tags || []);
  if (part.mainType === 9 && `${node.description || ''}`.includes('连击收招')) {
    const attackApplied = add(summary, 'actionDamagePct', first, node, '连击收招');
    const capApplied = add(summary, 'actionCapPct', second, node, '连击收招');
    return attackApplied || capApplied;
  }
  if (part.subType === 0) return add(summary, tags.has('skill') ? 'skillDamagePct' : 'actionDamagePct', first, node);
  if (part.subType === 1) {
    if (tags.has('skill')) return add(summary, 'skillCapPct', first, node);
    if (tags.has('sba')) return add(summary, 'sbaCapPct', first, node);
    if (tags.has('normal')) return add(summary, 'normalCapPct', first, node);
    return add(summary, 'actionCapPct', first, node);
  }
  return false;
}

function applyPart(summary, node, part, context) {
  if (part.mainType === 1 && part.behavior === 3) return applySynergy(summary, node, part, context.synergy);
  if (part.conditional && !conditionalPartActive(node, context)) return 'inactive:条件未启用';
  if (part.mainType === 8) return applyBaseStat(summary, node, part);
  if (part.mainType === 2 || part.mainType === 9) return applyTargeted(summary, node, part, context);
  return applyGeneric(summary, node, part, context);
}

function conditionalPartActive(node, context) {
  if (context.hasExplicitConditionalKeys) return context.conditionalKeys.has(node.key);
  return context.conditionalActive;
}

function classifyNode(summary, node, statuses) {
  if (statuses.includes('applied')) return;
  const entry = { nodeKey: node.key, name: nodeLabel(node) };
  const inactive = statuses.find(status => String(status).startsWith('inactive'));
  if (inactive) {
    summary.inactive.push({ ...entry, reason: String(inactive).split(':')[1] || '条件未启用' });
    return;
  }
  if (statuses.includes('not-applicable')) {
    summary.notApplicable.push({ ...entry, reason: '不作用于当前动作' });
    return;
  }
  const text = `${node.name || ''}${node.description || ''}`;
  if (NON_STAT_PATTERN.test(text) && !DAMAGE_TEXT_PATTERN.test(text)) {
    summary.nonStat.push({ ...entry, reason: '不影响面板数值' });
    return;
  }
  summary.unmodeled.push(entry);
}

export function summarizeMastery(nodes = [], options = {}) {
  const summary = emptySummary();
  const hasExplicitConditionalKeys = Array.isArray(options.conditionalKeys)
    || options.conditionalKeys instanceof Set;
  const context = {
    action: options.action || { tags: [] },
    synergy: { basic: 0, attack: 0, defense: 0, ...(options.synergy || {}) },
    conditionalActive: Boolean(options.conditionalActive),
    conditionalKeys: new Set(options.conditionalKeys || []),
    hasExplicitConditionalKeys,
    weakElement: Boolean(options.weakElement)
  };
  for (const node of nodes) {
    const statuses = (node.parts || []).map(part => applyPart(summary, node, part, context));
    classifyNode(summary, node, statuses);
  }
  return summary;
}
