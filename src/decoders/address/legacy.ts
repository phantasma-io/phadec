import { pbkdf2Sync } from 'node:crypto';
import {
  privateKeyToAddressDecoded,
  type AddressDecodeResult,
} from './shared.js';

const LEGACY_SEED_SALT_PREFIX = 'mnemonic';
const LEGACY_SEED_ITERATIONS = 2048;
const LEGACY_SEED_LENGTH = 64;
const LEGACY_PRIVATE_KEY_LENGTH = 32;

function normalizeLegacyInput(input: string): string {
  return input.trim().normalize('NFKD');
}

function validateLegacyMnemonicShape(mnemonic: string): void {
  const wordCount = mnemonic.length === 0 ? 0 : mnemonic.split(' ').length;
  if (wordCount < 12 || wordCount % 3 !== 0) {
    throw new Error(
      'legacy mnemonic must contain at least 12 words and a word count divisible by 3'
    );
  }
}

export function legacyMnemonicToPhantasmaAddress(
  mnemonicInput: string,
  passwordInput = ''
): AddressDecodeResult {
  const mnemonic = normalizeLegacyInput(mnemonicInput);
  validateLegacyMnemonicShape(mnemonic);

  const password = passwordInput.normalize('NFKD');
  const salt = `${LEGACY_SEED_SALT_PREFIX}${password}`;
  const seed = pbkdf2Sync(
    Buffer.from(mnemonic, 'utf8'),
    Buffer.from(salt, 'utf8'),
    LEGACY_SEED_ITERATIONS,
    LEGACY_SEED_LENGTH,
    'sha512'
  );
  const privateKey = seed.subarray(0, LEGACY_PRIVATE_KEY_LENGTH);

  return {
    decoded: privateKeyToAddressDecoded(privateKey, 'mnemonic-legacy-to-pha', {
      derivationMethod: 'legacy-pbkdf2-first32',
      legacyPasswordUsed: password.length > 0,
    }),
    warnings: [],
  };
}
