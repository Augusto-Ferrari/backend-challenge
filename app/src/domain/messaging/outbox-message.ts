import { IntegrationEvent } from '../events/integration-event.js';

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
}

export class OutboxMessage {
  readonly id: string;
  readonly aggregateId: string;
  readonly eventType: string;

  private readonly serializedPayload: string;
  private readonly occurredAtMs: number;
  private _attempts: number;
  private nextAttemptAtMs?: number;
  private publishedAtMs?: number;

  private constructor(state: OutboxMessageState) {
    this.id = state.id;
    this.aggregateId = state.aggregateId;
    this.eventType = state.eventType;

    // Guarda uma cÃ³pia do evento em JSON.
    this.serializedPayload = JSON.stringify(state.payload);

    this.occurredAtMs = state.occurredAt.getTime();
    this._attempts = state.attempts;
    this.nextAttemptAtMs = state.nextAttemptAt?.getTime();
    this.publishedAtMs = state.publishedAt?.getTime();
  }

  static enqueue(
    event: IntegrationEvent<object>,
  ): OutboxMessage {

    const payload: Record<string, unknown> = {
      ...event.toJSON(),
    };

    return new OutboxMessage({
      id: event.eventId,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload,
      occurredAt: event.occurredAt,
      attempts: 0,
    });
  }

  static rehydrate(
    state: OutboxMessageState,
  ): OutboxMessage {
    return new OutboxMessage(state);
  }

  get payload(): Readonly<Record<string, unknown>> {
    return JSON.parse(
      this.serializedPayload,
    ) as Record<string, unknown>;
  }

  get occurredAt(): Date {
    return new Date(this.occurredAtMs);
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date | undefined {
    return this.nextAttemptAtMs === undefined
      ? undefined
      : new Date(this.nextAttemptAtMs);
  }

  get publishedAt(): Date | undefined {
    return this.publishedAtMs === undefined
      ? undefined
      : new Date(this.publishedAtMs);
  }

  isPending(): boolean {
    return this.publishedAtMs === undefined;
  }

  isDue(now: Date): boolean {
    if (
      !(now instanceof Date) ||
      Number.isNaN(now.getTime())
    ) {
      throw new Error('Invalid outbox clock');
    }

    return (
      this.isPending() &&
      (
        this.nextAttemptAtMs === undefined ||
        this.nextAttemptAtMs <= now.getTime()
      )
    );
  }

  markPublished(at: Date): void {
    this.assertPending();
    this.assertDate(at);

    this.publishedAtMs = at.getTime();
  }

  scheduleRetry(now: Date): void {
    this.assertPending();
    this.assertDate(now);

    if (!Number.isSafeInteger(this._attempts + 1)) {
      throw new Error('Outbox retry limit reached');
    }

    this._attempts += 1;

    // Backoff exponencial:
    // tentativa 1: 2 segundos
    // tentativa 2: 4 segundos
    // tentativa 3: 8 segundos
    // ... com limite de 5 minutos.
    const delayMs = Math.min(
      1000 * 2 ** Math.min(this._attempts, 8),
      300_000,
    );

    this.nextAttemptAtMs = now.getTime() + delayMs;
  }

  private assertPending(): void {
    if (!this.isPending()) {
      throw new Error(
        'Outbox message already published',
      );
    }
  }

  private assertDate(at: Date): void {
    if (
      !(at instanceof Date) ||
      Number.isNaN(at.getTime())
    ) {
      throw new Error('Invalid outbox timestamp');
    }
  }
}