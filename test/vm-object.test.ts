import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeVmObjectHex } from '../src/decoders/vm-object.js';

test('decodes None, Bool, Number, and String VM objects', () => {
  assert.deepEqual(decodeVmObjectHex('00').decoded, {
    vmTypeId: 0,
    vmType: 'None',
    value: null,
  });

  assert.deepEqual(decodeVmObjectHex('0601').decoded, {
    vmTypeId: 6,
    vmType: 'Bool',
    value: true,
  });

  // Type Number (3), 1-byte signed BigInteger payload 11.
  const number = decodeVmObjectHex('03010B');
  assert.equal(number.decoded.vmType, 'Number');
  assert.equal(number.decoded.value, '11');
  assert.equal(number.json, '11');

  const text = decodeVmObjectHex('040141');
  assert.equal(text.decoded.vmType, 'String');
  assert.equal(text.decoded.value, 'A');
});

test('decodes Bytes, Timestamp, Enum, and empty Struct', () => {
  const bytes = decodeVmObjectHex('0202DEAD');
  assert.equal(bytes.decoded.vmType, 'Bytes');
  assert.equal(bytes.decoded.value, 'dead');

  const timestamp = decodeVmObjectHex('0501000000');
  assert.equal(timestamp.decoded.vmType, 'Timestamp');
  assert.equal(timestamp.decoded.value, 1);

  const enumerated = decodeVmObjectHex('0703');
  assert.equal(enumerated.decoded.vmType, 'Enum');
  assert.equal(enumerated.decoded.value, 3);

  const emptyStruct = decodeVmObjectHex('0100');
  assert.equal(emptyStruct.decoded.vmType, 'Struct');
  assert.deepEqual(emptyStruct.decoded.fields, {});
  assert.deepEqual(emptyStruct.json, {});
});

test('decodes a struct with string keys into fields', () => {
  // One child: key String "k" + value Bool true.
  const decoded = decodeVmObjectHex('010104016B0601');
  assert.equal(decoded.decoded.vmType, 'Struct');
  assert.deepEqual(decoded.decoded.fields, { k: true });
  assert.deepEqual(decoded.json, { k: true });
});

test('warns about trailing bytes after one VM object', () => {
  const decoded = decodeVmObjectHex('0601FF');
  assert.equal(decoded.decoded.vmType, 'Bool');
  assert.equal(decoded.decoded.value, true);
  assert.match(decoded.warnings[0] ?? '', /trailing bytes/);
});

test('rejects empty and invalid VM object hex', () => {
  assert.throws(() => decodeVmObjectHex(''), /empty|not valid hex/i);
  assert.throws(() => decodeVmObjectHex('09'), /unsupported VM type 9/);
});
