# pha-decode

CLI for decoding Phantasma Carbon + VM transactions, contract lifecycle scripts, event hex payloads, ROM blobs, serialized VM objects, and address conversions.

## Features

- Decode Carbon transaction hex, payload-only RPC `carbonTxData`, RPC JSON dumps, or fetch-and-decode by tx hash
- Decode Carbon `Phantasma` / `Phantasma_Raw` wrappers into a VM view
- Decode full VM transaction containers and disassemble raw VM scripts
- Decode VM interop calls with ABI-aware argument naming
- Summarize contract deploy / upgrade interops:
  - contract name
  - signer / `from`
  - script byte length + SHA-256
  - ABI byte length + SHA-256
  - ABI method/event summaries when ABI bytes are present
- Decode classic hex-encoded event payloads
- Decode serialized VMObject hex (RPC `InvokeRawScript` `result`)
- Decode ROM blobs in:
  - legacy/common VM dictionary format
  - dedicated `CROWN` format
- Convert Carbon `bytes32` addresses to Phantasma addresses and back
- Derive Phantasma addresses from WIF, 32-byte private keys, modern BIP44 seed phrases, or legacy Poltergeist seed phrases
- Render stable JSON or human-readable pretty output
- Merge ABI from local files or from RPC contract discovery

## Requirements

- Node.js `>=22`

## Installation

```bash
# global install
npm i -g pha-decode

# local development install
npm install
npm run build

# inspect CLI help or version
pha-decode --help
pha-decode --version
```

## Usage

```bash
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
```

## Common Options

- `--format <json|pretty>`: output format, default `pretty`
- `--vm-detail <all|calls|ops|none>`: VM detail level, default `all`
- `--carbon-detail <all|call|msg|none>`: Carbon detail level, default `call`
- `--carbon-addresses <bytes32|pha>`: render known Carbon addresses as raw `bytes32` or decoded Phantasma addresses, default `bytes32`
- `--protocol <number>`: protocol version used for built-in interop ABI selection, default latest known protocol
- `--rpc <url>`: RPC endpoint for `--hash`
- `--carbon-tx-data <hex>`: payload-only RPC `carbonTxData`; requires `--carbon-tx-type`
- `--carbon-tx-type <number|name>`: Carbon tx type number or enum name for `--carbon-tx-data`, e.g. `15` or `Phantasma`
- `--rpc-json <path|->`: decode a raw `getTransaction` result object or JSON-RPC response; `-` reads stdin
- `--resolve`: fetch contract metadata from RPC and merge it into method resolution
- `--abi <path>`: ABI JSON file or directory to merge into method resolution
- `--verbose`: enable SDK logging
- `--version`: print the package version
- `--help`: print CLI help

Mode-specific flags:

- tx mode
  - `--payload <hex>` optional RPC payload context for `--carbon-tx-data`
  - `--expiration <unix>` optional RPC expiration seconds context for `--carbon-tx-data`
  - `--gas-payer <address>` optional RPC gas payer context for `--carbon-tx-data`
  - `--gas-limit <amount>` optional RPC gas limit context for `--carbon-tx-data`
  - `--signature-count <n>` optional signature count context for `--carbon-tx-data`
- event mode
  - `--kind <eventKind>`
- ROM mode
  - `--symbol <symbol>`
  - `--token-id <tokenId>`
  - `--rom-format <auto|legacy|crown>`
- address mode
  - `--bytes32 <hex>`
  - `--pha <address>`
  - `--wif <wif>`
  - `--private-key <hex>`
  - `--mnemonic <words>` / `--seed-phrase <words>`
  - `--mnemonic-legacy <words>` / `--legacy-mnemonic <words>`
  - `--legacy-password <password>` / `--mnemonic-legacy-password <password>`
  - `--stdin` to read the selected address input from standard input; when run
    interactively, type one line and press Enter
  - `--index <n>` / `--derivation-index <n>` for seed phrase derivation, default `0`

## Transaction Input Expectations

`pha-decode tx --hex` accepts either:

