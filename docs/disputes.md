# Disputes & Appeals

When the buyer and seller can't agree, either party can raise a Kleros dispute. Kleros is a decentralized arbitration protocol: jurors review the evidence and vote on an outcome. The result is automatically enforced by the escrow contract.

## Raising a dispute

```ts
const escrow = klescrow.escrow('0xESCROW_ADDRESS');

// prepareRaiseDispute() fetches the current arbitration fee from the chain.
// The fee is paid in ETH and goes to the Kleros court.
const { tx: disputeTx, arbFeeWei } = await escrow.prepareRaiseDispute();

// Either the buyer or seller signs and sends.
await signer.sendTransaction({ ...disputeTx, value: BigInt(disputeTx.value) });
// → State: DISPUTED. Kleros jurors will now review the case.
```

> Only the buyer or seller can raise a dispute on a funded escrow.

## Submitting evidence

Evidence is submitted as an ERC-1497 URI, a link to a document containing the party's arguments and supporting materials. IPFS links are recommended for immutability.

```ts
// Buyer submits evidence:
await signer.sendTransaction(
  escrow.submitEvidence('ipfs://QmYourEvidenceDocument')
);

// Seller submits on their device:
await sellerSigner.sendTransaction(
  escrow.submitEvidence('ipfs://QmSellerEvidenceDocument')
);
```

> The escrow must be in the **DISPUTED** state. Only the buyer or seller can submit; the contract enforces this.

### Using the evidence SDK

`submitEvidence` takes a raw URI, but you typically want a properly structured ERC-1497 evidence document. The `@rakelabs/evidence-sdk` handles document creation, file attachments, and publishing to IPFS or Pinata. Use it to produce the URI, then pass it to `submitEvidence`:

```ts
import { createEvidencePublisher } from '@rakelabs/evidence-sdk';

const publisher = await createEvidencePublisher({ /* helia / pinata config */ });

const { uri } = await publisher.publish({
  name: 'Seller Evidence - Order #123',
  description: 'Screenshots of delivered work and chat logs.',
  fileUris: [], // optional attachments
});

await signer.sendTransaction(escrow.submitEvidence(uri));
```

## Rulings

After jurors vote, the Kleros arbitrator calls `rule()` on the escrow contract. The ruling is a number from 0–5:

All rulings are automatically enforced on-chain. In the case of technical errors or a "Refuse to Arbitrate" ruling, the parties can appeal, or decide to settle the dispute themselves.

## Appeals

Either party can appeal a ruling during the appeal window. Appeals go back to the Kleros court for a new round of voting.

```ts
// prepareAppeal fetches the current fee and appeal window from the chain.
const { tx: appealTx, appealFeeWei, appealPeriod } = await escrow.prepareAppeal('0x');

// Check if the appeal window is open:
const now = BigInt(Math.floor(Date.now() / 1000));
if (appealPeriod.end > 0n && now >= appealPeriod.start && now < appealPeriod.end) {
  await signer.sendTransaction({ ...appealTx, value: BigInt(appealTx.value) });
}
```

> `appealCost()` and `appealPeriod()` revert if the escrow is not in **DISPUTED** state. Check `info.state === EscrowState.DISPUTED` before calling them.

## Reading dispute state

```ts
const info = await escrow.read();

if (info.state === EscrowState.DISPUTED) {
  console.log('Dispute ID:', info.disputeId);
  console.log('Arbitration cost:', await escrow.arbitrationCost());
  console.log('Appeal cost:',     await escrow.appealCost());
  console.log('Appeal period:',   await escrow.appealPeriod());
}
```

## Reading evidence history

Evidence is emitted as on-chain events only; URIs are not stored in contract storage. Reconstruct the history from logs:

```ts
const events = await escrow.getEvidence(0, 'latest');

for (const e of events) {
  console.log(`Party ${e.party} submitted: ${e.evidence}`);
}
```