import type { AbstractProvider } from 'ethers';
import type { PreparedTx } from './common/index.js';
import type {
    EscrowInfo,
    AppealPeriod,
    EscrowEvent,
    EscrowEvidenceEvent,
    PrepareDepositResult,
    PrepareRaiseDisputeResult,
    PrepareAppealResult,
} from './types.js';
import type { KlescrowConfig } from './KlescrowTxBuilder.js';
import { KlescrowReader } from './KlescrowReader.js';
import { KlescrowTxBuilder } from './KlescrowTxBuilder.js';
import { KlescrowEvents, TOPIC_EVIDENCE } from './KlescrowEvents.js';
import { ZeroAddress } from 'ethers';

/**
 * A handle bound to a specific deployed Klescrow clone.
 *
 * Obtained via `Klescrow.escrow(address)` — construction is free (no network call).
 *
 * Read methods (`read`, `arbitrationCost`, …) are `async` and hit the chain.
 * Write methods (`deposit`, `approvePayment`, …) are synchronous and return an
 * unsigned `PreparedTx`. The caller's wallet signs and broadcasts.
 *
 * `walletAddress` (set on the SDK or overridden per-call) fills `callerWallet`
 * in every `PreparedTx` automatically, so callers never have to pass it manually.
 */
export class Escrow {
    constructor(
        /** On-chain address of this Klescrow clone. */
        readonly address: string,
        private readonly cfg:      KlescrowConfig,
        private readonly reader:   KlescrowReader,
        private readonly builder:  KlescrowTxBuilder,
        private readonly decoder:  KlescrowEvents,
        private readonly provider: AbstractProvider,
        private readonly walletAddress?: string,
    ) {}

    // ─── Reads (async, no wallet required) ────────────────────────────────────

    /** Reads all on-chain state for this escrow. */
    read(): Promise<EscrowInfo> {
        return this.reader.readEscrow(this.address);
    }

    /** Current Kleros arbitration cost in wei (from the escrow's snapshotted arbitrator). */
    arbitrationCost(): Promise<bigint> {
        return this.reader.readArbitrationCost(this.address);
    }

    /** Current Kleros appeal cost in wei. */
    appealCost(): Promise<bigint> {
        return this.reader.readAppealCost(this.address);
    }

    /** Current appeal window. */
    appealPeriod(): Promise<AppealPeriod> {
        return this.reader.readAppealPeriod(this.address);
    }

    /**
     * ETH queued for a wallet that can be claimed.
     */
    pendingWithdrawal(wallet: string): Promise<bigint> {
        return this.reader.readPendingWithdrawal(this.address, wallet);
    }

    // ─── Lifecycle writes ─────────────────────────────────────────────────────

    /**
     * Fund the escrow.
     * - ETH escrow: pass `ethValue = grossAmount` (net + fee).
     * - ERC20 escrow: pass `ethValue = 0n`; run `erc20Approve` first.
     */
    deposit(ethValue: bigint = 0n, wallet?: string): PreparedTx {
        return this.builder.deposit(this.cfg, {
            callerWallet:  this.resolveWallet(wallet),
            escrowAddress: this.address,
            ethValue,
        });
    }

    /** Signal intent to release funds to the seller. */
    approvePayment(wallet?: string): PreparedTx {
        return this.action('approvePayment', wallet);
    }

    /** Signal intent to return funds to the buyer. */
    approveRefund(wallet?: string): PreparedTx {
        return this.action('approveRefund', wallet);
    }

    /** Cancel this escrow before it is funded. */
    cancel(wallet?: string): PreparedTx {
        return this.action('cancel', wallet);
    }

    /** Join as the counterparty (open-buyer / open-seller flows). */
    join(wallet?: string): PreparedTx {
        return this.action('join', wallet);
    }

    /** Join explicitly as the buyer (open-seller flow). */
    joinAsBuyer(wallet?: string): PreparedTx {
        return this.action('joinAsBuyer', wallet);
    }

    /** Join explicitly as the seller (open-buyer flow). */
    joinAsSeller(wallet?: string): PreparedTx {
        return this.action('joinAsSeller', wallet);
    }

    /** Withdraw as a party before funding. */
    leave(wallet?: string): PreparedTx {
        return this.action('leave', wallet);
    }

    claim(wallet?: string): PreparedTx {
        return this.action('claim', wallet);
    }

    // ─── Dispute / Evidence / Appeal ──────────────────────────────────────────

    /**
     * Open a Kleros arbitration dispute.
     */
    raiseDispute(arbFeeWei: bigint, wallet?: string): PreparedTx {
        return this.builder.raiseDispute(this.cfg, {
            callerWallet:  this.resolveWallet(wallet),
            escrowAddress: this.address,
            arbFeeWei,
        });
    }

