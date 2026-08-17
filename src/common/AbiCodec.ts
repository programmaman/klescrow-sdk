export type Hex = `0x${string}`;

export type DecodedEvent = Readonly<Record<string, unknown>>;

export interface DecodedError {
    readonly name: string;
    readonly args: readonly unknown[];
}

/**
 * ABI translation supplied by an integration package such as ethers or viem.
 * The core SDK never implements ABI encoding or decoding itself.
 */
export interface AbiCodec {
    encode(signature: string, args?: readonly unknown[]): Hex;
    decode(signature: string, data: Hex): readonly unknown[];
    decodeEvent(signature: string, topics: readonly Hex[], data: Hex): DecodedEvent;
    decodeError(data: Hex): DecodedError | undefined;
}
