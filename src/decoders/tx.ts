import type { CarbonDecoded, DecodeOutput, OutputFormat } from '../types/decoded.js';
import { bytesToHex, hexToBytes, TxTypes } from 'phantasma-sdk-ts';
import { decodeCarbonPayloadForRpc, decodeCarbonSignedTxExact } from './carbon.js';
import { decodeVmHex, decodeVmScript, decodeVmTransaction } from './vm.js';
import { fetchTransaction } from '../rpc/phantasma.js';
import type { TransactionData } from 'phantasma-sdk-ts';
import type { AbiMethodSpecEntry } from '../abi/loader.js';

function buildBaseOutput(source: DecodeOutput['source'], input: string, format: OutputFormat): DecodeOutput {
  return {
    source,
    input,
    format,
    warnings: [],
    errors: [],
  };
}

function extractPhantasmaRawTxHex(msg: CarbonDecoded['msg']): string | null {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return null;
  }
  const transaction = (msg as Record<string, unknown>).transaction;
  return typeof transaction === 'string' && transaction.length > 0 ? transaction : null;
}

function extractPhantasmaScriptEnvelope(
  msg: CarbonDecoded['msg']
): { nexus: string; chain: string; scriptHex: string } | null {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return null;
  }

  const record = msg as Record<string, unknown>;
  const nexus = record.nexus;
  const chain = record.chain;
  const scriptHex = record.script;
  if (typeof nexus !== 'string' || typeof chain !== 'string' || typeof scriptHex !== 'string' || scriptHex.length === 0) {
    return null;
  }

  return { nexus, chain, scriptHex };
}

function payloadTextToHex(payload: string): string {
  return bytesToHex(new TextEncoder().encode(payload));
}

function expiryMsToUnixSeconds(expiry: string): number {
  try {
    return Number(BigInt(expiry) / 1000n);
  } catch {
    return 0;
  }
}

function countWitnesses(witnesses: CarbonDecoded['witnesses']): number {
  return Array.isArray(witnesses) ? witnesses.length : 0;
}

interface CarbonVmContext {
  payloadHex?: string;
  expirationUnix?: number;
  signatures?: number;
}

export interface CarbonTxDataDecodeContext {
  payloadHex?: string;
  expirationUnix?: number;
  gasPayer?: string;
  gasLimit?: string;
  signatureCount?: number;
}

function normalizeOptionalHex(value: string | undefined, warnings: string[], label: string): string {
  if (!value) {
    return '';
  }

  try {
    return bytesToHex(hexToBytes(value));
  } catch (err) {
    warnings.push(
      `${label} is not valid hex (${err instanceof Error ? err.message : String(err)})`
    );
    return value;
  }
}

function normalizeOptionalHexStrict(value: string | undefined, warnings: string[], label: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return bytesToHex(hexToBytes(value));
  } catch (err) {
    warnings.push(
      `${label} is not valid hex (${err instanceof Error ? err.message : String(err)})`
    );
    return undefined;
  }
}

