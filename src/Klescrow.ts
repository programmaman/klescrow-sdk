import type { PreparedTx } from './common/index.js';
import type { AbiCodec, ReadBlockReference, RpcClient } from './common/index.js';
import type {
    FactoryInfo,
    FeeQuote,
    EscrowImplementationInfo,
    EscrowCreatedEvent,
    PrepareCreateParams,
    PrepareCreateErc20Params,
    PrepareCreateEthResult,
    PrepareCreateErc20Result,
} from './types.js';
import type {
    KlescrowConfig,
    CreateEscrowParams,
    Erc20ApproveParams,
} from './KlescrowTxBuilder.js';
import { KlescrowTxBuilder } from './KlescrowTxBuilder.js';
import { KlescrowReader } from './KlescrowReader.js';
import { KlescrowEvents, TOPIC_ESCROW_CREATED } from './KlescrowEvents.js';
import { Escrow } from './Escrow.js';
import { requireAddress, IdGenerator } from './common/index.js';
import type { MulticallConfig } from './multicall.js';
import { getFactoryAddress, requireSupportedChainId } from './deployments.js';

// SDK configuration

export interface KlescrowSdkConfig {
    /** EVM chain ID used for reads and prepared transactions. */
    chainId: number;
    /** Factory address; defaults to the canonical deployment for `chainId`. */
    factoryAddress?: string;
    /** Application-supplied read-only JSON-RPC capability. */
    rpcClient: RpcClient;
    /** Application-supplied ABI encoder/decoder. */
    codec: AbiCodec;
    /** Block context for reads; defaults to `latest`. */
    readBlock?: ReadBlockReference;
    /** Default wallet for writes; can be overridden per call. */
    walletAddress?: string;
    /** Optional Multicall3 configuration for batched reads. */
    multicall?: MulticallConfig;
    /** Optional implementation to pin for create and predict calls. */
    impl?: EscrowImplementationInfo;
}

/** Options for {@link Klescrow.fromRpc}. */
export interface KlescrowFromRpcOptions {
    /** ABI encoder/decoder used by the SDK. */
    readonly codec: AbiCodec;
    /** Optional factory override. */
    readonly factoryAddress?: string;
    /** Optional default wallet for writes. */
    readonly walletAddress?: string;
    /** Optional block context for reads. */
    readonly readBlock?: ReadBlockReference;
    /** Optional Multicall3 configuration. */
    readonly multicall?: MulticallConfig;
    /** Optional implementation name or address to pin. */
    readonly implNameOrAddress?: string;
}

// Factory handle

/**
 * Factory-level reads and transaction builders, exposed as `klescrow.factory`.
 */
export class FactoryHandle {
    constructor(
        private readonly cfg:          KlescrowConfig,
        private readonly reader:       KlescrowReader,
        private readonly builder:      KlescrowTxBuilder,
        private readonly decoder:      KlescrowEvents,
        private readonly rpcClient:    RpcClient,
        private readonly walletAddress?: string,
        private readonly impl?:        string,
    ) {}

    // Reads

    /** Reads the complete on-chain factory configuration. */
    readConfig(): Promise<FactoryInfo> {
        return this.reader.readFactory(this.cfg.factoryAddress);
    }

    /**
     * Quotes the gross amount (net + protocol fee) for a given net amount.
     * Use the returned `gross` value as `amount` when building `CreateEscrowParams`.
     */
    quoteGross(net: bigint): Promise<FeeQuote> {
        return this.reader.quoteGross(this.cfg.factoryAddress, net);
    }

    /** Reads the protocol fee in basis points (`10_000` = 100%). */
    feeBps(): Promise<bigint> {
        return this.reader.readFeeBps(this.cfg.factoryAddress);
    }

    /** Reads the number of registered escrow implementations. */
    implementationCount(): Promise<number> {
        return this.reader.readImplementationCount(this.cfg.factoryAddress);
    }

    /** Reads an implementation by zero-based index. */
    implementationAt(index: number): Promise<EscrowImplementationInfo> {
        return this.reader.readImplementationAt(this.cfg.factoryAddress, index);
    }

