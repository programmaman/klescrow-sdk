import { matchesTopic, type EvmLog } from './common/index.js';
import type { AbiCodec, Hex } from './common/AbiCodec.js';
import { EVENT_TOPICS } from './abi.js';
import type {
    EscrowCreatedEvent,
    FundedEvent,
    ResolvedEvent,
    DisputeRaisedEvent,
    CancelledEvent,
    BuyerApprovedEvent,
    SellerApprovedEvent,
    ExpiryExtendedEvent,
    TermsHashUpdatedEvent,
    EscrowEvidenceEvent,
    BuyerJoinedEvent,
    BuyerLeftEvent,
    SellerJoinedEvent,
    SellerLeftEvent,
    ExpiryExtensionConsentedEvent,
} from './types.js';
import { escrowIntentFromOrdinal } from './types.js';
// ─── Pre-computed topic0 hashes (keccak256 of canonical event signature) ───────

/** Topic0 for KlescrowFactory.EscrowCreated */
export const TOPIC_ESCROW_CREATED = EVENT_TOPICS.EscrowCreated;
/** Topic0 for Klescrow.Funded */
export const TOPIC_FUNDED = EVENT_TOPICS.Funded;
/** Topic0 for Klescrow.Resolved */
export const TOPIC_RESOLVED = EVENT_TOPICS.Resolved;
/** Topic0 for Klescrow.DisputeRaised */
export const TOPIC_DISPUTE_RAISED = EVENT_TOPICS.DisputeRaised;
/** Topic0 for Klescrow.Cancelled */
export const TOPIC_CANCELLED = EVENT_TOPICS.Cancelled;
/** Topic0 for Klescrow.BuyerApproved */
export const TOPIC_BUYER_APPROVED = EVENT_TOPICS.BuyerApproved;
/** Topic0 for Klescrow.SellerApproved */
export const TOPIC_SELLER_APPROVED = EVENT_TOPICS.SellerApproved;
/** Topic0 for Klescrow.ExpiryExtended */
export const TOPIC_EXPIRY_EXTENDED = EVENT_TOPICS.ExpiryExtended;
/** Topic0 for Klescrow.TermsHashUpdated */
export const TOPIC_TERMS_HASH_UPDATED = EVENT_TOPICS.TermsHashUpdated;
/** Topic0 for IEvidence.Evidence emitted by a Klescrow escrow */
export const TOPIC_EVIDENCE = EVENT_TOPICS.Evidence;
/** Topic0 for Klescrow.BuyerJoined */
export const TOPIC_BUYER_JOINED = EVENT_TOPICS.BuyerJoined;
/** Topic0 for Klescrow.BuyerLeft */
export const TOPIC_BUYER_LEFT = EVENT_TOPICS.BuyerLeft;
/** Topic0 for Klescrow.SellerJoined */
export const TOPIC_SELLER_JOINED = EVENT_TOPICS.SellerJoined;
/** Topic0 for Klescrow.SellerLeft */
export const TOPIC_SELLER_LEFT = EVENT_TOPICS.SellerLeft;
/** Topic0 for Klescrow.ExpiryExtensionConsented */
export const TOPIC_EXPIRY_EXTENSION_CONSENTED = EVENT_TOPICS.ExpiryExtensionConsented;

/**
 * All Klescrow event topic0 hashes as a single object.
 *
 * Use this for custom `eth_getLogs` topic filtering.
 * This is the only public export of topic hashes — individual TOPIC_* constants
 * are intentionally not re-exported from the package index.
 *
 * @example
 * rpc.request({ method: 'eth_getLogs', params: [{ topics: [KlescrowTopics.FUNDED], address: cloneAddr }] })
 */
export const KlescrowTopics = {
    ESCROW_CREATED:             TOPIC_ESCROW_CREATED,
    FUNDED:                     TOPIC_FUNDED,
    RESOLVED:                   TOPIC_RESOLVED,
    DISPUTE_RAISED:             TOPIC_DISPUTE_RAISED,
    CANCELLED:                  TOPIC_CANCELLED,
    BUYER_APPROVED:             TOPIC_BUYER_APPROVED,
    SELLER_APPROVED:            TOPIC_SELLER_APPROVED,
    EXPIRY_EXTENDED:            TOPIC_EXPIRY_EXTENDED,
    TERMS_HASH_UPDATED:         TOPIC_TERMS_HASH_UPDATED,
    EVIDENCE:                   TOPIC_EVIDENCE,
    BUYER_JOINED:               TOPIC_BUYER_JOINED,
    BUYER_LEFT:                 TOPIC_BUYER_LEFT,
    SELLER_JOINED:              TOPIC_SELLER_JOINED,
    SELLER_LEFT:                TOPIC_SELLER_LEFT,
    EXPIRY_EXTENSION_CONSENTED: TOPIC_EXPIRY_EXTENSION_CONSENTED,
} as const;

