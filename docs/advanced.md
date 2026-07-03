# Advanced Guide

This guide is for integrations that need more control than the README happy path: open-party escrows, implementation pinning, direct builders, direct readers, multicall, event indexing, and wallet-library adapters.

## Choose the Right Layer

Most apps should use the facade:

```ts
const klescrow = await Klescrow.fromProvider(provider, walletAddress);
const { tx } = await klescrow.factory.prepareCreateEthEscrow(params);
const escrow = klescrow.escrow('0xESCROW_ADDRESS');
```

Drop lower only when you need a specific reason:

| Layer | Use when |
| --- | --- |
| `Klescrow` facade | You want deployment lookup, prepare helpers, bound escrows, and fewer sharp edges. |
| `KlescrowReader` | You only need chain reads and do not want write helpers. |
| `KlescrowTxBuilder` | You already have all fee/address data and only need calldata encoding. |
| `KlescrowEvents` | You are indexing logs yourself. |

## Explicit Config

Use the constructor when you need a custom factory address, explicit chain, multicall, or pinned implementation.

```ts
import { Klescrow } from '@rakelabs/klescrow-sdk';

const klescrow = new Klescrow({
  chainId: 11155111,
  factoryAddress: '0xFACTORY_ADDRESS',
  provider,
  walletAddress,
  multicall: {
    address: '0xcA11bde05977b3631167028862bE2a173976CA11',
  },
});
```

`fromProvider()` is better for normal app flows. The constructor is better for infrastructure, tests, custom deployments, and indexed backends.

## Open-Party Escrows

Set `buyerAddress` or `sellerAddress` to `null` to leave that role open. The deployed escrow can then be joined by the missing party before funding.

```ts
const { tx, escrowId } = await klescrow.factory.prepareCreateEthEscrow({
  netAmount: 1_000_000_000_000_000_000n,
  buyerAddress,
  sellerAddress: null,
  obligationDeadlineUnixSec: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
  settlementDeadlineUnixSec: 0n,
  termsHash: klescrow.termsHashFromUri('ipfs://QmTerms'),
});

await signer.sendTransaction({
  to: tx.to,
  data: tx.data,
  value: BigInt(tx.value),
});
```

Later, the seller joins:

```ts
const escrow = klescrow.escrow('0xESCROW_ADDRESS');
const joinTx = escrow.joinAsSeller();

await sellerSigner.sendTransaction({
  to: joinTx.to,
  data: joinTx.data,
  value: BigInt(joinTx.value),
});
```

Rules of thumb:

- `buyerAddress: null` creates an invoice-like flow where a buyer can join later.
- `sellerAddress: null` lets a seller accept an escrow later.
- `join()` lets the contract infer the open role.
- `joinAsBuyer()` and `joinAsSeller()` are clearer in UI code.

## Implementation Pinning

Factories can register multiple escrow implementations. By default, the SDK uses the factory default. Pin an implementation when you need deterministic behavior across a rollout.

```ts
const impls = await klescrow.factory.listImplementations();

const pinned = new Klescrow({
  chainId: 11155111,
  factoryAddress: '0xFACTORY_ADDRESS',
  provider,
  walletAddress,
  impl: impls[0],
});
```

You can also resolve by name or address through `fromProvider()`:

```ts
const klescrow = await Klescrow.fromProvider(
  provider,
  walletAddress,
  'Klescrow Single-Party',
);
```

Pinning affects create and predict calls. Existing escrow handles are bound to a deployed clone address and do not need implementation selection.

## ERC20 Creation Sequence

Use `prepareCreateErc20Escrow()` unless you have a reason to manually quote, predict, approve, and create.

```ts
const {
  approveTx,
  createTx,
  escrowId,
  predictedAddress,
  gross,
} = await klescrow.factory.prepareCreateErc20Escrow({
  tokenAddress: '0xTOKEN_ADDRESS',
  netAmount: 1_000_000n,
  buyerAddress,
  sellerAddress,
  obligationDeadlineUnixSec: deadline,
  settlementDeadlineUnixSec: 0n,
  termsHash,
});

await signer.sendTransaction({
  to: approveTx.to,
  data: approveTx.data,
  value: BigInt(approveTx.value),
});

await signer.sendTransaction({
  to: createTx.to,
  data: createTx.data,
  value: BigInt(createTx.value),
});
```

