import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs } from '../src/cli/args.js';

test('parses vmobj mode with --hex', () => {
  const parsed = parseArgs(['vmobj', '--hex', '03010B', '--format', 'json']);
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }
  assert.equal(parsed.options.command, 'vmobj');
  assert.equal(parsed.options.vmObjectHex, '03010B');
  assert.equal(parsed.options.format, 'json');
  assert.equal(parsed.options.txHex, undefined);
});

test('parses vmobj mode with a positional hex argument', () => {
  const parsed = parseArgs(['vmobj', '0x0601']);
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }
  assert.equal(parsed.options.command, 'vmobj');
  assert.equal(parsed.options.vmObjectHex, '0x0601');
});

test('vmobj mode requires hex input', () => {
  const parsed = parseArgs(['vmobj']);
  assert.equal(parsed.kind, 'error');
  if (parsed.kind !== 'error') {
    return;
  }
  assert.match(parsed.message, /requires --hex <vmObjectHex>/);
});

test('vmobj mode rejects two hex inputs', () => {
  const parsed = parseArgs(['vmobj', '--hex', '00', '01']);
  assert.equal(parsed.kind, 'error');
  if (parsed.kind !== 'error') {
    return;
  }
  assert.match(parsed.message, /only one hex input/);
});
