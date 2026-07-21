import { FACTOR_NAMES, MODELED_FACTORS, SYNERGY } from '../data/data.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const fmt = value => Math.round(Number(value) || 0).toLocaleString('en-US');
export const fmt1 = value => (Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
export const signedPct = value => `${value >= 0 ? '+' : ''}${(Number(value) || 0).toFixed(2)}%`;

export function fillFactorOptions() {
  const list = document.getElementById('factorOptions');
  list.innerHTML = FACTOR_NAMES.map(name => `<option value="${escapeHtml(name)}">`).join('');
}

function sourceInput(name, index, type, slot) {
  const value = escapeHtml(name || '');
  const attr = type === 'factor' ? 'list="factorOptions"' : 'list="factorOptions"';
  return `<input ${attr} value="${value}" data-source="${type}" data-index="${index}" data-slot="${slot}" aria-label="${type}${index + 1} 名称">`;
}

function levelInput(value, index, type, slot) {
  return `<input type="number" min="0" max="99" step="1" value="${Number(value) || 0}" data-source="${type}" data-index="${index}" data-slot="${slot}" aria-label="${type}${index + 1} 等级">`;
}

export function renderFactorRows(pairs) {
  return pairs.map((pair, index) => `<div class="source-row factor-row">
    <span class="slot">#${index + 1}</span>${sourceInput(pair[0], index, 'factor', 0)}${levelInput(pair[1], index, 'factor', 1)}<span class="plus">+</span>${sourceInput(pair[2], index, 'factor', 2)}${levelInput(pair[3], index, 'factor', 3)}
    <button class="remove-button" type="button" data-remove="factor" data-index="${index}" aria-label="移除第 ${index + 1} 栏">×</button>
  </div>`).join('');
}

export function renderSimpleRows(items, type) {
  return items.map((pair, index) => `<div class="source-row">
    ${sourceInput(pair[0], index, type, 0)}${levelInput(pair[1], index, type, 1)}<button class="remove-button" type="button" data-remove="${type}" data-index="${index}" aria-label="移除第 ${index + 1} 项">×</button>
  </div>`).join('');
}

export function renderLevelSummary(levels, activeFactors = []) {
  const names = Object.keys(levels).filter(name => levels[name] > 0).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const active = new Set(activeFactors);
  const groups = [
    ['本次生效', name => MODELED_FACTORS.includes(name) && active.has(name), 'output'],
    ['条件未触发', name => MODELED_FACTORS.includes(name) && !active.has(name), ''],
    ['功能 / 未建模', name => !MODELED_FACTORS.includes(name), '']
  ];
  return groups.map(([label, predicate, className]) => {
    const chips = names.filter(predicate).map(name => `<span class="level-chip ${className}">${escapeHtml(name)} ${levels[name]}</span>`).join('');
    return chips ? `<span class="summary-label">${label}</span>${chips}` : '';
  }).join('');
}

export function categoryOf(name) {
  return Object.keys(SYNERGY).find(key => SYNERGY[key].includes(name)) || 'other';
}
