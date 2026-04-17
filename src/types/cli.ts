import type { OutputFormat } from './decoded.js';

export type CliCommand = 'tx' | 'event' | 'rom' | 'address';
export type VmDetailMode = 'all' | 'calls' | 'ops' | 'none';
export type CarbonDetailMode = 'all' | 'call' | 'msg' | 'none';
export type CarbonAddressMode = 'bytes32' | 'pha';
export type RomDecodeMode = 'auto' | 'legacy' | 'crown';

export interface CliOptions {
  command: CliCommand;
  format: OutputFormat;
  resolve: boolean;
  verbose: boolean;
  vmDetail: VmDetailMode;
  carbonDetail: CarbonDetailMode;
  carbonAddresses: CarbonAddressMode;
  romMode: RomDecodeMode;
  protocolVersion: number;
  rpcUrl?: string;
  abiPath?: string;
  txHash?: string;
  txHex?: string;
  eventHex?: string;
  eventKind?: string;
  romHex?: string;
  romSymbol?: string;
  romTokenId?: string;
  addressBytes32?: string;
  addressPha?: string;
  addressWif?: string;
  addressPrivateKey?: string;
  addressMnemonic?: string;
  addressLegacyMnemonic?: string;
  addressLegacyPassword?: string;
  addressIndex: number;
}

export type ParseResult =
  | { kind: 'ok'; options: CliOptions }
  | { kind: 'help'; message?: string }
  | { kind: 'error'; message: string };
