import { createHash } from 'node:crypto';

import type {
  CreateWagerDto,
} from '../../modules/wagering/wagering.dto.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (
    value !== null &&
    typeof value === 'object'
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }

  return value;
}

export function sha256(
  value: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function wagerPayloadHash(
  input: CreateWagerDto,
): string {
  // Somente os campos de negócio.
  // Header e informações de transporte ficam fora.
  return sha256({
    providerId: input.providerId,
    externalTransactionId: input.externalTransactionId,
    playerId: input.playerId,
    walletId: input.walletId,
    roundId: input.roundId,
    gameId: input.gameId,
    kind: input.kind,
    money: {
      amount: input.money.amount,
      currency: input.money.currency,
    },
    referenceExternalTransactionId:
      input.referenceExternalTransactionId,
  });
}