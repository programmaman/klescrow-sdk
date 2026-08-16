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
    | { readonly blockHash: string; readonly requireCanonical?: boolean };

export interface PreparedRpc {
    readonly method: string;
    readonly params: readonly unknown[];
}

export interface RpcClient {
    request(request: PreparedRpc): Promise<unknown>;
}
