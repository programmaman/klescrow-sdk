import type { AbstractProvider } from 'ethers';
import { getAddress } from 'ethers';
import type { PreparedTx } from './common/index.js';
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
import { FACTORY_ADDRESS, getFactoryAddress } from './deployments.js';

// ─── SDK config ───────────────────────────────────────────────────────────────

export interface KlescrowSdkConfig {
    chainId: number;
    /** Defaults to the replayed Klescrow factory address. */
    factoryAddress?: string;
    /** ethers AbstractProvider (JsonRpcProvider, BrowserProvider, …). */
    provider: AbstractProvider;
    /**
     * Current user's wallet address.
     * When set, all write operations pre-fill `callerWallet` automatically.
     * Can still be overridden per-call.
     */
    walletAddress?: string;
    /**
     * Optional Multicall3 configuration.
     * When set, `readEscrow` and `readFactory` batch all their eth_calls into a
     * single `aggregate3` request, reducing RPC round-trips significantly.
     *
     * The canonical Multicall3 address on most EVM chains is:
     * `0xcA11bde05977b3631167028862bE2a173976CA11`
     *
     * Omit to keep the default parallel-Promise.all behaviour.
     */
    multicall?: MulticallConfig;
    /**
     * Optional escrow implementation to pin.
     *
     * Omit (or set undefined) to use the factory's live default.
     *
     * Set to an {@link EscrowImplementationInfo} from {@link FactoryHandle.listImplementations}
     * to pin a specific implementation for all create and predict calls on this SDK instance.
     */
    impl?: EscrowImplementationInfo;
}

// ─── FactoryHandle ─────────────────────────────────────────────────────────────

/**
 * Factory-level namespace. Access via `klescrow.factory`.
 *
 * Read methods are async (eth_call). Write methods return unsigned `PreparedTx`.
 */
export class FactoryHandle {
    constructor(
        private readonly cfg:          KlescrowConfig,
        private readonly reader:       KlescrowReader,
        private readonly builder:      KlescrowTxBuilder,
        private readonly decoder:      KlescrowEvents,
        private readonly provider:     AbstractProvider,
        private readonly walletAddress?: string,
        private readonly impl?:        string,
    ) {}

    // ─── Reads ─────────────────────────────────────────────────────────────

    /** Full on-chain factory configuration (fees, arbitrator, owner, …). */
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

    /** Current protocol fee in basis points (10 000 = 100 %). */
    feeBps(): Promise<bigint> {
        return this.reader.readFeeBps(this.cfg.factoryAddress);
    }

    /** Number of registered escrow implementation contracts. */
    implementationCount(): Promise<number> {
        return this.reader.readImplementationCount(this.cfg.factoryAddress);
    }

    /** Implementation address + name at `index` (0-based). */
    implementationAt(index: number): Promise<EscrowImplementationInfo> {
        return this.reader.readImplementationAt(this.cfg.factoryAddress, index);
    }

    /**
     * Calls `predictEscrowAddress` on-chain and returns the deterministic clone address.
     * Pass the wallet/creator that will submit `createEscrow(...)`.
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
     * Hashes a terms URI into the bytes32 value expected by createEscrow.
     * Convenience passthrough to the low-level tx builder helper.
     */
    termsHashFromUri(uri: string): string {
        return KlescrowTxBuilder.termsHashFromUri(uri);
    }

    /**
     * Reads all registered escrow implementations from the factory.
     *
     * Returns an ordered list of `{ address, name }` pairs suitable for
     * passing to {@link KlescrowSdkConfig.impl} or {@link Klescrow.fromProvider}.
     */
    async listImplementations(): Promise<EscrowImplementationInfo[]> {
        const count = await this.reader.readImplementationCount(this.cfg.factoryAddress);
        return Promise.all(
            Array.from({ length: count }, (_, i) =>
                this.reader.readImplementationAt(this.cfg.factoryAddress, i)),
        );
    }

