#!/usr/bin/env node
import { createRequire } from 'node:module';
import { parseArgs, printHelp } from './args.js';
import { decodeTxHex, decodeTxHash } from '../decoders/tx.js';
import { decodeEventHex } from '../decoders/event.js';
import { decodeRomHex } from '../decoders/rom.js';
import { decodeAddressConversion } from '../decoders/address.js';
import { applyCarbonAddressMode } from '../decoders/carbon-addresses.js';
import { renderOutput } from '../output/render.js';
import { buildMethodTable, loadAbi, mergeMethodTables } from '../abi/loader.js';
import type { AbiMethodSpecEntry } from '../abi/loader.js';
import { buildBuiltinMethodTable } from '../abi/builtin/index.js';
import { fetchContracts } from '../rpc/phantasma.js';
import type { DecodeOutput } from '../types/decoded.js';
import type { VmDetailMode, CarbonDetailMode } from '../types/cli.js';
import { bytesToHex, hexToBytes, setLogger } from 'phantasma-sdk-ts';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version: string };

function applyVmDetail(output: DecodeOutput, mode: VmDetailMode): void {
  const vm = output.vm;
  if (!vm) {
    return;
  }
  if (mode === 'calls') {
    delete vm.instructions;
    return;
  }
  if (mode === 'ops') {
    delete vm.methodCalls;
    return;
  }
  if (mode === 'none') {
    delete vm.instructions;
    delete vm.methodCalls;
  }
}

function applyCarbonDetail(output: DecodeOutput, mode: CarbonDetailMode): void {
  if (mode === 'all') {
    return;
  }
  if (mode === 'none') {
    delete output.carbon;
    return;
  }
  const carbon = output.carbon;
  if (!carbon) {
    return;
  }
  if (mode === 'call') {
    delete carbon.msg;
    return;
  }
  if (mode === 'msg') {
    delete carbon.call;
    delete carbon.calls;
  }
}

function isSecretAddressInput(opts: {
  addressWif?: string;
  addressPrivateKey?: string;
  addressMnemonic?: string;
  addressLegacyMnemonic?: string;
  addressLegacyPassword?: string;
}): boolean {
  return Boolean(
    opts.addressWif ||
    opts.addressPrivateKey ||
    opts.addressMnemonic ||
    opts.addressLegacyMnemonic ||
    opts.addressLegacyPassword
  );
}

