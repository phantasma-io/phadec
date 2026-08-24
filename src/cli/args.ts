import type {
  CliOptions,
  ParseResult,
  CliCommand,
  VmDetailMode,
  CarbonDetailMode,
  CarbonAddressMode,
  RomDecodeMode,
  AddressInputKind,
} from '../types/cli.js';
import type { OutputFormat } from '../types/decoded.js';
import { DomainSettings, TxTypes } from 'phantasma-sdk-ts';

const DEFAULT_FORMAT: OutputFormat = 'pretty';
const DEFAULT_VM_DETAIL: VmDetailMode = 'all';
const DEFAULT_CARBON_DETAIL: CarbonDetailMode = 'call';
const DEFAULT_CARBON_ADDRESSES: CarbonAddressMode = 'bytes32';
const DEFAULT_ROM_MODE: RomDecodeMode = 'auto';
const DEFAULT_PROTOCOL_VERSION = DomainSettings.LatestKnownProtocol;
const DEFAULT_ADDRESS_INDEX = 0;

function isCommand(value: string): value is CliCommand {
  return (
    value === 'tx' ||
    value === 'event' ||
    value === 'rom' ||
    value === 'vmobj' ||
    value === 'address'
  );
}

function parseFormat(value: string): OutputFormat | null {
  if (value === 'json' || value === 'pretty') {
    return value;
  }
  return null;
}

function parseVmDetail(value: string): VmDetailMode | null {
  switch (value) {
    case 'all':
    case 'both':
      return 'all';
    case 'calls':
    case 'methods':
      return 'calls';
    case 'ops':
    case 'opcodes':
      return 'ops';
    case 'none':
    case 'off':
      return 'none';
    default:
      return null;
  }
}

function parseCarbonDetail(value: string): CarbonDetailMode | null {
  switch (value) {
    case 'all':
    case 'call':
    case 'msg':
    case 'none':
      return value;
    default:
      return null;
  }
}

function parseCarbonAddresses(value: string): CarbonAddressMode | null {
  switch (value) {
    case 'bytes32':
    case 'raw':
    case 'hex':
    case 'off':
      return 'bytes32';
    case 'pha':
    case 'phantasma':
    case 'decode':
      return 'pha';
    default:
      return null;
  }
}

function parseProtocol(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function parseBoundedInteger(value: string, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    return null;
  }
  return parsed;
}

function normalizeEnumName(value: string): string {
  return value.replace(/[-_\s]/g, '').toLowerCase();
}

function parseCarbonTxType(value: string): number | null {
  const numeric = parseBoundedInteger(value, 0xff);
  if (numeric !== null) {
    return numeric;
  }

  const normalized = normalizeEnumName(value);
  for (const [key, enumValue] of Object.entries(TxTypes)) {
    if (typeof enumValue !== 'number') {
      continue;
    }
    if (normalizeEnumName(key) === normalized) {
      return enumValue;
    }
  }

  return null;
}

function parseAddressIndex(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0x7fffffff) {
    return null;
  }
  return parsed;
}

function parseRomMode(value: string): RomDecodeMode | null {
  switch (value) {
    case 'auto':
      return 'auto';
    case 'legacy':
    case 'common':
      return 'legacy';
    case 'crown':
      return 'crown';
    default:
      return null;
  }
}

function addressInputKindForFlag(key: string): AddressInputKind | null {
  switch (key) {
    case 'bytes32':
    case 'carbon-address':
      return 'bytes32';
    case 'pha':
    case 'pha-address':
      return 'pha';
    case 'wif':
      return 'wif';
    case 'private-key':
    case 'private':
    case 'hex-private-key':
      return 'private-key';
    case 'mnemonic':
    case 'seed-phrase':
      return 'mnemonic';
    case 'mnemonic-legacy':
    case 'legacy-mnemonic':
      return 'mnemonic-legacy';
    default:
      return null;
  }
}

