import { escapeHtml, fmt1, pct } from '../shared/format.js';

function rawCard(label, view) {
  const raw = view.raw;
  return `<article class="raw-result-card">
    <header><span>${label}</span><strong>${fmt1(raw.totalExpected)}</strong><small>单位倍率 Raw 总期望</small></header>
    <dl>
      <div><dt>非暴击 Raw</dt><dd>${fmt1(raw.rawNonCrit)}</dd></div>
      <div><dt>暴击 Raw</dt><dd>${fmt1(raw.rawCrit)}</dd></div>
      <div><dt>主体期望 Raw</dt><dd>${fmt1(raw.mainExpected)}</dd></div>
      <div><dt>额外伤害 Raw</dt><dd>${fmt1(raw.supplementalExpected)}</dd></div>
    </dl>
    <small>暴击率 ${fmt1(raw.critRate * 100)}% · 暴击倍率 ×${fmt1(raw.critMultiplier)} · 追击概率 ${fmt1(raw.supplementalRate * 100)}% · Echo ${fmt1(raw.echoLayers)} 层</small>
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
  </section>`;
}

function sameNote(title, value, note) {
  return `<p class="raw-same-note"><span>${title}</span><strong>${value}</strong><small>${note}</small></p>`;
}

export function renderRawResults(compare) {
  const relative = compare.A.raw.totalExpected
    ? compare.B.raw.totalExpected / compare.A.raw.totalExpected - 1
    : 0;
  const sameRaw = JSON.stringify(compare.A.raw) === JSON.stringify(compare.B.raw);
  const sameCap = JSON.stringify(compare.A.build.cap) === JSON.stringify(compare.B.build.cap);
  const formulaSame = sameRaw ? sameNote('B 方案', '与 A 的 Raw 推导相同', fmt1(compare.B.raw.totalExpected)) : '';
  const formulaB = sameRaw ? '' : rawFormula('B 方案', compare.B);
  const capSame = sameCap ? sameNote('B 方案', '与 A 的上限构成相同', `总倍率 ${fmt1(compare.capMultipliers.B * 100)}%`) : '';
  const capB = sameCap ? '' : capColumn('B 方案', compare.B, compare.capMultipliers.B);
  return `<section class="raw-intro">
      <div><strong>单位倍率 Raw</strong><span>未乘招式倍率，也不套用招式自身的封顶曲线</span></div>
      <output class="${relative < 0 ? 'negative' : relative > 0 ? 'positive' : ''}">B 对 A ${pct(relative * 100)}</output>
      <p>固定按满 HP、中立地面普通攻击、无弱点/连击/临时召唤效果计算。数值用于比较配装，不代表某一招的最终伤害。</p>
    </section>
    <div class="raw-result-grid">${rawCard('A 方案', compare.A)}${rawCard('B 方案', compare.B)}</div>
    <details class="raw-formula" open><summary>Raw 计算推导</summary>${formulaSame}<div class="${sameRaw ? 'single' : ''}">${rawFormula('A 方案', compare.A)}${formulaB}</div></details>
    <section class="cap-source-breakdown" aria-labelledby="capSourceTitle">
      <div class="subsection-heading"><div><span>CAP BREAKDOWN</span><h3 id="capSourceTitle">普通攻击上限来源</h3></div><small>不换算成某一招的绝对上限</small></div>
      ${capSame}<div class="cap-source-columns ${sameCap ? 'single' : ''}">${capColumn('A 方案', compare.A, compare.capMultipliers.A)}${capB}</div>
    </section>`;
}