function attachVmFromCarbon(
  output: DecodeOutput,
  methodTable?: Map<string, AbiMethodSpecEntry>,
  protocolVersion?: number,
  context: CarbonVmContext = {}
): boolean {
  if (!output.carbon) {
    return false;
  }

  if (output.carbon.type === TxTypes.Phantasma) {
    const envelope = extractPhantasmaScriptEnvelope(output.carbon.msg);
    if (!envelope) {
      output.warnings.push('Phantasma payload missing nexus/chain/script fields');
      return false;
    }

    const vm = decodeVmScript(envelope.scriptHex, methodTable, protocolVersion, {
      nexus: envelope.nexus,
      chain: envelope.chain,
      payloadHex: context.payloadHex ?? payloadTextToHex(output.carbon.payload),
      expirationUnix: context.expirationUnix ?? expiryMsToUnixSeconds(output.carbon.expiry),
      signatures: context.signatures ?? countWitnesses(output.carbon.witnesses),
    });
    output.vm = vm.decoded;
    output.warnings.push(...vm.warnings);
    return true;
  }

  if (output.carbon.type === TxTypes.Phantasma_Raw) {
    const txHex = extractPhantasmaRawTxHex(output.carbon.msg);
    if (!txHex) {
      output.warnings.push('Phantasma_Raw payload missing inner transaction bytes');
      return false;
    }
    try {
      const vm = decodeVmTransaction(txHex, methodTable, protocolVersion, { requireExact: true });
      output.vm = vm.decoded;
      output.warnings.push(...vm.warnings);
      return true;
    } catch (err) {
      output.warnings.push(
        `Phantasma_Raw inner VM decode failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  return false;
}

function attachVmFromRpcScript(
  output: DecodeOutput,
  tx: TransactionData,
  methodTable?: Map<string, AbiMethodSpecEntry>,
  protocolVersion?: number
): boolean {
  const scriptHex = normalizeOptionalHex(tx.script, output.warnings, 'RPC script');
  if (!scriptHex) {
    return false;
  }

  const vm = decodeVmScript(scriptHex, methodTable, protocolVersion, {
    chain: tx.chainAddress,
    payloadHex: normalizeOptionalHex(tx.payload, output.warnings, 'RPC payload'),
    expirationUnix: tx.expiration ?? 0,
    signatures: tx.signatures?.length ?? 0,
  });
  output.vm = vm.decoded;
  output.warnings.push(...vm.warnings);
  return true;
}

export function decodeTxHex(
  hex: string,
  format: OutputFormat,
  methodTable?: Map<string, AbiMethodSpecEntry>,
  protocolVersion?: number
): DecodeOutput {
  const output = buildBaseOutput('tx-hex', hex, format);
  let normalized: string;
  try {
    normalized = bytesToHex(hexToBytes(hex));
  } catch (err) {
    output.errors.push(err instanceof Error ? err.message : String(err));
    return output;
  }

  try {
    // Exact Carbon parsing must reject trailing bytes. Otherwise a raw VM
    // script can be mistaken for SignedTxMsg if its prefix happens to look
    // like a valid Carbon header.
    const carbon = decodeCarbonSignedTxExact(normalized);
    output.carbon = carbon.decoded;
    output.warnings.push(...carbon.warnings);
    attachVmFromCarbon(output, methodTable, protocolVersion);
    return output;
  } catch {
    // Carbon parse failed; try VM next.
  }

  try {
    const vm = decodeVmHex(normalized, methodTable, protocolVersion);
    output.vm = vm.decoded;
    output.warnings.push(...vm.warnings);
    return output;
  } catch (err) {
    output.errors.push(err instanceof Error ? err.message : String(err));
  }

  output.errors.push('failed to decode as Carbon or VM');
  return output;
}

export function decodeCarbonTxData(
  hex: string,
  carbonTxType: number,
  format: OutputFormat,
  context: CarbonTxDataDecodeContext = {},
  methodTable?: Map<string, AbiMethodSpecEntry>,
  protocolVersion?: number
): DecodeOutput {
  const output = buildBaseOutput('carbon-tx-data', hex, format);
  let normalized: string;
  try {
    normalized = bytesToHex(hexToBytes(hex));
    output.input = normalized;
  } catch (err) {
    output.errors.push(err instanceof Error ? err.message : String(err));
    return output;
  }

  const payloadHex = normalizeOptionalHexStrict(context.payloadHex, output.warnings, 'RPC payload');
  try {
    const carbon = decodeCarbonPayloadForRpc(carbonTxType, normalized, {
      ...(context.gasPayer ? { gasPayer: context.gasPayer } : {}),
      ...(context.gasLimit ? { gasLimit: context.gasLimit } : {}),
      ...(context.expirationUnix !== undefined ? { expiration: context.expirationUnix } : {}),
      ...(payloadHex ? { payloadHex } : {}),
    });
    output.carbon = carbon.decoded;
    output.warnings.push(...carbon.warnings);
    attachVmFromCarbon(output, methodTable, protocolVersion, {
      ...(payloadHex ? { payloadHex } : {}),
      expirationUnix: context.expirationUnix ?? 0,
      signatures: context.signatureCount ?? 0,
    });
  } catch (err) {
    output.errors.push(
      `Payload-only decode failed (${err instanceof Error ? err.message : String(err)})`
    );
  }

  return output;
}

export function decodeTxDataFromRpc(
  hash: string,
  rpcUrl: string,
  tx: TransactionData,
  format: OutputFormat,
  methodTable?: Map<string, AbiMethodSpecEntry>,
  protocolVersion?: number
): DecodeOutput {
  const output = buildBaseOutput('tx-hash', hash, format);
  output.rpc = { url: rpcUrl, method: 'getTransaction' };

  const carbonData = (tx.carbonTxData ?? '').trim();
  if (carbonData.length > 0 && carbonData !== '0x') {
    let normalized: string | null = null;
    try {
      normalized = bytesToHex(hexToBytes(carbonData));
    } catch (err) {
      output.warnings.push(
        `RPC carbonTxData is not valid hex (${err instanceof Error ? err.message : String(err)})`
      );
    }

    if (normalized) {
      let signedDecodeError: string | null = null;
      try {
        const carbon = decodeCarbonSignedTxExact(normalized);
        output.carbon = carbon.decoded;
        output.warnings.push(...carbon.warnings);
        if (attachVmFromCarbon(output, methodTable, protocolVersion, {
          payloadHex: normalizeOptionalHex(tx.payload, output.warnings, 'RPC payload'),
          expirationUnix: tx.expiration ?? 0,
          signatures: tx.signatures?.length ?? 0,
        })) {
          return output;
        }
      } catch (err) {
        signedDecodeError = err instanceof Error ? err.message : String(err);
      }

      try {
        const carbon = decodeCarbonPayloadForRpc(tx.carbonTxType ?? 0, normalized, {
          gasPayer: tx.gasPayer,
          gasLimit: tx.gasLimit,
          expiration: tx.expiration,
          payloadHex: tx.payload,
          signatures: tx.signatures,
        });
        output.carbon = carbon.decoded;
        output.warnings.push(...carbon.warnings);
        if (attachVmFromCarbon(output, methodTable, protocolVersion, {
          payloadHex: normalizeOptionalHex(tx.payload, output.warnings, 'RPC payload'),
          expirationUnix: tx.expiration ?? 0,
          signatures: tx.signatures?.length ?? 0,
        })) {
          return output;
        }
      } catch (payloadErr) {
        if (signedDecodeError) {
          output.warnings.push(`SignedTxMsg decode failed (${signedDecodeError})`);
        }
        output.warnings.push(
          `Payload-only decode failed (${payloadErr instanceof Error ? payloadErr.message : String(payloadErr)})`
        );
      }
    }
  }

  if (attachVmFromRpcScript(output, tx, methodTable, protocolVersion)) {
    output.warnings.push('RPC does not expose full VM tx bytes; output is script/payload only');
  }

  return output;
}

export async function decodeTxHash(
  hash: string,
  rpcUrl: string,
  format: OutputFormat,
  methodTable?: Map<string, AbiMethodSpecEntry>,
  protocolVersion?: number
): Promise<DecodeOutput> {
  let tx: TransactionData;
  try {
    tx = await fetchTransaction(rpcUrl, hash);
  } catch (err) {
    const output = buildBaseOutput('tx-hash', hash, format);
    output.rpc = { url: rpcUrl, method: 'getTransaction' };
    output.errors.push(err instanceof Error ? err.message : String(err));
    return output;
  }

  return decodeTxDataFromRpc(hash, rpcUrl, tx, format, methodTable, protocolVersion);
}
