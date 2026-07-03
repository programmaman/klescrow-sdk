# @rakelabs/klescrow-sdk

Add escrow-backed transactions to an ethers v6 app. Klescrow prepares unsigned transactions for escrow creation, deposits, releases, refunds, evidence, disputes, and appeals; your user's wallet still signs and broadcasts every transaction.

The SDK never holds private keys and never takes custody of funds.

```text
Your app -> Klescrow SDK -> unsigned transaction -> user wallet -> blockchain
```

## Install

```bash
npm install @rakelabs/klescrow-sdk ethers
```

Requirements:

- Node.js 20+
- ethers v6
- an EIP-1193 wallet provider, JSON-RPC provider, or compatible ethers provider

## What You Build With It

Use this package when your product needs a buyer and seller to coordinate around locked funds:

- the buyer creates an escrow and locks ETH or ERC20 tokens,
- the seller performs the agreed work,
- both parties approve release or refund,
- either party can raise a Kleros dispute if they cannot agree,
- evidence and appeal transactions can be prepared from the same bound escrow handle.

Every write method returns a `PreparedTx` with a `preview` field. Show that preview before asking a user to sign.

## Quick Start

```ts
import { BrowserProvider, ethers } from 'ethers';
import { Klescrow, KlescrowTxBuilder } from '@rakelabs/klescrow-sdk';

const provider = new BrowserProvider(window.ethereum);
await provider.send('eth_requestAccounts', []);

const signer = await provider.getSigner();
const buyerAddress = await signer.getAddress();

const klescrow = await Klescrow.fromProvider(provider, buyerAddress);

const now = BigInt(Math.floor(Date.now() / 1000));
const { tx: createTx, escrowId } = await klescrow.factory.prepareCreateEthEscrow({
  netAmount: ethers.parseEther('1'),
  sellerAddress: '0xSELLER_ADDRESS',
  obligationDeadlineUnixSec: now + 7n * 24n * 60n * 60n,
  settlementDeadlineUnixSec: 0n,
  termsHash: KlescrowTxBuilder.termsHashFromUri('https://example.com/orders/123/terms'),
});

console.log(createTx.preview);

const createResponse = await signer.sendTransaction({
  to: createTx.to,
  data: createTx.data,
  value: BigInt(createTx.value),
});
await createResponse.wait();

const created = (await klescrow.factory.getLogsByParty('buyer', buyerAddress))
  .find((event) => event.escrowId === escrowId);

if (!created) {
  throw new Error('Escrow creation event was not found');
}

const escrow = klescrow.escrow(created.escrowAddress);

const { tx: depositTx } = await escrow.prepareDeposit();
await signer.sendTransaction({
  to: depositTx.to,
  data: depositTx.data,
  value: BigInt(depositTx.value),
});
```

## Common Flows

### Release Funds

Both parties express agreement by sending their own approval transaction from their own wallet.

```ts
const escrow = klescrow.escrow('0xESCROW_ADDRESS');

const approveTx = escrow.approvePayment();
console.log(approveTx.preview);

await signer.sendTransaction({
  to: approveTx.to,
  data: approveTx.data,
  value: BigInt(approveTx.value),
});
```

### Refund Funds

```ts
const refundTx = escrow.approveRefund();
await signer.sendTransaction({
  to: refundTx.to,
  data: refundTx.data,
  value: BigInt(refundTx.value),
});
```

### Raise a Dispute

`prepareRaiseDispute()` reads the current Kleros arbitration cost and includes it as the transaction value.

```ts
const { tx: disputeTx, arbFeeWei } = await escrow.prepareRaiseDispute();

console.log('Arbitration fee:', arbFeeWei.toString());
console.log(disputeTx.preview);

await signer.sendTransaction({
  to: disputeTx.to,
  data: disputeTx.data,
  value: BigInt(disputeTx.value),
});
```

### Submit Evidence

Evidence is usually an `ipfs://...` URI produced by `@rakelabs/evidence-publisher`.

```ts
const evidenceTx = escrow.submitEvidence('ipfs://QmYourEvidenceDocument');
await signer.sendTransaction({
  to: evidenceTx.to,
  data: evidenceTx.data,
  value: BigInt(evidenceTx.value),
});
```

## ETH vs ERC20

For ETH escrows, the SDK includes the required ETH value in the prepared transaction.

For ERC20 escrows, prepare the ERC20 creation flow with `prepareCreateErc20Escrow(...)`, approve the token allowance as needed, then create and deposit through the escrow contract. See [docs/erc20-escrow.md](docs/erc20-escrow.md).

## Errors

Use `decodeKlescrowError` to turn raw revert data into a readable contract error.

```ts
import { decodeKlescrowError } from '@rakelabs/klescrow-sdk';

try {
  await signer.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value),
  });
} catch (err) {
  const decoded = decodeKlescrowError(err);
  if (decoded && 'error' in decoded) {
    console.error(decoded.error, decoded.args);
  }
}
```

## Documentation

| Document | Use it for |
| --- | --- |
| [docs/reference.md](docs/reference.md) | API reference, types, actions, events, and common mistakes |
| [docs/erc20-escrow.md](docs/erc20-escrow.md) | ERC20 escrow setup and token approval flow |
| [docs/disputes.md](docs/disputes.md) | Dispute, evidence, ruling, and appeal lifecycle |
| [docs/error-decoder.md](docs/error-decoder.md) | Revert decoding details |
| [docs/advanced.md](docs/advanced.md) | Reader, transaction builder, multicall, and implementation selection |
| [docs/on-chain.md](docs/on-chain.md) | Contract-level behavior and event model |

## Safety Notes

- Always show `tx.preview` before requesting a signature.
- Store the escrow contract address after creation; it is the canonical on-chain handle.
- Treat deadlines as Unix seconds.
- Check chain IDs and contract addresses before sending transactions.
- This software interacts with autonomous contracts. Users transact at their own risk.
