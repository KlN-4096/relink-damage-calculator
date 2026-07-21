export function groupByMap(items, keySelector) {
  const groups = new Map();
  for (const item of items || []) {
    const key = keySelector(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}
