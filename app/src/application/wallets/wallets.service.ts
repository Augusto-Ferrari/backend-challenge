import { randomUUID, createHash } from 'node:crypto';

import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { EntityManager } from '@mikro-orm/postgresql';

import {
  UniqueConstraintViolationException,
} from '@mikro-orm/core';

import {
  WalletSchema,
  WagerTransactionSchema,
  WalletLedgerEntrySchema,
  OutboxMessageSchema,
} from '../../infrastructure/persistence/records.js';

import {
  Money,
  type MoneyProps,
} from '../../domain/money/money.js';

import { Wallet } from '../../domain/wallet/wallet.js';

import {
  WalletLedgerEntry,
  LedgerDirection,
} from '../../domain/ledger/wallet-ledger-entry.js';

import {
  WagerTransaction,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';

import {
  WagerTransactionProcessed,
  WalletBalanceChanged,
} from '../../domain/events/wager-events.js';

import { OutboxMessage } from '../../domain/messaging/outbox-message.js';

export interface CreateWalletInput {
  playerId: string;
  initialBalance: MoneyProps;
}

export interface WalletResponse {
  id: string;
  playerId: string;
  balance: MoneyProps;
  version: number;
}

@Injectable()
export class WalletsService {
  constructor(private readonly em: EntityManager) {}

  async createWallet(
    input: CreateWalletInput,
  ): Promise<WalletResponse> {
    let initialBalance: Money;

    try {
      initialBalance = Money.from(input.initialBalance);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Invalid initial balance',
      );
    }

    const walletId = randomUUID();
    const now = new Date();

    const wallet = Wallet.open({
      id: walletId,
      playerId: input.playerId,
      initialBalance,
      at: now,
    });

    try {
      // Todos os inserts pertencem ao mesmo commit.
      return await this.em.transactional(
        async (em): Promise<WalletResponse> => {
          // 1. Grava a carteira.
          em.create(WalletSchema, {
            id: wallet.id,
            playerId: wallet.playerId,
            currency: wallet.currency,
            balance: wallet.balance.toJSON().amount,
            version: wallet.version,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt,
          });

          // Respeita a FK antes de criar a transação.
          await em.flush();

          // Carteira sem saldo não precisa de OPENING.
          if (initialBalance.isZero()) {
            return this.toResponse(wallet);
          }

          // 2. Cria a transação interna OPENING.
          const payloadHash = createHash('sha256')
            .update(
              JSON.stringify({
                kind: 'OPENING',
                walletId: wallet.id,
                playerId: wallet.playerId,
                money: initialBalance.toJSON(),
              }),
            )
            .digest('hex');

          const opening = WagerTransaction.createOpening({
            id: randomUUID(),
            walletId: wallet.id,
            playerId: wallet.playerId,
            money: initialBalance,
            payloadHash,
            createdAt: now,
          });

          opening.markProcessed(undefined, now);

          em.create(WagerTransactionSchema, {
            id: opening.id,
            providerId: opening.providerId,
            externalTransactionId: opening.externalTransactionId,
            idempotencyKey: opening.idempotencyKey,
            payloadHash: opening.payloadHash,
            walletId: opening.walletId,
            playerId: opening.playerId,
            roundId: opening.roundId,
            gameId: opening.gameId,
            kind: opening.kind,
            amount: opening.money.toJSON().amount,
            currency: opening.money.currency,
            referenceExternalTransactionId: null,
            referenceTransactionId: null,
            status: WagerTransactionStatus.Processed,
            failureCode: null,
            observedBalance: wallet.balance.toJSON().amount,
            processedAt: now,
            attempts: 0,
            nextAttemptAt: null,
            createdAt: opening.createdAt,
          });

          await em.flush();

          // 3. Registra o crédito inicial no ledger.
          // A versão da carteira permanece em 1.
          const ledger = WalletLedgerEntry.create({
            id: randomUUID(),
            walletId: wallet.id,
            transactionId: opening.id,
            direction: LedgerDirection.Credit,
            money: initialBalance,
            balanceBefore: Money.zero(wallet.currency),
            balanceAfter: wallet.balance,
            createdAt: now,
          });

          em.create(WalletLedgerEntrySchema, {
            id: ledger.id,
            walletId: ledger.walletId,
            transactionId: ledger.transactionId,
            direction: ledger.direction,
            amount: ledger.money.toJSON().amount,
            currency: ledger.money.currency,
            balanceBefore:
              ledger.balanceBefore.toJSON().amount,
            balanceAfter:
              ledger.balanceAfter.toJSON().amount,
            createdAt: ledger.createdAt,
          });

          // 4. Gera os eventos financeiros.
          const correlationId = randomUUID();

          const processedEvent =
            WagerTransactionProcessed.from(opening, {
              eventId: randomUUID(),
              correlationId,
              occurredAt: now,
            });

          const balanceEvent =
            WalletBalanceChanged.from(wallet, ledger, {
              eventId: randomUUID(),
              correlationId,
              causationId: processedEvent.eventId,
              occurredAt: now,
            });

          // 5. Persiste eventos na Outbox.
          for (const event of [
            processedEvent,
            balanceEvent,
          ]) {
            const outbox = OutboxMessage.enqueue(event);

            em.create(OutboxMessageSchema, {
              id: outbox.id,
              aggregateId: outbox.aggregateId,
              eventType: outbox.eventType,
              payload: outbox.payload,
              occurredAt: outbox.occurredAt,
              attempts: outbox.attempts,
              nextAttemptAt: null,
              publishedAt: null,
              claimOwner: null,
              claimUntil: null,
            });
          }

          // Flush continua dentro da transação.
          await em.flush();

          return this.toResponse(wallet);
        },
        { clear: true },
      );
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictException(
          'Wallet already exists for this player and currency',
        );
      }

      throw error;
    }
  }

  async getWallet(id: string): Promise<WalletResponse> {
    const record = await this.em.findOne(
      WalletSchema,
      { id },
    );

    if (!record) {
      throw new NotFoundException('Wallet not found');
    }

    return {
      id: record.id,
      playerId: record.playerId,
      balance: {
        amount: record.balance,
        currency: record.currency,
      },
      version: record.version,
    };
  }

  private toResponse(wallet: Wallet): WalletResponse {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }
}