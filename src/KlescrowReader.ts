import { Interface, AbstractProvider, ZeroAddress } from 'ethers';
import { requireAddress } from './common/index.js';
import {
    type FactoryInfo,
    type FeeQuote,
    type EscrowInfo,
    type EscrowImplementationInfo,
    type AppealPeriod,
    EscrowState,
    EscrowIntent,
    escrowStateFromOrdinal,
    escrowIntentFromOrdinal,
} from './types.js';
import { KlescrowFactory__factory, Klescrow__factory } from '../generated/typechain/index.js';
import { type MulticallConfig, type EncodedReadCall, executeMulticall } from './multicall.js';
import type { EscrowReadable } from './internal/EscrowReadable.js';

// ─── KlescrowReader ────────────────────────────────────────────────────────────

/**
 * Stateless reader for on-chain Klescrow state via JSON-RPC eth_call.
 *
 * Accepts any ethers AbstractProvider (JsonRpcProvider, BrowserProvider, etc.).
 * All methods are async and throw if the RPC call fails.
 *
 * Pass a `MulticallConfig` to batch reads through Multicall3.
 * Omit it (or leave undefined) to use the original parallel Promise.all path.
 */
export class KlescrowReader {
    private readonly _multicall?: MulticallConfig;
    readonly readEscrow: EscrowReadable<[escrowAddress: string]>;

    constructor(private readonly provider: AbstractProvider, multicallConfig?: MulticallConfig) {
        this._multicall = multicallConfig;
        this.readEscrow = Object.assign(
            (escrowAddress: string) => this._readEscrowSnapshot(escrowAddress),
            {
                state: (escrowAddress: string) => this._readEscrowState(escrowAddress),
                buyer: (escrowAddress: string) => this._readEscrowString(escrowAddress, 'buyer'),
                seller: (escrowAddress: string) => this._readEscrowString(escrowAddress, 'seller'),
                creator: (escrowAddress: string) => this._readEscrowString(escrowAddress, 'creator'),
                token: (escrowAddress: string) => this._readEscrowString(escrowAddress, 'token'),
                amount: (escrowAddress: string) => this._readEscrowBigInt(escrowAddress, 'amount'),
                fee: (escrowAddress: string) => this._readEscrowBigInt(escrowAddress, 'fee'),
                obligationDeadline: (escrowAddress: string) => this._readEscrowBigInt(escrowAddress, 'obligationDeadline'),
                settlementDeadline: (escrowAddress: string) => this._readEscrowBigInt(escrowAddress, 'settlementDeadline'),
                termsHash: (escrowAddress: string) => this._readEscrowString(escrowAddress, 'termsHash'),
                disputeId: (escrowAddress: string) => this._readEscrowBigInt(escrowAddress, 'disputeId'),
                buyerIntent: (escrowAddress: string) => this._readEscrowIntent(escrowAddress, 'buyerIntent'),
                sellerIntent: (escrowAddress: string) => this._readEscrowIntent(escrowAddress, 'sellerIntent'),
                proposedObligationDeadline: (escrowAddress: string) =>
                    this._readEscrowBigInt(escrowAddress, 'proposedObligationDeadline'),
                arbitrator: (escrowAddress: string) => this._readEscrowString(escrowAddress, 'arbitrator'),
                arbitratorConfiguration: (escrowAddress: string) =>
                    this._readEscrowString(escrowAddress, 'arbitratorConfiguration'),
                arbitrationCost: (escrowAddress: string) => this.readArbitrationCost(escrowAddress),
                appealCost: (escrowAddress: string) => this.readAppealCost(escrowAddress),
                appealPeriod: (escrowAddress: string) => this.readAppealPeriod(escrowAddress),
                pendingWithdrawal: (escrowAddress: string, wallet: string) =>
                    this.readPendingWithdrawal(escrowAddress, wallet),
            },
        );
    }

    // ─── Factory reads ────────────────────────────────────────────────────────

