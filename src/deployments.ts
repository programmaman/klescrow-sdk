/** Canonical Klescrow factory address. */
export const FACTORY_ADDRESS = '0xb381fB8e049C00B612fd060527dE0093DA1d6728';

export const SUPPORTED_CHAIN_IDS = [1, 100, 1337] as const;
const SUPPORTED_CHAIN_ID_SET = new Set<number>(SUPPORTED_CHAIN_IDS);

/**
 * Chain-specific overrides for exceptional deployments.
 *
 * The deployment process is expected to replay the factory to the same address
 * on every chain. Keep this map empty unless a chain is intentionally deployed
 * at a different address.
 */
const CHAIN_FACTORY_OVERRIDES: ReadonlyMap<number, string> = new Map([]);

/** Returns true when this SDK has a first-class deployment for the chain. */
export function isSupportedChainId(chainId: number): boolean {
    return SUPPORTED_CHAIN_ID_SET.has(chainId);
}

/**
 * Looks up the factory address for a given chain ID.
 *
 * Returns undefined for unsupported chain IDs unless an explicit override exists.
 */
export function getFactoryAddress(chainId: number): string | undefined {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
        return undefined;
    }

    return CHAIN_FACTORY_OVERRIDES.get(chainId) ?? (isSupportedChainId(chainId) ? FACTORY_ADDRESS : undefined);
}

/** Throws if the chain is not one this SDK supports out of the box. */
export function requireSupportedChainId(chainId: number): void {
    if (!isSupportedChainId(chainId)) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
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
