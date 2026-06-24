/**
 * Represents the current status of an escrow workflow.
 */
export enum EscrowState {
    UNFUNDED = 0,
    FUNDED = 1,
    DISPUTED = 2,
    RESOLVED = 3,
    CANCELLED = 4,
}

export function escrowStateFromOrdinal(ordinal: number): EscrowState {
    if (ordinal < 0 || ordinal > 4) throw new Error(`Unknown EscrowState ordinal: ${ordinal}`);
    return ordinal;
}

/**
 * Represents a party's declared resolution preference.
 */
export enum EscrowIntent {
    NONE = 0,
    APPROVE_PAYMENT = 1,
    APPROVE_REFUND = 2,
}

export function escrowIntentFromOrdinal(ordinal: number): EscrowIntent {
    if (ordinal < 0 || ordinal > 2) throw new Error(`Unknown EscrowIntent ordinal: ${ordinal}`);
    return ordinal;
}

// ─── Reader result types ───────────────────────────────────────────────────────

/** Snapshot of KlescrowFactory on-chain config. Returned by KlescrowReader.readFactory(). */
export interface FactoryInfo {
    factoryAddress: string;
    defaultImpl: string;
    defaultImplName: string;
    feeBps: bigint;
    feeRecipient: string;
    arbitrator: string;
    arbitratorConfiguration: string;
    metaEvidenceUri: string;
    owner: string;
    /** Non-empty only while a 2-step ownership transfer is pending. */
    pendingOwner: string;
}

/**
 * Result of KlescrowFactory.quoteGross(net).
 */
export interface FeeQuote {
    gross: bigint;
    fee: bigint;
}

/**
 * Snapshot of all on-chain state for a deployed Klescrow clone.
 * Returned by KlescrowReader.readEscrow().
 * Addresses are EIP-55 checksummed; zero address means slot is unset.
 */
export interface EscrowInfo {
    escrowAddress: string;
    state: EscrowState;
    buyer: string;
    seller: string;
    creator: string;
    /** Token contract address. */
    token: string;
    amount: bigint;
    fee: bigint;
    obligationDeadline: bigint;
    settlementDeadline: bigint;
    termsHash: string; // bytes32 hex
    disputeId: bigint;
    buyerIntent: EscrowIntent;
    sellerIntent: EscrowIntent;
    proposedObligationDeadline: bigint;
    /** Kleros arbitrator address snapshotted at escrow initialization. */
    arbitratorAddress: string;
    /** Arbitrator configuration hex string. */
    arbitratorConfiguration: string;
}

/**
 * A registered Klescrow implementation entry.
 * Returned by KlescrowReader.readImplementationAt().
 */
export interface EscrowImplementationInfo {
    address: string;
    name: string;
}

/**
 * Appeal window for a disputed escrow. Returned by KlescrowReader.readAppealPeriod().
 * start and end are Unix timestamps in seconds. end == 0n means no ruling yet.
 */
export interface AppealPeriod {
    start: bigint;
    end: bigint;
}

// ─── Minimal EVM log shape — re-exported from common for SDK consumer convenience ──
export type { EvmLog } from './common/LogUtils.js';

// ─── Prepare helper input / result types ──────────────────────────────────────

/**
 * Input for `factory.prepareCreateEthEscrow` and `factory.prepareCreateErc20Escrow`.
 * Pass `netAmount` — the gross and fee are quoted automatically.
 * `escrowId` is auto-generated (cryptographically random bytes32) if omitted.
 */
export interface PrepareCreateParams {
    /** Net escrow amount (before fee). The fee will be quoted and added automatically. */
    netAmount: bigint;
    /** bytes32 hex — auto-generated if omitted. */
    escrowId?: string;
    buyerAddress?: string | null;
    sellerAddress?: string | null;
    obligationDeadlineUnixSec: bigint;
    /** Absolute timestamp by which the seller must settle after the buyer's deposit (0 for no deadline). */
    settlementDeadlineUnixSec: bigint;
    /** keccak256 of terms URI — use `KlescrowTxBuilder.termsHashFromUri()`. */
    termsHash: string;
}

/** Input for `factory.prepareCreateErc20Escrow` — extends `PrepareCreateParams` with token. */
export interface PrepareCreateErc20Params extends PrepareCreateParams {
    tokenAddress: string;
}

/** Result of `factory.prepareCreateEthEscrow`. */
export interface PrepareCreateEthResult {
    /** Unsigned transaction to deploy the escrow clone. */
    tx: import('./common/PreparedTx.js').PreparedTx;
    /** The escrowId used (auto-generated or the one you passed in). */
    escrowId: string;
    /** Gross amount including protocol fee — pass this to `escrow.deposit(gross)`. */
    gross: bigint;
    /** Protocol fee portion. */
    fee: bigint;
}

/** Result of `factory.prepareCreateErc20Escrow`. */
export interface PrepareCreateErc20Result {
    /** Unsigned `createEscrow` transaction. */
    createTx: import('./common/PreparedTx.js').PreparedTx;
    /**
     * Unsigned ERC20 `approve(predictedAddress, gross)` transaction.
     * **Send this before `createTx`.**
     */
    approveTx: import('./common/PreparedTx.js').PreparedTx;
    /** The escrowId used. */
    escrowId: string;
    /** Gross amount including protocol fee. */
    gross: bigint;
    /** Protocol fee portion. */
    fee: bigint;
    /** Deterministic clone address — the spender for the ERC20 approve. */
    predictedAddress: string;
}

