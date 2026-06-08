# Advanced

Power-user features not covered in the happy path.

## Open escrows

Create an escrow without specifying one or both parties. Anyone can fill the open slot.

```ts
// Create with an open seller slot (buyer is known, anyone can be the seller):
const { tx, escrowId } = await klescrow.factory.prepareCreateEthEscrow({
  netAmount:         oneEthInWei,
  buyerAddress:      buyerWallet,
  sellerAddress:     null,    // open; any seller can join
  expiryTimeUnixSec: expiry,
  termsHash:         myTermsHash,
});
await signer.sendTransaction({ ...tx, value: BigInt(tx.value) });

// Later, a seller finds this escrow and joins:
const escrow = klescrow.escrow(escrowAddr);
await sellerSigner.sendTransaction(escrow.joinAsSeller());
// escrow.join() also works; the contract auto-detects the open role.
```

Both slots can be open. The `join()`, `joinAsBuyer()`, and `joinAsSeller()` methods handle filling open roles.

## Alternate implementations

The factory supports multiple escrow implementations. Use `impl` in the SDK config or per-call to pin a specific one.

```ts
const { tx } = await klescrow.factory.prepareCreateEthEscrow({
  impl: '0xSINGLE_PARTY_IMPL_ADDRESS',   // use a specific implementation
  netAmount: oneEthInWei,
  // ...
});
```

List registered implementations:

```ts
const count = await klescrow.factory.implementationCount();
for (let i = 0; i < count; i++) {
  const [addr, name] = await klescrow.factory.implementationAt(i);
  console.log(`${i}: ${name} (${addr})`);
}
```

## Batch reads with Multicall

By default `escrow.read()` makes ~15 RPC calls. Multicall batches them into one.

```ts
const klescrow = new Klescrow({
  chainId:        1,
  factoryAddress: '0xb381fB8e049C00B612fd060527dE0093DA1d6728',
  provider,
  walletAddress,
  multicall: {
    address: '0xcA11bde05977b3631167028862bE2a173976CA11', // works on most EVM chains
  },
});

const info = await escrow.read(); // 1 RPC call instead of ~15
```

> `fromProvider()` does not support multicall. Use the constructor for advanced config.

## Using wagmi / viem

```ts
import { sendTransaction } from 'wagmi/actions';

const tx = escrow.deposit(gross);
await sendTransaction({
  to:    tx.to   as `0x${string}`,
  data:  tx.data as `0x${string}`,
  value: BigInt(tx.value),
});
```

## Pull-payment claim

```ts
const balance = await escrow.pendingWithdrawal(myAddress);
if (balance > 0n) {
  await signer.sendTransaction(escrow.claim());
}
```

## Invoice mode

Create an escrow with `buyerAddress` as `null`. The open-buyer pattern works the same way as the open-seller pattern shown above.