function setAddressStdinKind(opts: CliOptions, key: string): string | null {
  const kind = addressInputKindForFlag(key);
  if (!kind) {
    return `unknown stdin address input selector: --${key}`;
  }
  if (opts.addressStdinKind && opts.addressStdinKind !== kind) {
    return 'address mode accepts only one stdin input selector';
  }
  opts.addressStdinKind = kind;
  return null;
}

function setFlagValue(
  opts: CliOptions,
  key: string,
  value: string
): string | null {
  switch (key) {
    case 'rpc':
      opts.rpcUrl = value;
      return null;
    case 'abi':
      opts.abiPath = value;
      return null;
    case 'hash':
    case 'tx':
      opts.txHash = value;
      return null;
    case 'carbon-tx-data':
    case 'carbonTxData':
    case 'carbon-data':
      opts.txCarbonTxData = value;
      return null;
    case 'carbon-tx-type':
    case 'carbonTxType':
    case 'carbon-type': {
      const carbonTxType = parseCarbonTxType(value);
      if (carbonTxType === null) {
        return `invalid carbon tx type: ${value}`;
      }
      opts.txCarbonTxType = carbonTxType;
      return null;
    }
    case 'rpc-json':
    case 'rpcJson':
      opts.txRpcJson = value;
      return null;
    case 'payload':
    case 'rpc-payload':
      opts.txPayload = value;
      return null;
    case 'expiration':
    case 'expiry':
    case 'rpc-expiration': {
      const expiration = parseBoundedInteger(value, Number.MAX_SAFE_INTEGER);
      if (expiration === null) {
        return `invalid expiration: ${value}`;
      }
      opts.txExpiration = expiration;
      return null;
    }
    case 'gas-payer':
    case 'gasPayer':
      opts.txGasPayer = value;
      return null;
    case 'gas-limit':
    case 'gasLimit':
      opts.txGasLimit = value;
      return null;
    case 'signature-count':
    case 'signatures':
    case 'signatureCount': {
      const signatureCount = parseBoundedInteger(value, 10000);
      if (signatureCount === null) {
        return `invalid signature count: ${value}`;
      }
      opts.txSignatureCount = signatureCount;
      return null;
    }
    case 'hex':
      if (opts.command === 'event') {
        opts.eventHex = value;
      } else if (opts.command === 'rom') {
        opts.romHex = value;
      } else if (opts.command === 'vmobj') {
        opts.vmObjectHex = value;
      } else {
        opts.txHex = value;
      }
      return null;
    case 'event-hex':
      opts.eventHex = value;
      return null;
    case 'kind':
      opts.eventKind = value;
      return null;
    case 'symbol':
      opts.romSymbol = value;
      return null;
    case 'token-id':
    case 'id':
      opts.romTokenId = value;
      return null;
    case 'bytes32':
    case 'carbon-address':
      opts.addressBytes32 = value;
      return null;
    case 'pha':
    case 'pha-address':
      opts.addressPha = value;
      return null;
    case 'wif':
      opts.addressWif = value;
      return null;
    case 'private-key':
    case 'private':
    case 'hex-private-key':
      opts.addressPrivateKey = value;
      return null;
    case 'mnemonic':
    case 'seed-phrase':
      opts.addressMnemonic = value;
      return null;
    case 'mnemonic-legacy':
    case 'legacy-mnemonic':
      opts.addressLegacyMnemonic = value;
      return null;
    case 'legacy-password':
    case 'mnemonic-legacy-password':
      opts.addressLegacyPassword = value;
      return null;
    case 'index':
    case 'derivation-index': {
      const index = parseAddressIndex(value);
      if (index === null) {
        return `invalid address derivation index: ${value}`;
      }
      opts.addressIndex = index;
      return null;
    }
    case 'rom-format':
    case 'rom-mode': {
      const romMode = parseRomMode(value);
      if (!romMode) {
        return `unknown rom format: ${value}`;
      }
      opts.romMode = romMode;
      return null;
    }
    case 'format': {
      const format = parseFormat(value);
      if (!format) {
        return `unknown format: ${value}`;
      }
      opts.format = format;
      return null;
    }
    case 'vm-detail': {
      const vmDetail = parseVmDetail(value);
      if (!vmDetail) {
        return `unknown vm detail: ${value}`;
      }
      opts.vmDetail = vmDetail;
      return null;
    }
    case 'carbon-detail': {
      const carbonDetail = parseCarbonDetail(value);
      if (!carbonDetail) {
        return `unknown carbon detail: ${value}`;
      }
      opts.carbonDetail = carbonDetail;
      return null;
    }
    case 'carbon-addresses': {
      const carbonAddresses = parseCarbonAddresses(value);
      if (!carbonAddresses) {
        return `unknown carbon address mode: ${value}`;
      }
      opts.carbonAddresses = carbonAddresses;
      return null;
    }
    case 'protocol':
    case 'protocol-version': {
      const protocolVersion = parseProtocol(value);
      if (protocolVersion === null) {
        return `invalid protocol version: ${value}`;
      }
      opts.protocolVersion = protocolVersion;
      return null;
    }
    default:
      return `unknown flag: --${key}`;
  }
}

