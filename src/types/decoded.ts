export type OutputFormat = 'json' | 'pretty';
export type DecodeSourceKind =
  | 'tx-hex'
  | 'tx-hash'
  | 'carbon-tx-data'
  | 'rpc-json'
  | 'event-hex'
  | 'rom-hex'
  | 'vmobj-hex'
  | 'address-convert'
  | 'address-derive';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export interface RpcMeta {
  url: string;
  method: string;
}

export interface CarbonDecoded {
  type: number;
  typeName: string;
  expiry: string;
  maxGas: string;
  maxData: string;
  gasFrom: string;
  payload: string;
  msg?: JsonValue;
  witnesses?: JsonValue;
  call?: CarbonCallDecoded;
  calls?: CarbonCallDecoded[];
}

export interface CarbonCallArg {
  name: string;
  type: string;
  value?: JsonValue;
  error?: string;
}

export interface CarbonCallSection {
  registerOffset: number;
  argsHex?: string;
  args?: CarbonCallArg[];
}

export interface CarbonCallDecoded {
  moduleId: number;
  methodId: number;
  moduleName?: string;
  methodName?: string;
  argsHex?: string;
  args?: CarbonCallArg[];
  sections?: CarbonCallSection[];
}

export interface VmInstruction {
  offset: number;
  opcode: number;
  opcodeName: string;
  args: JsonValue[];
}

export interface VmMethodCallArg {
  vmType: string;
  value: JsonValue;
  name?: string;
  abiType?: string;
  details?: JsonValue;
}

export interface VmMethodCall {
  contract: string;
  method: string;
  args: VmMethodCallArg[];
  summary?: JsonValue;
}

export interface VmDecoded {
  nexus: string;
  chain: string;
  scriptHex: string;
  payloadHex: string;
  expirationUnix: number;
  signatures: number;
  instructions?: VmInstruction[];
  methodCalls?: VmMethodCall[];
}

export interface EventDecoded {
  kind?: string;
  kindId?: number;
  rawHex: string;
  decoded?: JsonValue;
}

export interface VmObjectStructEntryDecoded {
  keyVmType: string;
  key: JsonValue;
  valueVmType: string;
  value: JsonValue;
}

export interface VmObjectDecoded {
  vmTypeId: number;
  vmType: string;
  value?: JsonValue;
  fields?: { [key: string]: JsonValue };
  entries?: VmObjectStructEntryDecoded[];
}

export type RomVmStructEntryDecoded = VmObjectStructEntryDecoded;
export type RomVmNodeDecoded = VmObjectDecoded;

export interface RomDecoded {
  parser: 'legacy-vm-dictionary' | 'crown';
  rawHex: string;
  symbol?: string;
  tokenId?: string;
  name?: string;
  description?: string;
  createdUnix?: number;
  createdIso?: string;
  fields?: { [key: string]: JsonValue };
  vm?: {
    root: RomVmNodeDecoded;
  };
  crown?: {
    addressLength: number;
    stakerAddressHex: string;
    stakerAddress?: string;
    timestampUnix: number;
    timestampIso: string;
  };
}

export interface AddressDecoded {
  direction:
    | 'bytes32-to-pha'
    | 'pha-to-bytes32'
    | 'wif-to-pha'
    | 'private-key-to-pha'
    | 'mnemonic-to-pha'
    | 'mnemonic-legacy-to-pha';
  bytes32?: string;
  phantasma: string;
  kind: 'user' | 'system';
  publicKey?: string;
  derivationMethod?: 'bip44' | 'legacy-pbkdf2-first32';
  derivationPath?: string;
  derivationIndex?: number;
  legacyPasswordUsed?: boolean;
}

export interface DecodeOutput {
  source: DecodeSourceKind;
  input: string;
  format: OutputFormat;
  rpc?: RpcMeta;
  carbon?: CarbonDecoded;
  vm?: VmDecoded;
  event?: EventDecoded;
  rom?: RomDecoded;
  vmObject?: VmObjectDecoded;
  address?: AddressDecoded;
  warnings: string[];
  errors: string[];
}