    // ─── Writes ────────────────────────────────────────────────────────────

    /**
     * Build an unsigned `createEscrow` transaction for a native-ETH-funded escrow.
     */
    createEthEscrow(p: Omit<CreateEscrowParams, 'callerWallet'>, wallet?: string): PreparedTx {
        return this.builder.createEthEscrow(this.cfg, {
            ...p,
            callerWallet: this.resolveWallet(wallet),
            impl: this.impl,
        });
    }

    /**
     * Build an unsigned `createEscrow` transaction for an ERC20-funded escrow.
     */
    createErc20Escrow(p: Omit<CreateEscrowParams, 'callerWallet'>, wallet?: string): PreparedTx {
        return this.builder.createErc20Escrow(this.cfg, {
            ...p,
            callerWallet: this.resolveWallet(wallet),
            impl: this.impl,
        });
    }

    /**
     * Build an ERC20 `approve(spender, amount)` transaction.
     */
    erc20Approve(p: Omit<Erc20ApproveParams, 'ownerWallet'>, wallet?: string): PreparedTx {
        return this.builder.erc20ApproveDeposit(this.cfg, {
            ...p,
            ownerWallet: this.resolveWallet(wallet),
        });
    }

    // ─── Prepare helpers (read + build in one call) ───────────────────────────

    /**
     * Quotes the protocol fee, then builds the `createEscrow` transaction.
     *
     * Pass `netAmount` — gross and fee are computed automatically.
     * `escrowId` is auto-generated (cryptographically random bytes32) if omitted.
     *
     * Eliminates the manual quote → create pattern:
     * ```ts
     * // Before
     * const { gross, fee } = await klescrow.factory.quoteGross(net);
     * const tx = klescrow.factory.createEthEscrow({ escrowId, amount: gross, fee, … });
     *
     * // After
     * const { tx, escrowId, gross, fee } = await klescrow.factory.prepareCreateEthEscrow({
     *   netAmount: 1_000_000n,
     *   sellerAddress: '0xSELLER…',
     *   obligationDeadlineUnixSec: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
     *   termsHash: KlescrowTxBuilder.termsHashFromUri('ipfs://Qm…'),
     * });
     * ```
     */
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
     * Quotes the protocol fee, predicts the clone address, then builds both the
     * ERC20 `approve` and `createEscrow` transactions.
     *
     * **Send `approveTx` first**, then `createTx`.
     *
     * Eliminates the manual quote → predictAddress → approve → create pattern:
     * ```ts
     * // Before
     * const { gross, fee } = await klescrow.factory.quoteGross(net);
     * const predicted = await klescrow.factory.predictAddress(wallet.address, { … });
     * const approveTx = klescrow.factory.erc20Approve({ spenderAddress: predicted, … });
     * const createTx  = klescrow.factory.createErc20Escrow({ amount: gross, fee, … });
     *
     * // After
     * const { approveTx, createTx, escrowId, gross, predictedAddress } =
     *   await klescrow.factory.prepareCreateErc20Escrow({
     *     tokenAddress: '0xTOKEN…',
     *     netAmount:    1_000_000n,
     *     buyerAddress: '0xBUYER…',
     *     …
     *   });
     * await signer.sendTransaction({ ...approveTx, value: BigInt(approveTx.value) });
     * await signer.sendTransaction({ ...createTx,  value: BigInt(createTx.value)  });
     * ```
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

    // ─── Event history ─────────────────────────────────────────────────────