The ERC20 approval spender is the predicted escrow clone, not the factory.

## Multicall Reads

`escrow.read()` and `factory.readConfig()` perform several chain reads. Add Multicall3 to batch those reads into one RPC call.

```ts
const klescrow = new Klescrow({
  chainId: 1,
  factoryAddress: '0xFACTORY_ADDRESS',
  provider,
  walletAddress,
  multicall: {
    address: '0xcA11bde05977b3631167028862bE2a173976CA11',
  },
});

const info = await klescrow.escrow('0xESCROW_ADDRESS').read();
```

Only configure multicall for chains where the address is deployed.

## Direct Transaction Builder

`KlescrowTxBuilder` is stateless. It does not quote fees, predict addresses, resolve deployments, or read chain state.

```ts
import { KlescrowTxBuilder, IdGenerator } from '@rakelabs/klescrow-sdk';

const builder = new KlescrowTxBuilder();
const cfg = { chainId: 11155111, factoryAddress: '0xFACTORY_ADDRESS' };

const tx = builder.createEthEscrow(cfg, {
  callerWallet: walletAddress,
  escrowId: IdGenerator.generateOnChainIdHex(),
  buyerAddress: walletAddress,
  sellerAddress: '0xSELLER_ADDRESS',
  amount: 1_000_000n,
  fee: 25_000n,
  obligationDeadlineUnixSec: BigInt(Math.floor(Date.now() / 1000) + 86400),
  settlementDeadlineUnixSec: 0n,
  termsHash: KlescrowTxBuilder.termsHashFromUri('ipfs://QmTerms'),
});
```

Use direct builders in backends, transaction simulators, tests, and account-abstraction flows where another system supplies the chain-derived values.

## Direct Reader

```ts
import { JsonRpcProvider } from 'ethers';
import { KlescrowReader } from '@rakelabs/klescrow-sdk';

const reader = new KlescrowReader(new JsonRpcProvider(process.env.RPC_URL));

const factory = await reader.readFactory('0xFACTORY_ADDRESS');
const escrow = await reader.readEscrow('0xESCROW_ADDRESS');
const quote = await reader.quoteGross('0xFACTORY_ADDRESS', 1_000_000n);
```

Use direct readers for indexers, dashboards, monitoring jobs, and services that should never prepare transactions.

## Event Indexing

For app-level history, prefer the facade helpers:

```ts
const created = await klescrow.factory.getLogsByParty('buyer', buyerAddress);
const escrowHistory = await klescrow.escrow('0xESCROW_ADDRESS').getLogs();
const evidence = await klescrow.escrow('0xESCROW_ADDRESS').getEvidence();
```

For custom indexers, decode raw logs:

```ts
import { KlescrowEvents, KlescrowTopics } from '@rakelabs/klescrow-sdk';

const events = new KlescrowEvents();
const logs = await provider.getLogs({
  address: factoryAddress,
  topics: [KlescrowTopics.ESCROW_CREATED],
  fromBlock: 0,
  toBlock: 'latest',
});

for (const log of logs) {
  const decoded = events.tryDecodeEscrowCreated({
    address: log.address,
    topics: log.topics,
    data: log.data,
    transactionHash: log.transactionHash,
  });
  if (decoded) {
    console.log(decoded.escrowId, decoded.escrowAddress);
  }
}
```

## Wallet Library Adapters

`PreparedTx` is wallet-library agnostic.

ethers v6:

```ts
await signer.sendTransaction({
  to: tx.to,
  data: tx.data,
  value: BigInt(tx.value),
});
```

wagmi / viem:

```ts
await sendTransaction(config, {
  to: tx.to as `0x${string}`,
  data: tx.data as `0x${string}`,
  value: BigInt(tx.value),
});
```

Account abstraction:

```ts
await smartAccount.sendUserOperation({
  target: tx.to,
  data: tx.data,
  value: BigInt(tx.value),
});
```

## Pull-Payment Claim

Some resolution paths can leave ETH queued for withdrawal. Check before showing a claim button.

```ts
const balance = await escrow.pendingWithdrawal(walletAddress);
if (balance > 0n) {
  const claimTx = escrow.claim();
  await signer.sendTransaction({
    to: claimTx.to,
    data: claimTx.data,
    value: BigInt(claimTx.value),
  });
}
```
