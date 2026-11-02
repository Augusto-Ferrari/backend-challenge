export interface EventContext {
  eventId: string;
  correlationId: string;
  causationId?: string;
  occurredAt?: Date;
}

export interface IntegrationEventProps<T extends object>
  extends EventContext {
  aggregateId: string;
  data: T;
}

export abstract class IntegrationEvent<T extends object> {
  abstract readonly eventType: string;
  abstract readonly version: number;

  readonly eventId: string;
  readonly aggregateId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly data: Readonly<T>;

  private readonly occurredAtMs: number;

  protected constructor(props: IntegrationEventProps<T>) {
    for (const [field, value] of [
      ['eventId', props.eventId],
      ['aggregateId', props.aggregateId],
      ['correlationId', props.correlationId],
    ] as const) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${field} is required`);
      }
    }

    const occurredAt = props.occurredAt ?? new Date();

    if (
      !(occurredAt instanceof Date) ||
      Number.isNaN(occurredAt.getTime())
    ) {
      throw new Error('Invalid event timestamp');
    }

    this.eventId = props.eventId;
    this.aggregateId = props.aggregateId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.occurredAtMs = occurredAt.getTime();

    this.data = Object.freeze({ ...props.data });
  }

  get occurredAt(): Date {
    return new Date(this.occurredAtMs);
  }

  toJSON(): {
    eventId: string;
    eventType: string;
    aggregateId: string;
    correlationId: string;
    causationId?: string;
    occurredAt: string;
    version: number;
    data: Readonly<T>;
  } {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      correlationId: this.correlationId,
      ...(this.causationId
        ? { causationId: this.causationId }
        : {}),
      occurredAt: this.occurredAt.toISOString(),
      version: this.version,
      data: this.data,
    };
  }
}