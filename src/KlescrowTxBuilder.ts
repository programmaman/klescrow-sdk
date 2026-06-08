import { Interface, keccak256, toUtf8Bytes, ZeroAddress, getAddress } from 'ethers';
import type { PreparedTx } from './common/index.js';
import { requireAddress, type SigningPreview, buildFeeBreakdown, formatUnixSec, ZERO_ADDRESS } from './common/index.js';
import { KlescrowFactory__factory, Klescrow__factory } from '../generated/typechain/index.js';

// ─── Configuration ─────────────────────────────────────────────────────────────

export interface KlescrowConfig {
    chainId: number;
    factoryAddress: string;
}

// ─── Parameter types ───────────────────────────────────────────────────────────

export interface CreateEscrowParams {
    callerWallet: string;
    /** bytes32 as 0x-prefixed hex — use IdGenerator.generateOnChainIdHex() or uuidToBytes32Hex() */
    escrowId: string;
    buyerAddress?: string | null;
    sellerAddress?: string | null;
    tokenAddress?: string | null;
    /** Net amount for the escrow. */
    amount: bigint;
    /** Protocol fee. */
    fee: bigint;
    /** Absolute fulfillment deadline (Unix seconds). */
    obligationDeadlineUnixSec: bigint;
    /** Absolute timestamp by which the seller must settle after the buyer's deposit (0 for no deadline). */
    settlementDeadlineUnixSec: bigint;
    /** keccak256 of terms URI as 0x hex — use KlescrowTxBuilder.termsHashFromUri() */
    termsHash: string;
    /** Pinned escrow implementation address. Internal — set by FactoryHandle. */
    impl?: string;
}

export interface DepositParams {
    callerWallet: string;
    escrowAddress: string;
    /** ETH value to send with the transaction (wei). */
    ethValue: bigint;
}

export interface EscrowActionParams {
    callerWallet: string;
    escrowAddress: string;
}

export interface RaiseDisputeParams {
    callerWallet: string;
    escrowAddress: string;
    arbFeeWei: bigint;
}

export interface SubmitEvidenceParams {
    callerWallet: string;
    escrowAddress: string;
    evidenceUri: string;
}

export interface AppealParams {
    callerWallet: string;
    escrowAddress: string;
    extraData: string;
    appealFeeWei: bigint;
}

export interface RemovePartyParams {
    callerWallet: string;
    escrowAddress: string;
    partyAddress: string;
}

export interface UpdateTermsHashParams {
    callerWallet: string;
    escrowAddress: string;
    termsHash: string;
}

export interface ExtendExpiryParams {
    callerWallet: string;
    escrowAddress: string;
    newExpiryUnixSec: bigint;
}

export interface Erc20ApproveParams {
    ownerWallet: string;
    tokenAddress: string;
    spenderAddress: string;
    amount: bigint;
}

// ─── ABI fragments ─────────────────────────────────────────────────────────────
// ERC20 approve — not a Klescrow contract, kept as minimal inline fragment
const ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
];

// ─── Builder ───────────────────────────────────────────────────────────────────

/**
 * Stateless transaction builder for the Klescrow contracts.
 *
 * Every method returns an unsigned PreparedTx — the caller's wallet signs and
 * submits the transaction. This class never holds private keys.
 */
export class KlescrowTxBuilder {
    private readonly factoryIface: Interface;
    private readonly escrowIface:  Interface;
    private readonly erc20Iface:   Interface;

    constructor() {
        // Cast to base Interface — TypeChain's typed overloads are too strict for string-based encoding
        this.factoryIface = KlescrowFactory__factory.createInterface() as unknown as Interface;
        this.escrowIface  = Klescrow__factory.createInterface() as unknown as Interface;
        this.erc20Iface   = new Interface(ERC20_ABI);
    }

    // ─── Factory ─────────────────────────────────────────────────────────────

    /** Builds an unsigned createEscrow transaction for a native-ETH escrow. */
    createEthEscrow(cfg: KlescrowConfig, p: CreateEscrowParams): PreparedTx {
        return this.buildCreateEscrow(cfg, p, null);
    }