/** Result of `escrow.prepareDeposit()`. */
export interface PrepareDepositResult {
    /** Unsigned deposit transaction (value = grossAmount for ETH, 0 for ERC20). */
    tx: import('./common/PreparedTx.js').PreparedTx;
    /** Gross amount read from on-chain escrow state. */
    grossAmount: bigint;
    /** True when the escrow is ETH-funded. */
    isEth: boolean;
}

/** Result of `escrow.prepareRaiseDispute()`. */
export interface PrepareRaiseDisputeResult {
    /** Unsigned raiseDispute transaction. */
    tx: import('./common/PreparedTx.js').PreparedTx;
    /** Kleros arbitration cost in wei. */
    arbFeeWei: bigint;
}

/** Result of `escrow.prepareAppeal()`. */
export interface PrepareAppealResult {
    /** Unsigned appeal transaction. */
    tx: import('./common/PreparedTx.js').PreparedTx;
    /** Appeal fee in wei. */
    appealFeeWei: bigint;
    /** The appeal window read from on-chain. Check `end > 0n` before sending. */
    appealPeriod: AppealPeriod;
}

// ─── Event types ──────────────────────────────────────────────────────────────

/** Decoded KlescrowFactory.EscrowCreated event. */
export interface EscrowCreatedEvent {
    /** bytes32 id as hex string */
    escrowId: string;
    escrowAddress: string;
    /** address that called createEscrow */
    creator: string;
    seller: string;
    buyer: string;
    token: string;
    amount: bigint;
    fee: bigint;
    obligationDeadline: bigint;
    settlementDeadline: bigint;
    /** bytes32 termsHash as hex string */
    termsHash: string;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.Funded event. */
export interface FundedEvent {
    depositor: string;
    amount: bigint;
    refundedExcess: bigint;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.Resolved event. ruling == 0n means happy-path both-approve. */
export interface ResolvedEvent {
    seller: string;
    sellerPaid: bigint;
    buyer: string;
    buyerPaid: bigint;
    ruling: bigint;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.DisputeRaised event. */
export interface DisputeRaisedEvent {
    disputeId: bigint;
    raisedBy: string;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.Cancelled event. */
export interface CancelledEvent {
    cancelledBy: string;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.BuyerApproved event. */
export interface BuyerApprovedEvent {
    buyer: string;
    intent: EscrowIntent;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.SellerApproved event. */
export interface SellerApprovedEvent {
    seller: string;
    intent: EscrowIntent;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.ExpiryExtended event. */
export interface ExpiryExtendedEvent {
    oldExpiry: bigint;
    newExpiry: bigint;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.TermsHashUpdated event. */
export interface TermsHashUpdatedEvent {
    updatedBy: string;
    /** bytes32 hex */
    oldTermsHash: string;
    /** bytes32 hex */
    newTermsHash: string;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded IEvidence.Evidence event emitted by a Klescrow clone. */
export interface EscrowEvidenceEvent {
    arbitrator: string;
    evidenceGroupId: bigint;
    party: string;
    evidenceUri: string;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.BuyerJoined event. */
export interface BuyerJoinedEvent {
    buyer: string;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.BuyerLeft event. */
export interface BuyerLeftEvent {
    buyer: string;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.SellerJoined event. */
export interface SellerJoinedEvent {
    seller: string;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.SellerLeft event. */
export interface SellerLeftEvent {
    seller: string;
    logAddress: string;
    transactionHash: string | undefined;
}

/** Decoded Klescrow.ExpiryExtensionConsented event. */
export interface ExpiryExtensionConsentedEvent {
    party: string;
    proposedObligationDeadline: bigint;
    logAddress: string;
    transactionHash: string | undefined;
}

/**
 * Discriminated union of all decoded Klescrow clone events.
 * Returned by KlescrowHandle.getLogs().
 *
 * Narrow with: `if (e.type === 'funded') { ... }`
 */
export type EscrowEvent =
    | ({ type: 'funded'                      } & FundedEvent)
    | ({ type: 'resolved'                    } & ResolvedEvent)
    | ({ type: 'dispute_raised'              } & DisputeRaisedEvent)
    | ({ type: 'cancelled'                   } & CancelledEvent)
    | ({ type: 'buyer_approved'              } & BuyerApprovedEvent)
    | ({ type: 'seller_approved'             } & SellerApprovedEvent)
    | ({ type: 'expiry_extended'             } & ExpiryExtendedEvent)
    | ({ type: 'terms_hash_updated'          } & TermsHashUpdatedEvent)
    | ({ type: 'evidence_submitted'          } & EscrowEvidenceEvent)
    | ({ type: 'buyer_joined'                } & BuyerJoinedEvent)
    | ({ type: 'buyer_left'                  } & BuyerLeftEvent)
    | ({ type: 'seller_joined'               } & SellerJoinedEvent)
    | ({ type: 'seller_left'                 } & SellerLeftEvent)
    | ({ type: 'expiry_extension_consented'  } & ExpiryExtensionConsentedEvent);