# @rakelabs/klescrow-sdk

**Add on-chain escrow to your product in minutes. No blockchain expertise required.**

## What is this?

Klescrow is a JavaScript / TypeScript library for holding funds safely between two parties using Ethereum smart contracts. Think of it as **a programmable escrow with a built-in dispute option**:

- A **buyer** locks funds into a smart contract.
- A **seller** delivers the goods or services.
- Both parties agree the deal is done, and funds are released.
- If there's a disagreement, **Kleros**, a decentralized arbitration protocol, decides the outcome.

> **This library never touches your users' money.** It prepares unsigned transactions. Your app hands them to the user's wallet (MetaMask, WalletConnect). The user signs and submits. Your server never holds private keys.

```
Your app  ──→  klescrow SDK  ──→  unsigned transaction  ──→  User's wallet  ──→  Blockchain
              (prepares it)        (just instructions)         (signs it)         (executes it)
```

## Installation

```bash
npm install @rakelabs/klescrow-sdk ethers
```

> Requires **ethers v6**. ethers v5 is not compatible.

## Escrow lifecycle

The lifecycle mirrors a typical digital escrow: create, fund, resolve or dispute.

## Quick start

```ts
import { Klescrow } from '@rakelabs/klescrow-sdk';
import { BrowserProvider } from 'ethers';

const provider    = new BrowserProvider(window.ethereum);
await provider.send('eth_requestAccounts', []);
const signer      = await provider.getSigner();
const myAddress   = await signer.getAddress();

// One line. Chain and factory address are auto-detected.
const klescrow = await Klescrow.fromProvider(provider, myAddress);
```

## Happy path: ETH escrow in 4 steps

```ts
import { Klescrow, KlescrowTxBuilder } from '@rakelabs/klescrow-sdk';
import { BrowserProvider } from 'ethers';

// ─── Setup ────────────────────────────────────────────────────────────────────

const provider    = new BrowserProvider(window.ethereum);
await provider.send('eth_requestAccounts', []);
const signer      = await provider.getSigner();
const buyerWallet = await signer.getAddress();

const klescrow = await Klescrow.fromProvider(provider, buyerWallet);

const sellerAddress = '0xSELLER_WALLET_ADDRESS';

// ─── Step 1: Create the escrow ───────────────────────────────────────────────

const oneEthInWei = 1_000_000_000_000_000_000n;

const { tx: createTx, escrowId } = await klescrow.factory.prepareCreateEthEscrow({
  netAmount:         oneEthInWei,
  sellerAddress,
  expiryTimeUnixSec: BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
  termsHash:         KlescrowTxBuilder.termsHashFromUri('https://yoursite.com/terms/order-123'),
});

await signer.sendTransaction({ ...createTx, value: BigInt(createTx.value) });
// → Escrow contract deployed on-chain.

// ─── Step 2: Find the deployed escrow ────────────────────────────────────────

const logs   = await klescrow.factory.getLogsByParty('buyer', buyerWallet);
const addr   = logs.find(e => e.escrowId === escrowId)!.escrowAddress;
const escrow = klescrow.escrow(addr);

// ─── Step 3: Deposit ─────────────────────────────────────────────────────────

const { tx: depositTx } = await escrow.prepareDeposit();

await signer.sendTransaction({ ...depositTx, value: BigInt(depositTx.value) });
// → Funds locked.

// ─── Step 4: Resolve ─────────────────────────────────────────────────────────

// Seller approves on their device:
//   await sellerSigner.sendTransaction(escrow.approvePayment());

// Buyer approves on their device:
await signer.sendTransaction(escrow.approvePayment());
// → Resolved.
```

> **ERC20 tokens?** The flow is the same: call `prepareCreateErc20Escrow`, approve the token, create, deposit. See [docs/erc20-escrow.md](docs/erc20-escrow.md).

## Disputes

When the parties can't agree, either one can raise a Kleros dispute, where a decentralized court of jurors votes on the outcome.

```ts
const escrow = klescrow.escrow('0xESCROW_ADDRESS');

// Raise a dispute. prepareRaiseDispute() fetches the arb fee from the chain.
const { tx: disputeTx } = await escrow.prepareRaiseDispute();
await signer.sendTransaction({ ...disputeTx, value: BigInt(disputeTx.value) });
// → State: DISPUTED

// Both parties submit evidence. IPFS links are recommended.
await signer.sendTransaction(escrow.submitEvidence('ipfs://QmYourEvidenceDoc'));
```

> Appeals, ruling flow, and the complete dispute lifecycle are in [docs/disputes.md](docs/disputes.md).

## Decoding revert errors

When a transaction reverts on-chain, MetaMask shows a raw hex code. `decodeKlescrowError` turns it into a readable error name.

```ts
import { decodeKlescrowError } from '@rakelabs/klescrow-sdk';

try {
  await signer.sendTransaction({ ...tx, value: BigInt(tx.value) });
} catch (err) {
  const decoded = decodeKlescrowError(err);

  if (decoded && 'error' in decoded) {
    // "InvalidState", "NotParty", "EscrowAlreadyExists" …
    showToast(`Transaction reverted: ${decoded.error}`);
    console.log('Args:', decoded.args); // { sent: 100n, expectedMin: 200n }
  } else if (decoded && 'raw' in decoded) {
    // Unrecognized revert: surface the hex
    console.warn('Unknown revert:', decoded.raw);
  }
  // decoded === null → not a contract revert (network error, user rejected, etc.)
}
```

Full reference: [docs/error-decoder.md](docs/error-decoder.md).

## Further reading

| Doc | Content |
|-----|---------|
| [docs/erc20-escrow.md](docs/erc20-escrow.md) | USDC / DAI / ERC20 token walkthrough |
| [docs/disputes.md](docs/disputes.md) | Raising disputes, submitting evidence, appeals |
| [docs/error-decoder.md](docs/error-decoder.md) | `decodeKlescrowError` reference and all error types |
| [docs/reference.md](docs/reference.md) | Every action, error, and common mistake in one place |
| [docs/advanced.md](docs/advanced.md) | Open escrows, multicall, wagmi/viem, implementation selection |

---

## Smart Contract Disclosure

**This software instantiates autonomous, immutable contracts. The author has zero administrative control or upgrade authority post-deployment. Users interact with this software entirely at their own risk.**