    /** Builds an unsigned createEscrow transaction for an ERC20-funded escrow. */
    createErc20Escrow(cfg: KlescrowConfig, p: CreateEscrowParams): PreparedTx {
        if (!p.tokenAddress) throw new Error('tokenAddress must be set for ERC20 escrow');
        requireAddress(p.tokenAddress, 'tokenAddress');
        return this.buildCreateEscrow(cfg, p, p.tokenAddress);
    }

    private buildCreateEscrow(cfg: KlescrowConfig, p: CreateEscrowParams, tokenOrNull: string | null | undefined): PreparedTx {
        requireAddress(cfg.factoryAddress, 'factoryAddress');
        requireAddress(p.callerWallet, 'callerWallet');
        requireBytes32Hex(p.escrowId, 'escrowId');
        if (p.amount <= 0n) throw new Error('amount must be > 0');
        if (p.fee < 0n) throw new Error('fee must be >= 0');
        if (p.obligationDeadlineUnixSec <= 0n) throw new Error('obligationDeadlineUnixSec must be > 0');
        if (p.settlementDeadlineUnixSec < 0n) throw new Error('settlementDeadlineUnixSec must be >= 0');
        requireBytes32Hex(p.termsHash, 'termsHash');

        const token = tokenOrNull ? requireAddress(tokenOrNull, 'tokenAddress') : ZeroAddress;
        const isEth = token === ZeroAddress;

        const req = {
            id:                 p.escrowId,
            buyer:              normalizeOptionalAddress(p.buyerAddress, 'buyerAddress'),
            seller:             normalizeOptionalAddress(p.sellerAddress, 'sellerAddress'),
            token,
            amount:             p.amount,
            fee:                p.fee,
            expiryTime:         p.obligationDeadlineUnixSec,
            settlementDeadline: p.settlementDeadlineUnixSec,
            termsHash:          p.termsHash,
        };

        const data = p.impl
            ? this.factoryIface.encodeFunctionData(
                'createEscrow(address,(bytes32,address,address,address,uint256,uint256,uint256,uint256,bytes32))',
                [p.impl, req])
            : this.factoryIface.encodeFunctionData(
                'createEscrow((bytes32,address,address,address,uint256,uint256,uint256,uint256,bytes32))',
                [req]);

        const preview: SigningPreview = {
            action: isEth ? 'Create ETH Escrow' : 'Create ERC20 Escrow',
            signer: 'creator',
            description: isEth
                ? 'Deploy a new escrow contract funded with native ETH.'
                : 'Deploy a new escrow contract funded with an ERC20 token.',
            token,
            tokenAmountWei: p.amount.toString(),
            fees: buildFeeBreakdown(token, [['Protocol fee', p.fee]]),
            details: {
                'Escrow ID':  p.escrowId,
                'Buyer':      normalizeOrZero(p.buyerAddress),
                'Seller':     normalizeOrZero(p.sellerAddress),
                'Token':      token,
                'Net amount': p.amount.toString(),
                'Protocol fee': p.fee.toString(),
                'Obligation deadline': formatUnixSec(p.obligationDeadlineUnixSec),
                'Settlement deadline': formatUnixSec(p.settlementDeadlineUnixSec),
                'Terms hash': p.termsHash,
            },
        };

        return noValue(cfg.factoryAddress, data, cfg.chainId, 'Create escrow', preview);
    }

    // ─── Deposit ────────────────────────────────────────────────────────────

    deposit(cfg: KlescrowConfig, p: DepositParams): PreparedTx {
        requireAddress(p.callerWallet, 'callerWallet');
        requireAddress(p.escrowAddress, 'escrowAddress');
        if (p.ethValue < 0n) throw new Error('ethValue must be >= 0');
        const data = this.escrowIface.encodeFunctionData('deposit', []);
        const isEth = p.ethValue > 0n;
        const preview: SigningPreview = {
            action: 'Fund Escrow',
            signer: 'buyer',
            description: isEth
                ? 'Deposit ETH into the escrow contract to lock funds.'
                : 'Deposit ERC20 tokens into the escrow contract to lock funds.',
            valueWei: isEth ? p.ethValue.toString() : undefined,
            token: isEth ? ZERO_ADDRESS : undefined,
            tokenAmountWei: isEth ? p.ethValue.toString() : undefined,
            details: { 'Escrow': p.escrowAddress },
        };
        return withValue(p.escrowAddress, data, p.ethValue, cfg.chainId, 'Deposit into escrow', preview);
    }

