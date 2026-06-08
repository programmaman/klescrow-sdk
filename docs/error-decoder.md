# Error Decoder

When a transaction reverts on-chain, the wallet throws an error containing raw hex revert data. `decodeKlescrowError` turns that into a readable error name and structured arguments.

## Return type

```ts
type DecodedRevert =
  | { error: string; args: Record<string, unknown> }  // known custom error
  | { raw: string }                                     // unknown revert hex
  | null;                                               // no revert data at all
```

## Usage

```ts
import { decodeKlescrowError } from '@rakelabs/klescrow-sdk';

try {
  await signer.sendTransaction({ ...tx, value: BigInt(tx.value) });
} catch (err) {
  const decoded = decodeKlescrowError(err);

  if (decoded && 'error' in decoded) {
    // Contract reverted with a known error. Show the error name to the user.
    // Use decoded.args to build richer messages.
    console.error(`Reverted: ${decoded.error}`, decoded.args);
    // e.g. "Reverted: BadEthValue" { sent: 500n, expectedMin: 1000n }

  } else if (decoded && 'raw' in decoded) {
    // Revert data found but the selector doesn't match any Klescrow error.
    // Could be a Kleros core error, ERC20 error, or an error from a new
    // contract version. Surface the first few bytes so the user has something.
    console.warn('Unknown revert:', decoded.raw.slice(0, 14) + '...');

  } else {
    // No revert data at all. This is not a contract revert.
    // Network error, user rejected the tx in MetaMask, insufficient funds, etc.
    console.error('Transaction failed:', err);
  }
}
```

## How it works

The decoder walks the error object recursively looking for hex revert data. Most wallet libraries (ethers, viem, wagmi) embed the revert payload at different depths; the walker checks `data`, `error`, `info`, `cause`, `originalError`, and `response` fields. Once it finds a hex string, it matches the first 4 bytes (the Solidity error selector) against every known Klescrow error signature.

This is a **pure function**. No RPC calls, no chain queries, no gas. You call it after the wallet rejects the transaction.

## Multi-SDK consumers

If your app uses multiple Rake Labs SDKs, chain the decoders:

```ts
import { decodeKlescrowError } from '@rakelabs/klescrow-sdk';
import { decodePaymentError } from '@rakelabs/dpayments-sdk';
import { decodeDisputeError } from '@rakelabs/kleros-proxy-sdk';

const decoded = decodeKlescrowError(err)
            ?? decodePaymentError(err)
            ?? decodeDisputeError(err);
```

The `??` short-circuits; whichever decoder matches first wins. Each SDK only recognizes its own contract errors, so there are no collisions.

## Decoded errors

The error decoder recognizes all custom errors defined in the escrow contract and factory. When a known error is detected, `decoded.error` contains the error name and `decoded.args` contains any associated values.
