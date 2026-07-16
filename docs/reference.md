# API Reference

Compact reference for the public Klescrow npm surface.

## Main Exports

```ts
import {
  Klescrow,
  KlescrowTxBuilder,
  KlescrowEvents,
  KlescrowTopics,
  decodeKlescrowError,
  EscrowState,
  EscrowIntent,
  IdGenerator,
} from '@rakelabs/klescrow-sdk';
```

## State Enums

```ts
enum EscrowState {
  UNFUNDED = 0,
  FUNDED = 1,
  DISPUTED = 2,
  RESOLVED = 3,
  CANCELLED = 4,
}

enum EscrowIntent {
  NONE = 0,
  APPROVE_PAYMENT = 1,
  APPROVE_REFUND = 2,
}
```

## Top-Level SDK

| Method | Purpose |
| --- | --- |
| `Klescrow.fromProvider(provider, walletAddress?, implNameOrAddress?)` | Detect chain and default factory from provider. |
| `Klescrow.forChain(chainId, provider, walletAddress?, impl?)` | Use the canonical factory address for a specific chain ID. |
| `new Klescrow(config)` | Use explicit factory, chain, multicall, and implementation config. |
| `klescrow.escrow(address)` | Return a bound escrow handle. No network call. |
| `klescrow.termsHashFromUri(uri)` | Hash a terms URI into the bytes32 value expected on-chain. |

## SDK Config

```ts
interface KlescrowSdkConfig {
  chainId: number;
  factoryAddress: string;
  provider: AbstractProvider;
  walletAddress?: string;
  multicall?: { address: string };
  impl?: { address: string; name: string };
}
```

## Factory Reads

| Method | Returns |
| --- | --- |
| `factory.readConfig()` | `FactoryInfo` |
| `factory.quoteGross(net)` | `{ gross, fee }` |
| `factory.feeBps()` | `bigint` |
| `factory.implementationCount()` | `number` |
| `factory.implementationAt(index)` | `{ address, name }` |
| `factory.listImplementations()` | `{ address, name }[]` |
| `factory.predictAddress(creator, req)` | Predicted clone address |
| `factory.getLogs(from?, to?)` | `EscrowCreatedEvent[]` |
| `factory.getLogsByParty(role, party, from?, to?)` | `EscrowCreatedEvent[]` |
| `factory.getLogsByCreator(creator, from?, to?)` | `EscrowCreatedEvent[]` |

## Factory Writes

Prefer prepare helpers for app code.

| Method | Description | Who signs |
| --- | --- | --- |
| `factory.prepareCreateEthEscrow(params)` | Quote fee and build ETH create transaction. | Creator |
| `factory.prepareCreateErc20Escrow(params)` | Quote fee, predict clone, build ERC20 approve and create transactions. | Creator |
| `factory.createEthEscrow(params)` | Build ETH create transaction when you already know fee values. | Creator |
| `factory.createErc20Escrow(params)` | Build ERC20 create transaction when you already know fee values. | Creator |
| `factory.erc20Approve(params)` | Build ERC20 approval transaction. | Token owner |

### Prepare Create Params

```ts
interface PrepareCreateParams {
  netAmount: bigint;
  escrowId?: string;
  buyerAddress?: string | null;
  sellerAddress?: string | null;
  obligationDeadlineUnixSec: bigint;
  settlementDeadlineUnixSec: bigint;
  termsHash: string;
}

interface PrepareCreateErc20Params extends PrepareCreateParams {
  tokenAddress: string;
}
```

### Prepare Results

```ts
type PrepareCreateEthResult = {
  tx: PreparedTx;
  escrowId: string;
  gross: bigint;
  fee: bigint;
};

type PrepareCreateErc20Result = {
  approveTx: PreparedTx;
  createTx: PreparedTx;
  escrowId: string;
  gross: bigint;
  fee: bigint;
  predictedAddress: string;
};
```

## Escrow Reads

| Method | Returns |
| --- | --- |
| `escrow.read()` | `EscrowInfo` |
| `escrow.read.state()` | `EscrowState` |
| `escrow.read.buyer()` | Buyer address |
| `escrow.read.seller()` | Seller address |
| `escrow.read.creator()` | Creator address |
| `escrow.read.token()` | Token address |
| `escrow.read.amount()` | Net amount as `bigint` |
| `escrow.read.fee()` | Protocol fee as `bigint` |
| `escrow.read.obligationDeadline()` | Obligation deadline as `bigint` |
| `escrow.read.settlementDeadline()` | Settlement deadline as `bigint` |
| `escrow.read.termsHash()` | Terms hash hex |
| `escrow.read.disputeId()` | Dispute ID as `bigint` |
| `escrow.read.buyerIntent()` | `EscrowIntent` |
| `escrow.read.sellerIntent()` | `EscrowIntent` |
| `escrow.read.proposedObligationDeadline()` | Proposed deadline as `bigint` |
| `escrow.read.arbitrator()` | Arbitrator address |
| `escrow.read.arbitratorConfiguration()` | Arbitrator configuration hex |
| `escrow.read.arbitrationCost()` | Current Kleros arbitration fee |
| `escrow.read.appealCost()` | Current appeal fee |
| `escrow.read.appealPeriod()` | `{ start, end }` |
| `escrow.read.pendingWithdrawal(wallet)` | Claimable ETH balance |
| `escrow.arbitrationCost()` | Current Kleros arbitration fee |
| `escrow.appealCost()` | Current appeal fee |
| `escrow.appealPeriod()` | `{ start, end }` |
| `escrow.pendingWithdrawal(address)` | Claimable ETH balance |
| `escrow.getEvidence(from?, to?)` | Evidence events |
| `escrow.getLogs(from?, to?)` | Decoded escrow events |