    // ─── Happy-path ───────────────────────────────────────────────────────────

    /** Signals intent to pay the seller. */
    approvePayment(cfg: KlescrowConfig, p: EscrowActionParams): PreparedTx {
        return this.simpleCall(cfg, p, 'approve', 'Approve Payment', {
            signer: 'either party',
            description: 'Signal intent to release funds to the seller. Both parties must approve for funds to release.',
            details: { 'Escrow': p.escrowAddress },
        });
    }

    /** Signals intent to refund the buyer. */
    approveRefund(cfg: KlescrowConfig, p: EscrowActionParams): PreparedTx {
        return this.simpleCall(cfg, p, 'refund', 'Approve Refund', {
            signer: 'either party',
            description: 'Signal intent to return funds to the buyer. Both parties must approve for funds to be returned.',
            details: { 'Escrow': p.escrowAddress },
        });
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    cancel(cfg: KlescrowConfig, p: EscrowActionParams): PreparedTx {
        return this.simpleCall(cfg, p, 'cancel', 'Cancel Escrow', {
            signer: 'either party',
            description: 'Cancel this escrow.',
            details: { 'Escrow': p.escrowAddress },
        });
    }

    join(cfg: KlescrowConfig, p: EscrowActionParams): PreparedTx {
        return this.simpleCall(cfg, p, 'join', 'Join Escrow', {
            signer: 'seller',
            description: 'Join the escrow as the counterparty.',
            details: { 'Escrow': p.escrowAddress },
        });
    }

    /** Join the escrow explicitly as the buyer (open-seller flow). */
    joinAsBuyer(cfg: KlescrowConfig, p: EscrowActionParams): PreparedTx {
        return this.simpleCall(cfg, p, 'joinAsBuyer', 'Join as Buyer', {
            signer: 'buyer',
            description: 'Join the escrow as the buyer.',
            details: { 'Escrow': p.escrowAddress },
        });
    }

    /** Join the escrow explicitly as the seller (open-buyer flow). */
    joinAsSeller(cfg: KlescrowConfig, p: EscrowActionParams): PreparedTx {
        return this.simpleCall(cfg, p, 'joinAsSeller', 'Join as Seller', {
            signer: 'seller',
            description: 'Join the escrow as the seller.',
            details: { 'Escrow': p.escrowAddress },
        });
    }

    leave(cfg: KlescrowConfig, p: EscrowActionParams): PreparedTx {
        return this.simpleCall(cfg, p, 'leave', 'Leave Escrow', {
            signer: 'either party',
            description: 'Withdraw from the escrow before it is funded.',
            details: { 'Escrow': p.escrowAddress },
        });
    }

    claim(cfg: KlescrowConfig, p: EscrowActionParams): PreparedTx {
        return this.simpleCall(cfg, p, 'claim', 'Claim ETH', {
            signer: 'recipient',
            description: 'Claim ETH queued for withdrawal.',
            token: ZERO_ADDRESS,
            details: { 'Escrow': p.escrowAddress },
        });
    }

    // ─── Dispute / evidence / appeal ─────────────────────────────────────────

    raiseDispute(cfg: KlescrowConfig, p: RaiseDisputeParams): PreparedTx {
        requireAddress(p.callerWallet, 'callerWallet');
        requireAddress(p.escrowAddress, 'escrowAddress');
        if (p.arbFeeWei < 0n) throw new Error('arbFeeWei must be >= 0');
        const data = this.escrowIface.encodeFunctionData('dispute', []);
        const preview: SigningPreview = {
            action: 'Raise Dispute',
            signer: 'either party',
            description: 'Open a Kleros arbitration dispute on this escrow. The arbitration fee is sent with this transaction.',
            valueWei: p.arbFeeWei.toString(),
            token: ZERO_ADDRESS,
            tokenAmountWei: p.arbFeeWei.toString(),
            fees: buildFeeBreakdown(ZERO_ADDRESS, [['Arbitration fee', p.arbFeeWei]]),
            details: { 'Escrow': p.escrowAddress },
        };
        return withValue(p.escrowAddress, data, p.arbFeeWei, cfg.chainId, 'Raise dispute', preview);
    }

    submitEvidence(cfg: KlescrowConfig, p: SubmitEvidenceParams): PreparedTx {
        requireAddress(p.callerWallet, 'callerWallet');
        requireAddress(p.escrowAddress, 'escrowAddress');
        if (!p.evidenceUri?.trim()) throw new Error('evidenceUri must not be blank');
        const data = this.escrowIface.encodeFunctionData('submitEvidence', [p.evidenceUri]);
        const preview: SigningPreview = {
            action: 'Submit Evidence',
            signer: 'either party',
            description: 'Submit an evidence URI (IPFS or HTTPS) to the Kleros arbitration for this escrow.',
            details: { 'Escrow': p.escrowAddress, 'Evidence URI': p.evidenceUri },
        };
        return noValue(p.escrowAddress, data, cfg.chainId, 'Submit evidence', preview);
    }

    appeal(cfg: KlescrowConfig, p: AppealParams): PreparedTx {
        requireAddress(p.callerWallet, 'callerWallet');
        requireAddress(p.escrowAddress, 'escrowAddress');
        if (p.appealFeeWei < 0n) throw new Error('appealFeeWei must be >= 0');
        const data = this.escrowIface.encodeFunctionData('appeal', [p.extraData ?? '0x']);
        const preview: SigningPreview = {
            action: 'Appeal Ruling',
            signer: 'either party',
            description: 'Appeal the Kleros ruling for this escrow. The appeal fee is sent with this transaction.',
            valueWei: p.appealFeeWei.toString(),
            token: ZERO_ADDRESS,
            tokenAmountWei: p.appealFeeWei.toString(),
            fees: buildFeeBreakdown(ZERO_ADDRESS, [['Appeal fee', p.appealFeeWei]]),
            details: { 'Escrow': p.escrowAddress },
        };
        return withValue(p.escrowAddress, data, p.appealFeeWei, cfg.chainId, 'Appeal ruling', preview);
    }

    removeParty(cfg: KlescrowConfig, p: RemovePartyParams): PreparedTx {
        requireAddress(p.callerWallet, 'callerWallet');
        requireAddress(p.escrowAddress, 'escrowAddress');
        const party = requireAddress(p.partyAddress, 'partyAddress');
        const data = this.escrowIface.encodeFunctionData('removeParty', [party]);
        const preview: SigningPreview = {
            action: 'Remove Party',
            signer: 'owner',
            description: 'Remove a party address from this escrow.',
            details: { 'Escrow': p.escrowAddress, 'Party to remove': party },
        };
        return noValue(p.escrowAddress, data, cfg.chainId, 'Remove party', preview);
    }

    updateTermsHash(cfg: KlescrowConfig, p: UpdateTermsHashParams): PreparedTx {
        requireAddress(p.callerWallet, 'callerWallet');
        requireAddress(p.escrowAddress, 'escrowAddress');
        requireBytes32Hex(p.termsHash, 'termsHash');
        const data = this.escrowIface.encodeFunctionData('updateTermsHash', [p.termsHash]);
        const preview: SigningPreview = {
            action: 'Update Terms Hash',
            signer: 'either party',
            description: 'Update the on-chain terms hash for this escrow.',
            details: { 'Escrow': p.escrowAddress, 'New terms hash': p.termsHash },
        };
        return noValue(p.escrowAddress, data, cfg.chainId, 'Update terms hash', preview);
    }

    extendExpiry(cfg: KlescrowConfig, p: ExtendExpiryParams): PreparedTx {
        requireAddress(p.callerWallet, 'callerWallet');
        requireAddress(p.escrowAddress, 'escrowAddress');
        if (p.newExpiryUnixSec <= 0n) throw new Error('newExpiryUnixSec must be > 0');
        const data = this.escrowIface.encodeFunctionData('extendExpiry', [p.newExpiryUnixSec]);
        const preview: SigningPreview = {
            action: 'Extend Expiry',
            signer: 'either party',
            description: 'Extend the expiry deadline of this escrow.',
            details: { 'Escrow': p.escrowAddress, 'New expiry': formatUnixSec(p.newExpiryUnixSec) },
        };
        return noValue(p.escrowAddress, data, cfg.chainId, 'Extend expiry', preview);
    }

    // ─── ERC20 helper ─────────────────────────────────────────────────────────

    /**
     * Builds an ERC20 approve(spender, amount) tx on the token contract.
     */
    erc20ApproveDeposit(cfg: KlescrowConfig, p: Erc20ApproveParams): PreparedTx {
        const token   = requireAddress(p.tokenAddress, 'tokenAddress');
        const spender = requireAddress(p.spenderAddress, 'spenderAddress');
        requireAddress(p.ownerWallet, 'ownerWallet');
        if (p.amount < 0n) throw new Error('amount must be >= 0');
        const data = this.erc20Iface.encodeFunctionData('approve', [spender, p.amount]);
        const preview: SigningPreview = {
            action: 'Approve Token Transfer',
            signer: 'buyer',
            description: 'Approve the escrow contract to pull ERC20 tokens from your wallet on deposit.',
            token,
            tokenAmountWei: p.amount.toString(),
            details: {
                'Token':   token,
                'Spender': spender,
                'Amount':  p.amount.toString(),
            },
        };
        return noValue(token, data, cfg.chainId, 'ERC20 approve for escrow deposit', preview);
    }

    // ─── Static utilities ─────────────────────────────────────────────────────

    /** Computes keccak256(UTF-8(uri)) as 0x-prefixed hex. Pass result as CreateEscrowParams.termsHash. */
    static termsHashFromUri(uri: string): string {
        if (!uri?.trim()) throw new Error('uri must not be blank');
        return keccak256(toUtf8Bytes(uri));
    }

    /** Computes platform fee from net amount and basis points. */
    static computeFee(netAmount: bigint, feeBps: bigint): bigint {
        if (feeBps === 0n) return 0n;
        return (netAmount * feeBps) / 10_000n;
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    private simpleCall(
        cfg: KlescrowConfig,
        p: EscrowActionParams,
        fnName: string,
        hint: string,
        previewOverrides: Partial<import('./common/TxPreview.js').SigningPreview> = {},
    ): PreparedTx {
        requireAddress(p.callerWallet, 'callerWallet');
        requireAddress(p.escrowAddress, 'escrowAddress');
        const preview: import('./common/TxPreview.js').SigningPreview = {
            action: hint,
            signer: 'either party',
            description: `Call ${fnName}() on the escrow contract.`,
            ...previewOverrides,
        };
        return noValue(p.escrowAddress, this.escrowIface.encodeFunctionData(fnName, []), cfg.chainId, hint, preview);
    }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

function noValue(to: string, data: string, chainId: number, signerHint: string, preview?: import('./common/TxPreview.js').SigningPreview): PreparedTx {
    return { to, data, value: '0', chainId, signerHint, preview };
}

function withValue(to: string, data: string, value: bigint, chainId: number, signerHint: string, preview?: import('./common/TxPreview.js').SigningPreview): PreparedTx {
    return { to, data, value: value.toString(), chainId, signerHint, preview };
}

function normalizeOptionalAddress(addr: string | null | undefined, name: string): string {
    if (addr == null || addr.trim() === '') return ZeroAddress;
    return requireAddress(addr, name);
}

function normalizeOrZero(addr: string | null | undefined): string {
    if (!addr || addr.trim() === '') return ZeroAddress;
    try { return getAddress(addr); } catch { return ZeroAddress; }
}

export function requireBytes32Hex(value: string, name: string): string {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
        throw new Error(`${name} must be a 0x-prefixed 32-byte hex string`);
    }
    return value;
}