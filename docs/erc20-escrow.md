# ERC20 Token Escrow

Use this guide when an escrow is funded with an ERC20 token such as USDC, DAI, or a marketplace token instead of native ETH.

The important difference from ETH is the approval sequence:

1. The SDK predicts the escrow clone address.
2. The buyer approves that predicted clone to pull the token amount.
3. The buyer creates the escrow.
4. The buyer deposits tokens into the escrow.

The approval spender is the escrow clone, not the factory.

## Setup

```ts
import { BrowserProvider } from 'ethers';
import { Klescrow, KlescrowTxBuilder } from '@rakelabs/klescrow-sdk';

const provider = new BrowserProvider(window.ethereum);
await provider.send('eth_requestAccounts', []);

const signer = await provider.getSigner();
const buyerAddress = await signer.getAddress();

const klescrow = await Klescrow.fromProvider(provider, buyerAddress);
```

## Prepare Approval and Creation

```ts
const tokenAddress = '0xTOKEN_ADDRESS';
const sellerAddress = '0xSELLER_ADDRESS';

const oneTokenInBaseUnits = 1_000_000n;
const obligationDeadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400);

const {
  approveTx,
  createTx,
  escrowId,
  predictedAddress,
  gross,
  fee,
} = await klescrow.factory.prepareCreateErc20Escrow({
  tokenAddress,
  netAmount: oneTokenInBaseUnits,
  buyerAddress,
  sellerAddress,
  obligationDeadlineUnixSec: obligationDeadline,
  settlementDeadlineUnixSec: 0n,
  termsHash: KlescrowTxBuilder.termsHashFromUri('https://example.com/orders/123/terms'),
});

console.log({ escrowId, predictedAddress, gross, fee });
console.log(approveTx.preview);
console.log(createTx.preview);
```

`netAmount` is the amount the seller receives. `gross` is `netAmount + protocol fee`; it is the amount approved for transfer.

## Send the Transactions

Send approval first:

```ts
await signer.sendTransaction({
  to: approveTx.to,
  data: approveTx.data,
  value: BigInt(approveTx.value),
});
```

Then create the escrow:

```ts
await signer.sendTransaction({
  to: createTx.to,
  data: createTx.data,
  value: BigInt(createTx.value),
});
```

After creation, bind the predicted escrow address and deposit:

```ts
const escrow = klescrow.escrow(predictedAddress);
const { tx: depositTx } = await escrow.prepareDeposit();

await signer.sendTransaction({
  to: depositTx.to,
  data: depositTx.data,
  value: BigInt(depositTx.value),
});
```

For ERC20 deposits, `depositTx.value` is `0`; the token movement happens through the token allowance.

## Resolve or Dispute

Happy-path release is the same as ETH:

```ts
const approvePaymentTx = escrow.approvePayment();
await signer.sendTransaction({
  to: approvePaymentTx.to,
  data: approvePaymentTx.data,
  value: BigInt(approvePaymentTx.value),
});
```

If the parties disagree, raise a dispute:

```ts
const { tx: disputeTx } = await escrow.prepareRaiseDispute();
await signer.sendTransaction({
  to: disputeTx.to,
  data: disputeTx.data,
  value: BigInt(disputeTx.value),
});
```

## Deadline Fields

| Field | Meaning |
| --- | --- |
| `obligationDeadlineUnixSec` | Absolute Unix timestamp for the seller obligation deadline. |
| `settlementDeadlineUnixSec` | Absolute Unix timestamp for settlement after deposit, or `0n` when no separate settlement deadline is needed. |

Use Unix seconds, not JavaScript milliseconds.

## ETH vs ERC20

| ETH escrow | ERC20 escrow |
| --- | --- |
| Use `prepareCreateEthEscrow()` | Use `prepareCreateErc20Escrow()` |
| No token approval | Send `approveTx` first |
| Native ETH value can appear in transaction `value` | Token amount moves through ERC20 allowance |
| Escrow address can be read from logs | Escrow address is predicted before creation |
| `depositTx.value` is the ETH gross amount | `depositTx.value` is `0` |

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Approving the factory address. | Approve `predictedAddress`, which `prepareCreateErc20Escrow()` already does. |
| Passing token display units. | Pass base units, such as `1_000_000n` for 1 USDC with 6 decimals. |
| Sending create before approval. | Send `approveTx`, wait for it to land, then send `createTx`. |
| Using `expiryTimeUnixSec`. | Use `obligationDeadlineUnixSec` and `settlementDeadlineUnixSec`. |
| Forgetting `BigInt(tx.value)`. | Convert the decimal string before passing it to ethers v6. |