    /**
     * Reads the full factory configuration.
     */
    async readFactory(factoryAddress: string): Promise<FactoryInfo> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        return this._multicall
            ? this._readFactoryViaMulticall(addr)
            : this._readFactoryDirect(addr);
    }

    private async _readFactoryDirect(addr: string): Promise<FactoryInfo> {
        const c = KlescrowFactory__factory.connect(addr, this.provider);

        const [feeBps, feeRecipient, arbitrator, arbitratorConfiguration,
               metaEvidenceUri, owner, pendingOwner, defaultImpl] =
            await Promise.all([
                c.feeBps(),
                c.feeRecipient(),
                c.arbitrator(),
                c.arbitratorConfiguration(),
                c.metaEvidenceURI(),
                c.owner(),
                c.pendingOwner(),
                c.defaultEscrowImplementation(),
            ]);

        return {
            factoryAddress:  addr,
            defaultImpl:     defaultImpl.impl,
            defaultImplName: defaultImpl.name,
            feeBps:          BigInt(feeBps),
            feeRecipient,
            arbitrator,
            arbitratorConfiguration,
            metaEvidenceUri,
            owner,
            pendingOwner: pendingOwner ?? '',
        };
    }

    private async _readFactoryViaMulticall(addr: string): Promise<FactoryInfo> {
        const cfg   = this._multicall!;
        const iface: Interface = KlescrowFactory__factory.createInterface();

        const enc = (method: string): EncodedReadCall => ({
            target:   addr,
            method,
            callData: iface.encodeFunctionData(method, []),
            decode:   (data: string) => iface.decodeFunctionResult(method, data)[0] as unknown,
        });

        const calls: EncodedReadCall[] = [
            enc('feeBps'),
            enc('feeRecipient'),
            enc('arbitrator'),
            enc('arbitratorConfiguration'),
            enc('metaEvidenceURI'),
            enc('owner'),
            enc('pendingOwner'),
            // defaultEscrowImplementation returns two values — decode both
            {
                target:   addr,
                method:   'defaultEscrowImplementation',
                callData: iface.encodeFunctionData('defaultEscrowImplementation', []),
                decode:   (data: string) => {
                    const r = iface.decodeFunctionResult('defaultEscrowImplementation', data);
                    return { impl: r[0] as string, name: r[1] as string };
                },
            },
        ];

        const results = await executeMulticall(
            this.provider, cfg.address, calls, cfg.requireSuccess !== false,
        );

        const [feeBps, feeRecipient, arbitrator, arbitratorConfiguration,
               metaEvidenceUri, owner, pendingOwner, defaultImplRaw] = results;

        const di = defaultImplRaw as { impl: string; name: string };

        return {
            factoryAddress:  addr,
            defaultImpl:     di.impl,
            defaultImplName: di.name,
            feeBps:          BigInt(feeBps as bigint),
            feeRecipient:    feeRecipient as string,
            arbitrator:      arbitrator as string,
            arbitratorConfiguration: arbitratorConfiguration as string,
            metaEvidenceUri: metaEvidenceUri as string,
            owner:           owner as string,
            pendingOwner:    (pendingOwner as string | undefined) ?? '',
        };
    }

    // ─── Single-call factory reads (not worth batching individually) ──────────

    async quoteGross(factoryAddress: string, net: bigint): Promise<FeeQuote> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        if (net <= 0n) throw new Error('net must be > 0');
        const c = KlescrowFactory__factory.connect(addr, this.provider);
        const result = await c.quoteGross(net);
        return { gross: result.gross, fee: result.fee };
    }

    async readFeeBps(factoryAddress: string): Promise<bigint> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        const c = KlescrowFactory__factory.connect(addr, this.provider);
        return BigInt(await c.feeBps());
    }

    async readImplementationCount(factoryAddress: string): Promise<number> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        const c = KlescrowFactory__factory.connect(addr, this.provider);
        return Number(await c.escrowImplementationCount());
    }

    async readImplementationAt(factoryAddress: string, index: number): Promise<EscrowImplementationInfo> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        if (index < 0) throw new Error('index must be >= 0');
        const c = KlescrowFactory__factory.connect(addr, this.provider);
        const result = await c.escrowImplementationAt(index);
        return { address: result.impl, name: result.name };
    }

    async predictEscrowAddress(factoryAddress: string, creator: string, req: {
        id: string;
        buyer?: string | null;
        seller?: string | null;
        token?: string | null;
        amount: bigint;
        fee: bigint;
        expiryTime: bigint;
        settlementDeadline: bigint;
        termsHash: string;
    }, impl?: string): Promise<string> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        const creatorAddr = requireAddress(creator, 'creator');
        const c = KlescrowFactory__factory.connect(addr, this.provider);

        const reqTuple = {
            id:                 req.id,
            buyer:              normalizeOptionalAddress(req.buyer, 'buyer'),
            seller:             normalizeOptionalAddress(req.seller, 'seller'),
            token:              normalizeOptionalAddress(req.token, 'token'),
            amount:             req.amount,
            fee:                req.fee,
            expiryTime:         req.expiryTime,
            settlementDeadline: req.settlementDeadline,
            termsHash:          req.termsHash,
        };

        if (impl) {
            return c['predictEscrowAddress(address,address,(bytes32,address,address,address,uint256,uint256,uint256,uint256,bytes32))'](
                impl, creatorAddr, reqTuple);
        }
        return c['predictEscrowAddress(address,(bytes32,address,address,address,uint256,uint256,uint256,uint256,bytes32))'](
            creatorAddr, reqTuple);
    }

    // ─── Escrow reads ─────────────────────────────────────────────────────────

    /**
     * Reads all on-chain state for a deployed escrow clone.
     */
    private async _readEscrowSnapshot(escrowAddress: string): Promise<EscrowInfo> {
        const addr = requireAddress(escrowAddress, 'escrowAddress');
        return this._multicall
            ? this._readEscrowViaMulticall(addr)
            : this._readEscrowDirect(addr);
    }

    private async _readEscrowDirect(addr: string): Promise<EscrowInfo> {
        const c = Klescrow__factory.connect(addr, this.provider);

        const results = await Promise.all([
            c.state(),
            c.buyer(),
            c.seller(),
            c.creator(),
            c.token(),
            c.amount(),
            c.fee(),
            c.obligationDeadline(),
            c.settlementDeadline(),
            c.termsHash(),
            c.disputeId(),
            c.buyerIntent(),
            c.sellerIntent(),
            c.proposedObligationDeadline(),
            c.arbitrator(),
            c.arbitratorConfiguration(),
        ]);

        return this._buildEscrowInfo(addr, results);
    }

    private async _readEscrowViaMulticall(addr: string): Promise<EscrowInfo> {
        const cfg   = this._multicall!;
        const iface: Interface = Klescrow__factory.createInterface();

        const enc = (method: string): EncodedReadCall => ({
            target:   addr,
            method,
            callData: iface.encodeFunctionData(method, []),
            decode:   (data: string) => iface.decodeFunctionResult(method, data)[0] as unknown,
        });

        const calls: EncodedReadCall[] = [
            enc('state'),
            enc('buyer'),
            enc('seller'),
            enc('creator'),
            enc('token'),
            enc('amount'),
            enc('fee'),
            enc('obligationDeadline'),
            enc('settlementDeadline'),
            enc('termsHash'),
            enc('disputeId'),
            enc('buyerIntent'),
            enc('sellerIntent'),
            enc('proposedObligationDeadline'),
            enc('arbitrator'),
            enc('arbitratorConfiguration'),
        ];

        const results = await executeMulticall(
            this.provider, cfg.address, calls, cfg.requireSuccess !== false,
        );

        return this._buildEscrowInfo(addr, results);
    }

    /** Shared builder — avoids duplicating the 15-field mapping in both read paths. */
    private _buildEscrowInfo(addr: string, results: unknown[]): EscrowInfo {
        const [
            stateOrd, buyer, seller, creator, token,
            amount, fee, obligationDeadline, settlementDeadline, termsHash,
            disputeId, buyerIntentOrd, sellerIntentOrd, proposedObligationDeadline,
            arbitratorAddress, arbitratorConfiguration,
        ] = results;

        return {
            escrowAddress:              addr,
            state:                      escrowStateFromOrdinal(Number(stateOrd)),
            buyer:                      buyer as string,
            seller:                     seller as string,
            creator:                    creator as string,
            token:                      token as string,
            amount:                     amount as bigint,
            fee:                        fee as bigint,
            obligationDeadline:         obligationDeadline as bigint,
            settlementDeadline:         settlementDeadline as bigint,
            termsHash:                  termsHash as string,
            disputeId:                  disputeId as bigint,
            buyerIntent:                escrowIntentFromOrdinal(Number(buyerIntentOrd)),
            sellerIntent:               escrowIntentFromOrdinal(Number(sellerIntentOrd)),
            proposedObligationDeadline: proposedObligationDeadline as bigint,
            arbitratorAddress:          arbitratorAddress as string,
            arbitratorConfiguration:    arbitratorConfiguration as string,
        };
    }

    private _escrow(escrowAddress: string) {
        return Klescrow__factory.connect(
            requireAddress(escrowAddress, 'escrowAddress'),
            this.provider,
        );
    }

    private async _readEscrowState(escrowAddress: string): Promise<EscrowState> {
        return escrowStateFromOrdinal(Number(await this._escrow(escrowAddress).state()));
    }

    private async _readEscrowString(escrowAddress: string, method:
        'buyer' | 'seller' | 'creator' | 'token' | 'termsHash' | 'arbitrator' | 'arbitratorConfiguration',
    ): Promise<string> {
        const escrow = this._escrow(escrowAddress);
        return await escrow[method]() as string;
    }

    private async _readEscrowBigInt(escrowAddress: string, method:
        'amount' | 'fee' | 'obligationDeadline' | 'settlementDeadline' | 'disputeId' | 'proposedObligationDeadline',
    ): Promise<bigint> {
        const escrow = this._escrow(escrowAddress);
        return await escrow[method]() as bigint;
    }

    private async _readEscrowIntent(escrowAddress: string, method: 'buyerIntent' | 'sellerIntent'): Promise<EscrowIntent> {
        const escrow = this._escrow(escrowAddress);
        return escrowIntentFromOrdinal(Number(await escrow[method]()));
    }

    // ─── Single-call escrow reads ─────────────────────────────────────────────

    async readArbitrationCost(escrowAddress: string): Promise<bigint> {
        const addr = requireAddress(escrowAddress, 'escrowAddress');
        const c = Klescrow__factory.connect(addr, this.provider);
        return c.arbitrationCost();
    }

    async readAppealCost(escrowAddress: string): Promise<bigint> {
        const addr = requireAddress(escrowAddress, 'escrowAddress');
        const c = Klescrow__factory.connect(addr, this.provider);
        return c.appealCost();
    }

    async readAppealPeriod(escrowAddress: string): Promise<AppealPeriod> {
        const addr = requireAddress(escrowAddress, 'escrowAddress');
        const c = Klescrow__factory.connect(addr, this.provider);
        const result = await c.appealPeriod();
        return { start: result[0], end: result[1] };
    }

    async readPendingWithdrawal(escrowAddress: string, wallet: string): Promise<bigint> {
        const addr       = requireAddress(escrowAddress, 'escrowAddress');
        const walletAddr = requireAddress(wallet, 'wallet');
        const c = Klescrow__factory.connect(addr, this.provider);
        return c.pendingWithdrawals(walletAddr);
    }
}

// Re-export enums so callers can import everything from this module if they prefer
export { EscrowState, EscrowIntent };

function normalizeOptionalAddress(addr: string | null | undefined, name: string): string {
    if (addr == null || addr.trim() === '') return ZeroAddress;
    return requireAddress(addr, name);
}