    /**
     * Predicts the deterministic clone address for a creator and escrow request.
     */
    predictAddress(creator: string, req: {
        id: string;
        buyer?: string | null;
        seller?: string | null;
        token?: string | null;
        amount: bigint;
        fee: bigint;
        expiryTime: bigint;
        settlementDeadline: bigint;
        termsHash: string;
    }): Promise<string> {
        return this.reader.predictEscrowAddress(this.cfg.factoryAddress, creator, req, this.impl);
    }

    /**
     * Hashes a terms URI into the bytes32 value expected by `createEscrow`.
     */
    termsHashFromUri(uri: string): string {
        return KlescrowTxBuilder.termsHashFromUri(uri);
    }

    /**
     * Reads all registered escrow implementations in factory order.
     */
    async listImplementations(): Promise<EscrowImplementationInfo[]> {
        const count = await this.reader.readImplementationCount(this.cfg.factoryAddress);
        return Promise.all(
            Array.from({ length: count }, (_, i) =>
                this.reader.readImplementationAt(this.cfg.factoryAddress, i)),
        );
    }

    // Writes

    /**
     * Builds an unsigned ETH-funded `createEscrow` transaction.
     */
    createEthEscrow(p: Omit<CreateEscrowParams, 'callerWallet'>, wallet?: string): PreparedTx {
        return this.builder.createEthEscrow(this.cfg, {
            ...p,
            callerWallet: this.resolveWallet(wallet),
            impl: this.impl,
        });
    }

    /**
     * Builds an unsigned ERC20-funded `createEscrow` transaction.
     */
    createErc20Escrow(p: Omit<CreateEscrowParams, 'callerWallet'>, wallet?: string): PreparedTx {
        return this.builder.createErc20Escrow(this.cfg, {
            ...p,
            callerWallet: this.resolveWallet(wallet),
            impl: this.impl,
        });
    }

    /**
     * Builds an ERC20 approval transaction for an escrow deposit.
     */
    erc20Approve(p: Omit<Erc20ApproveParams, 'ownerWallet'>, wallet?: string): PreparedTx {
        return this.builder.erc20ApproveDeposit(this.cfg, {
            ...p,
            ownerWallet: this.resolveWallet(wallet),
        });
    }

    // Read-and-build helpers

    /** Quotes the fee and builds an unsigned ETH create transaction. */
    async prepareCreateEthEscrow(
        params: Omit<PrepareCreateParams, 'callerWallet'>,
        wallet?: string,
    ): Promise<PrepareCreateEthResult> {
        const { gross, fee } = await this.reader.quoteGross(this.cfg.factoryAddress, params.netAmount);
        const escrowId = params.escrowId ?? IdGenerator.generateOnChainIdHex();
        const tx = this.builder.createEthEscrow(this.cfg, {
            callerWallet:               this.resolveWallet(wallet),
            escrowId,
            buyerAddress:               params.buyerAddress,
            sellerAddress:              params.sellerAddress,
            amount:                     params.netAmount,
            fee,
            obligationDeadlineUnixSec:  params.obligationDeadlineUnixSec,
            settlementDeadlineUnixSec:  params.settlementDeadlineUnixSec,
            termsHash:                  params.termsHash,
            impl:                       this.impl,
        });
        return { tx, escrowId, gross, fee };
    }

