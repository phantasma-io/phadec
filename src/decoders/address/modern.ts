import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import * as secp256k1 from 'tiny-secp256k1';
import { getPrivateKeyFromWif } from 'phantasma-sdk-ts';
import {
  normalizePrivateKeyHex,
  privateKeyToAddressDecoded,
  type AddressDecodeResult,
} from './shared.js';

const MNEMONIC_DERIVATION_PATH_PREFIX = "m/44'/60'/0'/0";

function normalizeModernMnemonic(input: string): string {
  return input
    .normalize('NFKD')
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean)
    .join(' ');
}

function getMnemonicDerivationPath(index: number): string {
  return `${MNEMONIC_DERIVATION_PATH_PREFIX}/${index}`;
}

function validateMnemonicIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index > 0x7fffffff) {
    throw new Error(
      `mnemonic derivation index must be an integer between 0 and ${0x7fffffff}`
    );
  }
}

export function wifToPhantasmaAddress(wif: string): AddressDecodeResult {
  const privateKeyHex = getPrivateKeyFromWif(wif);
  const privateKey = normalizePrivateKeyHex(privateKeyHex);
  return {
    decoded: privateKeyToAddressDecoded(privateKey, 'wif-to-pha'),
    warnings: [],
  };
}

export function privateKeyHexToPhantasmaAddress(
  privateKeyHex: string
): AddressDecodeResult {
  const privateKey = normalizePrivateKeyHex(privateKeyHex);
  return {
    decoded: privateKeyToAddressDecoded(privateKey, 'private-key-to-pha'),
    warnings: [],
  };
}

export function mnemonicToPhantasmaAddress(
  mnemonicInput: string,
  index: number
): AddressDecodeResult {
  validateMnemonicIndex(index);

  const mnemonic = normalizeModernMnemonic(mnemonicInput);
  const words = mnemonic.length === 0 ? [] : mnemonic.split(' ');
  if (words.length !== 12 && words.length !== 24) {
    throw new Error(
      `mnemonic must contain 12 or 24 words, got ${words.length}`
    );
  }
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('invalid BIP39 mnemonic');
  }

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const bip32 = BIP32Factory(secp256k1);
  const path = getMnemonicDerivationPath(index);
  const child = bip32.fromSeed(seed).derivePath(path);
  if (!child.privateKey) {
    throw new Error(
      `mnemonic derivation did not produce a private key at ${path}`
    );
  }

  return {
    decoded: privateKeyToAddressDecoded(child.privateKey, 'mnemonic-to-pha', {
      derivationMethod: 'bip44',
      derivationPath: path,
      derivationIndex: index,
    }),
    warnings: [],
  };
}
