import { requireAddress, ZERO_ADDRESS } from './common/index.js';
import type { AbiCodec, Hex } from './common/AbiCodec.js';
import type { ReadBlockReference, RpcClient } from './common/index.js';
import { encodeRpcBlockReference, ethCall, type RpcBlockIdentifier } from './internal/rpc.js';
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
import { type MulticallConfig, type EncodedReadCall, executeMulticall } from './multicall.js';
import type { EscrowReadable } from './internal/EscrowReadable.js';

export class KlescrowReader {
    private readonly _multicall?: MulticallConfig;
    private readonly _rpcClient: RpcClient;
    private readonly _codec: AbiCodec;
    private readonly _readBlock: RpcBlockIdentifier;
    readonly readEscrow: EscrowReadable<[escrowAddress: string]>;

    constructor(rpcClient: RpcClient, codec: AbiCodec, multicallConfig?: MulticallConfig, readBlock: ReadBlockReference = 'latest') {
        this._rpcClient = rpcClient;
        this._codec = codec;
        this._multicall = multicallConfig;
        this._readBlock = encodeRpcBlockReference(readBlock);
        this.readEscrow = Object.assign(
            (escrowAddress: string) => this._readEscrowSnapshot(escrowAddress),
            {
                state: (address: string) => this._readEscrowState(address),
                buyer: (address: string) => this._readEscrowString(address, 'buyer'),
                seller: (address: string) => this._readEscrowString(address, 'seller'),
                creator: (address: string) => this._readEscrowString(address, 'creator'),
                token: (address: string) => this._readEscrowString(address, 'token'),
                amount: (address: string) => this._readEscrowBigInt(address, 'amount'),
                fee: (address: string) => this._readEscrowBigInt(address, 'fee'),
                obligationDeadline: (address: string) => this._readEscrowBigInt(address, 'obligationDeadline'),
                settlementDeadline: (address: string) => this._readEscrowBigInt(address, 'settlementDeadline'),
                termsHash: (address: string) => this._readEscrowString(address, 'termsHash'),
                disputeId: (address: string) => this._readEscrowBigInt(address, 'disputeId'),
                buyerIntent: (address: string) => this._readEscrowIntent(address, 'buyerIntent'),
                sellerIntent: (address: string) => this._readEscrowIntent(address, 'sellerIntent'),
                proposedObligationDeadline: (address: string) => this._readEscrowBigInt(address, 'proposedObligationDeadline'),
                arbitrator: (address: string) => this._readEscrowString(address, 'arbitrator'),
                arbitratorConfiguration: (address: string) => this._readEscrowString(address, 'arbitratorConfiguration'),
                arbitrationCost: (address: string) => this.readArbitrationCost(address),
                appealCost: (address: string) => this.readAppealCost(address),
                appealPeriod: (address: string) => this.readAppealPeriod(address),
                pendingWithdrawal: (address: string, wallet: string) => this.readPendingWithdrawal(address, wallet),
            },
        );
    }

