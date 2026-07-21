import { escapeHtml, fmt1, pct } from '../shared/format.js';
import { UNIT_BASE_CAP } from '../core/damage-engine.js';

function capHitTag(hit) {
  return hit ? '<i class="cap-hit">已触顶</i>' : '<i class="cap-free">未触顶</i>';
}

function rawCard(label, view) {
  const raw = view.raw;
  return `<article class="raw-result-card">
    <header><span>${label}</span><strong>${fmt1(raw.cappedTotal)}</strong><small>封顶后 Raw 总期望 · 实战口径</small></header>
    <p class="raw-uncapped"><span>未封顶总期望</span><b>${fmt1(raw.totalExpected)}</b><small>装备理论值，不套上限</small></p>
    <dl>
      <div><dt>非暴击 Raw ${capHitTag(raw.capHit.nonCrit)}<i class="hit-weight">权重 ${fmt1((1 - raw.critRate) * 100)}%</i></dt><dd>${fmt1(raw.rawNonCrit)}${raw.capHit.nonCrit ? ` → ${fmt1(raw.capAbsolute)}` : ''}</dd></div>
      <div><dt>暴击 Raw ${capHitTag(raw.capHit.crit)}<i class="hit-weight">权重 ${fmt1(raw.critRate * 100)}%</i></dt><dd>${fmt1(raw.rawCrit)}${raw.capHit.crit ? ` → ${fmt1(raw.capAbsolute)}` : ''}</dd></div>
      <div><dt>主体期望（未封顶 / 封顶后）</dt><dd>${fmt1(raw.mainExpected)} / ${fmt1(raw.cappedMain)}</dd></div>
      <div><dt>额外伤害（未封顶 / 封顶后）</dt><dd>${fmt1(raw.supplementalExpected)} / ${fmt1(raw.cappedSupplemental)}</dd></div>
    </dl>
    <small>单击绝对上限 ${fmt1(raw.capAbsolute)} · 暴击率 ${fmt1(raw.critRate * 100)}% · 暴击倍率 ×${fmt1(raw.critMultiplier)} · 追击概率 ${fmt1(raw.supplementalRate * 100)}% · Echo ${fmt1(raw.echoLayers)} 层</small>
  </article>`;
}

function capParts(parts = []) {
  return parts.map(part => {
    const breakdown = (part.breakdown || [])
      .map(item => `${item.name} +${fmt1(item.value)}%`)
      .join(' · ');
    const detail = [breakdown, part.source].filter(Boolean)
      .map(text => `<small>${escapeHtml(text)}</small>`)
      .join('');
    return `<li><span><strong>${escapeHtml(part.name)}</strong>${detail}</span><b>+${fmt1(part.value)}%</b></li>`;
  }).join('');
}

function outsideParts(parts = []) {
  if (!parts.length) return '<p class="cap-outside-empty">上限外乘区：×1</p>';
  return `<ul class="outside-source-list">${parts.map(part =>
    `<li><span><strong>${escapeHtml(part.name)}</strong>${part.source ? `<small>${escapeHtml(part.source)}</small>` : ''}</span><b>×${fmt1(part.multiplier)}</b></li>`
  ).join('')}</ul>`;
}

function capColumn(label, view, scale) {
  const cap = view.build.cap;
  return `<div class="cap-source-column">
    <header><div><span>${label}</span><strong>总倍率 ${fmt1(scale * 100)}%</strong></div></header>
    <ul class="cap-source-list">${capParts(cap.parts)}</ul>
    ${outsideParts(cap.outsideParts)}
    <code>(1 + ${fmt1(cap.additivePct)}%) × ${fmt1(cap.outside)} = ${fmt1(scale)}</code>
  </div>`;
}