async function run(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
    console.log(packageJson.version);
    return;
  }

  const result = parseArgs(rawArgs);
  if (result.kind === 'help') {
    printHelp();
    return;
  }

  if (result.kind === 'error') {
    console.error(result.message);
    printHelp();
    process.exitCode = 1;
    return;
  }

  const opts = result.options;
  if (opts.verbose) {
    setLogger(console);
  } else {
    setLogger();
  }
  let methodTable: Map<string, AbiMethodSpecEntry> | undefined;
  const preWarnings: string[] = [];

  if (opts.command === 'event') {
    if (opts.abiPath) {
      preWarnings.push('--abi is ignored for event mode');
    }
    if (opts.resolve) {
      preWarnings.push('--resolve is ignored for event mode');
    }
    if (opts.vmDetail !== 'all') {
      preWarnings.push('--vm-detail is ignored for event mode');
    }
    if (opts.carbonDetail !== 'call') {
      preWarnings.push('--carbon-detail is ignored for event mode');
    }
    if (opts.carbonAddresses !== 'bytes32') {
      preWarnings.push('--carbon-addresses is ignored for event mode');
    }
  } else if (opts.command === 'rom') {
    if (opts.abiPath) {
      preWarnings.push('--abi is ignored for rom mode');
    }
    if (opts.resolve) {
      preWarnings.push('--resolve is ignored for rom mode');
    }
    if (opts.vmDetail !== 'all') {
      preWarnings.push('--vm-detail is ignored for rom mode');
    }
    if (opts.carbonDetail !== 'call') {
      preWarnings.push('--carbon-detail is ignored for rom mode');
    }
    if (opts.carbonAddresses !== 'bytes32') {
      preWarnings.push('--carbon-addresses is ignored for rom mode');
    }
    if (opts.rpcUrl) {
      preWarnings.push('--rpc is ignored for rom mode');
    }
    if (opts.eventKind) {
      preWarnings.push('--kind is ignored for rom mode');
    }
  } else if (opts.command === 'address') {
    if (opts.abiPath) {
      preWarnings.push('--abi is ignored for address mode');
    }
    if (opts.resolve) {
      preWarnings.push('--resolve is ignored for address mode');
    }
    if (opts.vmDetail !== 'all') {
      preWarnings.push('--vm-detail is ignored for address mode');
    }
    if (opts.carbonDetail !== 'call') {
      preWarnings.push('--carbon-detail is ignored for address mode');
    }
    if (opts.carbonAddresses !== 'bytes32') {
      preWarnings.push('--carbon-addresses is ignored for address mode');
    }
    if (opts.rpcUrl) {
      preWarnings.push('--rpc is ignored for address mode');
    }
    if (opts.eventKind) {
      preWarnings.push('--kind is ignored for address mode');
    }
    if (opts.txHex) {
      preWarnings.push('--hex is ignored for address mode (use --bytes32)');
    }
    if (opts.romHex) {
      preWarnings.push('--hex is ignored for address mode (use --bytes32)');
    }
    if (opts.romSymbol) {
      preWarnings.push('--symbol is ignored for address mode');
    }
    if (opts.romTokenId) {
      preWarnings.push('--token-id is ignored for address mode');
    }
    if (opts.addressIndex !== 0 && !opts.addressMnemonic) {
      preWarnings.push(
        '--index is ignored unless --mnemonic or --seed-phrase is used'
      );
    }
    if (opts.addressLegacyPassword && !opts.addressLegacyMnemonic) {
      preWarnings.push(
        '--legacy-password is ignored unless --mnemonic-legacy is used'
      );
    }
  } else {
    const table = buildBuiltinMethodTable(opts.protocolVersion);
    methodTable = table;

    if (opts.abiPath) {
      try {
        const abiResult = await loadAbi(opts.abiPath);
        mergeMethodTables(table, abiResult.methods, preWarnings, 'abi', {
          warnOnDuplicate: false,
          replaceSameArity: true,
        });
        preWarnings.push(...abiResult.warnings);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }
    }

    if (opts.resolve) {
      if (!opts.rpcUrl) {
        console.error('RPC url is required for --resolve');
        process.exitCode = 1;
        return;
      }
      try {
        const contracts = await fetchContracts(opts.rpcUrl, 'main');
        const contractResult = buildMethodTable(contracts, 'rpc');
        mergeMethodTables(table, contractResult.methods, preWarnings, 'rpc', {
          warnOnDuplicate: false,
          replaceSameArity: true,
        });
        preWarnings.push(...contractResult.warnings);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }
    }
  }

  if (opts.command === 'event') {
    try {
      const normalizedInput = bytesToHex(hexToBytes(opts.eventHex ?? ''));
      const output = decodeEventHex(opts.eventHex ?? '', opts.eventKind);
      const rendered = renderOutput({
        source: 'event-hex',
        input: normalizedInput,
        format: opts.format,
        event: output.decoded,
        warnings: [...preWarnings, ...output.warnings],
        errors: [],
      });
      console.log(rendered);
    } catch (err) {
      const rendered = renderOutput({
        source: 'event-hex',
        input: opts.eventHex ?? '',
        format: opts.format,
        warnings: preWarnings,
        errors: [err instanceof Error ? err.message : String(err)],
      });
      console.log(rendered);
      process.exitCode = 1;
    }
    return;
  }

  if (opts.command === 'rom') {
    try {
      const output: DecodeOutput = {
        source: 'rom-hex',
        input: opts.romHex ?? '',
        format: opts.format,
        warnings: [...preWarnings],
        errors: [],
      };
      const rom = decodeRomHex({
        hex: opts.romHex ?? '',
        mode: opts.romMode,
        ...(opts.romSymbol ? { symbol: opts.romSymbol } : {}),
        ...(opts.romTokenId ? { tokenId: opts.romTokenId } : {}),
      });
      output.input = rom.decoded.rawHex;
      output.rom = rom.decoded;
      output.warnings.push(...rom.warnings);
      console.log(renderOutput(output));
    } catch (err) {
      const rendered = renderOutput({
        source: 'rom-hex',
        input: opts.romHex ?? '',
        format: opts.format,
        warnings: preWarnings,
        errors: [err instanceof Error ? err.message : String(err)],
      });
      console.log(rendered);
      process.exitCode = 1;
    }
    return;
  }

  if (opts.command === 'address') {
    try {
      const conversion = decodeAddressConversion({
        ...(opts.addressBytes32 ? { bytes32: opts.addressBytes32 } : {}),
        ...(opts.addressPha ? { phantasma: opts.addressPha } : {}),
        ...(opts.addressWif ? { wif: opts.addressWif } : {}),
        ...(opts.addressPrivateKey
          ? { privateKey: opts.addressPrivateKey }
          : {}),
        ...(opts.addressMnemonic
          ? { mnemonic: opts.addressMnemonic, index: opts.addressIndex }
          : {}),
        ...(opts.addressLegacyMnemonic
          ? {
              legacyMnemonic: opts.addressLegacyMnemonic,
              legacyPassword: opts.addressLegacyPassword ?? '',
            }
          : {}),
      });
      const secretInput = isSecretAddressInput(opts);

      const rendered = renderOutput({
        source: secretInput ? 'address-derive' : 'address-convert',
        input: secretInput
          ? '<redacted>'
          : conversion.decoded.direction === 'bytes32-to-pha'
            ? (conversion.decoded.bytes32 ?? '')
            : conversion.decoded.phantasma,
        format: opts.format,
        address: conversion.decoded,
        warnings: [...preWarnings, ...conversion.warnings],
        errors: [],
      });
      console.log(rendered);
    } catch (err) {
      const rendered = renderOutput({
        source: isSecretAddressInput(opts)
          ? 'address-derive'
          : 'address-convert',
        input: isSecretAddressInput(opts)
          ? '<redacted>'
          : (opts.addressBytes32 ?? opts.addressPha ?? ''),
        format: opts.format,
        warnings: preWarnings,
        errors: [err instanceof Error ? err.message : String(err)],
      });
      console.log(rendered);
      process.exitCode = 1;
    }
    return;
  }

  if (opts.txHex) {
    const output = decodeTxHex(
      opts.txHex,
      opts.format,
      methodTable,
      opts.protocolVersion
    );
    output.warnings.push(
      ...applyCarbonAddressMode(output, opts.carbonAddresses)
    );
    applyVmDetail(output, opts.vmDetail);
    applyCarbonDetail(output, opts.carbonDetail);
    output.warnings.push(...preWarnings);
    console.log(renderOutput(output));
    return;
  }

  if (opts.txHash) {
    if (!opts.rpcUrl) {
      console.error('RPC url is required for --hash');
      process.exitCode = 1;
      return;
    }
    const output = await decodeTxHash(
      opts.txHash,
      opts.rpcUrl,
      opts.format,
      methodTable,
      opts.protocolVersion
    );
    output.warnings.push(
      ...applyCarbonAddressMode(output, opts.carbonAddresses)
    );
    applyVmDetail(output, opts.vmDetail);
    applyCarbonDetail(output, opts.carbonDetail);
    output.warnings.push(...preWarnings);
    console.log(renderOutput(output));
    return;
  }

  console.error('missing tx input');
  process.exitCode = 1;
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
