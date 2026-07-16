import type {
    AppealPeriod,
    EscrowInfo,
    EscrowIntent,
    EscrowState,
} from '../types.js';

/**
 * Shared callable read API used by both the unbound reader and a bound escrow.
 * `EscrowArgs` is either `[escrowAddress]` or `[]` when the address is already bound.
 */
export interface EscrowReadable<EscrowArgs extends [] | [escrowAddress: string]> {
    (...args: EscrowArgs): Promise<EscrowInfo>;
    state(...args: EscrowArgs): Promise<EscrowState>;
    buyer(...args: EscrowArgs): Promise<string>;
    seller(...args: EscrowArgs): Promise<string>;
    creator(...args: EscrowArgs): Promise<string>;
    token(...args: EscrowArgs): Promise<string>;
    amount(...args: EscrowArgs): Promise<bigint>;
    fee(...args: EscrowArgs): Promise<bigint>;
    obligationDeadline(...args: EscrowArgs): Promise<bigint>;
    settlementDeadline(...args: EscrowArgs): Promise<bigint>;
    termsHash(...args: EscrowArgs): Promise<string>;
    disputeId(...args: EscrowArgs): Promise<bigint>;
    buyerIntent(...args: EscrowArgs): Promise<EscrowIntent>;
    sellerIntent(...args: EscrowArgs): Promise<EscrowIntent>;
    proposedObligationDeadline(...args: EscrowArgs): Promise<bigint>;
    arbitrator(...args: EscrowArgs): Promise<string>;
    arbitratorConfiguration(...args: EscrowArgs): Promise<string>;
    arbitrationCost(...args: EscrowArgs): Promise<bigint>;
    appealCost(...args: EscrowArgs): Promise<bigint>;
    appealPeriod(...args: EscrowArgs): Promise<AppealPeriod>;
    pendingWithdrawal(...args: [...EscrowArgs, wallet: string]): Promise<bigint>;
}
