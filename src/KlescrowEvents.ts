import { id as ethersId } from 'ethers';
import { matchesTopic, type EvmLog } from './common/index.js';
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
import { KlescrowFactory__factory, Klescrow__factory } from '../generated/typechain/index.js';

// ─── TypeChain-generated interfaces (single source of truth) ─────────────────
const factoryIface = KlescrowFactory__factory.createInterface();
const escrowIface  = Klescrow__factory.createInterface();

// ─── Pre-computed topic0 hashes (keccak256 of canonical event signature) ───────

/** Topic0 for KlescrowFactory.EscrowCreated */
export const TOPIC_ESCROW_CREATED   = ethersId('EscrowCreated(bytes32,address,address,address,address,address,uint256,uint256,uint256,uint256,bytes32)');
/** Topic0 for Klescrow.Funded */
export const TOPIC_FUNDED           = ethersId('Funded(address,uint256,uint256)');
/** Topic0 for Klescrow.Resolved */
export const TOPIC_RESOLVED         = ethersId('Resolved(address,uint256,address,uint256,uint256)');
/** Topic0 for Klescrow.DisputeRaised */
export const TOPIC_DISPUTE_RAISED   = ethersId('DisputeRaised(uint256,address)');
/** Topic0 for Klescrow.Cancelled */
export const TOPIC_CANCELLED        = ethersId('Cancelled(address)');
/** Topic0 for Klescrow.BuyerApproved */
export const TOPIC_BUYER_APPROVED   = ethersId('BuyerApproved(address,uint8)');
/** Topic0 for Klescrow.SellerApproved */
export const TOPIC_SELLER_APPROVED  = ethersId('SellerApproved(address,uint8)');
/** Topic0 for Klescrow.ExpiryExtended */
export const TOPIC_EXPIRY_EXTENDED  = ethersId('ExpiryExtended(uint256,uint256)');
/** Topic0 for Klescrow.TermsHashUpdated */
export const TOPIC_TERMS_HASH_UPDATED = ethersId('TermsHashUpdated(address,bytes32,bytes32)');
/** Topic0 for IEvidence.Evidence emitted by a Klescrow escrow */
export const TOPIC_EVIDENCE         = ethersId('Evidence(address,uint256,address,string)');
/** Topic0 for Klescrow.BuyerJoined */
export const TOPIC_BUYER_JOINED     = ethersId('BuyerJoined(address)');
/** Topic0 for Klescrow.BuyerLeft */
export const TOPIC_BUYER_LEFT       = ethersId('BuyerLeft(address)');
/** Topic0 for Klescrow.SellerJoined */
export const TOPIC_SELLER_JOINED    = ethersId('SellerJoined(address)');
/** Topic0 for Klescrow.SellerLeft */
export const TOPIC_SELLER_LEFT      = ethersId('SellerLeft(address)');
/** Topic0 for Klescrow.ExpiryExtensionConsented */
export const TOPIC_EXPIRY_EXTENSION_CONSENTED = ethersId('ExpiryExtensionConsented(address,uint256)');

/**
 * All Klescrow event topic0 hashes as a single object.
 *
 * Use this for custom `eth_getLogs` topic filtering.
 * This is the only public export of topic hashes — individual TOPIC_* constants
 * are intentionally not re-exported from the package index.
 *
 * @example
 * provider.getLogs({ topics: [KlescrowTopics.FUNDED], address: cloneAddr })
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
 *   const events = new KlescrowEvents();
 *   events.tryDecodeEscrowCreated(log)?.escrowAddress;
 *
 */
export class KlescrowEvents {

    // ─── Factory events ───────────────────────────────────────────────────────

