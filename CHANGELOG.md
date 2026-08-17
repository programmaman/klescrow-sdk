# Changelog

All notable public changes to `@rakelabs/klescrow-sdk` are documented here.

## Unreleased

## 0.2.0

### Breaking

- Replaced the generic RPC request boundary with explicit `call`, `getLogs`, `getChainId`, and `getBlock` operations.

### Changed

- Updated escrow reads, event queries, and multicall flows to use the explicit RPC operations.
- Kept provider-specific transaction submission and revert handling in the integration adapters.

## 0.1.4

### Added

- Added convenient individual read methods for escrow status, parties, terms, disputes, and arbitration information.

### Changed

- Improved access to escrow information through the bound escrow and reader APIs.

### Maintenance

- Added automated release validation and npm provenance publishing.

## 0.1.3

- Initial public npm release of the Klescrow escrow workflow SDK.
