import { DEFAULT_CONFIG, FACTOR_NAMES } from './data/data.js';
import { createVirtualEquipment, updateEquipmentInput } from './core/equipment-model.js';
import { GAME_CATALOG, characterStatsAt } from './data/game-catalog.js';
import { createInventoryController } from './ui/inventory-controller.js';
import { compareProjectBuilds } from './core/project-engine.js';
import { loadStoredProject, persistProject } from './storage/project-storage.js';
import { renderApplication } from './ui/render-app.js';
import { mapSaveRecords } from './save/save-domain.js';
import { parseSaveFile } from './save/save-parser.js';
import { loadCachedSnapshot, persistCachedSnapshot } from './storage/snapshot-storage.js';
import {
  attachSaveSnapshot, cloneValue, copyBuild, createProjectState, ensureCharacterState, importSaveSnapshot,
  normalizeProjectState, parseBuildProject, resetBuild, serializeBuildProject, serializeStoredProject, swapBuilds
} from './core/state-model.js';

const STORAGE_KEY = 'relink-damage-calculator-project-v2';
const LEGACY_STORAGE_KEY = 'relink-local-damage-calculator-v1';
const EQUIP_TABS = ['factors', 'blessing', 'summons', 'mastery'];

let project = loadProject();
let equipmentTab = 'factors';
let toastTimer = null, storageFailureNotified = false;

function loadProject() {
  return loadStoredProject({
    storage: localStorage,
    currentKey: STORAGE_KEY,
    legacyKey: LEGACY_STORAGE_KEY,
    normalize: normalizeProjectState,
    fallback: createDefaultProject
  });
}

function createDefaultProject() {
  const build = cloneValue(DEFAULT_CONFIG);
  build.characterStats = characterStatsAt('PL2900', 100);
  return createProjectState({ characterId: 'PL2900', build });
}

function saveProject(showError = true) {
  const result = persistProject({
    storage: localStorage,
    key: STORAGE_KEY,
    project,
    serialize: serializeStoredProject
  });
  if (result.ok) {
    storageFailureNotified = false;
    return true;
  }
  console.warn('配装无法写入浏览器本地存储，当前页面中的修改仍然有效。', result.error);
  if (showError && !storageFailureNotified) toast('本地存储空间不足，修改仅保留在当前页面。', true);
  storageFailureNotified = true;
  return false;
}

function activeCharacter() {
  const characterId = project.activeCharacterId;
  const character = ensureCharacterState(project, characterId, {
    ...cloneValue(DEFAULT_CONFIG), characterStats: characterStatsAt(characterId, 100)
  });
  const catalog = GAME_CATALOG.characterById.get(characterId);
  character.name = catalog?.name || characterId;
  return character;
}

function activeBuild() {
  return activeCharacter().builds[project.activeBuildId];
}

function renderAll() {
  const character = activeCharacter();
  const view = compareProjectBuilds(character, project.summonBuilds);
  renderApplication({
    project,
    equipmentTab,
    character,
    build: activeBuild(),
    view
  });
}

function toast(message, error = false) {
  const node = document.getElementById('toast');
  clearTimeout(toastTimer);
  node.textContent = message;
  node.classList.toggle('error', error);
  node.classList.add('show');
  toastTimer = setTimeout(() => node.classList.remove('show'), 2400);
}

function scrollToContentStart() {
  const main = document.querySelector('main');
  const tabs = document.querySelector('.page-tabs');
  window.scrollTo({ top: Math.max(0, main.offsetTop - tabs.offsetHeight) });
}

function handleCharacterChange(characterId) {
  project.activeCharacterId = characterId;
  ensureCharacterState(project, characterId, {
    ...cloneValue(DEFAULT_CONFIG), characterStats: characterStatsAt(characterId, 100)
  });
  saveProject();
  renderAll();
}

function handleChange(event) {
  const target = event.target;
  if (target.id === 'characterSelect') return handleCharacterChange(target.value);
  const updated = updateEquipmentInput({
    target,
    build: activeBuild(),
    summons: project.summonBuilds[project.activeBuildId],
    catalogNodes: GAME_CATALOG.masteryByCharacter.get(project.activeCharacterId) || []
  });
  if (!updated) return;
  saveProject();
  renderAll();
}

function createVirtual(type, target) {
  const result = createVirtualEquipment({
    type,
    target,
    build: activeBuild(),
    summons: project.summonBuilds[project.activeBuildId]
  });
  if (!result.ok) {
    toast(result.message, true);
    return;
  }
  equipmentTab = result.tab;
  saveProject();
  renderAll();
}

function handleBuildCommand(command) {
  const characterId = project.activeCharacterId;
  if (command === 'copy') copyBuild(project, characterId, project.activeBuildId, project.activeBuildId === 'A' ? 'B' : 'A');
  if (command === 'swap') swapBuilds(project, characterId);
  if (command === 'reset') resetBuild(project, characterId, project.activeBuildId);
  saveProject();
  renderAll();
}