- a full Carbon `SignedTxMsg` hex string
- a full VM transaction hex string
- a raw VM script hex string

Payload-only RPC `carbonTxData` is not self-describing, so it is intentionally
not auto-detected by `--hex`. Use an explicit type-aware mode instead:

```bash
pha-decode tx --carbon-tx-data <carbonTxData> --carbon-tx-type <carbonTxType>
```

When you have the whole `getTransaction` response, prefer `--rpc-json` so the
decoder can also use payload, expiration, gas, signature, and fallback script
context:

```bash
pha-decode tx --rpc-json tx.json
curl ... | pha-decode tx --rpc-json -
```

If you only have a tx hash and a live RPC, use:

```bash
pha-decode tx --hash <txHash> --rpc <url>
```

When the decoded Carbon transaction carries VM execution data, `pha-decode` reconstructs `output.vm` automatically:

- `TxTypes.Phantasma` (`type 15`): reconstructs VM metadata from the Carbon envelope and disassembles `msg.script`
- `TxTypes.Phantasma_Raw` (`type 16`): unwraps and decodes the inner full VM transaction

For `tx --hash` and `tx --rpc-json`, `pha-decode` first tries `carbonTxData`.
If RPC also exposes a top-level `script`, that script is used as a fallback
when full VM reconstruction is not possible.

## Contract Lifecycle Decoding

`pha-decode` now enriches deploy / upgrade interops in VM output.

For `Runtime.DeployContract` and `Runtime.UpgradeContract`, the decoded output includes:

- `vm.methodCalls[].summary`
  - `kind`
  - `from`
  - `contractName`
  - `contractScript`
  - optional `contractABI`
- `vm.methodCalls[].args[].details`
  - per-script summary:
    - `byteLength`
    - `sha256`
    - `instructionCount` when disassembly succeeds
  - per-ABI summary:
    - `byteLength`
    - `sha256`
    - `methodCount`
    - `eventCount`
    - decoded method/event descriptors when ABI parsing succeeds

This makes `pha-decode` useful as a companion to `pha-deploy contract deploy --dry-run` and `pha-deploy contract upgrade --dry-run`.

## Examples

Decode a tx hash via RPC:

```bash
pha-decode tx --hash 155422A6882C3342933521DDC1A335292BF6448DBD489ED0BE21CFC74AFBA52A \
  --rpc https://pharpc1.phantasma.info/rpc \
  --format json \
  --carbon-addresses pha \
  --vm-detail calls \
  --carbon-detail call
```

Decode a copied RPC `carbonTxData` field directly:

```bash
pha-decode tx \
  --carbon-tx-data <carbonTxData> \
  --carbon-tx-type Phantasma \
  --payload <payloadHex> \
  --expiration <unixSeconds> \
  --vm-detail calls \
  --carbon-detail all \
  --format json
```

Decode a saved RPC transaction object:

```bash
pha-decode tx --rpc-json tx.json --vm-detail calls --format json
cat tx.json | pha-decode tx --rpc-json - --carbon-addresses pha
```

Decode a local Carbon tx, full VM tx, or raw VM script:

```bash
pha-decode 0xDEADBEEF...
```

Decode a deploy / upgrade dry-run transaction generated elsewhere:

```bash
pha-decode tx --hex <SIGNED_TX_HEX> --vm-detail calls --format pretty
```

Decode classic event hex:

```bash
pha-decode event --hex 0xAABBCC... --kind TokenMint
```

Decode ROM in auto mode:

```bash
pha-decode rom \
  --hex 220100F100396A4B73E3ABCD6B9039712944D7DF9E8ABE7211E519A91176E83A28D01B10027965 \
  --symbol CROWN \
  --token-id 80367770225206466995541877216191568684251978941303868068127874072614271067693
```

Force the legacy/common ROM parser:

```bash
pha-decode rom --hex 0x... --rom-format legacy
```

Decode serialized VMObject hex from `InvokeRawScript.result` (not a VM script):

```bash
pha-decode vmobj --hex 03010B
pha-decode vmobj 0x03010B --format json
```