## Escrow Writes

| Method | Description |
| --- | --- |
| `escrow.prepareDeposit()` | Read escrow amount and build deposit transaction. |
| `escrow.deposit(ethValue)` | Build deposit transaction with caller-supplied ETH value. |
| `escrow.approvePayment()` | Signal intent to release funds to seller. |
| `escrow.approveRefund()` | Signal intent to refund buyer. |
| `escrow.cancel()` | Cancel when allowed by contract state. |
| `escrow.join()` | Join an open role. |
| `escrow.joinAsBuyer()` | Join explicitly as buyer. |
| `escrow.joinAsSeller()` | Join explicitly as seller. |
| `escrow.leave()` | Leave before funding when allowed. |
| `escrow.removeParty(address)` | Remove a party when allowed. |
| `escrow.claim()` | Claim queued ETH withdrawal. |
| `escrow.extendExpiry(timestamp)` | Propose or confirm a new obligation deadline. |
| `escrow.updateTermsHash(hash)` | Update terms hash when allowed. |
| `escrow.prepareRaiseDispute()` | Read arbitration fee and build dispute transaction. |
| `escrow.raiseDispute(arbFeeWei)` | Build dispute transaction with caller-supplied fee. |
| `escrow.submitEvidence(uri)` | Submit an evidence URI. |
| `escrow.prepareAppeal(extraData?)` | Read appeal fee/window and build appeal transaction. |
| `escrow.appeal(extraData, feeWei)` | Build appeal transaction with caller-supplied fee. |

## EscrowInfo

```ts
interface EscrowInfo {
  escrowAddress: string;
  state: EscrowState;
  buyer: string;
  seller: string;
  creator: string;
  token: string;
  amount: bigint;
  fee: bigint;
  obligationDeadline: bigint;
  settlementDeadline: bigint;
  termsHash: string;
  disputeId: bigint;
  buyerIntent: EscrowIntent;
  sellerIntent: EscrowIntent;
  proposedObligationDeadline: bigint;
  arbitratorAddress: string;
  arbitratorConfiguration: string;
}
```

## PreparedTx

Every write method returns an unsigned transaction request.

```ts
interface PreparedTx {
  to: string;
  data: string;
  value: string;
  chainId: number;
  signerHint?: string;
  preview?: SigningPreview;
}
```

Send with ethers v6:

```ts
await signer.sendTransaction({
  to: tx.to,
  data: tx.data,
  value: BigInt(tx.value),
});
```

## Events

Use facade helpers for common app flows. Use `KlescrowEvents` for raw logs.

Factory event:

```ts
type EscrowCreatedEvent = {
  escrowId: string;
  escrowAddress: string;
  creator: string;
  seller: string;
  buyer: string;
  token: string;
  amount: bigint;
  fee: bigint;
  obligationDeadline: bigint;
  settlementDeadline: bigint;
  termsHash: string;
  logAddress: string;
  transactionHash?: string;
};
```

Escrow event union includes:

- `funded`
- `resolved`
- `dispute_raised`
- `cancelled`
- `buyer_approved`
- `seller_approved`
- `expiry_extended`
- `terms_hash_updated`
- `evidence_submitted`
- `buyer_joined`
- `buyer_left`
- `seller_joined`
- `seller_left`
- `expiry_extension_consented`

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Passing `tx.value` directly to ethers v6. | Use `BigInt(tx.value)`. |
| Approving the ERC20 factory instead of the predicted clone. | Use `prepareCreateErc20Escrow()` and send its `approveTx` first. |
| Treating `escrowId` as the contract address. | Store the deployed `escrowAddress` from `EscrowCreated`. |
| Calling appeal reads before a ruling exists. | Check state and `appealPeriod.end > 0n`. |
| Expecting one party to release funds alone. | Both buyer and seller must express the same happy-path intent. |
| Recomputing terms hashes differently across systems. | Use `KlescrowTxBuilder.termsHashFromUri(uri)` consistently. |
