import { traitCurveValue } from '../save/save-progression.js';

// Nodes extracted from the 2.0.2 battle curves. The matching EXE evaluator uses
// the left node's mode and cubic Bezier controls for each HP interval.
const BATTLE_CURVES = {
  garrison: [
    ['smooth', 0, 1, 0, 0],
    ['smooth', .2, .9708333, .02702538, -.02702538],
    ['smooth', .4, .7597222, .09677419, -.07894737],
    ['smooth', .6, .5, .07843138, -.07894737],
    ['smooth', .8000001, .2597222, .08571429, -.075],
    ['smooth', 1, 0, .1071429, -.1071429]
  ],
  sturdy: [
    ['flat', 0, 0, -.01298384, .01298384],
    ['smooth', .25, .1500006, 0, 0],
    ['smooth', .5, .2500005, -.05882353, .05882353],
    ['smooth', .7500001, .5000005, -.1063817, .1063817],
    ['smooth', 1, 1, -.2758663, .2758663]
  ]
};

const bounded = value => Math.min(1, Math.max(0, Number(value) || 0));
const compact = value => Number(Number(value).toFixed(8));

function cubicBezier(left, right, ratio) {
  const inverse = 1 - ratio;
  const p0 = left[2], p1 = left[2] + left[4];
  const p2 = right[2] + right[3], p3 = right[2];
  return inverse ** 3 * p0 + 3 * inverse ** 2 * ratio * p1
    + 3 * inverse * ratio ** 2 * p2 + ratio ** 3 * p3;
}

export function battleCurveValue(name, hpRatio) {
  const nodes = BATTLE_CURVES[name];
  if (!nodes) return 0;
  const hp = bounded(hpRatio);
  if (hp <= nodes[0][1]) return nodes[0][2];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const left = nodes[index], right = nodes[index + 1];
    if (hp > right[1]) continue;
    if (left[0] === 'flat') return hp < right[1] ? left[2] : right[2];
    return cubicBezier(left, right, (hp - left[1]) / (right[1] - left[1]));
  }
  return nodes.at(-1)[2];
}

function traitValue(levels, name, valueIndex = 0) {
  const level = Number(levels[name]) || 0;
  return level > 0 ? traitCurveValue(name, level, valueIndex) : 0;
}

function addPart(parts, label, value, evidence = 'verified') {
  const amount = Number(value) || 0;
  if (amount) parts.push({ label, value: amount, unit: '%', evidence });
}

export function calculateDefense(options) {
  const { levels, mastery, config, context = {} } = options;
  const hpRatio = Number.isFinite(Number(context.hpRatio)) ? bounded(context.hpRatio) : 1;
  const staticParts = [];
  addPart(staticParts, '专精防御', mastery.defensePct);
  addPart(staticParts, '浪迹天涯', traitValue(levels, '浪迹天涯', 1));
  addPart(staticParts, '坚持', traitValue(levels, '坚持'));
  addPart(staticParts, '手动承伤修正', -Number(config.manualModifiers?.damageTakenPct || 0), 'manual');

  const staticPct = staticParts.reduce((sum, part) => sum + part.value, 0);
  const staticMultiplier = Math.max(0, 1 - staticPct / 100);
  const garrisonCurve = battleCurveValue('garrison', hpRatio);
  const sturdyCurve = battleCurveValue('sturdy', hpRatio);
  const garrisonPct = traitValue(levels, '坚守') * garrisonCurve;
  const sturdyPct = traitValue(levels, '刚健') * sturdyCurve;
  const blackCrabPct = traitValue(levels, '可怕的漆黑钳蟹因子', 5);
  const smallCrabEquipped = traitValue(levels, '小钳蟹召唤石');
  const smallCrabPct = context.smallCrabBuffActive ? smallCrabEquipped : 0;
  const dynamicParts = [{ label: '静态池', value: staticMultiplier, unit: '×' }];
  if (garrisonPct) dynamicParts.push({ label: `坚守 @ ${compact(hpRatio * 100)}% HP`, value: 1 - garrisonPct / 100, unit: '×' });
  if (sturdyPct) dynamicParts.push({ label: `刚健 @ ${compact(hpRatio * 100)}% HP`, value: 1 - sturdyPct / 100, unit: '×' });
  if (blackCrabPct) dynamicParts.push({ label: '可怕的漆黑钳蟹', value: 1 - blackCrabPct / 100, unit: '×' });
  if (smallCrabPct) dynamicParts.push({ label: '小钳蟹召唤效果（10 秒）', value: 1 - smallCrabPct / 100, unit: '×' });
  const damageTakenMultiplier = dynamicParts.reduce((product, part) => product * part.value, 1);
  const reductionPct = (1 - damageTakenMultiplier) * 100;
  const taken = compact(damageTakenMultiplier);
  return {
    staticPct, staticMultiplier, garrisonPct, sturdyPct, blackCrabPct,
    smallCrabEquipped, smallCrabPct, hpRatio,
    damageTakenMultiplier, reductionPct,
    derivation: {
      status: 'verified',
      evidence: smallCrabEquipped && !smallCrabPct
        ? '2.0.2 EXE 承伤链与游戏曲线；小钳蟹 10 秒召唤状态当前未启用'
        : '2.0.2 EXE 承伤链与游戏曲线',
      groups: [
        { label: '常驻防御 / 减伤加算池', operator: '+', parts: staticParts, result: staticPct, resultUnit: '%' },
        { label: '承伤乘算链', operator: '×', parts: dynamicParts, result: taken, resultUnit: '×' }
      ],
      formula: `承伤倍率 = ${dynamicParts.map(part => compact(part.value)).join(' × ')} = ${taken}；综合减伤 = 1 - ${taken} = ${compact(reductionPct)}%`
    }
  };
}
