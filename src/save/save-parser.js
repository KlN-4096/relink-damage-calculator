const MAX_VECTOR_ITEMS = 5_000_000;

const SCALAR_SPECS = [
  { field: 1, kind: 'bool', size: 1, read: (view, offset) => view.getUint8(offset) !== 0 },
  { field: 2, kind: 'byte', size: 1, read: (view, offset) => view.getInt8(offset) },
  { field: 3, kind: 'ubyte', size: 1, read: (view, offset) => view.getUint8(offset) },
  { field: 4, kind: 'short', size: 2, read: (view, offset) => view.getInt16(offset, true) },
  { field: 5, kind: 'ushort', size: 2, read: (view, offset) => view.getUint16(offset, true) },
  { field: 6, kind: 'int', size: 4, read: (view, offset) => view.getInt32(offset, true) },
  { field: 7, kind: 'uint', size: 4, read: (view, offset) => view.getUint32(offset, true) },
  { field: 8, kind: 'long', size: 8, read: (view, offset) => safeInteger(view.getBigInt64(offset, true)) },
  { field: 9, kind: 'ulong', size: 8, read: (view, offset) => safeInteger(view.getBigUint64(offset, true)) },
  { field: 10, kind: 'float', size: 4, read: (view, offset) => view.getFloat32(offset, true) }
];

export class SaveParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SaveParseError';
  }
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value.toString();
}

function asView(input) {
  if (input instanceof ArrayBuffer) return new DataView(input);
  if (ArrayBuffer.isView(input)) return new DataView(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Save file must be an ArrayBuffer or typed array');
}

function hasBytes(view, offset, size) {
  return Number.isInteger(offset) && Number.isInteger(size) && offset >= 0 && size >= 0 && offset + size <= view.byteLength;
}

function looksLikeFlatBuffer(view, start, size) {
  if (!hasBytes(view, start, size) || size < 16) return false;
  try {
    const root = start + view.getUint32(start, true);
    if (root < start + 4 || !hasBytes(view, root, 4) || root >= start + size - 4) return false;
    const vtable = root - view.getInt32(root, true);
    if (vtable < start || vtable >= root || !hasBytes(view, vtable, 4)) return false;
    const vtableSize = view.getUint16(vtable, true);
    const objectSize = view.getUint16(vtable + 2, true);
    return vtableSize >= 4 && vtableSize <= 128 && objectSize >= 4 && objectSize <= 256
      && vtable + vtableSize <= start + size;
  } catch {
    return false;
  }
}

function readableI64(view, offset) {
  const value = view.getBigInt64(offset, true);
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : -1;
}

function detectContainer(view) {
  if (looksLikeFlatBuffer(view, 0, view.byteLength)) {
    return { mode: 'raw_savedatabinary', payloadOffset: 0, payloadSize: view.byteLength, header: {} };
  }
  if (view.byteLength < 52) throw new SaveParseError('文件不是受支持的 GBFR 存档或裸 SaveDataBinary。');

  const binaryOffset = readableI64(view, 20);
  const slotOffset = readableI64(view, 28);
  const binarySize = readableI64(view, 36);
  const slotSize = readableI64(view, 44);
  const validRanges = hasBytes(view, binaryOffset, binarySize) && binarySize > 0
    && hasBytes(view, slotOffset, slotSize) && slotSize > 0;
  if (!validRanges || !looksLikeFlatBuffer(view, slotOffset, slotSize)) {
    throw new SaveParseError('文件包装有效性检查失败，可能不是解密后的 GBFR SaveData1.dat。');
  }

  return {
    mode: 'wrapped_savegamefile_slotdata',
    payloadOffset: slotOffset,
    payloadSize: slotSize,
    header: {
      mainVersion: view.getInt32(0, true),
      steamId: view.getBigUint64(4, true).toString(),
      unknown: view.getInt32(12, true),
      subVersion: view.getInt32(16, true),
      binaryOffset,
      binarySize,
      slotOffset,
      slotSize
    }
  };
}

class FlatBufferReader {
  constructor(view, container) {
    this.view = new DataView(view.buffer, view.byteOffset + container.payloadOffset, container.payloadSize);
    this.root = this.view.getUint32(0, true);
    if (!this.has(this.root, 4)) throw new SaveParseError('存档根表超出 SlotData 范围。');
  }

  has(offset, size) {
    return hasBytes(this.view, offset, size);
  }

  field(table, index) {
    if (!this.has(table, 4)) return null;
    const vtable = table - this.view.getInt32(table, true);
    if (!this.has(vtable, 4)) return null;
    const size = this.view.getUint16(vtable, true);
    const entry = vtable + 4 + index * 2;
    if (size < 4 || size > 512 || !this.has(vtable, size) || entry + 2 > vtable + size) return null;
    const relative = this.view.getUint16(entry, true);
    return relative && this.has(table + relative, 1) ? table + relative : null;
  }

  vector(table, index) {
    const field = this.field(table, index);
    if (field === null || !this.has(field, 4)) return null;
    const offset = field + this.view.getUint32(field, true);
    if (!this.has(offset, 4)) return null;
    const count = this.view.getUint32(offset, true);
    return count <= MAX_VECTOR_ITEMS ? { count, data: offset + 4 } : null;
  }

  readValues(vector, spec) {
    if (!this.has(vector.data, vector.count * spec.size)) return null;
    const values = new Array(vector.count);
    for (let index = 0; index < vector.count; index += 1) {
      values[index] = spec.read(this.view, vector.data + index * spec.size);
    }
    return values;
  }

  recordsFor(spec) {
    const tables = this.vector(this.root, spec.field);
    if (!tables || !this.has(tables.data, tables.count * 4)) return [];
    const records = [];
    for (let index = 0; index < tables.count; index += 1) {
      const slot = tables.data + index * 4;
      const table = slot + this.view.getUint32(slot, true);
      const idField = this.field(table, 0);
      const unitField = this.field(table, 1);
      const valuesVector = this.vector(table, 2);
      if (idField === null || !this.has(idField, 4) || !valuesVector) continue;
      const values = this.readValues(valuesVector, spec);
      if (!values) continue;
      records.push({
        kind: spec.kind,
        idType: this.view.getUint32(idField, true),
        unitId: unitField === null ? 0 : this.view.getUint32(unitField, true),
        values
      });
    }
    return records;
  }
}

export function parseSaveFile(input) {
  const view = asView(input);
  const container = detectContainer(view);
  const reader = new FlatBufferReader(view, container);
  const records = SCALAR_SPECS.flatMap(spec => reader.recordsFor(spec));
  if (!records.length) throw new SaveParseError('存档中没有找到可识别的 GBFR 数值记录。');
  const versionField = reader.field(reader.root, 0);
  const version = versionField === null ? null : reader.view.getUint32(versionField, true);
  return { container, version, records };
}
