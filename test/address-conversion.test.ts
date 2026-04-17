import assert from 'node:assert/strict';
import test from 'node:test';
import { PhantasmaKeys, getPrivateKeyFromWif } from 'phantasma-sdk-ts';
import { decodeAddressConversion } from '../src/decoders/address.js';

// Test vectors sourced from phantasma-sdk-ts tests:
// - tests/types/Address.test.ts
// - tests/tx/Transaction.test.ts
const TEST_WIF = 'L5UEVHBjujaR1721aZM5Zm5ayjDyamMZS9W35RE9Y9giRkdf3dVx';
const TEST_ADDRESS = 'P2KFEyFevpQfSaW8G4VjSmhWUZXR4QrG9YQR1HbMpTUCpCL';
const TEST_PRIVATE_KEY = getPrivateKeyFromWif(TEST_WIF);
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_MNEMONIC_ADDRESS = 'P2K4HV69cVCMG8Bwfqi2RUjJSGMEUwRU96kCX6at5Xgs5fF';
const TEST_LEGACY_MNEMONIC_ADDRESS =
  'P2KH4vejgohPW4qZ9W8gGYnjW31dLig15NjNbY8Kzbmmp8R';
const TEST_LEGACY_MNEMONIC_PASSWORD_ADDRESS =
  'P2K9FHamyZ3JG3XnLsMF1XC5t4yKT8SztYxzEQHyvmhEw7Y';

test('pha -> bytes32 matches PhantasmaKeys test vector', () => {
  const expectedBytes32 = Buffer.from(
    PhantasmaKeys.fromWIF(TEST_WIF).Address.GetPublicKey()
  ).toString('hex');
  const result = decodeAddressConversion({ phantasma: TEST_ADDRESS });

  assert.equal(result.decoded.direction, 'pha-to-bytes32');
  assert.equal(result.decoded.phantasma, TEST_ADDRESS);
  assert.equal(result.decoded.bytes32, expectedBytes32);
  assert.equal(result.decoded.kind, 'user');
});

test('bytes32 -> pha roundtrip returns original test vector address', () => {
  const bytes32 = Buffer.from(
    PhantasmaKeys.fromWIF(TEST_WIF).Address.GetPublicKey()
  ).toString('hex');
  const result = decodeAddressConversion({ bytes32 });

  assert.equal(result.decoded.direction, 'bytes32-to-pha');
  assert.equal(result.decoded.bytes32, bytes32);
  assert.equal(result.decoded.phantasma, TEST_ADDRESS);
  assert.equal(result.decoded.kind, 'user');
});

test('null/system roundtrip is stable', () => {
  const zero =
    '0000000000000000000000000000000000000000000000000000000000000000';
  const fromBytes = decodeAddressConversion({ bytes32: zero });
  assert.equal(fromBytes.decoded.phantasma, 'NULL');
  assert.equal(fromBytes.decoded.kind, 'system');

  const fromPha = decodeAddressConversion({ phantasma: 'NULL' });
  assert.equal(fromPha.decoded.bytes32, zero);
  assert.equal(fromPha.decoded.kind, 'system');
});

test('invalid bytes32 length throws', () => {
  assert.throws(() => decodeAddressConversion({ bytes32: '0x1234' }), {
    message: /bytes32 value must be 32 bytes/,
  });
});

test('requires exactly one input direction', () => {
  assert.throws(() => decodeAddressConversion({}), {
    message:
      /requires --bytes32 <hex>, --pha <address>, --wif <wif>, --private-key <hex>, --mnemonic <words>, or --mnemonic-legacy <words>/,
  });
  assert.throws(
    () =>
      decodeAddressConversion({
        bytes32: '00'.repeat(32),
        phantasma: TEST_ADDRESS,
      }),
    { message: /accepts only one address input/ }
  );
});

test('wif -> pha derives expected address without exposing private data', () => {
  const result = decodeAddressConversion({ wif: TEST_WIF });

  assert.equal(result.decoded.direction, 'wif-to-pha');
  assert.equal(result.decoded.phantasma, TEST_ADDRESS);
  assert.equal(result.decoded.kind, 'user');
  assert.equal(
    result.decoded.bytes32,
    Buffer.from(PhantasmaKeys.fromWIF(TEST_WIF).PublicKey).toString('hex')
  );
});

test('private-key hex -> pha derives expected address', () => {
  const result = decodeAddressConversion({
    privateKey: `0x${TEST_PRIVATE_KEY.toUpperCase()}`,
  });

  assert.equal(result.decoded.direction, 'private-key-to-pha');
  assert.equal(result.decoded.phantasma, TEST_ADDRESS);
  assert.equal(result.decoded.kind, 'user');
});

test('mnemonic -> pha follows Poltergeist derivation path at index 0', () => {
  const result = decodeAddressConversion({ mnemonic: TEST_MNEMONIC, index: 0 });

  assert.equal(result.decoded.direction, 'mnemonic-to-pha');
  assert.equal(result.decoded.phantasma, TEST_MNEMONIC_ADDRESS);
  assert.equal(result.decoded.derivationMethod, 'bip44');
  assert.equal(result.decoded.derivationPath, "m/44'/60'/0'/0/0");
  assert.equal(result.decoded.derivationIndex, 0);
});

test('mnemonic validation rejects non 12/24 word input', () => {
  assert.throws(
    () => decodeAddressConversion({ mnemonic: 'abandon abandon abandon' }),
    {
      message: /mnemonic must contain 12 or 24 words/,
    }
  );
});

test('legacy mnemonic -> pha uses PBKDF2 seed first 32 bytes without BIP44', () => {
  const result = decodeAddressConversion({ legacyMnemonic: TEST_MNEMONIC });

  assert.equal(result.decoded.direction, 'mnemonic-legacy-to-pha');
  assert.equal(result.decoded.phantasma, TEST_LEGACY_MNEMONIC_ADDRESS);
  assert.equal(result.decoded.derivationMethod, 'legacy-pbkdf2-first32');
  assert.equal(result.decoded.derivationPath, undefined);
  assert.equal(result.decoded.legacyPasswordUsed, false);
});

test('legacy mnemonic password changes derived address', () => {
  const result = decodeAddressConversion({
    legacyMnemonic: TEST_MNEMONIC,
    legacyPassword: 'TREZOR',
  });

  assert.equal(result.decoded.direction, 'mnemonic-legacy-to-pha');
  assert.equal(result.decoded.phantasma, TEST_LEGACY_MNEMONIC_PASSWORD_ADDRESS);
  assert.equal(result.decoded.derivationMethod, 'legacy-pbkdf2-first32');
  assert.equal(result.decoded.legacyPasswordUsed, true);
});
