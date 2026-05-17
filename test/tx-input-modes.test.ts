import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Bytes32,
  CarbonBlob,
  PhantasmaKeys,
  ScriptBuilder,
  SmallString,
  SignedTxMsg,
  Transaction,
  TxMsg,
  TxMsgPhantasma,
  TxMsgPhantasmaRaw,
  TxTypes,
  bytesToHex,
  hexToBytes,
} from 'phantasma-sdk-ts';
import type { TransactionData } from 'phantasma-sdk-ts';
import { buildBuiltinMethodTable } from '../src/abi/builtin/index.js';
import { decodeCarbonTxData, decodeTxDataFromRpc, decodeTxHex } from '../src/decoders/tx.js';

const TEST_WIF = 'L5UEVHBjujaR1721aZM5Zm5ayjDyamMZS9W35RE9Y9giRkdf3dVx';
const VM_NEXUS = 'simnet';
const VM_CHAIN = 'main';
const CARBON_PAYLOAD_TEXT = 'pha-decode';
const VM_PAYLOAD_HEX = bytesToHex(new TextEncoder().encode('vm-payload'));
const CARBON_EXPIRY_MS = 1_768_962_590_000;
const RPC_EXPIRATION_UNIX = Math.floor(CARBON_EXPIRY_MS / 1000);
const METHOD_TABLE = buildBuiltinMethodTable(16);

function normalizeHex(hex: string): string {
  return bytesToHex(hexToBytes(hex));
}

function buildVmScriptHex(): string {
  const owner = PhantasmaKeys.fromWIF(TEST_WIF).Address;
  const nullAddress = new ScriptBuilder().NullAddress;

  return new ScriptBuilder()
    .BeginScript()
    .AllowGas(owner, nullAddress, 100000, 1)
    .CallInterop('stake.Stake', [owner, 'SOUL', 1])
    .SpendGas(owner)
    .EndScript();
}

function buildVmTransactionHex(scriptHex: string, payloadHex: string = VM_PAYLOAD_HEX): string {
  const tx = new Transaction(
    VM_NEXUS,
    VM_CHAIN,
    normalizeHex(scriptHex),
    new Date(RPC_EXPIRATION_UNIX * 1000),
    payloadHex
  );
  // Full VM transactions on the wire always include the signature-count field,
  // even when the transaction has zero signatures.
  return bytesToHex(tx.ToByteAray(true));
}

function buildSignedPhantasmaTxHex(scriptHex: string, payloadText: string = CARBON_PAYLOAD_TEXT): string {
  const msg = new TxMsg(
    TxTypes.Phantasma,
    BigInt(CARBON_EXPIRY_MS),
    21000n,
    0n,
    new Bytes32(),
    new SmallString(payloadText),
    new TxMsgPhantasma({
      nexus: new SmallString(VM_NEXUS),
      chain: new SmallString(VM_CHAIN),
      script: hexToBytes(scriptHex),
    })
  );

  return bytesToHex(CarbonBlob.Serialize(new SignedTxMsg(msg, [])));
}

function buildSignedPhantasmaRawTxHex(scriptHex: string): string {
  const innerTxHex = buildVmTransactionHex(scriptHex);
  const msg = new TxMsg(
    TxTypes.Phantasma_Raw,
    0n,
    0n,
    0n,
    new Bytes32(),
    new SmallString(''),
    new TxMsgPhantasmaRaw(hexToBytes(innerTxHex))
  );

  return bytesToHex(CarbonBlob.Serialize(new SignedTxMsg(msg, [])));
}

function buildRpcPhantasmaPayloadHex(scriptHex: string): string {
  return bytesToHex(
    CarbonBlob.Serialize(
      new TxMsgPhantasma({
        nexus: new SmallString(VM_NEXUS),
        chain: new SmallString(VM_CHAIN),
        script: hexToBytes(scriptHex),
      })
    )
  );
}

function buildRpcPhantasmaRawPayloadHex(scriptHex: string): string {
  const innerTxHex = buildVmTransactionHex(scriptHex);
  return bytesToHex(CarbonBlob.Serialize(new TxMsgPhantasmaRaw(hexToBytes(innerTxHex))));
}

function buildRpcTransaction(overrides: Partial<TransactionData>): TransactionData {
  return {
    hash: 'A'.repeat(64),
    chainAddress: VM_CHAIN,
    timestamp: 0,
    blockHeight: 0,
    blockHash: 'B'.repeat(64),
    script: '',
    payload: '',
    carbonTxType: 0,
    carbonTxData: '',
    events: [],
    result: '',
    debugComment: '',
    fee: '0',
    state: 'Halt',
    signatures: [],
    sender: '',
    gasPayer: '',
    gasTarget: '',
    gasPrice: '1',
    gasLimit: '0',
    expiration: RPC_EXPIRATION_UNIX,
    ...overrides,
  };
}