    /**
     * Quotes the fee, predicts the clone, and builds the approval and create
     * transactions. Send `approveTx` before `createTx`.
     */
    async prepareCreateErc20Escrow(
        params: Omit<PrepareCreateErc20Params, 'callerWallet'>,
        wallet?: string,
    ): Promise<PrepareCreateErc20Result> {
        const { gross, fee } = await this.reader.quoteGross(this.cfg.factoryAddress, params.netAmount);
        const escrowId = params.escrowId ?? IdGenerator.generateOnChainIdHex();
        const caller   = this.resolveWallet(wallet);

        const predictedAddress = await this.reader.predictEscrowAddress(this.cfg.factoryAddress, caller, {
            id:                 escrowId,
            buyer:              params.buyerAddress ?? null,
            seller:             params.sellerAddress ?? null,
            token:              params.tokenAddress,
            amount:             params.netAmount,
            fee,
            expiryTime:         params.obligationDeadlineUnixSec,
            settlementDeadline: params.settlementDeadlineUnixSec,
            termsHash:          params.termsHash,
        }, this.impl);

        const approveTx = this.builder.erc20ApproveDeposit(this.cfg, {
            ownerWallet:    caller,
            tokenAddress:   params.tokenAddress,
            spenderAddress: predictedAddress,
            amount:         gross,
        });

        const createTx = this.builder.createErc20Escrow(this.cfg, {
            callerWallet:               caller,
            escrowId,
            buyerAddress:               params.buyerAddress,
            sellerAddress:              params.sellerAddress,
            tokenAddress:               params.tokenAddress,
            amount:                     params.netAmount,
            fee,
            obligationDeadlineUnixSec:  params.obligationDeadlineUnixSec,
            settlementDeadlineUnixSec:  params.settlementDeadlineUnixSec,
            termsHash:                  params.termsHash,
            impl:                       this.impl,
        });

        return { createTx, approveTx, escrowId, gross, fee, predictedAddress };
    }

    // Event history

    /**
     * Fetches decoded `EscrowCreated` events emitted by this factory.
     *
     * @param fromBlock  First block to scan (default: 0).
     * @param toBlock    Last block to scan (default: 'latest').
     */
    async getLogs(
        fromBlock: number | 'earliest' = 0,
        toBlock:   number | 'latest'   = 'latest',
    ): Promise<EscrowCreatedEvent[]> {
        const rawLogs = await this.rpcClient.getLogs({
            address:   this.cfg.factoryAddress,
            topics:    [TOPIC_ESCROW_CREATED],
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
            const decoded = this.decoder.tryDecodeEscrowCreated(evmLog);
            return decoded ? [decoded] : [];
        });
    }

    /** Fetches creation events filtered by buyer or seller. */
    async getLogsByParty(
        role:       'buyer' | 'seller',
        party:      string,
        fromBlock:  number | 'earliest' = 0,
        toBlock:    number | 'latest'   = 'latest',
    ): Promise<EscrowCreatedEvent[]> {
        const all = await this.getLogs(fromBlock, toBlock);
        const normalized = requireAddress(party, 'party');
        return all.filter(e => role === 'seller'
            ? requireAddress(e.seller, 'seller') === normalized
            : requireAddress(e.buyer, 'buyer') === normalized);
    }

    /** Fetches creation events filtered by the factory creator. */
    async getLogsByCreator(
        creator:     string,
        fromBlock:   number | 'earliest' = 0,
        toBlock:     number | 'latest'   = 'latest',
    ): Promise<EscrowCreatedEvent[]> {
        const creatorTopic = '0x000000000000000000000000' + requireAddress(creator, 'creator').toLowerCase().slice(2);
        const rawLogs = await this.rpcClient.getLogs({
            address:   this.cfg.factoryAddress,
            topics:    [TOPIC_ESCROW_CREATED, null, creatorTopic],
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
            const decoded = this.decoder.tryDecodeEscrowCreated(evmLog);
            return decoded ? [decoded] : [];
        });
    }

    // Internals

    private resolveWallet(override?: string): string {
        const w = override ?? this.walletAddress;
        if (!w) throw new Error(
            'walletAddress is required — pass it to new Klescrow({ walletAddress }) or as the last argument to this method.',
        );
        return w;
    }
}

// Klescrow SDK

/** Top-level entry point for Klescrow reads and unsigned transaction builders. */
export class Klescrow {
    /** Factory-level reads and transaction builders. */
    readonly factory: FactoryHandle;

    private readonly _reader:   KlescrowReader;
    private readonly _builder:  KlescrowTxBuilder;
    private readonly _events:   KlescrowEvents;
    private readonly _cfg:      KlescrowConfig;
    private readonly _rpcClient: RpcClient;
    private readonly _wallet?:  string;
    private readonly _impl?:    string;