function validateOptions(opts: CliOptions): string | null {
  if (
    opts.command !== 'address' &&
    (opts.addressReadStdin || opts.addressStdinKind)
  ) {
    return '--stdin address input selectors are only supported in address mode';
  }

  if (opts.command === 'tx') {
    const inputCount = [
      opts.txHex,
      opts.txHash,
      opts.txCarbonTxData,
      opts.txRpcJson,
    ].filter(Boolean).length;
    if (inputCount === 0) {
      return 'tx mode requires --hex <txHex>, --hash <txHash>, --carbon-tx-data <hex>, or --rpc-json <path|->';
    }
    if (inputCount > 1) {
      return 'use only one tx input: --hex, --hash, --carbon-tx-data, or --rpc-json';
    }
    if (opts.txCarbonTxData && opts.txCarbonTxType === undefined) {
      return 'tx mode with --carbon-tx-data requires --carbon-tx-type <number|name>';
    }
    if (!opts.txCarbonTxData && opts.txCarbonTxType !== undefined) {
      return '--carbon-tx-type is only valid with --carbon-tx-data';
    }
    const hasCarbonContext = Boolean(
      opts.txPayload ||
        opts.txExpiration !== undefined ||
        opts.txGasPayer ||
        opts.txGasLimit ||
        opts.txSignatureCount !== undefined
    );
    if (hasCarbonContext && !opts.txCarbonTxData) {
      return '--payload, --expiration, --gas-payer, --gas-limit, and --signature-count are only valid with --carbon-tx-data';
    }
  } else if (opts.command === 'event') {
    if (!opts.eventHex) {
      return 'event mode requires --hex <eventHex>';
    }
  } else if (opts.command === 'rom') {
    if (!opts.romHex) {
      return 'rom mode requires --hex <romHex>';
    }
  } else if (opts.command === 'vmobj') {
    if (!opts.vmObjectHex) {
      return 'vmobj mode requires --hex <vmObjectHex>';
    }
  } else if (opts.command === 'address') {
    const valueInputCount = [
      opts.addressBytes32,
      opts.addressPha,
      opts.addressWif,
      opts.addressPrivateKey,
      opts.addressMnemonic,
      opts.addressLegacyMnemonic,
    ].filter(Boolean).length;

    if (opts.addressReadStdin) {
      if (valueInputCount > 0) {
        return 'address mode with --stdin does not accept address input values';
      }
      if (!opts.addressStdinKind) {
        return 'address mode with --stdin requires one input selector: --bytes32, --pha, --wif, --private-key, --mnemonic, or --mnemonic-legacy';
      }
    }

    const inputCount = valueInputCount + (opts.addressStdinKind ? 1 : 0);
    if (inputCount === 0) {
      return 'address mode requires --bytes32 <hex>, --pha <address>, --wif <wif>, --private-key <hex>, --mnemonic <words>, or --mnemonic-legacy <words>';
    }
    if (inputCount > 1) {
      return 'address mode accepts only one address input';
    }
  }
  return null;
}