    /**
     * Tries to decode a KlescrowFactory.EscrowCreated log.
     */
    tryDecodeEscrowCreated(log: EvmLog): EscrowCreatedEvent | undefined {
        if (!matchesTopic(log, TOPIC_ESCROW_CREATED)) return undefined;
        const parsed = factoryIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            escrowId:           parsed.args.id                as string,
            escrowAddress:      parsed.args.escrow            as string,
            creator:            parsed.args.creator           as string,
            seller:             parsed.args.seller            as string,
            buyer:              parsed.args.buyer             as string,
            token:              parsed.args.token             as string,
            amount:             parsed.args.amount            as bigint,
            fee:                parsed.args.fee               as bigint,
            obligationDeadline: parsed.args.expiryTime        as bigint,
            settlementDeadline: parsed.args.settlementDeadline as bigint,
            termsHash:          parsed.args.termsHash         as string,
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
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            depositor:      parsed.args.depositor      as string,
            amount:         parsed.args.amount         as bigint,
            refundedExcess: parsed.args.refundedExcess as bigint,
            logAddress:     log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.Resolved log.
     */
    tryDecodeResolved(log: EvmLog): ResolvedEvent | undefined {
        if (!matchesTopic(log, TOPIC_RESOLVED)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            seller:     parsed.args.seller     as string,
            sellerPaid: parsed.args.sellerPaid as bigint,
            buyer:      parsed.args.buyer      as string,
            buyerPaid:  parsed.args.buyerPaid  as bigint,
            ruling:     parsed.args.ruling     as bigint,
            logAddress: log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.DisputeRaised log.
     */
    tryDecodeDisputeRaised(log: EvmLog): DisputeRaisedEvent | undefined {
        if (!matchesTopic(log, TOPIC_DISPUTE_RAISED)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            disputeId: parsed.args.disputeId as bigint,
            raisedBy:  parsed.args.raisedBy  as string,
            logAddress: log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.Cancelled log.
     */
    tryDecodeCancelled(log: EvmLog): CancelledEvent | undefined {
        if (!matchesTopic(log, TOPIC_CANCELLED)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            cancelledBy: parsed.args.cancelledBy as string,
            logAddress:  log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.BuyerApproved log.
     */
    tryDecodeBuyerApproved(log: EvmLog): BuyerApprovedEvent | undefined {
        if (!matchesTopic(log, TOPIC_BUYER_APPROVED)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            buyer:  parsed.args.buyer as string,
            intent: escrowIntentFromOrdinal(Number(parsed.args.intent)),
            logAddress: log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.SellerApproved log.
     */
    tryDecodeSellerApproved(log: EvmLog): SellerApprovedEvent | undefined {
        if (!matchesTopic(log, TOPIC_SELLER_APPROVED)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            seller: parsed.args.seller as string,
            intent: escrowIntentFromOrdinal(Number(parsed.args.intent)),
            logAddress: log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.ExpiryExtended log.
     */
    tryDecodeExpiryExtended(log: EvmLog): ExpiryExtendedEvent | undefined {
        if (!matchesTopic(log, TOPIC_EXPIRY_EXTENDED)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            oldExpiry:  parsed.args.oldExpiry as bigint,
            newExpiry:  parsed.args.newExpiry as bigint,
            logAddress: log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.TermsHashUpdated log.
     */
    tryDecodeTermsHashUpdated(log: EvmLog): TermsHashUpdatedEvent | undefined {
        if (!matchesTopic(log, TOPIC_TERMS_HASH_UPDATED)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            updatedBy:    parsed.args.updatedBy    as string,
            oldTermsHash: parsed.args.oldTermsHash as string,
            newTermsHash: parsed.args.newTermsHash as string,
            logAddress:   log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode an IEvidence.Evidence log emitted by the escrow clone.
     */
    tryDecodeEvidence(log: EvmLog): EscrowEvidenceEvent | undefined {
        if (!matchesTopic(log, TOPIC_EVIDENCE)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            arbitrator:      parsed.args[0] as string,
            evidenceGroupId: parsed.args[1] as bigint,
            party:           parsed.args[2] as string,
            evidenceUri:     parsed.args[3] as string,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.BuyerJoined log.
     */
    tryDecodeBuyerJoined(log: EvmLog): BuyerJoinedEvent | undefined {
        if (!matchesTopic(log, TOPIC_BUYER_JOINED)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            buyer:           parsed.args.buyer as string,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.BuyerLeft log.
     */
    tryDecodeBuyerLeft(log: EvmLog): BuyerLeftEvent | undefined {
        if (!matchesTopic(log, TOPIC_BUYER_LEFT)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            buyer:           parsed.args.buyer as string,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.SellerJoined log.
     */
    tryDecodeSellerJoined(log: EvmLog): SellerJoinedEvent | undefined {
        if (!matchesTopic(log, TOPIC_SELLER_JOINED)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            seller:          parsed.args.seller as string,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.SellerLeft log.
     */
    tryDecodeSellerLeft(log: EvmLog): SellerLeftEvent | undefined {
        if (!matchesTopic(log, TOPIC_SELLER_LEFT)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            seller:          parsed.args.seller as string,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }

    /**
     * Tries to decode a Klescrow.ExpiryExtensionConsented log.
     */
    tryDecodeExpiryExtensionConsented(log: EvmLog): ExpiryExtensionConsentedEvent | undefined {
        if (!matchesTopic(log, TOPIC_EXPIRY_EXTENSION_CONSENTED)) return undefined;
        const parsed = escrowIface.parseLog({ topics: log.topics, data: log.data })!;
        return {
            party:                      parsed.args.party          as string,
            proposedObligationDeadline: parsed.args.proposedExpiry as bigint,
            logAddress:      log.address,
            transactionHash: log.transactionHash,
        };
    }
}