export function masteryNodes(builds) {
  return Object.values(builds || {}).flatMap(build => build?.masteryNodes || []);
}

function conditionAffectsDamage(part) {
  const synergy = Number(part.mainType) === 1 && Number(part.behavior) === 3;
  if (!part.conditional || synergy) return false;
  const mainType = Number(part.mainType), subType = Number(part.subType);
  if (mainType === 8) return [0, 2, 4, 6, 8].includes(subType);
  if (mainType === 2 || mainType === 9) return [0, 1].includes(subType);
  return mainType === 0 && [1, 12, 14].includes(subType);
}

function conditionEntries(builds) {
  const byLabel = new Map();
  masteryNodes(builds).forEach(node => {
    if (!(node.parts || []).some(conditionAffectsDamage)) return;
    const label = node.name || node.description || node.key;
    if (!byLabel.has(label)) byLabel.set(label, { label, keys: [] });
    const entry = byLabel.get(label);
    if (!entry.keys.includes(node.key)) entry.keys.push(node.key);
  });
  return [...byLabel.values()];
}

function groupMeta(label, index) {
  if (/(中毒|灼热|灾祸)状态/.test(label)) {
    return { id: 'self-debuff', title: '自身异常状态', exclusive: true };
  }
  if (/(正位|逆位)状态/.test(label)) {
    return { id: 'stance', title: '正位 / 逆位', exclusive: true };
  }
  const presence = label.match(/^(.{1,18}?)(?:在场|不在场)/);
  if (presence) {
    return { id: `presence-${presence[1]}`, title: `${presence[1]}状态`, exclusive: true };
  }
  if (/(普通状态|龙人化状态|啖因果状态)/.test(label)) {
    return { id: 'character-form', title: '角色形态', exclusive: true };
  }
  return { id: `condition-${index}`, title: '独立条件', exclusive: false };
}

export function conditionalMasteryGroups(builds) {
  const grouped = new Map();
  conditionEntries(builds).forEach((entry, index) => {
    const meta = groupMeta(entry.label, index);
    if (!grouped.has(meta.id)) grouped.set(meta.id, { ...meta, entries: [] });
    grouped.get(meta.id).entries.push(entry);
  });
  return [...grouped.values()];
}
