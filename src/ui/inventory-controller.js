import { applyInventoryItem } from '../core/equipment-model.js';
import { renderInventoryItems } from './render-build.js';

const TITLES = Object.freeze({
  weapons: '选择武器',
  factors: '选择因子',
  blessings: '选择祝福',
  summons: '选择召唤石'
});

function searchableText(item) {
  return [
    item.name,
    item.slot,
    ...(item.traits || []).flatMap(trait => [trait.name, trait.level]),
    item.mainTrait?.name,
    item.subTrait?.name,
    item.subTrait?.value
  ].filter(value => value !== undefined).join(' ').toLowerCase();
}

export function createInventoryController(options) {
  const { getProject, getActiveBuild, onMissingSnapshot, onApplied, toast } = options;
  let state = null;

  function items(type) {
    const project = getProject();
    const rows = project.snapshot?.inventory?.[type] || [];
    return type === 'weapons'
      ? rows.filter(item => item.characterId === project.activeCharacterId)
      : rows;
  }

  function renderResults() {
    if (!state) return;
    const all = items(state.type);
    const query = state.query.trim().toLowerCase();
    const matches = query ? all.filter(item => searchableText(item).includes(query)) : all;
    const visible = matches.slice(0, 200);
    const suffix = matches.length > visible.length ? ` · 显示前 ${visible.length} 项，请搜索缩小范围` : '';
    document.getElementById('inventoryResults').innerHTML =
      `<p class="inventory-count">${matches.length} 项${suffix}</p>${renderInventoryItems(visible, state.type)}`;
  }

  function open(type, target) {
    if (!getProject().snapshot) {
      onMissingSnapshot();
      return;
    }
    state = { type, target: target === undefined ? null : Number(target), query: '' };
    document.getElementById('inventoryDialogTitle').textContent = TITLES[type] || '选择库存装备';
    document.getElementById('inventorySearch').value = '';
    renderResults();
    document.getElementById('inventoryDialog').showModal();
    document.getElementById('inventorySearch').focus();
  }

  function handleSearch(target) {
    if (target.id !== 'inventorySearch' || !state) return false;
    state.query = target.value;
    renderResults();
    return true;
  }

  function select(key) {
    if (!state) return;
    const item = items(state.type).find(row => String(row.unitId ?? row.id) === key);
    if (!item) return;
    const project = getProject();
    const result = applyInventoryItem({
      type: state.type,
      item,
      target: state.target,
      build: getActiveBuild(),
      summons: project.summonBuilds[project.activeBuildId]
    });
    if (!result.ok) {
      toast(result.message, true);
      return;
    }
    document.getElementById('inventoryDialog').close();
    state = null;
    onApplied();
  }

  return Object.freeze({ open, handleSearch, select });
}
