# ERC20 Token Escrow

Use this when the escrow is funded with a token like USDC or DAI instead of ETH.

## Setup

Same as the [ETH walkthrough](../README.md#happy-path-eth-escrow-in-4-steps). Create the provider, signer, and `Klescrow` instance:

```ts
import { Klescrow, KlescrowTxBuilder } from '@rakelabs/klescrow-sdk';
import { BrowserProvider } from 'ethers';

const provider    = new BrowserProvider(window.ethereum);
await provider.send('eth_requestAccounts', []);
const signer      = await provider.getSigner();
const buyerWallet = await signer.getAddress();

const klescrow    = await Klescrow.fromProvider(provider, buyerWallet);
const sellerAddr  = '0xSELLER_WALLET_ADDRESS';
```

## Walkthrough

```ts
const usdcAddress    = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on mainnet
const oneUsdcInUnits = 1_000_000n; // USDC has 6 decimals, so 1 USDC = 1,000,000

// ─── Step 1: Prepare create ──────────────────────────────────────────────────

const { approveTx, createTx, escrowId, predictedAddress } =
  await klescrow.factory.prepareCreateErc20Escrow({
    tokenAddress:      usdcAddress,
    netAmount:         oneUsdcInUnits,
    buyerAddress:      buyerWallet,
    sellerAddress:     sellerAddr,
    expiryTimeUnixSec: BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
    termsHash:         KlescrowTxBuilder.termsHashFromUri('https://yoursite.com/terms/order-123'),
  });

// ─── Step 2: Approve the token spend ─────────────────────────────────────────

await signer.sendTransaction({ ...approveTx, value: BigInt(approveTx.value) });

// ─── Step 3: Create the escrow contract ──────────────────────────────────────

await signer.sendTransaction({ ...createTx, value: BigInt(createTx.value) });
// → Contract deployed at predictedAddress.

// ─── Step 4: Deposit ─────────────────────────────────────────────────────────

const escrow           = klescrow.escrow(predictedAddress);
const { tx: depositTx } = await escrow.prepareDeposit();

await signer.sendTransaction({ ...depositTx, value: BigInt(depositTx.value) });
// → Funds locked.

// ─── Step 5: Resolve ─────────────────────────────────────────────────────────

//   await sellerSigner.sendTransaction(escrow.approvePayment());
//   await signer.sendTransaction(escrow.approvePayment());
// → Resolved.
```

## Key differences from ETH

| ETH escrow | ERC20 escrow |
|---|---|
| `createEthEscrow` / `prepareCreateEthEscrow` | `createErc20Escrow` / `prepareCreateErc20Escrow` |
| No approve step | Token approve step first |
| Deposit value is gross amount | Deposit value is zero |
| Escrow address found from logs | Escrow address predicted before creation |
