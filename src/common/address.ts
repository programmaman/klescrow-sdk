import { keccak_256 } from '@noble/hashes/sha3.js';

export function checksumAddress(value: string): string {
    const hex = value.replace(/^0x/i, '').toLowerCase();
    const hash = Array.from(keccak_256(new TextEncoder().encode(hex)))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
    return `0x${Array.from(hex, (char, index) =>
        Number.parseInt(hash[index], 16) >= 8 ? char.toUpperCase() : char).join('')}`;
}
