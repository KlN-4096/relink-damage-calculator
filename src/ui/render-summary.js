import { fmt, fmt1, pct } from '../shared/format.js';

export function renderSummary(compare) {
  const a = compare.A, b = compare.B;
  const capScaleA = compare.capMultipliers.A * 100;
  const capScaleB = compare.capMultipliers.B * 100;
  return `
    <article class="metric-card metric-a"><span>A 单位倍率 Raw</span><strong>${fmt1(a.raw.totalExpected)}</strong><small>未乘招式倍率 · 上限 +${fmt1(a.build.cap.additivePct)}%</small></article>
    <article class="metric-card metric-b"><span>B 单位倍率 Raw</span><strong>${fmt1(b.raw.totalExpected)}</strong><small>未乘招式倍率 · 上限 +${fmt1(b.build.cap.additivePct)}%</small></article>
    <article class="metric-card ${compare.relative < 0 ? 'metric-loss' : 'metric-gain'}"><span>B 相对 A</span><strong>${pct(compare.relative * 100)}</strong><small>Raw 差 ${fmt1(compare.delta)}</small></article>
    <article class="metric-card"><span>完全封顶时上限差</span><strong>${pct(compare.capMarginal * 100)}</strong><small>(${fmt(capScaleA)} → ${fmt(capScaleB)}) 的比例</small></article>`;
}
