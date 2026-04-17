import {
  bytes32ToPhantasmaAddress,
  phantasmaAddressToBytes32,
} from './address/conversion.js';
import { legacyMnemonicToPhantasmaAddress } from './address/legacy.js';
import {
  mnemonicToPhantasmaAddress,
  privateKeyHexToPhantasmaAddress,
  wifToPhantasmaAddress,
} from './address/modern.js';
export type { AddressDecodeResult } from './address/shared.js';

export interface AddressDecodeOptions {
  bytes32?: string;
  phantasma?: string;
  wif?: string;
  privateKey?: string;
  mnemonic?: string;
  legacyMnemonic?: string;
  legacyPassword?: string;
  index?: number;
}

export function decodeAddressConversion(options: AddressDecodeOptions) {
  const inputCount = [
    options.bytes32,
    options.phantasma,
    options.wif,
    options.privateKey,
    options.mnemonic,
    options.legacyMnemonic,
  ].filter(Boolean).length;

  if (inputCount > 1) {
    throw new Error('address mode accepts only one address input');
  }

  if (options.bytes32) {
    return bytes32ToPhantasmaAddress(options.bytes32);
  }

  if (options.phantasma) {
    return phantasmaAddressToBytes32(options.phantasma);
  }

  if (options.wif) {
    return wifToPhantasmaAddress(options.wif);
  }

  if (options.privateKey) {
    return privateKeyHexToPhantasmaAddress(options.privateKey);
  }

  if (options.mnemonic) {
    return mnemonicToPhantasmaAddress(options.mnemonic, options.index ?? 0);
  }

  if (options.legacyMnemonic) {
    return legacyMnemonicToPhantasmaAddress(
      options.legacyMnemonic,
      options.legacyPassword ?? ''
    );
  }

  throw new Error(
    'address mode requires --bytes32 <hex>, --pha <address>, --wif <wif>, --private-key <hex>, --mnemonic <words>, or --mnemonic-legacy <words>'
  );
}