    async readFactory(factoryAddress: string): Promise<FactoryInfo> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        return this._multicall ? this._readFactoryViaMulticall(addr) : this._readFactoryDirect(addr);
    }

    private async _readFactoryDirect(addr: string): Promise<FactoryInfo> {
        const call = (method: string) => this._call({ to: addr, data: this._codec.encode(`${method}()`) });
        const [feeBpsRaw, feeRecipientRaw, arbitratorRaw, arbitratorConfigurationRaw, metaEvidenceUriRaw, ownerRaw, pendingOwnerRaw, defaultImplRaw] = await Promise.all([
            call('feeBps'), call('feeRecipient'), call('arbitrator'), call('arbitratorConfiguration'), call('metaEvidenceURI'), call('owner'), call('pendingOwner'), call('defaultEscrowImplementation'),
        ]);
        const [defaultImpl, defaultImplName] = this._codec.decode('defaultEscrowImplementation()', defaultImplRaw);
        const pendingOwner = this._codec.decode('pendingOwner()', pendingOwnerRaw)[0] as string;
        return {
            factoryAddress: addr,
            defaultImpl: defaultImpl as string,
            defaultImplName: defaultImplName as string,
            feeBps: this._codec.decode('feeBps()', feeBpsRaw)[0] as bigint,
            feeRecipient: this._codec.decode('feeRecipient()', feeRecipientRaw)[0] as string,
            arbitrator: this._codec.decode('arbitrator()', arbitratorRaw)[0] as string,
            arbitratorConfiguration: this._codec.decode('arbitratorConfiguration()', arbitratorConfigurationRaw)[0] as string,
            metaEvidenceUri: this._codec.decode('metaEvidenceURI()', metaEvidenceUriRaw)[0] as string,
            owner: this._codec.decode('owner()', ownerRaw)[0] as string,
            pendingOwner: pendingOwner && pendingOwner !== ZERO_ADDRESS ? pendingOwner : '',
        };
    }

    private async _readFactoryViaMulticall(addr: string): Promise<FactoryInfo> {
        const calls: EncodedReadCall[] = [
            ...['feeBps', 'feeRecipient', 'arbitrator', 'arbitratorConfiguration', 'metaEvidenceURI', 'owner', 'pendingOwner'].map(method => this._encodeReadCall(addr, method)),
            this._encodeReadCall(addr, 'defaultEscrowImplementation', data => {
                const [impl, name] = this._codec.decode('defaultEscrowImplementation()', data);
                return { impl: impl as string, name: name as string };
            }),
        ];
        const values = await this._executeMulticall(calls);
        const defaultImpl = values[7] as { impl: string; name: string };
        return {
            factoryAddress: addr,
            defaultImpl: defaultImpl.impl,
            defaultImplName: defaultImpl.name,
            feeBps: values[0] as bigint,
            feeRecipient: values[1] as string,
            arbitrator: values[2] as string,
            arbitratorConfiguration: values[3] as string,
            metaEvidenceUri: values[4] as string,
            owner: values[5] as string,
            pendingOwner: values[6] as string === ZERO_ADDRESS ? '' : values[6] as string,
        };
    }

    async quoteGross(factoryAddress: string, net: bigint): Promise<FeeQuote> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        if (net <= 0n) throw new Error('net must be > 0');
        const signature = 'quoteGross(uint256)';
        const [gross, fee] = this._codec.decode(signature, await this._call({ to: addr, data: this._codec.encode(signature, [net]) }));
        return { gross: gross as bigint, fee: fee as bigint };
    }

    async readFeeBps(factoryAddress: string): Promise<bigint> {
        return await this._readFactoryValue(factoryAddress, 'feeBps()') as bigint;
    }

    async readImplementationCount(factoryAddress: string): Promise<number> {
        return Number(await this._readFactoryValue(factoryAddress, 'escrowImplementationCount()'));
    }

    async readImplementationAt(factoryAddress: string, index: number): Promise<EscrowImplementationInfo> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        if (index < 0) throw new Error('index must be >= 0');
        const signature = 'escrowImplementationAt(uint256)';
        const [address, name] = this._codec.decode(signature, await this._call({ to: addr, data: this._codec.encode(signature, [index]) }));
        return { address: address as string, name: name as string };
    }

    async predictEscrowAddress(factoryAddress: string, creator: string, req: {
        id: string; buyer?: string | null; seller?: string | null; token?: string | null;
        amount: bigint; fee: bigint; expiryTime: bigint; settlementDeadline: bigint; termsHash: string;
    }, impl?: string): Promise<string> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        const creatorAddr = requireAddress(creator, 'creator');
        const tuple = {
            id: req.id,
            buyer: normalizeOptionalAddress(req.buyer, 'buyer'),
            seller: normalizeOptionalAddress(req.seller, 'seller'),
            token: normalizeOptionalAddress(req.token, 'token'),
            amount: req.amount,
            fee: req.fee,
            expiryTime: req.expiryTime,
            settlementDeadline: req.settlementDeadline,
            termsHash: req.termsHash,
        };
        const signature = impl
            ? 'predictEscrowAddress(address,address,(bytes32,address,address,address,uint256,uint256,uint256,uint256,bytes32))'
            : 'predictEscrowAddress(address,(bytes32,address,address,address,uint256,uint256,uint256,uint256,bytes32))';
        const args = impl ? [impl, creatorAddr, tuple] : [creatorAddr, tuple];
        return this._codec.decode(signature, await this._call({ to: addr, data: this._codec.encode(signature, args) }))[0] as string;
    }

    private async _readEscrowSnapshot(escrowAddress: string): Promise<EscrowInfo> {
        const addr = requireAddress(escrowAddress, 'escrowAddress');
        return this._multicall ? this._readEscrowViaMulticall(addr) : this._readEscrowDirect(addr);
    }

    private async _readEscrowDirect(addr: string): Promise<EscrowInfo> {
        const methods = ['state', 'buyer', 'seller', 'creator', 'token', 'amount', 'fee', 'obligationDeadline', 'settlementDeadline', 'termsHash', 'disputeId', 'buyerIntent', 'sellerIntent', 'proposedObligationDeadline', 'arbitrator', 'arbitratorConfiguration'];
        const raw = await Promise.all(methods.map(method => this._call({ to: addr, data: this._codec.encode(`${method}()`) })));
        const values = raw.map((data, index) => this._codec.decode(`${methods[index]}()`, data)[0]);
        return this._buildEscrowInfo(addr, values);
    }

    private async _readEscrowViaMulticall(addr: string): Promise<EscrowInfo> {
        const methods = ['state', 'buyer', 'seller', 'creator', 'token', 'amount', 'fee', 'obligationDeadline', 'settlementDeadline', 'termsHash', 'disputeId', 'buyerIntent', 'sellerIntent', 'proposedObligationDeadline', 'arbitrator', 'arbitratorConfiguration'];
        return this._buildEscrowInfo(addr, await this._executeMulticall(methods.map(method => this._encodeReadCall(addr, method))));
    }

    private _buildEscrowInfo(addr: string, results: readonly unknown[]): EscrowInfo {
        const [stateOrd, buyer, seller, creator, token, amount, fee, obligationDeadline, settlementDeadline, termsHash, disputeId, buyerIntentOrd, sellerIntentOrd, proposedObligationDeadline, arbitratorAddress, arbitratorConfiguration] = results;
        return {
            escrowAddress: addr,
            state: escrowStateFromOrdinal(Number(stateOrd)),
            buyer: buyer as string, seller: seller as string, creator: creator as string, token: token as string,
            amount: amount as bigint, fee: fee as bigint, obligationDeadline: obligationDeadline as bigint,
            settlementDeadline: settlementDeadline as bigint, termsHash: termsHash as string, disputeId: disputeId as bigint,
            buyerIntent: escrowIntentFromOrdinal(Number(buyerIntentOrd)), sellerIntent: escrowIntentFromOrdinal(Number(sellerIntentOrd)),
            proposedObligationDeadline: proposedObligationDeadline as bigint,
            arbitratorAddress: arbitratorAddress as string, arbitratorConfiguration: arbitratorConfiguration as string,
        };
    }

    private _encodeReadCall<T = unknown>(target: string, method: string, decode?: (data: Hex) => T): EncodedReadCall<T> {
        const signature = `${method}()`;
        return { target, method, callData: this._codec.encode(signature), decode: decode ?? (data => this._codec.decode(signature, data)[0] as T) };
    }

    private async _executeMulticall<T>(calls: readonly EncodedReadCall<T>[]): Promise<T[]> {
        const config = this._multicall;
        if (!config) throw new Error('Multicall is not configured.');
        return executeMulticall(this._rpcClient, this._codec, config.address, calls, this._readBlock);
    }

    private async _readEscrowValue(address: string, method: string): Promise<unknown> {
        const addr = requireAddress(address, 'escrowAddress');
        const signature = `${method}()`;
        return this._codec.decode(signature, await this._call({ to: addr, data: this._codec.encode(signature) }))[0];
    }

    private async _readEscrowState(address: string): Promise<EscrowState> { return escrowStateFromOrdinal(Number(await this._readEscrowValue(address, 'state'))); }
    private async _readEscrowString(address: string, method: 'buyer' | 'seller' | 'creator' | 'token' | 'termsHash' | 'arbitrator' | 'arbitratorConfiguration'): Promise<string> { return await this._readEscrowValue(address, method) as string; }
    private async _readEscrowBigInt(address: string, method: 'amount' | 'fee' | 'obligationDeadline' | 'settlementDeadline' | 'disputeId' | 'proposedObligationDeadline'): Promise<bigint> { return await this._readEscrowValue(address, method) as bigint; }
    private async _readEscrowIntent(address: string, method: 'buyerIntent' | 'sellerIntent'): Promise<EscrowIntent> { return escrowIntentFromOrdinal(Number(await this._readEscrowValue(address, method))); }

    async readArbitrationCost(escrowAddress: string): Promise<bigint> { return await this._readEscrowValue(escrowAddress, 'arbitrationCost') as bigint; }
    async readAppealCost(escrowAddress: string): Promise<bigint> { return await this._readEscrowValue(escrowAddress, 'appealCost') as bigint; }

    async readAppealPeriod(escrowAddress: string): Promise<AppealPeriod> {
        const addr = requireAddress(escrowAddress, 'escrowAddress');
        const signature = 'appealPeriod()';
        const [start, end] = this._codec.decode(signature, await this._call({ to: addr, data: this._codec.encode(signature) }));
        return { start: start as bigint, end: end as bigint };
    }

    async readPendingWithdrawal(escrowAddress: string, wallet: string): Promise<bigint> {
        const addr = requireAddress(escrowAddress, 'escrowAddress');
        const walletAddr = requireAddress(wallet, 'wallet');
        const signature = 'pendingWithdrawals(address)';
        return this._codec.decode(signature, await this._call({ to: addr, data: this._codec.encode(signature, [walletAddr]) }))[0] as bigint;
    }

    private async _readFactoryValue(factoryAddress: string, signature: string): Promise<unknown> {
        const addr = requireAddress(factoryAddress, 'factoryAddress');
        return this._codec.decode(signature, await this._call({ to: addr, data: this._codec.encode(signature) }))[0];
    }

    private _call(request: { to: string; data: Hex }): Promise<Hex> { return ethCall(this._rpcClient, request, this._readBlock); }
}

export { EscrowState, EscrowIntent };

function normalizeOptionalAddress(addr: string | null | undefined, name: string): string {
    if (addr == null || addr.trim() === '') return ZERO_ADDRESS;
    return requireAddress(addr, name);
}