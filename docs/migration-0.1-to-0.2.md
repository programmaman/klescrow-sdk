# Migrating from 0.1.x to 0.2.0

Klescrow 0.2.0 does not depend on Ethers or Viem. The SDK receives an
application-owned `RpcClient` and `AbiCodec`; adapters provide those interfaces
for popular libraries.

```bash
npm install @rakelabs/klescrow-sdk @rakelabs/ethers-adapter ethers
# or
npm install @rakelabs/klescrow-sdk @rakelabs/viem-adapter viem
```

Replace provider-based construction with
`Klescrow.fromRpc(rpcClient, { codec, walletAddress })`. Continue using the
wallet or signer in your application to sign and broadcast each `PreparedTx`.

For revert handling, decode raw bytes with the codec or use the selected
adapter's provider-specific error helper for wrapped exceptions.

The 0.1.x documentation remains available in the corresponding Git tags.
