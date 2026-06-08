/**
 * Known contract addresses for Klescrow deployments.
 */

/** Ethereum Mainnet deployment. */
export const MAINNET = '0xb381fB8e049C00B612fd060527dE0093DA1d6728';

// TODO: Add Arbitrum, Base, etc. as they are deployed

/**
 * Chain-ID to factory address mappings used by {@link getFactoryAddress}.
 * Extend this map as new chains are deployed.
 */
const KNOWN_DEPLOYMENTS: ReadonlyMap<number, string> = new Map([
    [1, MAINNET],
]);

/**
 * Looks up the known factory address for a given chain ID.
 *
 * @returns the factory address, or `undefined` if no deployment is known for this chain.
 */
export function getFactoryAddress(chainId: number): string | undefined {
    return KNOWN_DEPLOYMENTS.get(chainId);
}

/**
 * All known deployments as a readonly array of `{ chainId, factoryAddress }` pairs.
 * Useful for populating chain-selector UIs or config validation.
 */
export function listDeployments(): ReadonlyArray<{ chainId: number; factoryAddress: string }> {
    return Array.from(KNOWN_DEPLOYMENTS.entries())
        .map(([chainId, factoryAddress]) => ({ chainId, factoryAddress }));
}