const ESCROW_CREATED = 'EscrowCreated(bytes32,address,address,address,address,address,uint256,uint256,uint256,uint256,bytes32)';
const FUNDED = 'Funded(address,uint256,uint256)';
const RESOLVED = 'Resolved(address,uint256,address,uint256,uint256)';
const DISPUTE_RAISED = 'DisputeRaised(uint256,address)';
const CANCELLED = 'Cancelled(address)';
const BUYER_APPROVED = 'BuyerApproved(address,uint8)';
const SELLER_APPROVED = 'SellerApproved(address,uint8)';
const EXPIRY_EXTENDED = 'ExpiryExtended(uint256,uint256)';
const TERMS_HASH_UPDATED = 'TermsHashUpdated(address,bytes32,bytes32)';
const EVIDENCE = 'Evidence(address,uint256,address,string)';
const BUYER_JOINED = 'BuyerJoined(address)';
const BUYER_LEFT = 'BuyerLeft(address)';
const SELLER_JOINED = 'SellerJoined(address)';
const SELLER_LEFT = 'SellerLeft(address)';
const EXPIRY_EXTENSION_CONSENTED = 'ExpiryExtensionConsented(address,uint256)';


// ─── KlescrowEvents ────────────────────────────────────────────────────────────

/**
 * Stateless log decoder for Klescrow and KlescrowFactory events.
 *
 * Each tryDecode* method:
 *   1. Returns undefined immediately if topics[0] does not match.
 *   2. Returns the decoded event object on match.
 *   3. Throws if the log is structurally malformed.
 *
 * Usage:
 *   const events = new KlescrowEvents(codec);
 *   events.tryDecodeEscrowCreated(log)?.escrowAddress;
 *
 */
export class KlescrowEvents {
    constructor(private readonly codec: AbiCodec) {}

    // ─── Factory events ───────────────────────────────────────────────────────

    /**
     * Tries to decode a KlescrowFactory.EscrowCreated log.
     */
    tryDecodeEscrowCreated(log: EvmLog): EscrowCreatedEvent | undefined {
        if (!matchesTopic(log, TOPIC_ESCROW_CREATED)) return undefined;
        const event = this.codec.decodeEvent(ESCROW_CREATED, log.topics as Hex[], log.data as Hex);
        return {
            escrowId:           event.id                as string,
            escrowAddress:      event.escrow            as string,
            creator:            event.creator           as string,
            seller:             event.seller            as string,
            buyer:              event.buyer             as string,
            token:              event.token             as string,
            amount:             event.amount            as bigint,
            fee:                event.fee               as bigint,
            obligationDeadline: event.expiryTime        as bigint,
            settlementDeadline: event.settlementDeadline as bigint,
            termsHash:          event.termsHash         as string,
            logAddress:    log.address,
            transactionHash: log.transactionHash,
        };
    }

    // ─── Escrow events ────────────────────────────────────────────────────────

