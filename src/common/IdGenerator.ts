/**
 * A globally distributed unique ID generator.
 * Provides a golden path to avoid collision and manual generation mistakes across the frontend and backend.
 *
 * Uses the Web Crypto API (`globalThis.crypto`) which is available in Node 18+, all modern browsers,
 * and Cloudflare Workers — no Node-specific imports needed.
 */
export class IdGenerator {
    private static readonly BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    /**
     * Generates a globally unique ID formatted for on-chain usage (32 bytes as a hex string).
     * Useful for smart contract `bytes32` slots.
     */
    public static generateOnChainIdHex(): string {
        const bytes = new Uint8Array(32);
        globalThis.crypto.getRandomValues(bytes);
        return '0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Generates a globally unique ID formatted for on-chain usage (32 byte buffer).
     */
    public static generateOnChainIdBytes(): Uint8Array {
        const bytes = new Uint8Array(32);
        globalThis.crypto.getRandomValues(bytes);
        return bytes;
    }

    /**
     * Generates an easy-to-read Base62 ID for URLs or UI systems.
     * @param prefix An optional prefix (e.g., 'pay_')
     * @param length The length of the random portion (default 16)
     */
    public static generateFriendlyId(prefix: string = "", length: number = 16): string {
        const bytes = new Uint8Array(length);
        globalThis.crypto.getRandomValues(bytes);
        let result = prefix;
        for (let i = 0; i < length; i++) {
            result += IdGenerator.BASE62[bytes[i] % IdGenerator.BASE62.length];
        }
        return result;
    }
}