export function parseArgs(argv: string[]): ParseResult {
  if (argv.length === 0) {
    return { kind: 'help' };
  }

  if (argv.includes('--help') || argv.includes('-h')) {
    return { kind: 'help' };
  }

  const firstArg = argv[0];
  const hasExplicitCommand = Boolean(firstArg && isCommand(firstArg));

  // Shorthand: no explicit command, single arg => tx hex
  if (
    !hasExplicitCommand &&
    argv.length === 1 &&
    firstArg &&
    !firstArg.startsWith('-')
  ) {
    const opts: CliOptions = {
      command: 'tx',
      format: DEFAULT_FORMAT,
      resolve: false,
      verbose: false,
      vmDetail: DEFAULT_VM_DETAIL,
      carbonDetail: DEFAULT_CARBON_DETAIL,
      carbonAddresses: DEFAULT_CARBON_ADDRESSES,
      romMode: DEFAULT_ROM_MODE,
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      addressReadStdin: false,
      addressIndex: DEFAULT_ADDRESS_INDEX,
      txHex: firstArg,
    };
    const err = validateOptions(opts);
    if (err) {
      return { kind: 'error', message: err };
    }
    return { kind: 'ok', options: opts };
  }

  const first = firstArg;
  let command: CliCommand = 'tx';
  let index = 0;
  if (first && isCommand(first)) {
    command = first;
    index = 1;
  }

  const opts: CliOptions = {
    command,
    format: DEFAULT_FORMAT,
    resolve: false,
    verbose: false,
    vmDetail: DEFAULT_VM_DETAIL,
    carbonDetail: DEFAULT_CARBON_DETAIL,
    carbonAddresses: DEFAULT_CARBON_ADDRESSES,
    romMode: DEFAULT_ROM_MODE,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    addressReadStdin: false,
    addressIndex: DEFAULT_ADDRESS_INDEX,
  };
  const hasStdinFlag = argv.includes('--stdin');

  while (index < argv.length) {
    const token = argv[index];
    if (!token) {
      index += 1;
      continue;
    }

    if (token === '--resolve') {
      opts.resolve = true;
      index += 1;
      continue;
    }

    if (token === '--verbose') {
      opts.verbose = true;
      index += 1;
      continue;
    }

    if (token === '--stdin') {
      opts.addressReadStdin = true;
      index += 1;
      continue;
    }

    if (!token.startsWith('--')) {
      if (opts.command === 'vmobj') {
        if (opts.vmObjectHex) {
          return { kind: 'error', message: 'vmobj mode accepts only one hex input' };
        }
        opts.vmObjectHex = token;
        index += 1;
        continue;
      }
      return { kind: 'error', message: `unexpected argument: ${token}` };
    }

    const [rawKeyRaw, rawValue] = token.slice(2).split('=');
    const rawKey = rawKeyRaw ?? '';
    if (!rawKey) {
      return { kind: 'error', message: 'missing flag name' };
    }
    if (rawValue !== undefined) {
      const err = setFlagValue(opts, rawKey, rawValue);
      if (err) {
        return { kind: 'error', message: err };
      }
      index += 1;
      continue;
    }

    if (hasStdinFlag && addressInputKindForFlag(rawKey)) {
      const err = setAddressStdinKind(opts, rawKey);
      if (err) {
        return { kind: 'error', message: err };
      }
      index += 1;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      return { kind: 'error', message: `missing value for --${rawKey}` };
    }
    const err = setFlagValue(opts, rawKey, value);
    if (err) {
      return { kind: 'error', message: err };
    }
    index += 2;
  }

  const validationError = validateOptions(opts);
  if (validationError) {
    return { kind: 'error', message: validationError };
  }

  return { kind: 'ok', options: opts };
}