    /**
     * Tries to decode a Klescrow.Funded log.
     */
    tryDecodeFunded(log: EvmLog): FundedEvent | undefined {
        if (!matchesTopic(log, TOPIC_FUNDED)) return undefined;
        const event = this.codec.decodeEvent(FUNDED, log.topics as Hex[], log.data as Hex);
        return {
            depositor:      event.depositor      as string,
            amount:         event.amount         as bigint,
            refundedExcess: event.refundedExcess as bigint,
            logAddress:     log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.Resolved log.
     */
    tryDecodeResolved(log: EvmLog): ResolvedEvent | undefined {
        if (!matchesTopic(log, TOPIC_RESOLVED)) return undefined;
        const event = this.codec.decodeEvent(RESOLVED, log.topics as Hex[], log.data as Hex);
        return {
            seller:     event.seller     as string,
            sellerPaid: event.sellerPaid as bigint,
            buyer:      event.buyer      as string,
            buyerPaid:  event.buyerPaid  as bigint,
            ruling:     event.ruling     as bigint,
            logAddress: log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.DisputeRaised log.
     */
    tryDecodeDisputeRaised(log: EvmLog): DisputeRaisedEvent | undefined {
        if (!matchesTopic(log, TOPIC_DISPUTE_RAISED)) return undefined;
        const event = this.codec.decodeEvent(DISPUTE_RAISED, log.topics as Hex[], log.data as Hex);
        return {
            disputeId: event.disputeId as bigint,
            raisedBy:  event.raisedBy  as string,
            logAddress: log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.Cancelled log.
     */
    tryDecodeCancelled(log: EvmLog): CancelledEvent | undefined {
        if (!matchesTopic(log, TOPIC_CANCELLED)) return undefined;
        const event = this.codec.decodeEvent(CANCELLED, log.topics as Hex[], log.data as Hex);
        return {
            cancelledBy: event.cancelledBy as string,
            logAddress:  log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.BuyerApproved log.
     */
    tryDecodeBuyerApproved(log: EvmLog): BuyerApprovedEvent | undefined {
        if (!matchesTopic(log, TOPIC_BUYER_APPROVED)) return undefined;
        const event = this.codec.decodeEvent(BUYER_APPROVED, log.topics as Hex[], log.data as Hex);
        return {
            buyer:  event.buyer as string,
            intent: escrowIntentFromOrdinal(Number(event.intent)),
            logAddress: log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.SellerApproved log.
     */
    tryDecodeSellerApproved(log: EvmLog): SellerApprovedEvent | undefined {
        if (!matchesTopic(log, TOPIC_SELLER_APPROVED)) return undefined;
        const event = this.codec.decodeEvent(SELLER_APPROVED, log.topics as Hex[], log.data as Hex);
        return {
            seller: event.seller as string,
            intent: escrowIntentFromOrdinal(Number(event.intent)),
            logAddress: log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.ExpiryExtended log.
     */
    tryDecodeExpiryExtended(log: EvmLog): ExpiryExtendedEvent | undefined {
        if (!matchesTopic(log, TOPIC_EXPIRY_EXTENDED)) return undefined;
        const event = this.codec.decodeEvent(EXPIRY_EXTENDED, log.topics as Hex[], log.data as Hex);
        return {
            oldExpiry:  event.oldExpiry as bigint,
            newExpiry:  event.newExpiry as bigint,
            logAddress: log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.TermsHashUpdated log.
     */
    tryDecodeTermsHashUpdated(log: EvmLog): TermsHashUpdatedEvent | undefined {
        if (!matchesTopic(log, TOPIC_TERMS_HASH_UPDATED)) return undefined;
        const event = this.codec.decodeEvent(TERMS_HASH_UPDATED, log.topics as Hex[], log.data as Hex);
        return {
            updatedBy:    event.updatedBy    as string,
            oldTermsHash: event.oldTermsHash as string,
            newTermsHash: event.newTermsHash as string,
            logAddress:   log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode an IEvidence.Evidence log emitted by the escrow clone.
     */
    tryDecodeEvidence(log: EvmLog): EscrowEvidenceEvent | undefined {
        if (!matchesTopic(log, TOPIC_EVIDENCE)) return undefined;
        const event = this.codec.decodeEvent(EVIDENCE, log.topics as Hex[], log.data as Hex);
        return {
            arbitrator:      event._arbitrator as string,
            evidenceGroupId: event._evidenceGroupId as bigint,
            party:           event._party as string,
            evidenceUri:     event._evidence as string,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.BuyerJoined log.
     */
    tryDecodeBuyerJoined(log: EvmLog): BuyerJoinedEvent | undefined {
        if (!matchesTopic(log, TOPIC_BUYER_JOINED)) return undefined;
        const event = this.codec.decodeEvent(BUYER_JOINED, log.topics as Hex[], log.data as Hex);
        return {
            buyer:           event.buyer as string,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.BuyerLeft log.
     */
    tryDecodeBuyerLeft(log: EvmLog): BuyerLeftEvent | undefined {
        if (!matchesTopic(log, TOPIC_BUYER_LEFT)) return undefined;
        const event = this.codec.decodeEvent(BUYER_LEFT, log.topics as Hex[], log.data as Hex);
        return {
            buyer:           event.buyer as string,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.SellerJoined log.
     */
    tryDecodeSellerJoined(log: EvmLog): SellerJoinedEvent | undefined {
        if (!matchesTopic(log, TOPIC_SELLER_JOINED)) return undefined;
        const event = this.codec.decodeEvent(SELLER_JOINED, log.topics as Hex[], log.data as Hex);
        return {
            seller:          event.seller as string,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.SellerLeft log.
     */
    tryDecodeSellerLeft(log: EvmLog): SellerLeftEvent | undefined {
        if (!matchesTopic(log, TOPIC_SELLER_LEFT)) return undefined;
        const event = this.codec.decodeEvent(SELLER_LEFT, log.topics as Hex[], log.data as Hex);
        return {
            seller:          event.seller as string,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.ExpiryExtensionConsented log.
     */
    tryDecodeExpiryExtensionConsented(log: EvmLog): ExpiryExtensionConsentedEvent | undefined {
        if (!matchesTopic(log, TOPIC_EXPIRY_EXTENSION_CONSENTED)) return undefined;
        const event = this.codec.decodeEvent(EXPIRY_EXTENSION_CONSENTED, log.topics as Hex[], log.data as Hex);
        return {
            party:                      event.party          as string,
            proposedObligationDeadline: event.proposedExpiry as bigint,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }
}
