import type { EvmLog } from './LogUtils.js';

export type ReadBlockTag =
    | 'earliest'
    | 'latest'
    | 'pending'
    | 'safe'
    | 'finalized';

export type ReadBlockReference =
    | number
    | bigint
    | ReadBlockTag
    | { readonly blockNumber: number | bigint }
    | { readonly blockHash: `0x${string}`; readonly requireCanonical?: boolean };

export type Hex = `0x${string}`;

export interface CallRequest {
    readonly to: string;
    readonly data: Hex;
    readonly from?: string;
    readonly value?: bigint;
    readonly block?: ReadBlockReference;
}

export interface LogFilter {
    readonly address?: string | readonly string[];
    readonly topics?: readonly (string | null | readonly string[])[];
    readonly fromBlock?: number | bigint | ReadBlockTag;
    readonly toBlock?: number | bigint | ReadBlockTag;
    readonly blockHash?: Hex;
}

export interface BlockInfo {
    readonly number: number;
    readonly timestamp: number;
}

export interface RpcClient {
    call(request: CallRequest): Promise<Hex>;
    getLogs(filter: LogFilter): Promise<readonly EvmLog[]>;
    getChainId(): Promise<number>;
    getBlock(reference: ReadBlockReference): Promise<BlockInfo>;
}