export function printHelp(): void {
  const text = `Usage:
  pha-decode <txHex>
  pha-decode tx --hex <txHex>
  pha-decode tx --hash <txHash> --rpc <url>
  pha-decode tx --carbon-tx-data <hex> --carbon-tx-type <number|name>
  pha-decode tx --rpc-json <path|->
  pha-decode event --hex <eventHex> [--kind <kind>]
  pha-decode rom --hex <romHex> [--symbol <symbol>] [--token-id <tokenId>] [--rom-format <mode>]
  pha-decode vmobj --hex <vmObjectHex>
  pha-decode vmobj <vmObjectHex>
  pha-decode address --bytes32 <hex>
  pha-decode address --pha <address>
  pha-decode address --wif <wif>
  pha-decode address --private-key <hex>
  pha-decode address --mnemonic "<12-or-24-word phrase>" [--index <n>]
  pha-decode address --mnemonic-legacy "<old seed phrase>" [--legacy-password <password>]
  printf '%s' "<secret>" | pha-decode address --stdin --wif

Options:
  --format <json|pretty>  Output format (default: pretty)
  --vm-detail <mode>      VM output detail: all|calls|ops|none (default: all)
  --carbon-detail <mode>  Carbon output detail: all|call|msg|none (default: call)
  --carbon-addresses <m>  Carbon address output: bytes32|pha (default: bytes32)
  --protocol <number>     Protocol version for interop ABI selection (default: latest)
  --rpc <url>             RPC endpoint for --hash
  --carbon-tx-data <hex>  RPC carbonTxData payload-only field (requires --carbon-tx-type)
  --carbon-tx-type <t>    Carbon tx type number or enum name for --carbon-tx-data
  --rpc-json <path|->     Decode a getTransaction JSON object or JSON-RPC response; "-" reads stdin
  --payload <hex>         Optional RPC payload hex context for --carbon-tx-data
  --expiration <unix>     Optional RPC expiration seconds context for --carbon-tx-data
  --gas-payer <address>   Optional RPC gasPayer context for --carbon-tx-data
  --gas-limit <amount>    Optional RPC gasLimit context for --carbon-tx-data
  --signature-count <n>   Optional signature count context for --carbon-tx-data VM view
  --resolve               Enable extra RPC-based resolution
  --verbose               Enable SDK logging
  --version               Show version number
  --abi <path>            ABI JSON file or directory
  --kind <eventKind>      Event kind hint for hex-encoded (classic) events
  --symbol <symbol>       ROM symbol hint (used by rom mode, e.g. CROWN)
  --token-id <tokenId>    ROM token id hint (used by rom mode for naming)
  --rom-format <mode>     ROM parser mode: auto|legacy|crown (default: auto)
  --bytes32 <hex>         Carbon bytes32 address input (used by address mode)
  --pha <address>         Phantasma address input (used by address mode)
  --wif <wif>             WIF private-key input (used by address mode; redacted in output)
  --private-key <hex>     32-byte hex private-key input (used by address mode; redacted in output)
  --mnemonic <words>      12/24-word BIP39 seed phrase (used by address mode; redacted in output)
  --seed-phrase <words>   Alias for --mnemonic
  --mnemonic-legacy <w>   Legacy Poltergeist seed phrase (used by address mode; redacted in output)
  --legacy-password <p>   Optional legacy seed password for --mnemonic-legacy (redacted in output)
  --stdin                 Read selected address input from stdin; use with --wif, --private-key,
                          --mnemonic, --mnemonic-legacy, --bytes32, or --pha as a selector
                          In an interactive terminal, type one line and press Enter.
  --index <n>             Address derivation index for --mnemonic (default: 0)
  --help                  Show this help

Tx input notes:
  --hex accepts exact Carbon SignedTxMsg, full VM tx, or raw VM script hex
  vmobj --hex decodes one serialized VMObject (InvokeRawScript result), not a script
  --hash requires --rpc and reconstructs VM output from Carbon Phantasma wrappers when possible
  --carbon-tx-data decodes payload-only RPC carbonTxData and needs the matching carbonTxType
  --rpc-json accepts either a raw getTransaction result object or a JSON-RPC envelope with result
`;
  console.log(text);
}
