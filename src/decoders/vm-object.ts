import { Address, bytesToHex, hexToBytes, twosComplementLEToBigInt } from 'phantasma-sdk-ts';
import type { JsonValue, VmObjectDecoded, VmObjectStructEntryDecoded } from '../types/decoded.js';

export interface VmObjectDecodeResult {
  decoded: VmObjectDecoded;
  json: JsonValue;
  rawHex: string;
  warnings: string[];
}

const VM_TYPE_NAME: Record<number, string> = {
  0: 'None',
  1: 'Struct',
  2: 'Bytes',
  3: 'Number',
  4: 'String',
  5: 'Timestamp',
  6: 'Bool',
  7: 'Enum',
  8: 'Object',
};

const MAX_VM_OBJECT_DEPTH = 128;

export class VmObjectReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  get isEnd(): boolean {
    return this.offset >= this.bytes.length;
  }

  readByte(): number {
    if (this.offset >= this.bytes.length) {
      throw new Error(`VM object reader past end at offset ${this.offset}`);
    }
    const value = this.bytes[this.offset];
    if (value === undefined) {
      throw new Error(`VM object reader past end at offset ${this.offset}`);
    }
    this.offset += 1;
    return value;
  }

  readBytes(length: number): Uint8Array {
    if (length < 0) {
      throw new Error(`VM object reader invalid length ${length}`);
    }
    if (this.offset + length > this.bytes.length) {
      throw new Error(
        `VM object reader past end at offset ${this.offset} (need ${length}, remaining ${this.remaining})`
      );
    }
    const out = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  readUInt32LE(): number {
    const b0 = this.readByte();
    const b1 = this.readByte();
    const b2 = this.readByte();
    const b3 = this.readByte();
    return (b0 + (b1 << 8) + (b2 << 16) + (b3 << 24)) >>> 0;
  }

  readVarInt(max: number = Number.MAX_SAFE_INTEGER): number {
    const prefix = this.readByte();
    let value: bigint;

    if (prefix === 0xfd) {
      const a = this.readByte();
      const b = this.readByte();
      value = BigInt(a + (b << 8));
    } else if (prefix === 0xfe) {
      const a = this.readByte();
      const b = this.readByte();
      const c = this.readByte();
      const d = this.readByte();
      value = BigInt((a + (b << 8) + (c << 16) + (d << 24)) >>> 0);
    } else if (prefix === 0xff) {
      const a = BigInt(this.readByte());
      const b = BigInt(this.readByte());
      const c = BigInt(this.readByte());
      const d = BigInt(this.readByte());
      const e = BigInt(this.readByte());
      const f = BigInt(this.readByte());
      const g = BigInt(this.readByte());
      const h = BigInt(this.readByte());
      value =
        a +
        (b << 8n) +
        (c << 16n) +
        (d << 24n) +
        (e << 32n) +
        (f << 40n) +
        (g << 48n) +
        (h << 56n);
    } else {
      value = BigInt(prefix);
    }

    const limit = BigInt(max);
    if (value > limit) {
      throw new Error(`VM object varint ${value.toString()} exceeds max ${max}`);
    }
    return Number(value);
  }

  readByteArray(max: number = Number.MAX_SAFE_INTEGER): Uint8Array {
    const length = this.readVarInt(max);
    return this.readBytes(length);
  }
}