function expectVmMethods(output: ReturnType<typeof decodeTxHex>): string[] {
  return output.vm?.methodCalls?.map((entry) => entry.method) ?? [];
}

test('decodeTxHex extracts VM view from Carbon type 15 transactions', () => {
  const scriptHex = buildVmScriptHex();
  const output = decodeTxHex(buildSignedPhantasmaTxHex(scriptHex), 'json', METHOD_TABLE, 16);

  assert.equal(output.carbon?.typeName, 'Phantasma');
  assert.equal(output.vm?.nexus, VM_NEXUS);
  assert.equal(output.vm?.chain, VM_CHAIN);
  assert.equal(output.vm?.scriptHex, normalizeHex(scriptHex));
  assert.equal(output.vm?.payloadHex, bytesToHex(new TextEncoder().encode(CARBON_PAYLOAD_TEXT)));
  assert.equal(output.vm?.expirationUnix, RPC_EXPIRATION_UNIX);
  assert.deepEqual(expectVmMethods(output), ['AllowGas', 'stake.Stake', 'SpendGas']);
});

test('decodeTxHex extracts inner VM transaction from Carbon type 16 transactions', () => {
  const scriptHex = buildVmScriptHex();
  const output = decodeTxHex(buildSignedPhantasmaRawTxHex(scriptHex), 'json', METHOD_TABLE, 16);

  assert.equal(output.carbon?.typeName, 'Phantasma_Raw');
  assert.equal(output.vm?.nexus, VM_NEXUS);
  assert.equal(output.vm?.chain, VM_CHAIN);
  assert.equal(output.vm?.scriptHex, normalizeHex(scriptHex));
  assert.equal(output.vm?.payloadHex, VM_PAYLOAD_HEX);
  assert.deepEqual(expectVmMethods(output), ['AllowGas', 'stake.Stake', 'SpendGas']);
});

test('decodeTxHex decodes full VM transaction containers directly', () => {
  const scriptHex = buildVmScriptHex();
  const output = decodeTxHex(buildVmTransactionHex(scriptHex), 'json', METHOD_TABLE, 16);

  assert.equal(output.carbon, undefined);
  assert.equal(output.vm?.nexus, VM_NEXUS);
  assert.equal(output.vm?.chain, VM_CHAIN);
  assert.equal(output.vm?.scriptHex, normalizeHex(scriptHex));
  assert.equal(output.vm?.payloadHex, VM_PAYLOAD_HEX);
  assert.deepEqual(expectVmMethods(output), ['AllowGas', 'stake.Stake', 'SpendGas']);
});

test('decodeTxHex treats raw VM script as script input instead of false Carbon', () => {
  const scriptHex = buildVmScriptHex();
  const output = decodeTxHex(scriptHex, 'json', METHOD_TABLE, 16);

  assert.equal(output.carbon, undefined);
  assert.equal(output.vm?.nexus, '');
  assert.equal(output.vm?.chain, '');
  assert.equal(output.vm?.scriptHex, normalizeHex(scriptHex));
  assert.deepEqual(expectVmMethods(output), ['AllowGas', 'stake.Stake', 'SpendGas']);
});

test('decodeTxDataFromRpc reconstructs type 15 VM output from carbonTxData when top-level script is absent', () => {
  const scriptHex = buildVmScriptHex();
  const output = decodeTxDataFromRpc(
    'C'.repeat(64),
    'http://localhost:5172/rpc',
    buildRpcTransaction({
      script: '',
      payload: bytesToHex(new TextEncoder().encode(CARBON_PAYLOAD_TEXT)),
      carbonTxType: TxTypes.Phantasma,
      carbonTxData: buildRpcPhantasmaPayloadHex(scriptHex),
      signatures: [],
    }),
    'json',
    METHOD_TABLE,
    16
  );

  assert.equal(output.carbon?.typeName, 'Phantasma');
  assert.equal(output.vm?.nexus, VM_NEXUS);
  assert.equal(output.vm?.chain, VM_CHAIN);
  assert.equal(output.vm?.scriptHex, normalizeHex(scriptHex));
  assert.equal(output.vm?.payloadHex, bytesToHex(new TextEncoder().encode(CARBON_PAYLOAD_TEXT)));
  assert.equal(output.vm?.expirationUnix, RPC_EXPIRATION_UNIX);
  assert.deepEqual(expectVmMethods(output), ['AllowGas', 'stake.Stake', 'SpendGas']);
  assert.equal(output.warnings.includes('RPC does not expose full VM tx bytes; output is script/payload only'), false);
});

