import type { EvmLog } from '../common/LogUtils.js';
import type {
    PreparedRpc,
    ReadBlockReference,
    ReadBlockTag,
    RpcClient,
} from '../common/index.js';

export type RpcQuantity = `0x${string}`;
export type RpcBlockIdentifier =
    | RpcQuantity
    | ReadBlockTag
    | { readonly blockNumber: RpcQuantity }
    | { readonly blockHash: `0x${string}`; readonly requireCanonical?: boolean };

export interface RpcCallObject {
    readonly to: string;
    readonly data: `0x${string}`;
}

export interface RpcLogFilter {
    readonly address?: string | readonly string[];
    readonly topics?: readonly (string | null | readonly string[])[];
    readonly fromBlock?: number | bigint | ReadBlockTag;
    readonly toBlock?: number | bigint | ReadBlockTag;
    readonly blockHash?: string;
}

export function encodeRpcQuantity(value: number | bigint): RpcQuantity {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
        throw new Error('RPC quantity must be a non-negative safe integer');
    }
    if (typeof value === 'bigint' && value < 0n) {
        throw new Error('RPC quantity must be non-negative');
    }
    return `0x${BigInt(value).toString(16)}`;
}

export function encodeRpcBlockReference(value: ReadBlockReference): RpcBlockIdentifier {
    if (typeof value === 'number' || typeof value === 'bigint') {
        return encodeRpcQuantity(value);
    }
    if (typeof value === 'string') {
        if (!['earliest', 'latest', 'pending', 'safe', 'finalized'].includes(value)) {
            throw new Error(`Invalid RPC block tag: ${value}`);
        }
        return value;
    }
    if ('blockNumber' in value) {
        return { blockNumber: encodeRpcQuantity(value.blockNumber) };
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(value.blockHash)) {
        throw new Error('Invalid RPC block hash');
    }
    return {
        blockHash: value.blockHash as `0x${string}`,
        ...(value.requireCanonical === undefined ? {} : { requireCanonical: value.requireCanonical }),
    };
}

export function prepareEthCall(call: RpcCallObject, block: RpcBlockIdentifier): PreparedRpc {
    return { method: 'eth_call', params: [call, block] };
}

export async function ethCall(
    rpcClient: RpcClient,
    call: RpcCallObject,
    block: RpcBlockIdentifier,
): Promise<`0x${string}`> {
    return requireRpcData(await rpcClient.request(prepareEthCall(call, block)));
}

export function prepareGetLogs(filter: RpcLogFilter): PreparedRpc {
    if (filter.blockHash !== undefined &&
        (filter.fromBlock !== undefined || filter.toBlock !== undefined)) {
        throw new Error('eth_getLogs blockHash is mutually exclusive with fromBlock/toBlock');
    }
    const params = filter.blockHash === undefined
        ? {
            ...(filter.address === undefined ? {} : { address: filter.address }),
            ...(filter.topics === undefined ? {} : { topics: filter.topics }),
            fromBlock: filter.fromBlock === undefined ? '0x0' : encodeLogBound(filter.fromBlock),
            toBlock: filter.toBlock === undefined ? 'latest' : encodeLogBound(filter.toBlock),
        }
        : {
            ...(filter.address === undefined ? {} : { address: filter.address }),
            ...(filter.topics === undefined ? {} : { topics: filter.topics }),
            blockHash: requireRpcHash(filter.blockHash),
        };
    return { method: 'eth_getLogs', params: [params] };
}

export async function ethGetLogs(
    rpcClient: RpcClient,
    filter: RpcLogFilter,
): Promise<readonly EvmLog[]> {
    return decodeRpcLogs(await rpcClient.request(prepareGetLogs(filter)));
}

export async function ethChainId(rpcClient: RpcClient): Promise<number> {
    return decodeRpcChainId(await rpcClient.request({ method: 'eth_chainId', params: [] }));
}

export function requireRpcData(value: unknown): `0x${string}` {
    if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
        throw new Error('Invalid JSON-RPC data result');
    }
    return value as `0x${string}`;
}

export function requireRpcQuantity(value: unknown): RpcQuantity {
    if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
        throw new Error('Invalid JSON-RPC quantity result');
    }
    return value as RpcQuantity;
}

export function decodeRpcChainId(value: unknown): number {
    const quantity = BigInt(requireRpcQuantity(value));
    if (quantity <= 0n || quantity > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Invalid JSON-RPC chain ID result');
    }
    return Number(quantity);
}

export function decodeRpcLogs(value: unknown): readonly EvmLog[] {
    if (!Array.isArray(value)) throw new Error('Invalid eth_getLogs result');
    return value.map((log, index) => {
        if (!isRecord(log) || typeof log.address !== 'string' ||
            !Array.isArray(log.topics) || !log.topics.every(topic => typeof topic === 'string') ||
            typeof log.data !== 'string') {
            throw new Error(`Invalid eth_getLogs log at index ${index}`);
        }
        const result: EvmLog = {
            address: log.address,
            topics: log.topics,
            data: requireRpcData(log.data),
        };
        if (log.transactionHash !== undefined) {
            if (typeof log.transactionHash !== 'string') {
                throw new Error(`Invalid eth_getLogs transaction hash at index ${index}`);
            }
            result.transactionHash = log.transactionHash;
        }
        return result;
    });
}

function encodeLogBound(value: number | bigint | ReadBlockTag): RpcQuantity | ReadBlockTag {
    return typeof value === 'number' || typeof value === 'bigint' ? encodeRpcQuantity(value) : value;
}

function requireRpcHash(value: string): `0x${string}` {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('Invalid RPC block hash');
    return value as `0x${string}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
