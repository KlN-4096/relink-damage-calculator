export function loadStoredProject({ storage, currentKey, legacyKey, normalize, fallback }) {
  try {
    const current = storage.getItem(currentKey);
    if (current) return normalize(JSON.parse(current));
    const legacy = storage.getItem(legacyKey);
    return legacy ? normalize(JSON.parse(legacy)) : fallback();
  } catch (error) {
    console.warn('无法读取本地配装，已使用默认方案。', error);
    return fallback();
  }
}

export function persistProject({ storage, key, project, serialize }) {
  try {
    const text = serialize(project);
    storage.setItem(key, text);
    return { ok: true, size: text.length, error: null };
  } catch (error) {
    return { ok: false, size: 0, error };
  }
}
