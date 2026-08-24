import { Address, bytesToHex, hexToBytes } from 'phantasma-sdk-ts';
import type { JsonValue, RomDecoded } from '../types/decoded.js';
import { parseVmObject, VmObjectReader } from './vm-object.js';

export type RomDecodeMode = 'auto' | 'legacy' | 'crown';

export interface RomDecodeOptions {
  hex: string;
  symbol?: string;
  tokenId?: string;
  mode?: RomDecodeMode;
}

export interface RomDecodeResult {
  decoded: RomDecoded;
  warnings: string[];
}

type RomParserKind = 'legacy' | 'crown';

function timestampToIso(value: number): string {
  return new Date(value * 1000).toISOString();
}

function parseCreatedFromFields(fields?: { [key: string]: JsonValue }): number | null {
  if (!fields) {
    return null;
  }

  const value = fields.created;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function decodeLegacyRom(
  bytes: Uint8Array,
  symbol?: string,
  tokenId?: string
): RomDecodeResult {
  const warnings: string[] = [];
  const reader = new VmObjectReader(bytes);
  const root = parseVmObject(reader, 0);

  if (root.vmType !== 'Struct') {
    throw new Error(`legacy ROM root must be Struct, got ${root.vmType}`);
  }

  if (!reader.isEnd) {
    warnings.push(`legacy ROM has ${reader.remaining} trailing bytes`);
  }

  const fields = root.fields;
  const createdUnix = parseCreatedFromFields(fields);

  const decoded: RomDecoded = {
    parser: 'legacy-vm-dictionary',
    rawHex: bytesToHex(bytes),
    vm: { root },
  };

  if (symbol) {
    decoded.symbol = symbol;
  }

  if (tokenId) {
    decoded.tokenId = tokenId;
  }

  if (fields) {
    decoded.fields = fields;
  }

  if (fields && typeof fields.name === 'string') {
    decoded.name = fields.name;
  }

  if (fields && typeof fields.description === 'string') {
    decoded.description = fields.description;
  }

  if (createdUnix !== null) {
    decoded.createdUnix = createdUnix;
    decoded.createdIso = timestampToIso(createdUnix);
  }

  return { decoded, warnings };
}

function decodeCrownRom(
  bytes: Uint8Array,
  symbol?: string,
  tokenId?: string
): RomDecodeResult {
  const warnings: string[] = [];
  const reader = new VmObjectReader(bytes);

  const addressLength = reader.readVarInt(2048);
  const stakerAddressBytes = reader.readBytes(addressLength);
  const timestampUnix = reader.readUInt32LE();

  if (!reader.isEnd) {
    warnings.push(`CROWN ROM has ${reader.remaining} trailing bytes`);
  }

  let stakerAddress: string | undefined;
  if (stakerAddressBytes.length === Address.LengthInBytes) {
    try {
      stakerAddress = Address.FromBytes(stakerAddressBytes).Text;
    } catch {
      warnings.push('CROWN staker address bytes could not be converted to text address');
    }
  } else {
    warnings.push(
      `CROWN staker address length is ${stakerAddressBytes.length}, expected ${Address.LengthInBytes}`
    );
  }

  const crown: NonNullable<RomDecoded['crown']> = {
    addressLength,
    stakerAddressHex: bytesToHex(stakerAddressBytes),
    timestampUnix,
    timestampIso: timestampToIso(timestampUnix),
  };

  if (stakerAddress) {
    crown.stakerAddress = stakerAddress;
  }

  const decoded: RomDecoded = {
    parser: 'crown',
    rawHex: bytesToHex(bytes),
    ...(tokenId ? { name: `CROWN #${tokenId}` } : {}),
    description: '',
    createdUnix: timestampUnix,
    createdIso: timestampToIso(timestampUnix),
    crown,
  };

  if (symbol) {
    decoded.symbol = symbol;
  }

  if (tokenId) {
    decoded.tokenId = tokenId;
  }

  return { decoded, warnings };
}

function pickPrimaryParser(mode: RomDecodeMode, symbol?: string): RomParserKind {
  if (mode === 'legacy') {
    return 'legacy';
  }

  if (mode === 'crown') {
    return 'crown';
  }

  // CROWN ROM is not a VM dictionary, so prefer dedicated parser when symbol is known.
  const normalizedSymbol = symbol?.trim().toUpperCase();
  return normalizedSymbol === 'CROWN' ? 'crown' : 'legacy';
}

function runParser(
  parser: RomParserKind,
  bytes: Uint8Array,
  symbol?: string,
  tokenId?: string
): RomDecodeResult {
  if (parser === 'crown') {
    return decodeCrownRom(bytes, symbol, tokenId);
  }

  return decodeLegacyRom(bytes, symbol, tokenId);
}

export function decodeRomHex(options: RomDecodeOptions): RomDecodeResult {
  const mode = options.mode ?? 'auto';
  const symbol = options.symbol?.trim().toUpperCase();
  const tokenId = options.tokenId?.trim();

  const normalizedHex = bytesToHex(hexToBytes(options.hex));
  const bytes = hexToBytes(normalizedHex);

  const primary = pickPrimaryParser(mode, symbol);

  try {
    const primaryResult = runParser(primary, bytes, symbol, tokenId);
    return primaryResult;
  } catch (primaryErr) {
    const primaryMessage = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    if (mode !== 'auto') {
      throw new Error(`${primary} ROM decode failed: ${primaryMessage}`);
    }

    // Auto mode is deterministic: try alternate parser and surface explicit fallback warning.
    const fallback: RomParserKind = primary === 'crown' ? 'legacy' : 'crown';
    const fallbackResult = runParser(fallback, bytes, symbol, tokenId);
    fallbackResult.warnings.unshift(
      `auto parser fallback: ${primary} failed (${primaryMessage}); ${fallback} succeeded`
    );
    return fallbackResult;
  }
}
