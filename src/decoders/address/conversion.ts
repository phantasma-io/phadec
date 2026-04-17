import { Address, AddressKind, bytesToHex, hexToBytes } from 'phantasma-sdk-ts';
import type { AddressDecodeResult } from './shared.js';

const CARBON_SYSTEM_PREFIX_ZERO_BYTES = 15;

function isCarbonSystemAddress(bytes32: Uint8Array): boolean {
  for (let i = 0; i < CARBON_SYSTEM_PREFIX_ZERO_BYTES; i += 1) {
    if (bytes32[i] !== 0) {
      return false;
    }
  }
  return true;
}

function normalizeBytes32Hex(input: string): Uint8Array {
  const bytes = hexToBytes(input);
  if (bytes.length !== 32) {
    throw new Error(`bytes32 value must be 32 bytes, got ${bytes.length}`);
  }
  return bytes;
}

export function bytes32ToPhantasmaAddress(
  bytes32Hex: string
): AddressDecodeResult {
  const warnings: string[] = [];
  const bytes32 = normalizeBytes32Hex(bytes32Hex);
  const kind = isCarbonSystemAddress(bytes32) ? 'system' : 'user';

  const addressBytes = new Uint8Array(Address.LengthInBytes);
  addressBytes[0] = kind === 'system' ? AddressKind.System : AddressKind.User;
  addressBytes[1] = 0;
  addressBytes.set(bytes32, 2);

  const phantasma = Address.FromBytes(addressBytes).Text;
  return {
    decoded: {
      direction: 'bytes32-to-pha',
      bytes32: bytesToHex(bytes32),
      phantasma,
      kind,
    },
    warnings,
  };
}

export function phantasmaAddressToBytes32(
  phantasma: string
): AddressDecodeResult {
  const warnings: string[] = [];
  const address = Address.FromText(phantasma);

  if (address.Kind === AddressKind.Interop) {
    throw new Error(
      'interop addresses are not supported for carbon bytes32 conversion'
    );
  }

  const kind: 'user' | 'system' = address.IsSystem ? 'system' : 'user';
  const bytes32 = address.GetPublicKey();

  return {
    decoded: {
      direction: 'pha-to-bytes32',
      bytes32: bytesToHex(bytes32),
      phantasma: address.Text,
      kind,
    },
    warnings,
  };
}