Convert Carbon `bytes32` to a Phantasma address:

```bash
pha-decode address --bytes32 f100396a4b73e3abcd6b9039712944d7df9e8abe7211e519a91176e83a28d01b
```

Convert a Phantasma address back to Carbon `bytes32`:

```bash
pha-decode address --pha P2KKzrLNZK75f4Vtp4wwWocfgoqywBo3zKBWxBXjLgbxXmL
```

Derive a Phantasma address from WIF:

```bash
pha-decode address --wif <WIF>
```

Or read the WIF from stdin to avoid putting it in shell history:

```bash
printf '%s' "$WIF" | pha-decode address --stdin --wif
```

Derive a Phantasma address from a 32-byte private key hex:

```bash
pha-decode address --private-key <64_HEX_CHARS>
```

Stdin form:

```bash
printf '%s' "$PRIVATE_KEY_HEX" | pha-decode address --stdin --private-key
```

Derive a Phantasma address from a 12/24-word seed phrase:

```bash
pha-decode address --mnemonic "<seed phrase>" --index 0
```

Stdin form:

```bash
printf '%s' "$MNEMONIC" | pha-decode address --stdin --mnemonic --index 0
```

Seed phrases use the same derivation path as current Poltergeist wallets:
`m/44'/60'/0'/0/<index>`.

Derive a Phantasma address from an old Poltergeist legacy seed phrase:

```bash
pha-decode address --mnemonic-legacy "<old seed phrase>"
```

For Poltergeist v1.0-v1.2 wallets that used a seed password:

```bash
pha-decode address --mnemonic-legacy "<old seed phrase>" --legacy-password "<seed password>"
```

Stdin form for the legacy seed phrase:

```bash
printf '%s' "$LEGACY_MNEMONIC" | pha-decode address --stdin --mnemonic-legacy
```

Legacy seed phrases use the old Poltergeist algorithm:
`PBKDF2-HMAC-SHA512(seedPhrase, "mnemonic" + password)` and the first 32 bytes
as the Phantasma private key. They do not use the modern BIP44 derivation path.
WIF, private-key, mnemonic, legacy mnemonic, and legacy password inputs are
redacted from CLI output. Prefer `--stdin` for the primary secret input when
scripting.

## Output Shape

JSON output is stable and machine-friendly:

```json
{
  "source": "tx-hash",
  "input": "155422A6...",
  "rpc": { "url": "https://...", "method": "getTransaction" },
  "carbon": { "...": "..." },
  "vm": { "...": "..." },
  "event": { "...": "..." },
  "rom": { "...": "..." },
  "vmObject": { "...": "..." },
  "address": { "...": "..." },
  "warnings": [],
  "errors": []
}
```

Notes:

- `carbon.call` is the human-readable Carbon call decode
- `carbon.msg` is the raw Carbon payload decode
- `vm.instructions` and `vm.methodCalls` are controlled by `--vm-detail`
- `--carbon-addresses pha` only converts known address-shaped Carbon fields
- event hex decoding applies to classic event payloads only
- `vmobj` decodes one serialized VMObject. Use `result` from InvokeRawScript, not the script you invoked. If `results[]` has several items, decode each hex separately.
- ROM auto mode chooses a parser from the available context and falls back with warnings when needed
- address derivation from WIF/private-key/mnemonic/legacy mnemonic never prints the secret input back into `input`

## Dev Shortcuts

This repo ships a `justfile` with:

- `just build`
- `just test`
- `just r <args>`
- `just d <args>`

Use `just --list` to inspect the full local helper set.

## Limitations

- `--resolve` requires `--rpc`
- `tx --hash` requires `--rpc`
- `tx --carbon-tx-data` requires `--carbon-tx-type`; use `--rpc-json` when you have the full RPC object
- if RPC `getContracts` is incomplete, unresolved methods fall back to raw data
- unknown methods or argument types stay raw; the CLI does not guess
- contract lifecycle summaries depend on the VM interop arguments actually containing script / ABI bytes