    /**
     * Submit an evidence URI (IPFS or HTTPS) to the ongoing Kleros arbitration.
     */
    submitEvidence(evidenceUri: string, wallet?: string): PreparedTx {
        return this.builder.submitEvidence(this.cfg, {
            callerWallet:  this.resolveWallet(wallet),
            escrowAddress: this.address,
            evidenceUri,
        });
    }

    /**
     * Fetches all ERC-1497 `Evidence` events emitted by this escrow.
     */
    async getEvidence(
        fromBlock: number | 'earliest' = 0,
        toBlock:   number | 'latest'   = 'latest',
    ): Promise<EscrowEvidenceEvent[]> {
        const rawLogs = await this.provider.getLogs({
            address:   this.address,
            topics:    [TOPIC_EVIDENCE],
            fromBlock,
            toBlock,
        });

        return rawLogs.flatMap(log => {
            const evmLog = {
                address:         log.address,
                topics:          log.topics,
                data:            log.data,
                transactionHash: log.transactionHash,
            };
            const decoded = this.decoder.tryDecodeEvidence(evmLog);
            return decoded ? [decoded] : [];
        });
    }

    /**
     * Appeal the Kleros ruling.
     */
    appeal(extraData: string, appealFeeWei: bigint, wallet?: string): PreparedTx {
        return this.builder.appeal(this.cfg, {
            callerWallet:  this.resolveWallet(wallet),
            escrowAddress: this.address,
            extraData,
            appealFeeWei,
        });
    }

    // ─── Metadata ─────────────────────────────────────────────────────────────

    /** Update the on-chain terms hash. */
    updateTermsHash(termsHash: string, wallet?: string): PreparedTx {
        return this.builder.updateTermsHash(this.cfg, {
            callerWallet:  this.resolveWallet(wallet),
            escrowAddress: this.address,
            termsHash,
        });
    }

    /** Extend the escrow expiry deadline. */
    extendExpiry(newExpiryUnixSec: bigint, wallet?: string): PreparedTx {
        return this.builder.extendExpiry(this.cfg, {
            callerWallet:  this.resolveWallet(wallet),
            escrowAddress: this.address,
            newExpiryUnixSec,
        });
    }

    /**
     * Remove a party address from this escrow.
     */
    removeParty(partyAddress: string, wallet?: string): PreparedTx {
        return this.builder.removeParty(this.cfg, {
            callerWallet:  this.resolveWallet(wallet),
            escrowAddress: this.address,
            partyAddress,
        });
    }

    // ─── Prepare helpers (read + build in one call) ───────────────────────────

    /**
     * Reads the escrow's on-chain gross amount and builds the deposit transaction.
     *
     * Eliminates the manual read → deposit pattern:
     * ```ts
     * // Before
     * const { amount, token } = await escrow.read();
     * const tx = escrow.deposit(token === ZeroAddress ? amount : 0n);
     *
     * // After
     * const { tx, grossAmount, isEth } = await escrow.prepareDeposit();
     * ```
     */
    async prepareDeposit(wallet?: string): Promise<PrepareDepositResult> {
        const info = await this.read();
        const isEth = info.token === ZeroAddress || info.token === '0x0000000000000000000000000000000000000000';
        const grossAmount = info.amount + info.fee;
        const ethValue = isEth ? grossAmount : 0n;
        return {
            tx:          this.deposit(ethValue, wallet),
            grossAmount,
            isEth,
        };
    }

    /**
     * Fetches the current Kleros arbitration cost and builds the raiseDispute transaction.
     *
     * Eliminates the manual arbitrationCost → raiseDispute pattern:
     * ```ts
     * // Before
     * const arbFeeWei = await escrow.arbitrationCost();
     * const tx = escrow.raiseDispute(arbFeeWei);
     *
     * // After
     * const { tx, arbFeeWei } = await escrow.prepareRaiseDispute();
     * ```
     */
    async prepareRaiseDispute(wallet?: string): Promise<PrepareRaiseDisputeResult> {
        const arbFeeWei = await this.arbitrationCost();
        return {
            tx: this.raiseDispute(arbFeeWei, wallet),
            arbFeeWei,
        };
    }

