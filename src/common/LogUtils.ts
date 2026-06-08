/**
 * Minimal EVM log shape accepted by all SDK event decoders.
 * Structurally compatible with ethers Log, viem Log, and any custom provider response
 * as long as these four fields are present.
 */
export interface EvmLog {
    address: string;
    topics: readonly string[];
    data: string;
    transactionHash?: string;
}

// ─── Topic helpers ────────────────────────────────────────────────────────────

/**
 * Returns true if the log's topic[0] matches the given event topic0 hash.
 * Comparison is case-insensitive so 0x-prefixed lowercase and checksummed
 * variants all match.
 */
export function matchesTopic(log: EvmLog, topic0: string): boolean {
    return log.topics.length > 0 &&
        log.topics[0].toLowerCase() === topic0.toLowerCase();
}

/**
 * Decodes a raw indexed address topic (32 bytes, left-padded with zeros)
 * into a plain 20-byte 0x-prefixed hex address string.
 *
 * Use this instead of direct topic slicing to avoid off-by-one errors.
 */
export function decodeIndexedAddress(topic: string): string {
    const hex = stripHex(topic);
    if (hex.length !== 64) throw new Error('indexed address topic must be 32 bytes');
    return '0x' + hex.slice(24); // last 20 bytes
}

/**
 * Decodes a raw indexed bytes32 topic into a 0x-prefixed 32-byte hex string.
 * Useful for escrowId / paymentId / disputeId indexed fields.
 */
export function decodeIndexedBytes32(topic: string): string {
    const hex = stripHex(topic);
    if (hex.length !== 64) throw new Error('indexed bytes32 topic must be 32 bytes');
    return '0x' + hex;
}

/**
 * Decodes a raw indexed uint256 topic into a bigint.
 */
export function decodeIndexedUint256(topic: string): bigint {
    const hex = stripHex(topic);
    if (hex.length !== 64) throw new Error('indexed uint256 topic must be 32 bytes');
    return BigInt('0x' + hex);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function stripHex(value: string): string {
    return value.startsWith('0x') || value.startsWith('0X')
        ? value.slice(2).toLowerCase()
        : value.toLowerCase();
}
