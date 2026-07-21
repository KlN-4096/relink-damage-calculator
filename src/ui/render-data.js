import { escapeHtml, fmt } from '../shared/format.js';

export function renderData(project) {
  const snapshot = project.snapshot;
  const counts = snapshot?.inventory || {};
  const characters = snapshot ? Object.values(snapshot.characters) : [];
  return `<div class="data-grid">
    <section class="surface data-import"><div class="section-heading"><div><p class="section-index">08</p><h2>游戏存档 · 只读导入</h2></div><span class="status-badge ${snapshot ? 'active' : ''}">${snapshot ? '已读取' : '未读取'}</span></div>
      <p>读取 <code>SaveData1.dat</code> 中的角色、武器、因子、祝福、召唤石、能力与专精。计算器不会修改或写回游戏存档。</p>
      <button type="button" class="primary-button" data-data-command="save-import">选择 SaveData1.dat</button>
      ${snapshot ? `<dl class="data-facts"><div><dt>文件</dt><dd>${escapeHtml(snapshot.fileName)}</dd></div><div><dt>导入时间</dt><dd>${new Date(snapshot.importedAt).toLocaleString('zh-CN')}</dd></div><div><dt>角色</dt><dd>${characters.length}</dd></div><div><dt>武器</dt><dd>${fmt(counts.weapons?.length)}</dd></div><div><dt>因子</dt><dd>${fmt(counts.factors?.length)}</dd></div><div><dt>祝福</dt><dd>${fmt(counts.blessings?.length)}</dd></div><div><dt>召唤石</dt><dd>${fmt(counts.summons?.length)}</dd></div></dl>` : ''}
    </section>
    <section class="surface data-import"><div class="section-heading"><div><p class="section-index">09</p><h2>配装方案 JSON</h2></div><span class="status-badge">本地方案</span></div>
      <p>只包含计算器中的 A / B 草稿与动作条件，不包含导入的游戏存档快照，也不会覆盖游戏文件。</p>
      <div class="data-actions"><button type="button" data-data-command="project-import">导入方案 JSON</button><button type="button" data-data-command="project-export">导出方案 JSON</button><button type="button" class="danger-button" data-data-command="project-reset">重置本地方案</button></div>
    </section>
    <section class="surface inventory-summary"><div class="section-heading"><div><p class="section-index">10</p><h2>角色与库存概览</h2></div><output>${characters.length} 名角色</output></div>
      ${snapshot ? `<div class="character-list">${characters.map(character => `<button type="button" data-character-jump="${character.id}"><strong>${escapeHtml(character.name)}</strong><span>Lv.${character.level} · ${escapeHtml(character.build?.weaponItem?.name || '无武器')} · 因子 ${character.build?.factorItems?.length || 0}</span></button>`).join('')}</div>` : '<p class="empty-state">导入存档后可浏览全部角色当前装备。</p>'}
    </section>
  </div>`;
}
