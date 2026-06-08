import { Contract, type AbstractProvider } from 'ethers';

/**
 * Minimal Multicall3 ABI — only aggregate3 is needed for batched reads.
 * We mark it view in our local ABI so ethers routes it through eth_call automatically.
 * The canonical Multicall3 address is 0xcA11bde05977b3631167028862bE2a173976CA11
 * on most EVM chains, but supply the correct address per-chain via MulticallConfig.
 */
const MULTICALL3_ABI = [
    'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) ' +
    'view returns (tuple(bool success, bytes returnData)[] returnData)',
] as const;

// ─── Config ────────────────────────────────────────────────────────────────────

export interface MulticallConfig {
    /** Deployed Multicall3 contract address for this chain. */
    address: string;
    /**
     * When true (default), throw a descriptive error if any batched call
     * reports success=false.  Set to false only when you want to handle
     * per-call failures yourself.
     */
    requireSuccess?: boolean;
}

// ─── Batch call types ──────────────────────────────────────────────────────────

export interface EncodedReadCall<T = unknown> {
    /** Contract address to call. */
    target: string;
    /** Human-readable method name — included in thrown error messages on failure. */
    method: string;
    /** ABI-encoded calldata for this call target. */
    callData: string;
    /** Decode the raw returnData bytes into the desired type T. */
    decode: (returnData: string) => T;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

/**
 * Batch multiple read calls through Multicall3's `aggregate3` function.
 *
 * All inner calls use `allowFailure: true` at the Multicall3 level so partial
 * failures are surfaced as results instead of reverting the whole batch.
 * The `requireSuccess` flag (default: true) then controls whether a failed
 * inner call throws in JavaScript.
 *
 * @param provider        Any ethers AbstractProvider (JsonRpcProvider, BrowserProvider, …).
 * @param multicallAddress Deployed Multicall3 address on the target chain.
 * @param calls            Ordered list of encoded read calls.
 * @param requireSuccess   Throw if any call fails (default: true).
 */
export async function executeMulticall<T>(
    provider: AbstractProvider,
    multicallAddress: string,
    calls: EncodedReadCall<T>[],
    requireSuccess = true,
): Promise<T[]> {
    if (calls.length === 0) return [];

    const contract = new Contract(multicallAddress, MULTICALL3_ABI, provider);

    // Always pass allowFailure=true to aggregate3 so failed calls return (false, 0x)
    // instead of reverting the whole batch — we enforce requireSuccess ourselves in JS.
    const batch = calls.map(c => ({
        target:        c.target,
        allowFailure:  true,
        callData:      c.callData,
    }));

    const rawResults: Array<{ success: boolean; returnData: string }> =
        await (contract.aggregate3 as typeof contract.aggregate3)(batch);

    return rawResults.map((r, i) => {
        const c = calls[i]!;
        if (!r.success && requireSuccess) {
            throw new Error(
                `Multicall3 call failed — method="${c.method}" target=${c.target}`,
            );
        }
        return c.decode(r.returnData);
    });
}