import { Decimal } from 'decimal.js';

export interface MoneyProps {
  amount: string;
  currency: string;
}

// Precisão suficiente para operações sobre NUMERIC(20,2).
// Não usamos arredondamento de valores recebidos.
const ExactDecimal = Decimal.clone({
  precision: 40,
});

export class Money {
  private static readonly AMOUNT_PATTERN =
    /^(0|[1-9]\d*)\.\d{2}$/;

  private static readonly MAX_ABSOLUTE =
    new ExactDecimal('999999999999999999.99');

  private static readonly VALID_CURRENCIES =
    new Set(Intl.supportedValuesOf('currency'));

  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {
    Object.freeze(this);
  }

  // Cria Money a partir de um contrato de entrada.
  static from(props: MoneyProps): Money {
    if (
      !props ||
      typeof props.amount !== 'string' ||
      !Money.AMOUNT_PATTERN.test(props.amount)
    ) {
      throw new Error(
        'Invalid monetary amount: expected a non-negative decimal string with exactly 2 digits.'
      );
    }

    Money.validateCurrency(props.currency);

    return Money.fromDecimal(
      new ExactDecimal(props.amount),
      props.currency,
    );
  }

  static zero(currency: string): Money {
    return Money.from({
      amount: '0.00',
      currency,
    });
  }

  // Uso interno: permite resultados negativos em operações
  // como subtract e negate, sem aceitá-los na entrada pública.
  private static fromDecimal(
    value: Decimal,
    currency: string,
  ): Money {
    if (
      !value.isFinite() ||
      value.decimalPlaces() > 2 ||
      value.abs().greaterThan(Money.MAX_ABSOLUTE)
    ) {
      throw new Error(
        'Monetary result exceeds supported precision or range.'
      );
    }

    return new Money(value, currency);
  }

  private static validateCurrency(currency: string): void {
    if (
      typeof currency !== 'string' ||
      !/^[A-Z]{3}$/.test(currency) ||
      !Money.VALID_CURRENCIES.has(currency)
    ) {
      throw new Error(
        `Invalid ISO-4217 currency: ${String(currency)}`
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);

    return Money.fromDecimal(
      this.value.plus(other.value),
      this.currency,
    );
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);

    return Money.fromDecimal(
      this.value.minus(other.value),
      this.currency,
    );
  }

  negate(): Money {
    return Money.fromDecimal(
      this.value.negated(),
      this.currency,
    );
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);

    return this.value.lessThan(other.value);
  }

  equals(other: Money): boolean {
    this.assertSameCurrency(other);

    return this.value.equals(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.value.toFixed(2),
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.value.toFixed(2)} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: ${this.currency} !== ${other.currency}`
      );
    }
  }
}