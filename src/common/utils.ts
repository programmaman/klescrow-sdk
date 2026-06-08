import { getAddress } from 'ethers';

/**
 * Validates that a string is a structurally valid 20-byte Ethereum address,
 * then returns the EIP-55 checksummed form.
 *
 * @throws Error if the address is blank or not a valid 20-byte hex address
 */
export function requireAddress(addr: string | null | undefined, name: string): string {
    if (!addr || addr.trim() === '') {
        throw new Error(`${name} must not be blank`);
    }
    const stripped = addr.startsWith('0x') || addr.startsWith('0X') ? addr.slice(2) : addr;
    if (stripped.length !== 40 || !/^[0-9a-fA-F]{40}$/.test(stripped)) {
        throw new Error(`${name} is not a valid 20-byte Ethereum address: ${addr}`);
    }
    return getAddress(addr);
}

/**
 * Converts a UUID string (e.g. "550e8400-e29b-41d4-a716-446655440000") to a
 * 0x-prefixed 32-byte hex string, matching the Java UuidBytes.uuidToBytes32Hex() convention:
 * the 16 UUID bytes are written at positions 0-15, positions 16-31 are zero.
 *
 * @throws Error if the input is not a valid UUID string
 */
export function uuidToBytes32Hex(uuid: string): string {
    const hex = uuid.replace(/-/g, '');
    if (hex.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(hex)) {
        throw new Error(`Not a valid UUID (after stripping dashes must be 32 hex chars): ${uuid}`);
    }
    // 16 UUID bytes, left-justified in a 32-byte slot (trailing zero-padding)
    return '0x' + hex + '0'.repeat(32);
}

/**
 * Converts a 0x-prefixed 32-byte hex string back to a UUID string.
 * Inverse of uuidToBytes32Hex().
 *
 * @throws Error if the input is not a valid 32-byte hex string
 */
export function bytes32HexToUuid(bytes32Hex: string): string {
    const hex = bytes32Hex.startsWith('0x') || bytes32Hex.startsWith('0X')
        ? bytes32Hex.slice(2)
        : bytes32Hex;
    if (hex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
        throw new Error(`Not a valid bytes32 hex (must be 64 hex chars after 0x): ${bytes32Hex}`);
    }
    const u = hex.slice(0, 32);
    return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20, 32)}`;
}
