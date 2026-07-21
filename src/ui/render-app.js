import { GAME_CATALOG } from '../data/game-catalog.js';
import { renderRawResults } from './render-actions.js';
import { renderBuildOverview, renderBuildToolbar, renderEquipment } from './render-build.js';
import { renderComparison } from './render-comparison.js';
import { renderData } from './render-data.js';
import { renderSummary } from './render-summary.js';

function renderCharacterSelect(project) {
  const select = document.getElementById('characterSelect');
  select.innerHTML = [...GAME_CATALOG.characterById.values()].map(character =>
    `<option value="${character.id}">${character.name} · ${character.id}</option>`
  ).join('');
  select.value = project.activeCharacterId;
  const badge = document.getElementById('saveBadge');
  badge.textContent = project.snapshot ? `存档已读 · ${project.snapshot.fileName}` : '未导入存档';
  badge.classList.toggle('active', Boolean(project.snapshot));
}

function renderPages(project) {
  document.querySelectorAll('[data-page]').forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.page === project.activeTab));
  });
  document.querySelectorAll('[data-page-panel]').forEach(panel => {
    panel.hidden = panel.dataset.pagePanel !== project.activeTab;
  });
}

function renderWorkspace({ project, equipmentTab, character, build, view }) {
  const calculated = view[project.activeBuildId].build;  document.getElementById('buildToolbar').innerHTML = renderBuildToolbar(project, character);
  document.getElementById('buildOverview').innerHTML = renderBuildOverview(build, calculated);
  const source = build.source?.kind === 'save' ? '存档基线' : build.source?.virtual ? '虚拟方案' : '本地方案';
  document.getElementById('buildSourceBadge').textContent = source;
  document.querySelectorAll('[data-equip-tab]').forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.equipTab === equipmentTab));
  });
  const catalogNodes = GAME_CATALOG.masteryByCharacter.get(character.characterId) || [];
  document.getElementById('equipmentEditor').innerHTML = renderEquipment(
    build,
    calculated,
    project.summonBuilds[project.activeBuildId],
    equipmentTab,
    catalogNodes
  );
  const counts = {
    factors: build.factorPairs?.filter(pair => pair?.[0]).length || 0,
    blessing: build.blessings?.filter(pair => pair?.[0]).length || 0,
    summons: project.summonBuilds[project.activeBuildId]?.filter(Boolean).length || 0,
    mastery: build.masteryNodes?.length || 0
  };
  document.getElementById('equipmentCount').textContent = `${counts[equipmentTab]} 项`;
}

function renderRaw(view) {
  document.getElementById('rawResults').innerHTML = renderRawResults(view);
  document.getElementById('rawSummary').textContent = `A ${Math.round(view.A.raw.totalExpected).toLocaleString('zh-CN')}`;
}

export function renderApplication(options) {
  const { project, equipmentTab, character, build, view } = options;
  renderCharacterSelect(project);
  renderPages(project);
  document.getElementById('summaryMetrics').innerHTML = renderSummary(view);
  renderWorkspace({ project, equipmentTab, character, build, view });
  renderRaw(view);
  document.getElementById('comparisonContent').innerHTML = renderComparison(view);
  document.getElementById('dataContent').innerHTML = renderData(project);
}