test('decodeCarbonTxData decodes payload-only type 15 carbonTxData directly', () => {
  const scriptHex = buildVmScriptHex();
  const output = decodeCarbonTxData(
    buildRpcPhantasmaPayloadHex(scriptHex),
    TxTypes.Phantasma,
    'json',
    {
      payloadHex: bytesToHex(new TextEncoder().encode(CARBON_PAYLOAD_TEXT)),
      expirationUnix: RPC_EXPIRATION_UNIX,
      signatureCount: 2,
    },
    METHOD_TABLE,
    16
  );

  assert.equal(output.source, 'carbon-tx-data');
  assert.equal(output.carbon?.typeName, 'Phantasma');
  assert.equal(output.vm?.nexus, VM_NEXUS);
  assert.equal(output.vm?.chain, VM_CHAIN);
  assert.equal(output.vm?.scriptHex, normalizeHex(scriptHex));
  assert.equal(output.vm?.payloadHex, bytesToHex(new TextEncoder().encode(CARBON_PAYLOAD_TEXT)));
  assert.equal(output.vm?.expirationUnix, RPC_EXPIRATION_UNIX);
  assert.equal(output.vm?.signatures, 2);
  assert.deepEqual(expectVmMethods(output), ['AllowGas', 'stake.Stake', 'SpendGas']);
});

test('decodeTxDataFromRpc reconstructs type 16 VM output from carbonTxData', () => {
  const scriptHex = buildVmScriptHex();
  const output = decodeTxDataFromRpc(
    'D'.repeat(64),
    'http://localhost:5172/rpc',
    buildRpcTransaction({
      script: '',
      payload: '',
      carbonTxType: TxTypes.Phantasma_Raw,
      carbonTxData: buildRpcPhantasmaRawPayloadHex(scriptHex),
    }),
    'json',
    METHOD_TABLE,
    16
  );

  assert.equal(output.carbon?.typeName, 'Phantasma_Raw');
  assert.equal(output.vm?.nexus, VM_NEXUS);
  assert.equal(output.vm?.chain, VM_CHAIN);
  assert.equal(output.vm?.scriptHex, normalizeHex(scriptHex));
  assert.equal(output.vm?.payloadHex, VM_PAYLOAD_HEX);
  assert.deepEqual(expectVmMethods(output), ['AllowGas', 'stake.Stake', 'SpendGas']);
});

test('decodeCarbonTxData decodes payload-only type 16 carbonTxData directly', () => {
  const scriptHex = buildVmScriptHex();
  const output = decodeCarbonTxData(
    buildRpcPhantasmaRawPayloadHex(scriptHex),
    TxTypes.Phantasma_Raw,
    'json',
    {},
    METHOD_TABLE,
    16
  );

  assert.equal(output.source, 'carbon-tx-data');
  assert.equal(output.carbon?.typeName, 'Phantasma_Raw');
  assert.equal(output.vm?.nexus, VM_NEXUS);
  assert.equal(output.vm?.chain, VM_CHAIN);
  assert.equal(output.vm?.scriptHex, normalizeHex(scriptHex));
  assert.equal(output.vm?.payloadHex, VM_PAYLOAD_HEX);
  assert.deepEqual(expectVmMethods(output), ['AllowGas', 'stake.Stake', 'SpendGas']);
});

test('decodeTxDataFromRpc falls back to top-level RPC script when carbonTxData is unavailable', () => {
  const scriptHex = buildVmScriptHex();
  const output = decodeTxDataFromRpc(
    'E'.repeat(64),
    'http://localhost:5172/rpc',
    buildRpcTransaction({
      script: normalizeHex(scriptHex),
      payload: VM_PAYLOAD_HEX,
      carbonTxData: '',
    }),
    'json',
    METHOD_TABLE,
    16
  );

  assert.equal(output.carbon, undefined);
  assert.equal(output.vm?.chain, VM_CHAIN);
  assert.equal(output.vm?.scriptHex, normalizeHex(scriptHex));
  assert.equal(output.vm?.payloadHex, VM_PAYLOAD_HEX);
  assert.equal(output.warnings.includes('RPC does not expose full VM tx bytes; output is script/payload only'), true);
});