    /**
     * Fetches the current appeal cost and window, then builds the appeal transaction.
     *
     * Always check `appealPeriod.end > 0n` before broadcasting — `end === 0n` means
     * no ruling has been issued yet. Check `now >= start && now < end` to confirm
     * the window is open.
     *
     * Eliminates the manual appealCost + appealPeriod → appeal pattern:
     * ```ts
     * // Before
     * const [cost, period] = await Promise.all([escrow.appealCost(), escrow.appealPeriod()]);
     * const tx = escrow.appeal('0x', cost);
     *
     * // After
     * const { tx, appealFeeWei, appealPeriod } = await escrow.prepareAppeal('0x');
     * ```
     */
    async prepareAppeal(extraData: string, wallet?: string): Promise<PrepareAppealResult> {
        const [appealFeeWei, period] = await Promise.all([
            this.appealCost(),
            this.appealPeriod(),
        ]);
        return {
            tx:          this.appeal(extraData, appealFeeWei, wallet),
            appealFeeWei,
            appealPeriod: period,
        };
    }

    // ─── Event history ────────────────────────────────────────────────────────

    /**
     * Fetches and decodes all clone-level events for this escrow.
     *
     * Uses `eth_getLogs` filtered to `this.address`. Unknown log signatures are
     * silently skipped.
     *
     * @param fromBlock  First block to scan (default: 0 / genesis).
     * @param toBlock    Last block to scan (default: 'latest').
     */
    async getLogs(
        fromBlock: number | 'earliest' = 0,
        toBlock:   number | 'latest'   = 'latest',
    ): Promise<EscrowEvent[]> {
        const rawLogs = await this.provider.getLogs({
            address:   this.address,
            fromBlock,
            toBlock,
        });

        const events: EscrowEvent[] = [];

        for (const log of rawLogs) {
            const evmLog = {
                address:         log.address,
                topics:          log.topics,
                data:            log.data,
                transactionHash: log.transactionHash,
            };

            const funded = this.decoder.tryDecodeFunded(evmLog);
            if (funded) { events.push({ type: 'funded', ...funded }); continue; }

            const resolved = this.decoder.tryDecodeResolved(evmLog);
            if (resolved) { events.push({ type: 'resolved', ...resolved }); continue; }

            const disputed = this.decoder.tryDecodeDisputeRaised(evmLog);
            if (disputed) { events.push({ type: 'dispute_raised', ...disputed }); continue; }

            const cancelled = this.decoder.tryDecodeCancelled(evmLog);
            if (cancelled) { events.push({ type: 'cancelled', ...cancelled }); continue; }

            const buyerApproved = this.decoder.tryDecodeBuyerApproved(evmLog);
            if (buyerApproved) { events.push({ type: 'buyer_approved', ...buyerApproved }); continue; }

            const sellerApproved = this.decoder.tryDecodeSellerApproved(evmLog);
            if (sellerApproved) { events.push({ type: 'seller_approved', ...sellerApproved }); continue; }

            const expiryExtended = this.decoder.tryDecodeExpiryExtended(evmLog);
            if (expiryExtended) { events.push({ type: 'expiry_extended', ...expiryExtended }); continue; }

            const termsUpdated = this.decoder.tryDecodeTermsHashUpdated(evmLog);
            if (termsUpdated) { events.push({ type: 'terms_hash_updated', ...termsUpdated }); continue; }

            const evidence = this.decoder.tryDecodeEvidence(evmLog);
            if (evidence) { events.push({ type: 'evidence_submitted', ...evidence }); continue; }

            const buyerJoined = this.decoder.tryDecodeBuyerJoined(evmLog);
            if (buyerJoined) { events.push({ type: 'buyer_joined', ...buyerJoined }); continue; }

            const buyerLeft = this.decoder.tryDecodeBuyerLeft(evmLog);
            if (buyerLeft) { events.push({ type: 'buyer_left', ...buyerLeft }); continue; }

            const sellerJoined = this.decoder.tryDecodeSellerJoined(evmLog);
            if (sellerJoined) { events.push({ type: 'seller_joined', ...sellerJoined }); continue; }

            const sellerLeft = this.decoder.tryDecodeSellerLeft(evmLog);
            if (sellerLeft) { events.push({ type: 'seller_left', ...sellerLeft }); continue; }

            const expiryConsented = this.decoder.tryDecodeExpiryExtensionConsented(evmLog);
            if (expiryConsented) { events.push({ type: 'expiry_extension_consented', ...expiryConsented }); }

            // unknown topic — skip silently
        }

        return events;
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    private action(
        method: 'approvePayment' | 'approveRefund' | 'cancel' | 'join' | 'joinAsBuyer' | 'joinAsSeller' | 'leave' | 'claim',
        wallet?: string,
    ): PreparedTx {
        return this.builder[method](this.cfg, {
            callerWallet:  this.resolveWallet(wallet),
            escrowAddress: this.address,
        });
    }

    private resolveWallet(override?: string): string {
        const w = override ?? this.walletAddress;
        if (!w) throw new Error(
            'walletAddress is required — pass it to new Klescrow({ walletAddress }) or as the last argument to this method.',
        );
        return w;
    }
}