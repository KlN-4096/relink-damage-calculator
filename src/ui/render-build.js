import { escapeHtml, fmt, fmt1, sourceTag, traitText } from '../shared/format.js';
import { groupByMap } from '../shared/collections.js';
import { SUMMON_PARAMS } from '../core/equipment-model.js';

export function renderBuildToolbar(project, character) {
  const active = project.activeBuildId;
  const baselineLabel = character.baseline?.source?.kind === 'save' ? '存档' : '默认';
  return `<div class="build-switch" role="group" aria-label="当前编辑方案">
      <button type="button" data-build="A" aria-pressed="${active === 'A'}"><b>A</b><span>${active === 'A' ? '正在编辑' : '切换编辑'}</span></button>
      <button type="button" data-build="B" aria-pressed="${active === 'B'}"><b>B</b><span>${active === 'B' ? '正在编辑' : '切换编辑'}</span></button>
    </div>
    <div class="build-actions">
      <button type="button" data-command="copy">复制 ${active} 到 ${active === 'A' ? 'B' : 'A'}</button>
      <button type="button" data-command="swap">交换 A / B</button>
      <button type="button" data-command="reset">恢复${baselineLabel}基线</button>
    </div>
    <p class="build-context">${escapeHtml(character.name || character.characterId)} · ${active} 方案中的角色装备独立；召唤石按 A / B 全局共享。</p>`;
}

const exact = value => (Number(value) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 6 });

function formulaValue(value, unit = '', absolute = false) {
  const number = absolute ? Math.abs(Number(value) || 0) : Number(value) || 0;
  if (unit === '%') return `${exact(number)}%`;
  if (unit === '×') return `${exact(number)} 倍`;
  return exact(number);
}

function formulaGroup(group) {
  const terms = (group.parts || []).map((item, index) => {
    const negative = group.operator === '+' && Number(item.value) < 0;
    const operator = index ? (negative ? '−' : group.operator) : '';
    const pending = item.evidence === 'pending-pool' ? ' pending' : '';
    return `${operator ? `<i>${operator}</i>` : ''}<span class="formula-term${pending}"><small>${escapeHtml(item.label)}</small><strong>${formulaValue(item.value, item.unit, negative)}</strong></span>`;
  }).join('') || '<span class="formula-empty">无额外来源</span>';
  return `<div class="formula-group"><div><b>${escapeHtml(group.label)}</b><output>= ${formulaValue(group.result, group.resultUnit)}</output></div><p>${terms}</p></div>`;
}

function metric(label, value, derivation) {
  const statuses = { verified: '程序已核对', observed: '实测样本吻合' };
  const status = statuses[derivation?.status] || '部分待标定';
  const provisional = !statuses[derivation?.status];
  return `<details class="stat-metric ${provisional ? 'provisional' : derivation?.status || ''}"><summary><span><small>${escapeHtml(label)}</small><strong>${value}</strong></span></summary><div class="stat-derivation"><header><b>${status}</b><span>${escapeHtml(derivation?.evidence || '')}</span></header><div class="formula-groups">${(derivation?.groups || []).map(formulaGroup).join('')}</div><code>${escapeHtml(derivation?.formula || '')}</code></div></details>`;
}

function effectiveHpDerivation(calculated) {
  const taken = calculated.damageTakenMultiplier;
  const result = taken > 0 ? calculated.hp.final / taken : Number.POSITIVE_INFINITY;
  const inputStatuses = [calculated.hp.derivation.status, calculated.defense.derivation.status];
  const status = inputStatuses.includes('provisional')
    ? 'provisional'
    : inputStatuses.includes('observed') ? 'observed' : 'verified';
  return {
    status,
    evidence: '由最终 HP 与当前承伤倍率直接换算',
    groups: [{
      label: '有效生命换算', operator: '÷',
      parts: [{ label: '最终 HP', value: calculated.hp.final }, { label: '承伤倍率', value: taken }],
      result
    }],
    formula: `${calculated.hp.final} ÷ ${exact(taken)} = ${exact(result)}`
  };
}

