import { calculateBuild } from './build-engine.js';
import { calculateRawDamage } from './damage-engine.js';

const RAW_CONTEXT = Object.freeze({
  action: Object.freeze({ id: 'normal-raw', type: 'normal', abilityId: null, tags: Object.freeze(['normal']) }),
  hpRatio: 1,
  normalCapPct: 0,
  actionCapPct: 0,
  actionMultiplier: 1,
  externalCapMultiplier: 1,
  critBonusPct: 0,
  critDamageBonusPct: 0,
  skillCount: 4,
  weakPoint: false,
  comboActive: false,
  conditionalKeys: Object.freeze([]),
  smallCrabBuffActive: false
});

function summonLevels(stones) {
  return (stones || []).filter(stone => stone?.mainTrait).map(stone => [
    stone.mainTrait.name,
    Number(stone.mainTrait.level) || 0
  ]);
}

export function calculateRawBuild(build, summons) {
  const config = {
    ...build,
    summonStones: summons || [],
    summons: summonLevels(summons)
  };
  const calculated = calculateBuild(config, RAW_CONTEXT);
  const raw = calculateRawDamage({
    attack: calculated.attack.combat ?? calculated.attack.final,
    normalMultiplier: calculated.actionMultiplier,
    outsideMultiplier: calculated.cap.outside,
    critRate: calculated.crit.probability,
    critMultiplier: calculated.crit.multiplier,
    supplementalRate: calculated.supplementaryRate,
    echoLayers: calculated.echoLayers,
    capMultiplier: Math.max(0, 1 + calculated.cap.additivePct / 100) * calculated.cap.outside
  });
  return { build: calculated, raw, context: RAW_CONTEXT };
}

function itemKey(item) {
  return item?.unitId ?? item?.id ?? item?.hash ?? item?.name ?? null;
}

function itemLabel(item, fallback) {
  if (!item) return '无';
  return `${item.name || fallback}${item.virtual ? ' [虚拟]' : ''}`;
}

export function diffBuildSources(buildA, buildB, summonsA = [], summonsB = []) {
  const rows = [];
  const push = (source, a, b) => { if (a !== b) rows.push({ source, a, b }); };
  push('武器', itemLabel(buildA.weaponItem, buildA.weapon), itemLabel(buildB.weaponItem, buildB.weapon));
  const maxFactors = Math.max(buildA.factorPairs?.length || 0, buildB.factorPairs?.length || 0);
  for (let index = 0; index < maxFactors; index += 1) {
    const a = (buildA.factorPairs?.[index] || []).join(' / ') || '无';
    const b = (buildB.factorPairs?.[index] || []).join(' / ') || '无';
    push(`因子 ${index + 1}`, a, b);
  }
  push('祝福', itemLabel(buildA.blessingItem, '祝福'), itemLabel(buildB.blessingItem, '祝福'));
  const masteryA = new Set((buildA.masteryNodes || []).map(node => node.key));
  const masteryB = new Set((buildB.masteryNodes || []).map(node => node.key));
  push('已点专精', `${masteryA.size} 个`, `${masteryB.size} 个`);
  const limitA = (buildA.limitBonuses || []).map(item => `${item.name} ${item.value}`).join(' / ') || '无';
  const limitB = (buildB.limitBonuses || []).map(item => `${item.name} ${item.value}`).join(' / ') || '无';
  push('超限专精', limitA, limitB);
  for (let index = 0; index < Math.max(summonsA.length, summonsB.length, 4); index += 1) {
    const a = summonsA[index], b = summonsB[index];
    if (itemKey(a) !== itemKey(b) || JSON.stringify(a) !== JSON.stringify(b)) {
      push(`召唤石 ${index + 1}`, itemLabel(a, '召唤石'), itemLabel(b, '召唤石'));
    }
  }
  return rows;
}

export function compareProjectBuilds(character, summons = {}) {
  const summonA = summons.A || [], summonB = summons.B || [];
  const a = calculateRawBuild(character.builds.A, summonA);
  const b = calculateRawBuild(character.builds.B, summonB);
  const totalA = a.raw.totalExpected;
  const totalB = b.raw.totalExpected;
  const capMultiplierA = Math.max(0, 1 + a.build.cap.additivePct / 100) * a.build.cap.outside;
  const capMultiplierB = Math.max(0, 1 + b.build.cap.additivePct / 100) * b.build.cap.outside;
  return {
    A: a,
    B: b,
    delta: totalB - totalA,
    relative: totalA ? totalB / totalA - 1 : 0,
    cappedDelta: b.raw.cappedTotal - a.raw.cappedTotal,
    cappedRelative: a.raw.cappedTotal ? b.raw.cappedTotal / a.raw.cappedTotal - 1 : 0,
    capMarginal: capMultiplierA ? capMultiplierB / capMultiplierA - 1 : 0,
    capMultipliers: { A: capMultiplierA, B: capMultiplierB },
    sourceDiffs: diffBuildSources(character.builds.A, character.builds.B, summonA, summonB)
  };
}
