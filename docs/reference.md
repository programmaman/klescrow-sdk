# Reference

Cheat sheet for every action, type, and common mistake.

## States

```ts
enum EscrowState { UNFUNDED, FUNDED, DISPUTED, RESOLVED, CANCELLED }
enum EscrowIntent { NONE, APPROVE_PAYMENT, APPROVE_REFUND }
```

## Factory actions

| Method | Description | Who signs |
|--------|-------------|:---------:|
| `factory.readConfig()` | Read factory config (fee, arbitrator, etc.). | N/A (read) |
| `factory.quoteGross(net)` | Quote gross = net + fee. | N/A (read) |
| `factory.prepareCreateEthEscrow(params)` | Quote fee + build create tx in one call. | Creator |
| `factory.prepareCreateErc20Escrow(params)` | Quote fee + build approve + create txs. | Creator |
| `factory.createEthEscrow(params)` | Build create tx only (you supply fee). | Creator |
| `factory.createErc20Escrow(params)` | Build create tx only (you supply fee). | Creator |
| `factory.erc20Approve(params)` | Build ERC20 approve tx. | Buyer |
| `factory.getLogsByParty(role, address)` | Query factory events by party. | N/A (read) |

### Create params

```ts
{
  escrowId:                    string;   // bytes32 hex (auto-generated if omitted)
  buyerAddress?:               string;   // null = open slot
  sellerAddress?:              string;   // null = open slot
  tokenAddress?:               string;   // ERC20 only
  amount:                      bigint;   // NET seller amount
  fee:                         bigint;   // protocol fee
  obligationDeadlineUnixSec:   bigint;   // absolute Unix timestamp
  settlementDeadlineUnixSec:   bigint;   // 0 = same as obligation
  termsHash:                   string;   // keccak256 of terms URI
}
```

## Escrow reads

| Method | Returns |
|--------|---------|
| `escrow.read()` | `EscrowInfo`, all on-chain state |
| `escrow.arbitrationCost()` | `bigint`, current Kleros arbitration fee in wei |
| `escrow.appealCost()` | `bigint`, current appeal fee (DISPUTED only) |
| `escrow.appealPeriod()` | `{ start, end }`, appeal window (DISPUTED only) |
| `escrow.pendingWithdrawal(address)` | `bigint`, ETH queued for pull-payment fallback |
| `escrow.getEvidence(fromBlock, toBlock)` | `EscrowEvidenceEvent[]`, evidence log history |
| `escrow.getLogs()` | `EscrowEvent[]`, all escrow events |

### EscrowInfo fields

```ts
{
  escrowAddress:             string;       // this clone's address
  state:                     EscrowState;
  buyer:                     string;       // may be 0x0 in invoice mode
  seller:                    string;
  creator:                   string;
  token:                     string;       // 0x0 = ETH
  amount:                    bigint;       // NET (seller receives this)
  fee:                       bigint;       // platform fee
  obligationDeadline:        bigint;       // Unix sec
  settlementDeadline:        bigint;       // Unix sec
  termsHash:                 string;       // bytes32 hex
  disputeId:                 bigint;
  buyerIntent:               EscrowIntent;
  sellerIntent:              EscrowIntent;
  proposedObligationDeadline: bigint;
  arbitratorAddress:         string;
  arbitratorConfiguration:   string;       // raw hex
}
```

## Escrow writes

| Method | Description |
|--------|-------------|
| `escrow.prepareDeposit()` | Read gross from chain + build deposit tx. |
| `escrow.deposit(ethValue)` | Build deposit tx (you supply amount). |
| `escrow.approvePayment()` | Build approve payment tx. |
| `escrow.approveRefund()` | Build approve refund tx. |
| `escrow.cancel()` | Build cancel tx. |
| `escrow.join()` | Build join tx. |
| `escrow.joinAsBuyer()` | Build join-as-buyer tx. |
| `escrow.joinAsSeller()` | Build join-as-seller tx. |
| `escrow.leave()` | Build leave tx. |
| `escrow.removeParty(address)` | Build remove-party tx. |
| `escrow.claim()` | Build claim tx. |
| `escrow.extendExpiry(ts)` | Build extend-expiry tx. |
| `escrow.updateTermsHash(hash)` | Build update-terms-hash tx. |

## Dispute writes

| Method | Description |
|--------|-------------|
| `escrow.prepareRaiseDispute()` | Fetch arb fee + build dispute tx. |
| `escrow.raiseDispute(arbFeeWei)` | Build dispute tx (you supply fee). |
| `escrow.submitEvidence(uri)` | Build evidence submission tx. |
| `escrow.prepareAppeal(extraData)` | Fetch appeal fee + window + build tx. |
| `escrow.appeal(extraData, fee)` | Build appeal tx (you supply fee). |

## PreparedTx

Every write method returns an unsigned transaction. You hand it to the wallet.

```ts
interface PreparedTx {
  to:          string;   // contract address
  data:        string;   // ABI-encoded function call
  value:       string;   // ETH to send (convert to BigInt!)
  chainId:     number;
  signerHint?: string;   // "buyer", "seller", "either party"
}
```

### Sending it

```ts
const tx = escrow.deposit(gross);

// ethers v6
await signer.sendTransaction({
  to:    tx.to,
  data:  tx.data,
  value: BigInt(tx.value),
});

// wagmi / viem
await sendTransaction({
  to:    tx.to   as `0x${string}`,
  data:  tx.data as `0x${string}`,
  value: BigInt(tx.value),
});
```

## Common mistakes

### ❌ Not converting `tx.value` to BigInt

`PreparedTx.value` is a **decimal string**. ethers v6 requires `bigint`.

```ts
await signer.sendTransaction({ ...tx, value: BigInt(tx.value) }); // correct
```

### ❌ Calling `appealCost()` / `appealPeriod()` outside DISPUTED

These revert on-chain if the escrow is not DISPUTED. Check state first.

### ❌ ERC20: approving the factory instead of the clone

Token approval must go to the **escrow clone address**, not the factory. `prepareCreateErc20Escrow` handles this automatically.

### ❌ Thinking `approvePayment` works with one party

`approvePayment()` requires **both** buyer and seller. Neither can unilaterally release payment.

### ❌ `extendExpiry` with one party

Both must call with the **exact same** timestamp value.
