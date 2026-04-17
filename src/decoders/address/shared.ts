import { PhantasmaKeys, bytesToHex, hexToBytes } from 'phantasma-sdk-ts';
import type { AddressDecoded } from '../../types/decoded.js';

export interface AddressDecodeResult {
  decoded: AddressDecoded;
  warnings: string[];
}

export function normalizePrivateKeyHex(input: string): Uint8Array {
  const bytes = hexToBytes(input);
  if (bytes.length !== PhantasmaKeys.PrivateKeyLength) {
    throw new Error(`private key must be 32 bytes, got ${bytes.length}`);
  }
  return bytes;
}

export function privateKeyToAddressDecoded(
  privateKey: Uint8Array,
  direction: AddressDecoded['direction'],
  extras: Partial<AddressDecoded> = {}
): AddressDecoded {
  const keys = new PhantasmaKeys(privateKey);
  const publicKey = bytesToHex(keys.PublicKey);
  return {
    direction,
    bytes32: publicKey,
    phantasma: keys.Address.Text,
    kind: 'user',
    publicKey,
    ...extras,
  };
}
