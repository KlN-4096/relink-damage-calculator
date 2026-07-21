import { DEFAULT_CONFIG } from '../data/data.js';
import { GAME_CATALOG } from '../data/game-catalog.js';

export const SCHEMA_VERSION = 2;
export const BUILD_IDS = Object.freeze(['A', 'B']);
export const DEFAULT_CHARACTER_ID = 'PL2900';
const CHARACTER_IDS = new Set(GAME_CATALOG.characterById.keys());

const BUILD_KEYS = [
  'weapon', 'weaponItem', 'awakenLevel', 'weaponSkill1', 'weaponSkill2', 'mastery', 'masteryNodes',
  'blessings', 'blessingItem', 'factorPairs', 'factorItems', 'summons', 'summonStones', 'limitBonuses',
  'abilities', 'equippedAbilityIds', 'characterStats', 'progression', 'manualModifiers', 'source'
];

export const cloneValue = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function normalizeSummonStones(rows) {
  return (Array.isArray(rows) ? rows : []).map(stone => {
    const normalized = cloneValue(stone);
    const trait = normalized?.subTrait;
    if (!trait || trait.levelIndex !== undefined || normalized.unitId === undefined) return normalized;
    const catalog = GAME_CATALOG.summonParams.get(Number(trait.hash) >>> 0);
    const rawIndex = Number(trait.level);
    if (!catalog || !Number.isInteger(rawIndex) || rawIndex < 0 || rawIndex >= catalog.values.length) return normalized;
    const legacyValue = Number(catalog.values[Math.max(0, rawIndex - 1)]);
    if (Number(trait.value) !== legacyValue) return normalized;
    trait.levelIndex = rawIndex;
    trait.level = rawIndex + 1;
    trait.value = catalog.values[rawIndex];
    return normalized;
  });
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function normalizeBuild(raw = {}) {
  const build = cloneValue(DEFAULT_CONFIG);
  for (const key of BUILD_KEYS) {
    if (raw[key] !== undefined) build[key] = cloneValue(raw[key]);
  }
  build.mastery = { ...cloneValue(DEFAULT_CONFIG.mastery), ...(build.mastery || {}) };
  build.masteryNodes = Array.isArray(build.masteryNodes) ? build.masteryNodes : [];
  // Older stored copies keep raw "{0}" templates; refresh text and effect parts
  // from the current catalog so display and calculation stay accurate.
  build.masteryNodes = build.masteryNodes.map(node => {
    const fresh = GAME_CATALOG.masteryByKey?.get(node?.key);
    return fresh ? { ...node, name: fresh.name, description: fresh.description, parts: cloneValue(fresh.parts) } : node;
  });
  build.factorItems = Array.isArray(build.factorItems) ? build.factorItems : [];
  build.summonStones = normalizeSummonStones(build.summonStones);
  build.limitBonuses = Array.isArray(build.limitBonuses) ? build.limitBonuses : [];
  build.abilities = Array.isArray(build.abilities) ? build.abilities : [];
  build.equippedAbilityIds = Array.isArray(build.equippedAbilityIds) ? build.equippedAbilityIds : [];
  build.characterStats = {
    level: 100,
    hp: 0,
    attack: 0,
    critRate: 0,
    stun: 0,
    ...(build.characterStats || {})
  };
  build.manualModifiers = {
    attackPct: 0,
    hpPct: 0,
    capPct: 0,
    damagePct: 0,
    damageTakenPct: 0,
    supplementaryRate: 0,
    echoLayers: 0,
    ...(build.manualModifiers || {})
  };
  build.source = {
    kind: 'manual',
    itemId: null,
    virtual: false,
    ...(build.source || {})
  };
  return build;
}

function createCharacterState(characterId, build) {
  const baseline = normalizeBuild(build);
  return {
    characterId,
    baseline: cloneValue(baseline),
    builds: { A: cloneValue(baseline), B: cloneValue(baseline) }
  };
}

export function createProjectState({ characterId = DEFAULT_CHARACTER_ID, build = DEFAULT_CONFIG } = {}) {
  const summons = cloneValue(build.summonStones || []);
  return {
    schemaVersion: SCHEMA_VERSION,
    activeCharacterId: characterId,
    activeBuildId: 'A',
    activeTab: 'workspace',
    snapshot: null,
    summonBaseline: summons,
    summonBuilds: { A: cloneValue(summons), B: cloneValue(summons) },
    characters: { [characterId]: createCharacterState(characterId, build) }
  };
}

export function ensureCharacterState(project, characterId, build = DEFAULT_CONFIG) {
  if (!project.characters[characterId]) {
    project.characters[characterId] = createCharacterState(characterId, build);
  }
  return project.characters[characterId];
}

function normalizeCharacterState(characterId, raw = {}) {
  const baseline = normalizeBuild(raw.baseline || raw.builds?.A || DEFAULT_CONFIG);
  return {
    characterId,
    baseline,
    builds: {
      A: normalizeBuild(raw.builds?.A || baseline),
      B: normalizeBuild(raw.builds?.B || raw.builds?.A || baseline)
    }
  };
}

export function normalizeProjectState(raw = {}) {
  if (raw.schemaVersion === SCHEMA_VERSION && raw.characters && typeof raw.characters === 'object') {
    const characterIds = Object.keys(raw.characters).filter(characterId => CHARACTER_IDS.has(characterId));
    const activeCharacterId = characterIds.includes(raw.activeCharacterId)
      ? raw.activeCharacterId
      : characterIds[0] || DEFAULT_CHARACTER_ID;
    const characters = Object.fromEntries(characterIds.map(characterId => [
      characterId,
      normalizeCharacterState(characterId, raw.characters[characterId])
    ]));
    if (!characters[activeCharacterId]) characters[activeCharacterId] = createCharacterState(activeCharacterId, DEFAULT_CONFIG);
    return {
      schemaVersion: SCHEMA_VERSION,
      activeCharacterId,
      activeBuildId: BUILD_IDS.includes(raw.activeBuildId) ? raw.activeBuildId : 'A',
      activeTab: ['workspace', 'actions', 'comparison', 'data'].includes(raw.activeTab) ? raw.activeTab : 'workspace',
      snapshot: null,
      summonBaseline: normalizeSummonStones(raw.summonBaseline),
      summonBuilds: {
        A: normalizeSummonStones(raw.summonBuilds?.A || raw.summonBaseline),
        B: normalizeSummonStones(raw.summonBuilds?.B || raw.summonBuilds?.A || raw.summonBaseline)
      },
      characters
    };
  }

  const requestedCharacter = String(raw.damage?.characterId || '');
  const characterId = CHARACTER_IDS.has(requestedCharacter) ? requestedCharacter : DEFAULT_CHARACTER_ID;
  return createProjectState({ characterId, build: raw });
}

export function copyBuild(project, characterId, fromId, toId) {
  if (!BUILD_IDS.includes(fromId) || !BUILD_IDS.includes(toId)) throw new RangeError('Unknown build id');
  const character = ensureCharacterState(project, characterId);
  character.builds[toId] = cloneValue(character.builds[fromId]);
  project.summonBuilds[toId] = cloneValue(project.summonBuilds[fromId]);
  return character.builds[toId];
}

export function swapBuilds(project, characterId) {
  const character = ensureCharacterState(project, characterId);
  const previousA = character.builds.A;
  character.builds.A = character.builds.B;
  character.builds.B = previousA;
  const previousSummons = project.summonBuilds.A;
  project.summonBuilds.A = project.summonBuilds.B;
  project.summonBuilds.B = previousSummons;
  return character.builds;
}

export function resetBuild(project, characterId, buildId) {
  if (!BUILD_IDS.includes(buildId)) throw new RangeError('Unknown build id');
  const character = ensureCharacterState(project, characterId);
  character.builds[buildId] = cloneValue(character.baseline);
  project.summonBuilds[buildId] = cloneValue(project.summonBaseline);
  return character.builds[buildId];
}

export function normalizeSaveSnapshot(raw = {}) {
  const characters = Object.fromEntries(Object.entries(raw.characters || {}).map(([characterId, character = {}]) => [
    characterId,
    {
      ...cloneValue(character),
      characterId,
      build: character.build ? normalizeBuild({
        ...character.build,
        source: { kind: 'save', virtual: false, ...(character.build.source || {}) }
      }) : null
    }
  ]));
  return {
    format: 'GBFR-SaveData',
    readOnly: true,
    fileName: String(raw.fileName || 'SaveData1.dat'),
    importedAt: raw.importedAt || new Date().toISOString(),
    gameVersion: raw.gameVersion || null,
    hashValid: raw.hashValid ?? null,
    characters,
    inventory: {
      weapons: cloneValue(raw.inventory?.weapons || []),
      factors: cloneValue(raw.inventory?.factors || []),
      blessings: cloneValue(raw.inventory?.blessings || []),
      summons: cloneValue(raw.inventory?.summons || []),
      abilities: cloneValue(raw.inventory?.abilities || [])
    },
    equippedSummonIds: cloneValue(raw.equippedSummonIds || []),
    warnings: cloneValue(raw.warnings || [])
  };
}

export function importSaveSnapshot(project, rawSnapshot) {
  const snapshot = attachSaveSnapshot(project, rawSnapshot);
  const summonBaseline = Object.values(snapshot.characters).find(character => character.build?.summonStones)?.build?.summonStones || [];
  project.summonBaseline = cloneValue(summonBaseline);
  project.summonBuilds = { A: cloneValue(summonBaseline), B: cloneValue(summonBaseline) };
  for (const [characterId, savedCharacter] of Object.entries(snapshot.characters)) {
    const character = ensureCharacterState(project, characterId);
    if (!savedCharacter.build) continue;
    character.baseline = cloneValue(savedCharacter.build);
    character.builds.A = cloneValue(savedCharacter.build);
    character.builds.B = cloneValue(savedCharacter.build);
  }
  if (snapshot.characters[project.activeCharacterId] === undefined) {
    const firstCharacterId = Object.keys(snapshot.characters)[0];
    if (firstCharacterId) project.activeCharacterId = firstCharacterId;
  }
  return snapshot;
}

export function attachSaveSnapshot(project, rawSnapshot) {
  const snapshot = deepFreeze(normalizeSaveSnapshot(rawSnapshot));
  project.snapshot = snapshot;
  return snapshot;
}

function projectOutput(project) {
  return {
    schemaVersion: SCHEMA_VERSION,
    activeCharacterId: project.activeCharacterId,
    activeBuildId: project.activeBuildId,
    activeTab: project.activeTab,
    summonBaseline: cloneValue(project.summonBaseline),
    summonBuilds: cloneValue(project.summonBuilds),
    characters: cloneValue(project.characters)
  };
}

export function serializeBuildProject(project) {
  return JSON.stringify(projectOutput(project), null, 2);
}

export function serializeStoredProject(project) {
  return JSON.stringify(projectOutput(project));
}

export function parseBuildProject(text) {
  return normalizeProjectState(JSON.parse(text));
}