    /**
     * Fetches all `EscrowCreated` events emitted by this factory.
     *
     * @param fromBlock  First block to scan (default: 0).
     * @param toBlock    Last block to scan (default: 'latest').
     */
    async getLogs(
        fromBlock: number | 'earliest' = 0,
        toBlock:   number | 'latest'   = 'latest',
    ): Promise<EscrowCreatedEvent[]> {
        const rawLogs = await this.provider.getLogs({
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

    async getLogsByParty(
        role:       'buyer' | 'seller',
        party:      string,
        fromBlock:  number | 'earliest' = 0,
        toBlock:    number | 'latest'   = 'latest',
    ): Promise<EscrowCreatedEvent[]> {
        const all = await this.getLogs(fromBlock, toBlock);
        const normalized = getAddress(requireAddress(party, 'party'));
        return all.filter(e => role === 'seller'
            ? getAddress(e.seller) === normalized
            : getAddress(e.buyer) === normalized);
    }

    async getLogsByCreator(
        creator:     string,
        fromBlock:   number | 'earliest' = 0,
        toBlock:     number | 'latest'   = 'latest',
    ): Promise<EscrowCreatedEvent[]> {
        const creatorTopic = '0x000000000000000000000000' + requireAddress(creator, 'creator').toLowerCase().slice(2);
        const rawLogs = await this.provider.getLogs({
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

    // ─── Internals ─────────────────────────────────────────────────────────

    private resolveWallet(override?: string): string {
        const w = override ?? this.walletAddress;
        if (!w) throw new Error(
            'walletAddress is required — pass it to new Klescrow({ walletAddress }) or as the last argument to this method.',
        );
        return w;
    }
}

// ─── Klescrow ─────────────────────────────────────────────────────────────────

/**
 * Top-level entry point for the Klescrow SDK.
 *
 * Zero-config usage (auto-detects chain + factory from the wallet):
 * ```ts
 * const klescrow = await Klescrow.fromProvider(provider);
 * ```
 *
 * Explicit config (for custom chains or factory addresses):
 * ```ts
 * const klescrow = new Klescrow({
 *   chainId:        1,
 *   factoryAddress: '0x…',
 *   provider,
 *   walletAddress:  '0x…',   // optional — fills callerWallet on all write ops
 *   impl:           { address: '0x…', name: 'Klescrow Single-Party' },  // optional
 * });
 *
 * // Factory-level operations
 * const info     = await klescrow.factory.readConfig();
 * const quote    = await klescrow.factory.quoteGross(1_000_000n);
 * const createTx = klescrow.factory.createEthEscrow(params);
 *
 * // Bound escrow — no network call
 * const escrow     = klescrow.escrow('0x…');
 * const state      = await escrow.read();
 * const approveTx  = escrow.approvePayment();
 * const history    = await escrow.getLogs();
 * ```
 */
export class Klescrow {
    /** Factory-level operations (reads + create tx). */
    readonly factory: FactoryHandle;

    private readonly _reader:   KlescrowReader;
    private readonly _builder:  KlescrowTxBuilder;
    private readonly _events:   KlescrowEvents;
    private readonly _cfg:      KlescrowConfig;
    private readonly _provider: AbstractProvider;
    private readonly _wallet?:  string;
    private readonly _impl?:    string;
    constructor(config: KlescrowSdkConfig) {
        const chainId = Klescrow._normalizeChainId(config.chainId);
        const factoryAddress = config.factoryAddress ?? getFactoryAddress(chainId) ?? FACTORY_ADDRESS;
        requireAddress(factoryAddress, 'factoryAddress');
        this._cfg      = { chainId, factoryAddress };
        this._provider = config.provider;
        this._reader   = new KlescrowReader(config.provider, config.multicall);
        this._builder  = new KlescrowTxBuilder();
        this._events   = new KlescrowEvents();
        this._wallet   = config.walletAddress;
        this._impl     = config.impl
            ? requireAddress(config.impl.address, 'impl')
            : undefined;

        this.factory = new FactoryHandle(
            this._cfg, this._reader, this._builder, this._events,
            this._provider, this._wallet, this._impl,
        );
    }

    /**
     * Creates a `Klescrow` instance using the replayed factory address for the given chain ID.
     *
     * Convenience equivalent to:
     * ```ts
     * return new Klescrow({
     *   chainId,
     *   factoryAddress: FACTORY_ADDRESS,
     *   provider,
     *   walletAddress,
     *   impl,
     * });
     * ```
     *
     * @param chainId Any positive integer chain ID.
     * @param provider The provider to use for interacting with the blockchain.
     * @param walletAddress The address of the wallet to use for interacting with the escrow.
     * @param impl Optional escrow implementation. Omit to use the factory's live default.
     * @throws if `chainId` is not a positive safe integer.
     */
    static forChain(
        chainId: number,
        provider: AbstractProvider,
        walletAddress?: string,
        impl?: EscrowImplementationInfo,
    ): Klescrow {
        return new Klescrow({ chainId, provider, walletAddress, impl });
    }

    /**
     * Creates a `Klescrow` instance by auto-detecting the chain from the provider
     * and using the canonical replayed factory address.
     *
     * This is the **recommended** entry point — zero config:
     * ```ts
     * const provider = new ethers.BrowserProvider(window.ethereum);
     * const klescrow = await Klescrow.fromProvider(provider);
     * ```
     *
     * With optional wallet address (auto-fills callerWallet on write ops):
     * ```ts
     * const signer = await provider.getSigner();
     * const klescrow = await Klescrow.fromProvider(provider, await signer.getAddress());
     * ```
     *
     * With a specific escrow implementation by name or address:
     * ```ts
     * const klescrow = await Klescrow.fromProvider(
     *     provider, await signer.getAddress(), 'Klescrow Single-Party');
     * ```
     *
     * @param provider          Any ethers AbstractProvider (BrowserProvider, JsonRpcProvider, etc.)
     * @param walletAddress     Optional — when set, all write ops pre-fill `callerWallet`.
     * @param implNameOrAddress Optional — name or address of a registered implementation.
     *                          Omit to use the factory's live default.
     * @throws if the provider returns an invalid chain ID.
     * @throws if `implNameOrAddress` is a name that doesn't match any registered implementation.
     */
    static async fromProvider(
        provider: AbstractProvider,
        walletAddress?: string,
        implNameOrAddress?: string,
    ): Promise<Klescrow> {
        const { chainId } = await provider.getNetwork();
        const chainIdNumber = Klescrow._normalizeChainId(Number(chainId));
        const factoryAddress = FACTORY_ADDRESS;

        let impl: EscrowImplementationInfo | undefined;
        if (implNameOrAddress) {
            impl = await this._resolveImpl(provider, factoryAddress, implNameOrAddress);
        }

        return new Klescrow({ chainId: chainIdNumber, provider, walletAddress, impl });
    }

    private static _normalizeChainId(chainId: number): number {
        if (!Number.isSafeInteger(chainId) || chainId <= 0) {
            throw new Error(`Invalid Klescrow chain ID: ${chainId}.`);
        }
        return chainId;
    }

    private static async _resolveImpl(
        provider: AbstractProvider,
        factoryAddress: string,
        nameOrAddress: string,
    ): Promise<EscrowImplementationInfo> {
        // Address: validate and return directly
        if (nameOrAddress.startsWith('0x')) {
            return { address: requireAddress(nameOrAddress, 'impl'), name: '' };
        }
        // Name: read factory, find match
        const reader = new KlescrowReader(provider);
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

    /**
     * Returns an `Escrow` bound to the given deployed clone address.
     *
     * This is a **free, synchronous** operation — no network call is made.
     */
    escrow(address: string): Escrow {
        return new Escrow(
            requireAddress(address, 'escrowAddress'),
            this._cfg, this._reader, this._builder, this._events, this._provider, this._wallet,
        );
    }

    /**
     * Hashes a terms URI into the bytes32 value expected by createEscrow.
     * Convenience passthrough for UI and integration flows.
     */
    termsHashFromUri(uri: string): string {
        return this.factory.termsHashFromUri(uri);
    }
}