    /** Creates an instance from explicit chain and deployment configuration. */
    constructor(config: KlescrowSdkConfig) {
        const chainId = Klescrow._normalizeChainId(config.chainId);

        if (!config.factoryAddress) {
            requireSupportedChainId(chainId);
        }

        const factoryAddress = config.factoryAddress ?? getFactoryAddress(chainId);
        if (!factoryAddress) {
            throw new Error(`Unsupported chain ID: ${chainId}`);
        }

        requireAddress(factoryAddress, 'factoryAddress');
        this._cfg      = { chainId, factoryAddress };
        this._rpcClient = config.rpcClient;
        this._reader   = new KlescrowReader(config.rpcClient, config.codec, config.multicall, config.readBlock);
        this._builder  = new KlescrowTxBuilder(config.codec);
        this._events   = new KlescrowEvents(config.codec);
        this._wallet   = config.walletAddress;
        this._impl     = config.impl
            ? requireAddress(config.impl.address, 'impl')
            : undefined;

        this.factory = new FactoryHandle(
            this._cfg, this._reader, this._builder, this._events,
            this._rpcClient, this._wallet, this._impl,
        );
    }

    /** Creates an instance using the canonical factory for `chainId`. */
    static forChain(
        chainId: number,
        rpcClient: RpcClient,
        codec: AbiCodec,
        walletAddress?: string,
        impl?: EscrowImplementationInfo,
    ): Klescrow {
        return new Klescrow({ chainId, rpcClient, codec, walletAddress, impl });
    }

    /**
     * Creates an instance by discovering the chain through JSON-RPC.
     *
     * @param rpcClient Application-supplied read-only JSON-RPC capability.
     * @param options ABI codec and optional deployment settings.
     * @throws If the chain ID or selected implementation is invalid or unsupported.
     */
    static async fromRpc(
        rpcClient: RpcClient,
        options: KlescrowFromRpcOptions,
    ): Promise<Klescrow> {
        const chainId = Klescrow._normalizeChainId(await rpcClient.getChainId());
        const factoryAddress = options.factoryAddress ?? getFactoryAddress(chainId);
        if (!factoryAddress) {
            throw new Error(`Unsupported chain ID: ${chainId}`);
        }

        const reader = new KlescrowReader(rpcClient, options.codec, options.multicall, options.readBlock);
        let impl: EscrowImplementationInfo | undefined;
        if (options.implNameOrAddress) {
            impl = await this._resolveImpl(reader, factoryAddress, options.implNameOrAddress);
        }

        return new Klescrow({
            chainId,
            rpcClient,
            codec: options.codec,
            factoryAddress,
            walletAddress: options.walletAddress,
            readBlock: options.readBlock,
            multicall: options.multicall,
            impl,
        });
    }

    private static _normalizeChainId(chainId: number): number {
        if (!Number.isSafeInteger(chainId) || chainId <= 0) {
            throw new Error(`Invalid Klescrow chain ID: ${chainId}.`);
        }
        return chainId;
    }

    private static async _resolveImpl(
        reader: KlescrowReader,
        factoryAddress: string,
        nameOrAddress: string,
    ): Promise<EscrowImplementationInfo> {
        // An address can be used directly.
        if (nameOrAddress.startsWith('0x')) {
            return { address: requireAddress(nameOrAddress, 'impl'), name: '' };
        }
        // Otherwise resolve the name from the factory.
        const count  = await reader.readImplementationCount(factoryAddress);
        const impls  = await Promise.all(
            Array.from({ length: count }, (_, i) =>
                reader.readImplementationAt(factoryAddress, i)),
        );
        const match = impls.find(i =>
            i.name.toLowerCase() === nameOrAddress.toLowerCase());
        if (!match) throw new Error(
            `No implementation named "${nameOrAddress}" on factory ${factoryAddress}. ` +
            `Available: ${impls.map(i => i.name).join(', ')}.`);
        return match;
    }

    /** Returns an escrow handle without making a network request. */
    escrow(address: string): Escrow {
        return new Escrow(
            requireAddress(address, 'escrowAddress'),
            this._cfg, this._reader, this._builder, this._events, this._rpcClient, this._wallet,
        );
    }

    /** Hashes a terms URI into the bytes32 value expected by `createEscrow`. */
    termsHashFromUri(uri: string): string {
        return this.factory.termsHashFromUri(uri);
    }
}
