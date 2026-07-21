export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

export const fmt = value => Math.round(Number(value) || 0).toLocaleString('zh-CN');
export const fmt1 = value => (Number(value) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
export const pct = value => `${Number(value) >= 0 ? '+' : ''}${(Number(value) || 0).toFixed(2)}%`;

export function traitText(traits = []) {
  return traits.map(trait => `${trait.name} Lv.${trait.level}`).join(' / ') || '无词条';
}

export function sourceTag(item) {
  if (item?.virtual) return '<span class="source-tag virtual">虚拟</span>';
  if (item?.modified) return '<span class="source-tag modified">已修改</span>';
  const label = item?.unitId !== undefined || item?.kind === 'save' ? '存档' : '默认';
  return `<span class="source-tag">${label}</span>`;
}
