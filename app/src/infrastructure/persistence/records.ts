import { EntitySchema } from '@mikro-orm/core';

// 1. Carteira financeira
export interface WalletRecord {
  id: string;
  playerId: string;
  currency: string;
  balance: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const WalletSchema = new EntitySchema<WalletRecord>({
  name: 'WalletRecord',
  tableName: 'wallets',
  properties: {
    id: { type: 'uuid', primary: true },
    playerId: {
      type: 'uuid',
      fieldName: 'player_id',
    },
    currency: { type: 'string', length: 3 },
    balance: {
      type: 'string',
      columnType: 'numeric(20,2)',
    },
    version: { type: 'integer' },
    createdAt: {
      type: Date,
      fieldName: 'created_at',
      columnType: 'timestamptz',
    },
    updatedAt: {
      type: Date,
      fieldName: 'updated_at',
      columnType: 'timestamptz',
    },
  },
});

// 2. Transações de apostas
export interface WagerTransactionRecord {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: string;
  amount: string;
  currency: string;
  referenceExternalTransactionId?: string | null;
  referenceTransactionId?: string | null;
  status: string;
  failureCode?: string | null;
  observedBalance?: string | null;
  processedAt?: Date | null;
  attempts: number;
  nextAttemptAt?: Date | null;
  createdAt: Date;
}

export const WagerTransactionSchema =
  new EntitySchema<WagerTransactionRecord>({
    name: 'WagerTransactionRecord',
    tableName: 'wager_transactions',
    properties: {
      id: { type: 'uuid', primary: true },
      providerId: {
        type: 'string',
        length: 128,
        fieldName: 'provider_id',
      },
      externalTransactionId: {
        type: 'string',
        length: 255,
        fieldName: 'external_transaction_id',
      },
      idempotencyKey: {
        type: 'string',
        length: 255,
        fieldName: 'idempotency_key',
      },
      payloadHash: {
        type: 'string',
        length: 64,
        fieldName: 'payload_hash',
      },
      walletId: {
        type: 'uuid',
        fieldName: 'wallet_id',
      },
      playerId: {
        type: 'uuid',
        fieldName: 'player_id',
      },
      roundId: {
        type: 'string',
        length: 255,
        fieldName: 'round_id',
      },
      gameId: {
        type: 'string',
        length: 255,
        fieldName: 'game_id',
      },
      kind: { type: 'string', length: 16 },
      amount: {
        type: 'string',
        columnType: 'numeric(20,2)',
      },
      currency: { type: 'string', length: 3 },
      referenceExternalTransactionId: {
        type: 'string',
        length: 255,
        fieldName: 'reference_external_transaction_id',
        nullable: true,
      },
      referenceTransactionId: {
        type: 'uuid',
        fieldName: 'reference_transaction_id',
        nullable: true,
      },
      status: { type: 'string', length: 24 },
      failureCode: {
        type: 'string',
        length: 100,
        fieldName: 'failure_code',
        nullable: true,
      },
      observedBalance: {
        type: 'string',
        columnType: 'numeric(20,2)',
        fieldName: 'observed_balance',
        nullable: true,
      },
      processedAt: {
        type: Date,
        fieldName: 'processed_at',
        nullable: true,
      },
      attempts: { type: 'integer' },
      nextAttemptAt: {
        type: Date,
        fieldName: 'next_attempt_at',
        nullable: true,
      },
      createdAt: {
        type: Date,
        fieldName: 'created_at',
      },
    },
  });

// 3. Ledger financeiro
export interface WalletLedgerEntryRecord {
  id: string;
  walletId: string;
  transactionId: string;
  direction: string;
  amount: string;
  currency: string;
  balanceBefore: string;
  balanceAfter: string;
  createdAt: Date;
}

export const WalletLedgerEntrySchema =
  new EntitySchema<WalletLedgerEntryRecord>({
    name: 'WalletLedgerEntryRecord',
    tableName: 'wallet_ledger_entries',
    properties: {
      id: { type: 'uuid', primary: true },
      walletId: {
        type: 'uuid',
        fieldName: 'wallet_id',
      },
      transactionId: {
        type: 'uuid',
        fieldName: 'transaction_id',
      },
      direction: { type: 'string', length: 6 },
      amount: {
        type: 'string',
        columnType: 'numeric(20,2)',
      },
      currency: { type: 'string', length: 3 },
      balanceBefore: {
        type: 'string',
        columnType: 'numeric(20,2)',
        fieldName: 'balance_before',
      },
      balanceAfter: {
        type: 'string',
        columnType: 'numeric(20,2)',
        fieldName: 'balance_after',
      },
      createdAt: {
        type: Date,
        fieldName: 'created_at',
      },
    },
  });

// 4. Mensagens recebidas
export interface InboxMessageRecord {
  consumerName: string;
  messageId: string;
  payloadHash: string;
  receivedAt: Date;
  processedAt?: Date | null;
}

export const InboxMessageSchema =
  new EntitySchema<InboxMessageRecord>({
    name: 'InboxMessageRecord',
    tableName: 'inbox_messages',
    properties: {
      consumerName: {
        type: 'string',
        length: 128,
        fieldName: 'consumer_name',
        primary: true,
      },
      messageId: {
        type: 'string',
        length: 255,
        fieldName: 'message_id',
        primary: true,
      },
      payloadHash: {
        type: 'string',
        length: 64,
        fieldName: 'payload_hash',
      },
      receivedAt: {
        type: Date,
        fieldName: 'received_at',
      },
      processedAt: {
        type: Date,
        fieldName: 'processed_at',
        nullable: true,
      },
    },
  });

// 5. Eventos a publicar
export interface OutboxMessageRecord {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date | null;
  publishedAt?: Date | null;
  claimOwner?: string | null;
  claimUntil?: Date | null;
}

export const OutboxMessageSchema =
  new EntitySchema<OutboxMessageRecord>({
    name: 'OutboxMessageRecord',
    tableName: 'outbox_messages',
    properties: {
      id: { type: 'uuid', primary: true },
      aggregateId: {
        type: 'uuid',
        fieldName: 'aggregate_id',
      },
      eventType: {
        type: 'string',
        length: 128,
        fieldName: 'event_type',
      },
      payload: { type: 'json' },
      occurredAt: {
        type: Date,
        fieldName: 'occurred_at',
      },
      attempts: { type: 'integer' },
      nextAttemptAt: {
        type: Date,
        fieldName: 'next_attempt_at',
        nullable: true,
      },
      publishedAt: {
        type: Date,
        fieldName: 'published_at',
        nullable: true,
      },
      claimOwner: {
        type: 'string',
        length: 128,
        fieldName: 'claim_owner',
        nullable: true,
      },
      claimUntil: {
        type: Date,
        fieldName: 'claim_until',
        nullable: true,
      },
    },
  });