function vmTypeName(typeId: number): string {
  return VM_TYPE_NAME[typeId] ?? `Unknown_${typeId}`;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

export function vmObjectToJson(node: VmObjectDecoded): JsonValue {
  if (node.vmType === 'Struct') {
    if (node.fields) {
      return node.fields;
    }
    const entries = node.entries ?? [];
    return entries.map((entry) => ({
      keyVmType: entry.keyVmType,
      key: entry.key,
      valueVmType: entry.valueVmType,
      value: entry.value,
    }));
  }

  if (node.value === undefined) {
    return null;
  }

  return node.value;
}

function keyToFieldName(node: VmObjectDecoded): string | null {
  if (node.value === undefined || node.value === null) {
    return null;
  }

  switch (node.vmType) {
    case 'String':
      return typeof node.value === 'string' ? node.value : null;
    case 'Number':
      return typeof node.value === 'string' ? node.value : null;
    case 'Enum':
    case 'Timestamp':
      return typeof node.value === 'number' ? node.value.toString() : null;
    case 'Bool':
      return typeof node.value === 'boolean' ? (node.value ? 'true' : 'false') : null;
    default:
      return null;
  }
}

export function parseVmObject(reader: VmObjectReader, depth: number): VmObjectDecoded {
  if (depth > MAX_VM_OBJECT_DEPTH) {
    throw new Error('VM object decode exceeded max depth');
  }

  const typeId = reader.readByte();
  const typeName = vmTypeName(typeId);

  switch (typeId) {
    case 0:
      return { vmTypeId: typeId, vmType: typeName, value: null };

    case 1: {
      const count = reader.readVarInt();
      // Same remaining-bytes width bound as the C++ VMObject deserializer: each
      // child is a key plus a value, each at least a 1-byte type tag.
      if (count < 0 || count > Math.floor(reader.remaining / 2)) {
        throw new Error(`struct child count ${count} exceeds remaining bytes`);
      }
      const entries: VmObjectStructEntryDecoded[] = [];
      const fields: { [key: string]: JsonValue } = {};
      let canBuildFields = true;

      for (let i = 0; i < count; i += 1) {
        const keyNode = parseVmObject(reader, depth + 1);
        const valueNode = parseVmObject(reader, depth + 1);

        const keyJson = vmObjectToJson(keyNode);
        const valueJson = vmObjectToJson(valueNode);

        entries.push({
          keyVmType: keyNode.vmType,
          key: keyJson,
          valueVmType: valueNode.vmType,
          value: valueJson,
        });

        const fieldKey = keyToFieldName(keyNode);
        if (!fieldKey || Object.hasOwn(fields, fieldKey)) {
          canBuildFields = false;
          continue;
        }
        fields[fieldKey] = valueJson;
      }

      if (canBuildFields) {
        return {
          vmTypeId: typeId,
          vmType: typeName,
          fields,
          entries,
        };
      }

      return {
        vmTypeId: typeId,
        vmType: typeName,
        entries,
      };
    }

    case 2: {
      const value = bytesToHex(reader.readByteArray());
      return { vmTypeId: typeId, vmType: typeName, value };
    }

    case 3: {
      const length = reader.readByte();
      const bytes = reader.readBytes(length);
      const value = twosComplementLEToBigInt(bytes).toString();
      return { vmTypeId: typeId, vmType: typeName, value };
    }

    case 4: {
      const value = decodeUtf8(reader.readByteArray());
      return { vmTypeId: typeId, vmType: typeName, value };
    }

    case 5: {
      const value = reader.readUInt32LE();
      return { vmTypeId: typeId, vmType: typeName, value };
    }

    case 6: {
      const value = reader.readByte() !== 0;
      return { vmTypeId: typeId, vmType: typeName, value };
    }

    case 7: {
      const value = reader.readVarInt();
      return { vmTypeId: typeId, vmType: typeName, value };
    }

    case 8: {
      const raw = reader.readByteArray();
      const valueHex = bytesToHex(raw);

      // VM Object may contain serialized Address bytes (length-prefixed payload).
      if (raw.length === Address.LengthInBytes + 1 && raw[0] === Address.LengthInBytes) {
        const addressBytes = raw.subarray(1);
        try {
          const address = Address.FromBytes(addressBytes).Text;
          return {
            vmTypeId: typeId,
            vmType: typeName,
            value: {
              kind: 'Address',
              text: address,
              bytesHex: bytesToHex(addressBytes),
            },
          };
        } catch {
          // Keep raw object bytes when address conversion fails.
        }
      }

      return {
        vmTypeId: typeId,
        vmType: typeName,
        value: {
          kind: 'ObjectBytes',
          bytesHex: valueHex,
        },
      };
    }

    default:
      throw new Error(`unsupported VM type ${typeId} at offset ${reader.position - 1}`);
  }
}

export function decodeVmObjectHex(hex: string): VmObjectDecodeResult {
  const warnings: string[] = [];
  const rawHex = bytesToHex(hexToBytes(hex));
  const bytes = hexToBytes(rawHex);
  if (bytes.length === 0) {
    throw new Error('VM object hex is empty');
  }

  const reader = new VmObjectReader(bytes);
  const decoded = parseVmObject(reader, 0);
  if (!reader.isEnd) {
    warnings.push(`VM object has ${reader.remaining} trailing bytes`);
  }

  return {
    decoded,
    json: vmObjectToJson(decoded),
    rawHex,
    warnings,
  };
}