function rawFormula(label, view) {
  const raw = view.raw;
  return `<section><strong>${label}</strong>
    <code>非暴击 Raw = ${fmt1(raw.attack)} × ${fmt1(raw.normalMultiplier)} × ${fmt1(raw.outside)} = ${fmt1(raw.rawNonCrit)}</code>
    <code>暴击 Raw = ${fmt1(raw.rawNonCrit)} × ${fmt1(raw.critMultiplier)} = ${fmt1(raw.rawCrit)}</code>
    <code>主体期望 Raw = 非暴击 Raw × (1 - ${fmt1(raw.critRate)}) + 暴击 Raw × ${fmt1(raw.critRate)} = ${fmt1(raw.mainExpected)}</code>
    <code>额外伤害 Raw = ${fmt1(raw.mainExpected)} × 20% × (${fmt1(raw.supplementalRate)} + ${fmt1(raw.echoLayers)}) = ${fmt1(raw.supplementalExpected)}</code>
    <code>单击绝对上限 = ${fmt1(UNIT_BASE_CAP)} × ${fmt1(raw.capMultiplier)} = ${fmt1(raw.capAbsolute)}</code>
    <code>封顶后主体期望 = min(非暴击, 上限) × (1 - ${fmt1(raw.critRate)}) + min(暴击, 上限) × ${fmt1(raw.critRate)} = ${fmt1(raw.cappedMain)}</code>
    <code>封顶后总期望 = ${fmt1(raw.cappedMain)} × (1 + 20% × (${fmt1(raw.supplementalRate)} + ${fmt1(raw.echoLayers)})) = ${fmt1(raw.cappedTotal)}</code>
  </section>`;
}

function sameNote(title, value, note) {
  return `<p class="raw-same-note"><span>${title}</span><strong>${value}</strong><small>${note}</small></p>`;
}

export function renderRawResults(compare) {
  const relative = compare.relative;
  const cappedRelative = compare.cappedRelative;
  const sameRaw = JSON.stringify(compare.A.raw) === JSON.stringify(compare.B.raw);
  const sameCap = JSON.stringify(compare.A.build.cap) === JSON.stringify(compare.B.build.cap);
  const formulaSame = sameRaw ? sameNote('B 方案', '与 A 的 Raw 推导相同', fmt1(compare.B.raw.totalExpected)) : '';
  const formulaB = sameRaw ? '' : rawFormula('B 方案', compare.B);
  const capSame = sameCap ? sameNote('B 方案', '与 A 的上限构成相同', `总倍率 ${fmt1(compare.capMultipliers.B * 100)}%`) : '';
  const capB = sameCap ? '' : capColumn('B 方案', compare.B, compare.capMultipliers.B);
  return `<section class="raw-intro">
      <div><strong>单位倍率 Raw</strong><span>按 1.0 倍率单段基准招计算，同时给出未封顶与封顶后两个口径</span></div>
      <output class="${cappedRelative < 0 ? 'negative' : cappedRelative > 0 ? 'positive' : ''}">封顶后 B 对 A ${pct(cappedRelative * 100)} · 未封顶 ${pct(relative * 100)}</output>
      <p>固定按满 HP、中立地面普通攻击、无弱点/连击/临时召唤效果计算。未封顶 = 装备的理论期望；封顶后 = 逐击套用绝对上限（基础上限 ${fmt1(UNIT_BASE_CAP)} × 上限总倍率）后的实战口径，溢出上限的部分会被削平。高倍率段的单位上限略高于此基准。</p>
    </section>
    <div class="raw-result-grid">${rawCard('A 方案', compare.A)}${rawCard('B 方案', compare.B)}</div>
    <details class="raw-formula" open><summary>Raw 计算推导</summary>${formulaSame}<div class="${sameRaw ? 'single' : ''}">${rawFormula('A 方案', compare.A)}${formulaB}</div></details>
    <section class="cap-source-breakdown" aria-labelledby="capSourceTitle">
      <div class="subsection-heading"><div><span>CAP BREAKDOWN</span><h3 id="capSourceTitle">普通攻击上限来源</h3></div><small>绝对上限 = 基础上限 ${fmt1(UNIT_BASE_CAP)} × 总倍率</small></div>
      ${capSame}<div class="cap-source-columns ${sameCap ? 'single' : ''}">${capColumn('A 方案', compare.A, compare.capMultipliers.A)}${capB}</div>
    </section>`;
}
