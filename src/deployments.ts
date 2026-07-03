/** Canonical Klescrow factory address. */
export const MAINNET = '0xb381fB8e049C00B612fd060527dE0093DA1d6728';
export const FACTORY_ADDRESS = MAINNET;

/**
 * Backwards-compatible alias for the canonical factory address.
 */
export const DEFAULT_FACTORY_ADDRESS = FACTORY_ADDRESS;

/**
 * Chain-specific overrides for exceptional deployments.
 *
 * The deployment process is expected to replay the factory to the same address
 * on every chain. Keep this map empty unless a chain is intentionally deployed
 * at a different address.
 */
const CHAIN_FACTORY_OVERRIDES: ReadonlyMap<number, string> = new Map([]);

/**
 * Looks up the factory address for a given chain ID.
 *
 * @returns the chain override when present, otherwise the default replayed address.
 */
export function getFactoryAddress(chainId: number): string | undefined {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
        return undefined;
    }

    return CHAIN_FACTORY_OVERRIDES.get(chainId) ?? FACTORY_ADDRESS;
}

/**
 * Common deployed chains plus any explicit chain overrides.
 *
 * `getFactoryAddress` is intentionally broader than this list.
 */
export function listDeployments(): ReadonlyArray<{ chainId: number; factoryAddress: string }> {
    const common = new Map<number, string>([
        [1, FACTORY_ADDRESS],
        [100, FACTORY_ADDRESS],
        [1337, FACTORY_ADDRESS],
    ]);

    for (const [chainId, factoryAddress] of CHAIN_FACTORY_OVERRIDES) {
        common.set(chainId, factoryAddress);
    }

    return Array.from(common.entries()).map(([chainId, factoryAddress]) => ({
        chainId,
        factoryAddress,
    }));
}
