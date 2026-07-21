import { escapeHtml, fmt, fmt1, pct } from '../shared/format.js';

function row(label, a, b, percent = false) {
  const delta = b - a;
  const relative = a ? delta / a : 0;
  const format = percent ? value => `${fmt1(value)}%` : fmt1;
  return `<tr><th>${label}</th><td>${format(a)}</td><td>${format(b)}</td><td class="${delta < 0 ? 'negative' : delta > 0 ? 'positive' : ''}">${pct(relative * 100)}</td></tr>`;
}

export function renderComparison(compare) {
  const a = compare.A, b = compare.B;
  const relativeLabel = pct(compare.relative * 100);
  const metrics = [
    row('最终 HP', a.build.hp.final, b.build.hp.final),
    row('有效生命', a.build.effectiveHp, b.build.effectiveHp),
    row('面板攻击', a.build.attack.final, b.build.attack.final),
    row('暴击率', a.build.crit.raw, b.build.crit.raw, true),
    row('昏厥值', a.build.stun.final, b.build.stun.final),
    row('普通攻击上限加算', a.build.cap.additivePct, b.build.cap.additivePct, true),
    row('追击触发率', a.build.supplementaryRate * 100, b.build.supplementaryRate * 100, true),
    row('Echo 层数', a.build.echoLayers, b.build.echoLayers),
    row('单位倍率 Raw 主体期望', a.raw.mainExpected, b.raw.mainExpected),
    row('单位倍率 Raw 额外伤害', a.raw.supplementalExpected, b.raw.supplementalExpected),
    row('单位倍率 Raw 总期望', a.raw.totalExpected, b.raw.totalExpected)
  ].join('');
  const diffs = compare.sourceDiffs.map(item => `<tr><th>${escapeHtml(item.source)}</th><td>${escapeHtml(item.a)}</td><td>${escapeHtml(item.b)}</td></tr>`).join('');
  const capScaleA = compare.capMultipliers.A * 100;
  const capScaleB = compare.capMultipliers.B * 100;
  const capParts = mergeCapParts(a.build.cap.parts, b.build.cap.parts);
  return `<div class="comparison-grid">
    <section class="surface"><div class="section-heading"><div><p class="section-index">04</p><h2>属性与 Raw</h2></div><output>${relativeLabel}</output></div><div class="table-scroll"><table><thead><tr><th>项目</th><th>A</th><th>B</th><th>B 对 A</th></tr></thead><tbody>${metrics}</tbody></table></div></section>
    <section class="surface"><div class="section-heading"><div><p class="section-index">05</p><h2>配装差异来源</h2></div><output>${compare.sourceDiffs.length} 项</output></div>${diffs ? `<div class="table-scroll"><table><thead><tr><th>来源</th><th>A</th><th>B</th></tr></thead><tbody>${diffs}</tbody></table></div>` : '<p class="empty-state">A 和 B 的完整配装相同。</p>'}</section>
    <section class="surface cap-explainer"><div class="section-heading"><div><p class="section-index">06</p><h2>上限边际</h2></div><output>${pct(compare.capMarginal * 100)}</output></div>
      <div class="cap-equation"><span>A 的总上限倍率</span><b>${fmt1(capScaleA)}%</b><i>→</i><span>B 的总上限倍率</span><b>${fmt1(capScaleB)}%</b></div>
      <code>完全封顶时实际变化 = (${fmt1(capScaleB)} ÷ ${fmt1(capScaleA)}) - 1 = ${pct(compare.capMarginal * 100)}；总倍率含上限外乘区</code>
      <p>这就是“后期 +200% 上限约等于 10%”的来源：当现有总倍率为 2000% 时，从 2000 变为 2200，2200 ÷ 2000 - 1 = 10%。未封顶时，实际提升还会低于这个理论值。</p>
      <details open><summary>上限构成明细（加算部分）</summary><div class="table-scroll"><table><thead><tr><th>来源</th><th>A</th><th>B</th></tr></thead><tbody>${capParts}</tbody></table></div></details>
    </section>
  </div>`;
}

function mergeCapParts(partsA = [], partsB = []) {
  const names = [...new Set([...partsA.map(part => part.name), ...partsB.map(part => part.name)])];
  const valueOf = (parts, name) => parts.filter(part => part.name === name).reduce((sum, part) => sum + part.value, 0);
  return names.map(name => {
    const a = valueOf(partsA, name), b = valueOf(partsB, name);
    return `<tr><th>${escapeHtml(name)}</th><td>+${fmt1(a)}%</td><td class="${b < a ? 'negative' : b > a ? 'positive' : ''}">+${fmt1(b)}%</td></tr>`;
  }).join('');
}
