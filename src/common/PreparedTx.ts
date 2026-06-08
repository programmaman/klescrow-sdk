export interface PreparedTx {
    /**
     * The target smart contract address.
     */
    to: string;

    /**
     * The encoded ABI data for the transaction.
     */
    data: string;

    /**
     * The value in wei to send with the transaction (decimal string).
     */
    value: string;

    /**
     * The EVM chain id for the transaction.
     */
    chainId: number;

    /**
     * Human-readable note about who is expected to sign this transaction.
     */
    signerHint?: string;

    /**
     * Rich signing preview for wallet / UI display.
     * Populated by every TxBuilder method so a frontend can render a
     * confirmation dialog without decoding raw calldata.
     */
    preview?: import('./TxPreview.js').SigningPreview;
}
