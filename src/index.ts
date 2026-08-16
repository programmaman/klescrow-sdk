// ─── Main entry points ─────────────────────────────────────────────────────
export { Klescrow, FactoryHandle } from './Klescrow.js';
export type { KlescrowFromRpcOptions, KlescrowSdkConfig } from './Klescrow.js';

// ─── Bound escrow handle ────────────────────────────────────────────────────
export { Escrow } from './Escrow.js';

// ─── Transaction builder ────────────────────────────────────────────────────
export { KlescrowTxBuilder } from './KlescrowTxBuilder.js';
export type {
    KlescrowConfig,
    CreateEscrowParams,
    DepositParams,
    EscrowActionParams,
    RaiseDisputeParams,
    SubmitEvidenceParams,
    AppealParams,
    RemovePartyParams,
    UpdateTermsHashParams,
    ExtendExpiryParams,
    Erc20ApproveParams,
} from './KlescrowTxBuilder.js';

// ─── Reader ─────────────────────────────────────────────────────────────────
export { KlescrowReader } from './KlescrowReader.js';

// ─── Events ─────────────────────────────────────────────────────────────────
export {
    KlescrowEvents,
    KlescrowTopics,
    TOPIC_ESCROW_CREATED,
    TOPIC_FUNDED,
    TOPIC_RESOLVED,
    TOPIC_DISPUTE_RAISED,
    TOPIC_CANCELLED,
    TOPIC_BUYER_APPROVED,
    TOPIC_SELLER_APPROVED,
    TOPIC_EXPIRY_EXTENDED,
    TOPIC_TERMS_HASH_UPDATED,
    TOPIC_EVIDENCE,
    TOPIC_BUYER_JOINED,
    TOPIC_BUYER_LEFT,
    TOPIC_SELLER_JOINED,
    TOPIC_SELLER_LEFT,
    TOPIC_EXPIRY_EXTENSION_CONSENTED,
} from './KlescrowEvents.js';

// ─── Types ──────────────────────────────────────────────────────────────────
export { EscrowState, escrowStateFromOrdinal, EscrowIntent, escrowIntentFromOrdinal } from './types.js';
export type {
    FactoryInfo,
    FeeQuote,
    EscrowInfo,
    EscrowImplementationInfo,
    AppealPeriod,
    EvmLog,
    PrepareCreateParams,
    PrepareCreateErc20Params,
    PrepareCreateEthResult,
    PrepareCreateErc20Result,
    PrepareDepositResult,
    PrepareRaiseDisputeResult,
    PrepareAppealResult,
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
    EscrowEvent,
} from './types.js';

// ─── Common ─────────────────────────────────────────────────────────────────
export type { PreparedTx } from './common/PreparedTx.js';
export type { PreparedRpc, ReadBlockReference, ReadBlockTag, RpcClient } from './common/RpcClient.js';
export type { AbiCodec, DecodedError, DecodedEvent, Hex } from './common/AbiCodec.js';
export type { SigningPreview, FeeBreakdown, FeeLineItem } from './common/TxPreview.js';
export {
    IdGenerator,
    requireAddress,
    uuidToBytes32Hex,
    bytes32HexToUuid,
    ZERO_ADDRESS,
    buildFeeBreakdown,
    formatUnixSec,
} from './common/index.js';

// ─── Multicall ──────────────────────────────────────────────────────────────
export type { MulticallConfig } from './multicall.js';

// ─── Deployments ────────────────────────────────────────────────────────────
export * as KlescrowDeployments from './deployments.js';
export {
    FACTORY_ADDRESS,
    SUPPORTED_CHAIN_IDS,
    isSupportedChainId,
    requireSupportedChainId,
    getFactoryAddress,
    listDeployments,
} from './deployments.js';

export { ABI, EVENT_TOPICS } from './abi.js';