export function renderBuildOverview(build, calculated) {
  const weapon = build.weaponItem;
  const stats = weapon?.currentStats;
  const skills = weapon?.currentSkills || [build.weaponSkill1, build.weaponSkill2].filter(Boolean).map(([name, level]) => ({ name, level }));
  return `<div class="build-identity">
      <div class="weapon-name">${sourceTag(weapon || build.source)}<strong>${escapeHtml(weapon?.name || build.weapon)}</strong><span>${escapeHtml(weapon?.archetype || '')}</span></div>
      <button type="button" data-open-inventory="weapons">更换武器</button>
    </div>
    <div class="stat-strip">
      ${metric('最终 HP', fmt(calculated.hp.final), calculated.hp.derivation)}
      ${metric('面板攻击', fmt(calculated.attack.final), calculated.attack.derivation)}
      ${metric('暴击率', `${fmt1(calculated.crit.raw)}%`, calculated.crit.derivation)}
      ${metric('昏厥值', fmt(calculated.stun.final), calculated.stun.derivation)}
      ${metric('综合减伤', `${fmt1(calculated.defense.reductionPct)}%`, calculated.defense.derivation)}
      ${metric('有效生命', fmt(calculated.effectiveHp), effectiveHpDerivation(calculated))}
    </div>
    <div class="detail-grid">
      <div><span>角色基础</span><strong>HP ${fmt(build.characterStats?.hp)} / 攻击 ${fmt(build.characterStats?.attack)}</strong></div>
      <div><span>武器当前属性</span><strong>${stats ? `Lv.${stats.level} · HP ${fmt(stats.hp)} / 攻击 ${fmt(stats.attack)}` : '使用旧版武器模板'}</strong></div>
      <div class="wide"><span>武器技能</span><strong>${skills.map(skill => `${escapeHtml(skill.name)} Lv.${fmt(skill.level)}`).join(' · ') || '无'}</strong></div>
    </div>`;
}

function factorRows(build) {
  const pairs = build.factorPairs || [];
  return `<div class="slot-list">${pairs.map((pair, index) => `<div class="equipment-row">
      <span class="slot-index">${String(index + 1).padStart(2, '0')}</span>
      <div class="factor-fields"><label>主词条<input data-factor-name="${index}:0" list="traitNameList" value="${escapeHtml(pair[0] || '')}"></label><label>Lv.<input type="number" min="0" max="99" data-factor-level="${index}:1" value="${fmt(pair[1])}"></label><label>副词条<input data-factor-name="${index}:2" list="traitNameList" value="${escapeHtml(pair[2] || '')}"></label><label>Lv.<input type="number" min="0" max="99" data-factor-level="${index}:3" value="${fmt(pair[3])}"></label></div>
      ${sourceTag(build.factorItems?.[index] || { virtual: true })}
      <button type="button" data-open-inventory="factors" data-target="${index}">更换</button>
      <button type="button" class="icon-button" data-remove-factor="${index}" aria-label="清空第 ${index + 1} 个因子">×</button>
    </div>`).join('')}</div>
    <div class="editor-actions"><button type="button" data-open-inventory="factors">从因子库存选择</button><button type="button" data-create="factor">新建虚拟因子</button></div>`;
}

function blessingPanel(build) {
  const item = build.blessingItem;
  const traits = item?.traits || (build.blessings || []).map(([name, level]) => ({ name, level }));
  return `<div class="featured-item">${sourceTag(item || { virtual: true })}<div><strong>${escapeHtml(item?.name || '当前祝福')}</strong><span>${escapeHtml(traitText(traits))}</span></div></div>
    <div class="blessing-fields">${[0, 1, 2].map(index => `<label>词条 ${index + 1}<input data-blessing-name="${index}" list="traitNameList" value="${escapeHtml(traits[index]?.name || '')}"></label><label>等级<input type="number" min="0" max="99" data-blessing-level="${index}" value="${traits[index]?.level || 0}"></label>`).join('')}</div>
    <div class="editor-actions"><button type="button" data-open-inventory="blessings">从祝福库存选择</button><button type="button" data-create="blessing">新建虚拟祝福</button><button type="button" data-remove-blessing>卸下祝福</button></div>`;
}

function summonPanel(summons) {
  return `<div class="slot-list">${[0, 1, 2, 3].map(index => {
    const item = summons[index];
    return `<div class="equipment-row summon-row"><span class="slot-index">${index + 1}</span><div class="summon-fields"><label>召唤石<input data-summon-name="${index}" value="${escapeHtml(item?.name || '')}" ${item ? '' : 'disabled'}></label><label>主词条<input data-summon-main="${index}" list="traitNameList" value="${escapeHtml(item?.mainTrait?.name || '')}" ${item ? '' : 'disabled'}></label><label>等级<input type="number" min="0" max="99" data-summon-main-level="${index}" value="${item?.mainTrait?.level || 0}" ${item ? '' : 'disabled'}></label><label>副词条<select data-summon-param="${index}" ${item ? '' : 'disabled'}>${summonParamOptions(item?.subTrait?.paramId)}</select></label><label>数值<input type="number" data-summon-value="${index}" value="${item?.subTrait?.value || 0}" ${item ? '' : 'disabled'}></label></div>${item ? sourceTag(item) : ''}<button type="button" data-open-inventory="summons" data-target="${index}">更换</button><button type="button" class="icon-button" data-remove-summon="${index}" aria-label="清空第 ${index + 1} 颗召唤石">×</button></div>`;
  }).join('')}</div><div class="editor-actions"><button type="button" data-open-inventory="summons">从召唤石库存选择</button><button type="button" data-create="summon">新建虚拟召唤石</button></div>`;
}

