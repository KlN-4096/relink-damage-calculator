export const SUPPLEMENTAL_RATIO = 0.2;
// 1.0 倍率单段动作的基础伤害上限（2.0.2 chara_damage_limit 标准曲线；高倍率段的
// 单位上限略高于线性，此处取单位基准招做封顶口径）。
export const UNIT_BASE_CAP = 9999;

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export function marginalCapGain(currentCapPct, deltaPct) {
  const current = Math.max(0, 1 + (Number(currentCapPct) || 0) / 100);
  const next = Math.max(0, 1 + ((Number(currentCapPct) || 0) + (Number(deltaPct) || 0)) / 100);
  return current === 0 ? 0 : next / current - 1;
}

export function calculateRawDamage(input) {
  const attack = Math.max(0, Number(input.attack) || 0);
  const multiplierValue = Number(input.normalMultiplier);
  const normalMultiplier = Math.max(0, Number.isFinite(multiplierValue) ? multiplierValue : 1);
  const outsideValue = Number(input.outsideMultiplier);
  const outside = Math.max(0, Number.isFinite(outsideValue) ? outsideValue : 1);
  const critRate = clamp(input.critRate, 0, 1);
  const critMultiplier = Math.max(0, Number(input.critMultiplier) || 0);
  const rawNonCrit = attack * normalMultiplier * outside;
  const rawCrit = rawNonCrit * critMultiplier;
  const mainExpected = (1 - critRate) * rawNonCrit + critRate * rawCrit;
  const echoLayers = Math.max(0, Number(input.echoLayers) || 0);
  const supplementalRate = clamp(input.supplementalRate, 0, 1);
  const supplementalExpected = mainExpected * SUPPLEMENTAL_RATIO * (echoLayers + supplementalRate);
  const capMultiplierValue = Number(input.capMultiplier);
  const capMultiplier = capMultiplierValue > 0 ? capMultiplierValue : Number.POSITIVE_INFINITY;
  const capAbsolute = Number.isFinite(capMultiplier) ? UNIT_BASE_CAP * capMultiplier : Number.POSITIVE_INFINITY;
  const cappedNonCrit = Math.min(rawNonCrit, capAbsolute);
  const cappedCrit = Math.min(rawCrit, capAbsolute);
  const cappedMain = (1 - critRate) * cappedNonCrit + critRate * cappedCrit;
  const cappedSupplemental = cappedMain * SUPPLEMENTAL_RATIO * (echoLayers + supplementalRate);
  return {
    rawNonCrit, rawCrit, mainExpected, supplementalExpected,
    totalExpected: mainExpected + supplementalExpected,
    capMultiplier: Number.isFinite(capMultiplier) ? capMultiplier : 0,
    capAbsolute, cappedNonCrit, cappedCrit, cappedMain, cappedSupplemental,
    cappedTotal: cappedMain + cappedSupplemental,
    capHit: { nonCrit: rawNonCrit > capAbsolute, crit: rawCrit > capAbsolute },
    attack, normalMultiplier, outside, critRate, critMultiplier,
    supplementalRate, echoLayers
  };
}