function downloadProject() {
  const blob = new Blob([serializeBuildProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'relink-build-project.json';
  link.click();
  URL.revokeObjectURL(url);
  toast('已导出配装方案 JSON');
}

async function importSave(file) {
  try {
    const parsed = parseSaveFile(await file.arrayBuffer());
    const snapshot = mapSaveRecords(parsed.records, GAME_CATALOG, {
      fileName: file.name, gameVersion: GAME_CATALOG.version, importedAt: new Date().toISOString()
    });
    importSaveSnapshot(project, snapshot);
    project.activeTab = 'actions';
    let cached = true;
    try { await persistCachedSnapshot(snapshot); }
    catch (error) { cached = false; console.warn('无法缓存只读存档快照。', error); }
    const persisted = saveProject(false);
    renderAll();
    const suffix = !persisted ? '，配装仅保留在当前页面' : cached ? '' : '，刷新后需重新导入存档';
    toast(`已只读导入 ${Object.keys(snapshot.characters).length} 名角色${suffix}`);
  } catch (error) {
    console.error(error);
    toast(error.message || '存档无法读取', true);
  }
}

async function importProject(file) {
  try {
    const snapshot = project.snapshot;
    project = parseBuildProject(await file.text());
    if (snapshot) attachSaveSnapshot(project, snapshot);
    const persisted = saveProject(false);
    renderAll();
    toast(persisted ? '已导入配装方案 JSON' : '已导入方案，修改仅保留在当前页面');
  } catch (error) {
    console.error(error);
    toast('方案 JSON 无法读取', true);
  }
}

const inventoryController = createInventoryController({
  getProject: () => project,
  getActiveBuild: activeBuild,
  onMissingSnapshot: () => {
    project.activeTab = 'data';
    saveProject();
    renderAll();
    scrollToContentStart();
    toast('请先在数据管理中导入游戏存档');
  },
  onApplied: () => {
    saveProject();
    renderAll();
  },
  toast
});

document.addEventListener('change', handleChange);
document.addEventListener('input', event => {
  inventoryController.handleSearch(event.target);
});

document.addEventListener('click', event => {
  const page = event.target.closest('[data-page]');
  if (page) { project.activeTab = page.dataset.page; saveProject(); renderAll(); scrollToContentStart(); return; }
  const build = event.target.closest('[data-build]');
  if (build) { project.activeBuildId = build.dataset.build; saveProject(); renderAll(); return; }
  const command = event.target.closest('[data-command]');
  if (command) { handleBuildCommand(command.dataset.command); return; }
  const equipTab = event.target.closest('[data-equip-tab]');
  if (equipTab) { equipmentTab = EQUIP_TABS.includes(equipTab.dataset.equipTab) ? equipTab.dataset.equipTab : 'factors'; renderAll(); return; }
  const inventory = event.target.closest('[data-open-inventory]');
  if (inventory) { inventoryController.open(inventory.dataset.openInventory, inventory.dataset.target); return; }
  const selected = event.target.closest('[data-select-item]');
  if (selected) { inventoryController.select(selected.dataset.selectItem); return; }
  const create = event.target.closest('[data-create]');
  if (create) { createVirtual(create.dataset.create, create.dataset.target); return; }
  const removeFactor = event.target.closest('[data-remove-factor]');
  if (removeFactor) {
    const index = Number(removeFactor.dataset.removeFactor), buildState = activeBuild();
    buildState.factorPairs[index] = ['', 0, '', 0]; buildState.factorItems[index] = null;
    saveProject(); renderAll(); return;
  }
  const removeBlessing = event.target.closest('[data-remove-blessing]');
  if (removeBlessing) {
    const buildState = activeBuild();
    buildState.blessings = [];
    buildState.blessingItem = null;
    saveProject(); renderAll(); return;
  }
  const removeSummon = event.target.closest('[data-remove-summon]');
  if (removeSummon) { project.summonBuilds[project.activeBuildId][Number(removeSummon.dataset.removeSummon)] = null; saveProject(); renderAll(); return; }
  const data = event.target.closest('[data-data-command]');
  if (data) {
    if (data.dataset.dataCommand === 'save-import') document.getElementById('saveFile').click();
    if (data.dataset.dataCommand === 'project-import') document.getElementById('projectFile').click();
    if (data.dataset.dataCommand === 'project-export') downloadProject();
    if (data.dataset.dataCommand === 'project-reset' && confirm('确定重置本地 A / B 配装吗？游戏存档不会受影响。')) {
      const snapshot = project.snapshot; project = createDefaultProject();
      if (snapshot) attachSaveSnapshot(project, snapshot);
      saveProject(); renderAll(); scrollToContentStart();
    }
    return;
  }
  const jump = event.target.closest('[data-character-jump]');
  if (jump) { project.activeTab = 'workspace'; handleCharacterChange(jump.dataset.characterJump); scrollToContentStart(); }
});

document.getElementById('saveFile').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (file) importSave(file);
  event.target.value = '';
});
document.getElementById('projectFile').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (file) importProject(file);
  event.target.value = '';
});

document.getElementById('traitNameList').innerHTML = FACTOR_NAMES.map(name => `<option value="${name}"></option>`).join('');
renderAll();
loadCachedSnapshot().then(snapshot => {
  if (!snapshot || project.snapshot) return;
  attachSaveSnapshot(project, snapshot); renderAll();
}).catch(error => console.warn('无法恢复浏览器中的只读存档快照。', error));
