/**
 * A single line item in a fee breakdown.
 */
export interface FeeLineItem {
    /** Human-readable label, e.g. "Protocol fee (2.5%)", "Arbitration cost". */
    label: string;
    /** Amount in wei as a decimal string (safe for BigInt conversion). */
    amountWei: string;
    /** Token address. ZeroAddress (0x000…0) for native ETH; ERC20 address otherwise. */
    token: string;
}

/**
 * Structured breakdown of all fees associated with a transaction.
 * Attach to {@link SigningPreview#fees} so the UI can render a cost summary.
 */
export interface FeeBreakdown {
    /** Primary token address for this fee group (ZeroAddress for ETH). */
    token: string;
    /** Individual fee line items. Sum of `amountWei` across items == `totalFeeWei`. */
    items: FeeLineItem[];
    /** Pre-computed sum of all item `amountWei` values (decimal string). */
    totalFeeWei: string;
}

/**
 * Human-readable preview of an unsigned transaction.
 *
 * Wallets and UIs attach this to a {@link PreparedTx} and render it in a
 * signing confirmation dialog so users understand exactly what they are signing.
 */
export interface SigningPreview {
    /** Short action label shown as the title, e.g. "Create Escrow". */
    action: string;

    /**
     * Who is expected to sign, expressed as a role string.
     * Examples: `"buyer"`, `"seller"`, `"payer"`, `"payee"`, `"owner"`, `"either party"`.
     */
    signer: string;

    /** One-sentence description of the transaction's on-chain effect. */
    description: string;

    /**
     * Native ETH value being sent with the transaction (in wei, decimal string).
     * Omitted when the transaction carries no ETH value.
     */
    valueWei?: string;

    /**
     * Primary token address relevant to this action.
     * ZeroAddress for native ETH; an ERC20 contract address otherwise.
     * Omitted for non-asset actions such as `submitEvidence` or `extendExpiry`.
     */
    token?: string;

    /**
     * Token or ETH amount relevant to this action (decimal string, in wei/smallest unit).
     * For ETH actions this mirrors `valueWei`.
     * For ERC20 actions this is the token amount being transferred or approved.
     * Omitted for non-asset actions.
     */
    tokenAmountWei?: string;

    /**
     * Fee breakdown for actions that incur protocol or arbitration fees.
     * Omitted when no fees are applicable.
     */
    fees?: FeeBreakdown;

    /**
     * Supplementary key/value pairs for display purposes.
     * Examples: `{ "Seller": "0xABC…", "Expires": "2026-12-31", "Terms hash": "0x123…" }`.
     */
    details?: Record<string, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Ethereum zero address constant (20 zero bytes). */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Builds a {@link FeeBreakdown} from an ordered list of named wei amounts.
 * Items with zero amount are included (callers may filter if desired).
 *
 * @param token   Token address for all items (ZeroAddress for ETH).
 * @param entries Pairs of [label, amountWei as bigint].
 */
export function buildFeeBreakdown(
    token: string,
    entries: ReadonlyArray<[label: string, amountWei: bigint]>,
): FeeBreakdown {
    const items: FeeLineItem[] = entries.map(([label, amountWei]) => ({
        label,
        amountWei: amountWei.toString(),
        token,
    }));
    const total = entries.reduce((acc, [, v]) => acc + v, 0n);
    return { token, items, totalFeeWei: total.toString() };
}

/**
 * Formats a Unix timestamp (seconds) to an ISO date string for display.
 * Returns `"(unknown)"` for zero or negative values.
 */
export function formatUnixSec(unixSec: bigint): string {
    if (unixSec <= 0n) return '(unknown)';
    return new Date(Number(unixSec) * 1000).toISOString();
}
