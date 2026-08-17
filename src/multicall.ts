import type { AbiCodec, DecodedError, Hex } from './common/AbiCodec.js';
import type { ReadBlockReference, RpcClient } from './common/index.js';

export interface MulticallConfig {
    address: string;
}

export interface EncodedReadCall<T = unknown> {
    target: string;
    method: string;
    callData: Hex;
    decode: (returnData: Hex) => T;
}

interface MulticallResult {
    readonly success: boolean;
    readonly returnData: Hex;
}

export class MulticallCallError extends Error {
    constructor(
        readonly index: number,
        readonly method: string,
        readonly target: string,
        readonly returnData: Hex,
        readonly decodedError?: DecodedError,
    ) {
        super(`Multicall3 call failed — method="${method}" target=${target}`);
        this.name = 'MulticallCallError';
    }
}

export async function executeMulticall<T>(
    rpcClient: RpcClient,
    codec: AbiCodec,
    multicallAddress: string,
    calls: readonly EncodedReadCall<T>[],
    readBlock: ReadBlockReference = 'latest',
): Promise<T[]> {
    if (calls.length === 0) return [];

    const batch = calls.map(call => ({
        target: call.target,
        allowFailure: true,
        callData: call.callData,
    }));
    const data = codec.encode('aggregate3((address,bool,bytes)[])', [batch]);
    const raw = await rpcClient.call({ to: multicallAddress, data, block: readBlock });
    const [decoded] = codec.decode('aggregate3((address,bool,bytes)[])', raw);
    const results = decoded as readonly MulticallResult[];

    return results.map((result, index) => {
        const call = calls[index];
        if (!result.success) {
            throw new MulticallCallError(
                index,
                call.method,
                call.target,
                result.returnData,
                codec.decodeError(result.returnData),
            );
        }
        return call.decode(result.returnData);
    });
}
