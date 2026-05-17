import assert from 'node:assert/strict';
import test from 'node:test';
import { TxTypes } from 'phantasma-sdk-ts';
import { parseArgs } from '../src/cli/args.js';

test('parses tx mode with explicit carbonTxData input', () => {
  const parsed = parseArgs([
    'tx',
    '--carbon-tx-data',
    '0102',
    '--carbon-tx-type',
    'Phantasma',
    '--payload',
    '7061796c6f6164',
    '--expiration',
    '123',
    '--gas-payer',
    'P2K6hJ8Lt8qFa4daU1344F5jzhXXpGc8LM5cy6jnds5Bi2m',
    '--gas-limit',
    '42',
    '--signature-count',
    '1',
  ]);

  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') return;
  assert.equal(parsed.options.txCarbonTxData, '0102');
  assert.equal(parsed.options.txCarbonTxType, TxTypes.Phantasma);
  assert.equal(parsed.options.txPayload, '7061796c6f6164');
  assert.equal(parsed.options.txExpiration, 123);
  assert.equal(parsed.options.txGasPayer, 'P2K6hJ8Lt8qFa4daU1344F5jzhXXpGc8LM5cy6jnds5Bi2m');
  assert.equal(parsed.options.txGasLimit, '42');
  assert.equal(parsed.options.txSignatureCount, 1);
});

test('parses tx mode with rpc-json file input', () => {
  const parsed = parseArgs(['tx', '--rpc-json', '-', '--format', 'json']);

  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') return;
  assert.equal(parsed.options.txRpcJson, '-');
  assert.equal(parsed.options.format, 'json');
});

test('requires carbon tx type for carbonTxData input', () => {
  const parsed = parseArgs(['tx', '--carbon-tx-data', '0102']);

  assert.equal(parsed.kind, 'error');
  if (parsed.kind !== 'error') return;
  assert.match(parsed.message, /requires --carbon-tx-type/);
});

test('rejects mixing tx input modes', () => {
  const parsed = parseArgs([
    'tx',
    '--hex',
    '00',
    '--carbon-tx-data',
    '0102',
    '--carbon-tx-type',
    '15',
  ]);

  assert.equal(parsed.kind, 'error');
  if (parsed.kind !== 'error') return;
  assert.match(parsed.message, /use only one tx input/);
});

test('rejects carbon context flags outside carbonTxData mode', () => {
  const parsed = parseArgs(['tx', '--hex', '00', '--payload', '01']);

  assert.equal(parsed.kind, 'error');
  if (parsed.kind !== 'error') return;
  assert.match(parsed.message, /only valid with --carbon-tx-data/);
});