function summonParamOptions(selected) {
  return SUMMON_PARAMS.map(([id, name]) => `<option value="${id}" ${Number(selected) === id ? 'selected' : ''}>${name}</option>`).join('');
}

const MASTERY_CATEGORY_NAMES = { SB_ATK: '攻击盘', SB_DEF: '防御盘', SB_LIMIT: '界限盘' };

function masteryPanel(build, calculated, catalogNodes) {
  const limits = build.limitBonuses || [];
  const active = new Set((build.masteryNodes || []).map(node => node.key));
  const grouped = groupByMap(catalogNodes, node => node.category || '其他');
  const nodes = [...grouped].map(([category, items]) => `<details ${category === 'SB_DEF' ? 'open' : ''}><summary>${escapeHtml(MASTERY_CATEGORY_NAMES[category] || category)} · 已点 ${items.filter(item => active.has(item.key)).length} / ${items.length}</summary><div class="mastery-list">${items.map(node => `<label class="mastery-node"><input type="checkbox" data-mastery-key="${node.key}" ${active.has(node.key) ? 'checked' : ''}><span><strong>${escapeHtml(node.name || `节点 ${node.index ?? ''}`)}</strong><small>${escapeHtml(node.description || node.category || '')}</small></span></label>`).join('')}</div></details>`).join('');
  const summary = calculated.mastery;
  return `<div class="mastery-summary"><span>已点专精 <b>${active.size}</b> / 目录 ${catalogNodes?.length || 0}</span><span title="对当前动作产生数值影响的节点">本动作生效 <b>${summary.applied.length}</b></span><span title="需要满足条件（弱点、联动因子数、条件开关）才生效">条件未启用 <b>${summary.inactive.length}</b></span><span title="只作用于其他动作或特定能力">不作用于当前动作 <b>${summary.notApplicable.length}</b></span><span title="冷却、抗性等不进入面板数值的节点">非数值 <b>${summary.nonStat.length}</b></span><span title="效果尚未建模，未计入数值">未建模 <b>${summary.unmodeled.length}</b></span></div>
    <div class="mastery-catalog">${nodes || '<p class="empty-state">该角色没有目录专精数据。</p>'}</div>
    <details open><summary>超限专精</summary><div class="limit-list">${[0, 1, 2, 3].map(index => { const item = limits[index]; return `<div><span>槽位 ${index + 1}</span><select data-limit-kind="${index}">${limitOptions(item?.kind)}</select><input type="number" min="0" step="1" data-limit-value="${index}" value="${item?.value || 0}"><b>${item?.kind?.startsWith('flat') ? '点' : '%'}</b></div>`; }).join('')}</div></details>`;
}

const LIMIT_TYPES = [['flatAttack', '攻击力'], ['normalCapPct', '普通攻击上限'], ['skillCapPct', '能力上限'], ['critRatePct', '暴击率'], ['flatHp', '最大 HP'], ['skillDamagePct', '能力伤害'], ['sbaCapPct', '奥义上限'], ['sbaDamagePct', '奥义伤害'], ['stunFlat', '昏厥值']];
function limitOptions(selected) { return LIMIT_TYPES.map(([kind, name]) => `<option value="${kind}" ${kind === selected ? 'selected' : ''}>${name}</option>`).join(''); }

export function renderEquipment(build, calculated, summons, tab, catalogNodes = []) {
  if (tab === 'blessing') return blessingPanel(build);
  if (tab === 'summons') return summonPanel(summons);
  if (tab === 'mastery') return masteryPanel(build, calculated, catalogNodes);
  return factorRows(build);
}

export function renderInventoryItems(items, type, selectedKey) {
  return items.map(item => {
    const key = String(item.unitId ?? item.id);
    let details = '';
    if (type === 'weapons') details = `${item.archetype || ''} · Lv.${item.currentStats?.level || '?'} · 攻击 ${fmt(item.currentStats?.attack)}`;
    if (type === 'factors') details = traitText(item.traits);
    if (type === 'blessings') details = traitText(item.traits);
    if (type === 'summons') details = `${item.mainTrait?.name || '无主词条'} Lv.${item.mainTrait?.level || 0} · ${item.subTrait?.name || '无副词条'} ${fmt1(item.subTrait?.value)}`;
    return `<button type="button" class="inventory-item ${key === selectedKey ? 'selected' : ''}" data-select-item="${escapeHtml(key)}"><span>${sourceTag(item)}<strong>${escapeHtml(item.name || `${type} ${key}`)}</strong></span><small>${escapeHtml(details)}</small></button>`;
  }).join('') || '<p class="empty-state">没有匹配的库存内容。</p>';
}
