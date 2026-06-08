import { Interface } from 'ethers';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecodedRevert =
  | { error: string; args: Record<string, unknown> }
  | { raw: string };

// ─── Revert data extraction ───────────────────────────────────────────────────

const HEX_DATA_RE = /^0x(?:[0-9a-fA-F]{2})*$/;

function isHexData(value: unknown): value is string {
  return typeof value === 'string' && HEX_DATA_RE.test(value);
}

function readRevertData(value: unknown, seen: Set<object>, depth: number): string | null {
  if (value == null || depth > 8) return null;
  if (isHexData(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readRevertData(item, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value !== 'object') return null;

  const objectValue = value as Record<string, unknown>;
  if (seen.has(objectValue)) return null;
  seen.add(objectValue);

  for (const key of ['data', 'error', 'info', 'cause', 'originalError', 'response'] as const) {
    const found = readRevertData(objectValue[key], seen, depth + 1);
    if (found) return found;
  }

  return null;
}

function extractRevertData(err: unknown): string | null {
  return readRevertData(err, new Set<object>(), 0);
}

function toDecodedArgs(decoded: { fragment: { inputs: readonly { name?: string }[] }; args: readonly unknown[] }): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  decoded.fragment.inputs.forEach((input, index) => {
    const key = input.name && input.name.length > 0 ? input.name : String(index);
    args[key] = decoded.args[index];
  });
  return args;
}

const ERROR_IFACE = new Interface([
  'error InvalidAddress()',
  'error InvalidToken()',
  'error InvalidAmount()',
  'error InvalidExpiryTime()',
  'error InvalidEvidence()',
  'error TooLate()',
  'error InvalidState()',
  'error NotBuyer()',
  'error SameParty()',
  'error NotSeller()',
  'error NotParty()',
  'error NotAuthorizedDepositor()',
  'error NotArbitrator()',
  'error NotFactory()',
  'error NotCreator()',
  'error CreatorCannotLeave()',
  'error CreatorCannotBeRemoved()',
  'error BadEthValue(uint256 sent, uint256 expectedMin)',
  'error DisputeAlreadyExists()',
  'error DisputeNotFound(uint256 disputeId)',
  'error InvalidRuling(uint256 ruling)',
  'error NothingToClaim()',
  'error ClaimFailed()',
  'error NoSeller()',
  'error InvalidProposedExpiry()',
  'error AppealWindowNotOpen()',
  'error EscrowAlreadyExists(bytes32 id)',
  'error FeeTooLow(uint256 provided, uint256 minimum)',
  'error TransferFailed()',
  'error InvalidTerms()',
]);

// ─── Decoder ──────────────────────────────────────────────────────────────────

/**
 * Decodes a wallet-level revert error into a structured {@link DecodedRevert}.
 *
 * Returns `null` when no hex revert data was found (network errors, user rejection,
 * insufficient-funds errors).  Returns `{ raw }` when revert data was present but
 * does not match any known Klescrow contract error.
 *
 * @example
 * ```ts
 * try { await wallet.sendTransaction(tx); }
 * catch (err) {
 *   const r = decodeKlescrowError(err);
 *   if (r?.error) console.error(r.error, r.args);
 * }
 * ```
 */
export function decodeKlescrowError(err: unknown): DecodedRevert | null {
  const data = extractRevertData(err);
  if (!data) return null;

  try {
    const decoded = ERROR_IFACE.parseError(data);
    if (!decoded) return { raw: data };

    return {
      error: decoded.name,
      args: toDecodedArgs(decoded),
    };
  } catch {
    return { raw: data };
  }
}
