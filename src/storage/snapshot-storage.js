const DATABASE_NAME = 'relink-damage-calculator';
const STORE_NAME = 'save-snapshots';
const SNAPSHOT_KEY = 'latest-v2';

function openDatabase(indexedDb) {
  return new Promise((resolve, reject) => {
    if (!indexedDb) {
      reject(new Error('当前浏览器不支持 IndexedDB'));
      return;
    }
    const request = indexedDb.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开存档快照数据库'));
  });
}

async function runRequest(mode, createRequest, indexedDb) {
  const database = await openDatabase(indexedDb);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = createRequest(transaction.objectStore(STORE_NAME));
    let result;
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error);
    };
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => fail(request.error || new Error('存档快照数据库请求失败'));
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result);
    };
    transaction.onerror = () => fail(transaction.error || new Error('存档快照数据库事务失败'));
    transaction.onabort = () => fail(transaction.error || new Error('存档快照数据库事务已中止'));
  });
}

export function loadCachedSnapshot(indexedDb = globalThis.indexedDB) {
  return runRequest('readonly', store => store.get(SNAPSHOT_KEY), indexedDb);
}

export function persistCachedSnapshot(snapshot, indexedDb = globalThis.indexedDB) {
  return runRequest('readwrite', store => store.put(snapshot, SNAPSHOT_KEY), indexedDb);
}

export function clearCachedSnapshot(indexedDb = globalThis.indexedDB) {
  return runRequest('readwrite', store => store.delete(SNAPSHOT_KEY), indexedDb);
}
