const CAP_CATEGORY_BY_TAG = Object.freeze({ normal: 103, skill: 104, sba: 105 });
const CAP_CATEGORY_LABELS = Object.freeze({
  103: '普通攻击上限',
  104: '能力伤害上限',
  105: '奥义伤害上限'
});
const PAGE_LABELS = Object.freeze({
  attack: '攻击',
  hpResistance: 'HP/抗性'
});
const DEFAULT_PROGRESS = Object.freeze({
  attack: 224,
  hpResistance: 50,
  weaponLevel: 20,
  weaponTranscendence: 390,
  master: 100
});

function capCategory(tags) {
  if (tags.includes('sba')) return CAP_CATEGORY_BY_TAG.sba;
  if (tags.includes('skill')) return CAP_CATEGORY_BY_TAG.skill;
  return CAP_CATEGORY_BY_TAG.normal;
}

function pageParts(progression, category, source) {
  const stats = Object.keys(PAGE_LABELS).map(key => {
    const page = progression.pages?.[key];
    return {
      name: `角色强化 · ${PAGE_LABELS[key]}`,
      value: Number(page?.rawCategories?.[category]) || 0,
      source
    };
  }).filter(part => part.value);
  const weaponLevel = Number(progression.pages?.weaponCollection?.rawCategories?.[category]) || 0;
  const transcendencePage = progression.pages?.weaponTranscendence || progression.pages?.limitBreak;
  const weaponTranscendence = Number(transcendencePage?.rawCategories?.[category]) || 0;
  const weaponTotal = weaponLevel + weaponTranscendence;
  if (weaponTotal) stats.push({
    name: '角色强化 · 武器收集加成（合计）',
    value: weaponTotal,
    breakdown: [
      { name: '基础武器等级', value: weaponLevel },
      { name: '超凡强化（超凡觉醒）', value: weaponTranscendence }
    ].filter(part => part.value),
    source
  });
  return stats;
}

function masterPart(progression, source) {
  const value = Number(progression.master?.damageCapPct) || 0;
  if (!value) return [];
  const level = Number(progression.master?.level) || 0;
  return [{ name: `Master 等级（MLv.${level}）`, value, source }];
}

export function progressionCapParts(config, tags = []) {
  const category = capCategory(tags);
  const categoryLabel = CAP_CATEGORY_LABELS[category];
  const progression = config.progression;
  if (progression?.valid) {
    const source = `存档已点节点 · ${categoryLabel}（类别 ${category}）`;
    return [...pageParts(progression, category, source), ...masterPart(progression, '存档 Master 等级解锁')];
  }
  if (progression || config.source?.kind === 'save') return [];
  const source = `未导入存档 · 默认示例模板 · ${categoryLabel}（类别 ${category}）`;
  return [
    { name: '角色强化 · 攻击', value: DEFAULT_PROGRESS.attack, source },
    { name: '角色强化 · HP/抗性', value: DEFAULT_PROGRESS.hpResistance, source },
    {
      name: '角色强化 · 武器收集加成（合计）',
      value: DEFAULT_PROGRESS.weaponLevel + DEFAULT_PROGRESS.weaponTranscendence,
      breakdown: [
        { name: '基础武器等级', value: DEFAULT_PROGRESS.weaponLevel },
        { name: '超凡强化（超凡觉醒）', value: DEFAULT_PROGRESS.weaponTranscendence }
      ],
      source
    },
    { name: 'Master 等级（MLv.50）', value: DEFAULT_PROGRESS.master, source: '未导入存档 · 默认示例模板' }
  ];
}
