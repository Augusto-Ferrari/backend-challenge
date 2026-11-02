import { describe, expect, test } from 'bun:test';
import { Money } from '../../src/domain/money/money.js';

describe('Money', () => {

  test('creates a valid amount', () => {
    const money = Money.from({
      amount: '25.00',
      currency: 'BRL',
    });

    expect(money.toJSON()).toEqual({
      amount: '25.00',
      currency: 'BRL',
    });
  });

  test('creates zero', () => {
    const money = Money.zero('BRL');

    expect(money.isZero()).toBe(true);
    expect(money.toJSON().amount).toBe('0.00');
  });

  test('adds values without precision errors', () => {
    const a = Money.from({
      amount: '0.10',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '0.20',
      currency: 'BRL',
    });

    const result = a.add(b);

    expect(result.toJSON().amount).toBe('0.30');
  });

  test('subtracts monetary values', () => {
    const a = Money.from({
      amount: '100.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '25.00',
      currency: 'BRL',
    });

    expect(a.subtract(b).toJSON().amount).toBe('75.00');
  });

  test('supports negative internal results', () => {
    const a = Money.from({
      amount: '20.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '50.00',
      currency: 'BRL',
    });

    const result = a.subtract(b);

    expect(result.isNegative()).toBe(true);
    expect(result.toJSON().amount).toBe('-30.00');
  });

  test('negates an amount', () => {
    const money = Money.from({
      amount: '25.00',
      currency: 'BRL',
    });

    const negative = money.negate();

    expect(negative.toJSON().amount).toBe('-25.00');
    expect(negative.negate().equals(money)).toBe(true);
  });

  test('does not mutate original amounts', () => {
    const a = Money.from({
      amount: '100.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '20.00',
      currency: 'BRL',
    });

    a.subtract(b);

    expect(a.toJSON().amount).toBe('100.00');
  });

  test('compares monetary values', () => {
    const a = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const b = Money.from({
      amount: '20.00',
      currency: 'BRL',
    });

    expect(a.isLessThan(b)).toBe(true);
    expect(b.isLessThan(a)).toBe(false);
    expect(a.equals(a)).toBe(true);
  });

  test('rejects different currencies', () => {
    const brl = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const usd = Money.from({
      amount: '10.00',
      currency: 'USD',
    });

    expect(() => brl.add(usd)).toThrow();
    expect(() => brl.subtract(usd)).toThrow();
    expect(() => brl.isLessThan(usd)).toThrow();
    expect(() => brl.equals(usd)).toThrow();
  });

  test('rejects invalid decimal strings', () => {
    const invalidAmounts = [
      '',
      '25',
      '25.0',
      '25.123',
      '-25.00',
      'NaN',
      'Infinity',
      '1e3',
      '025.00',
      ' 25.00',
    ];

    for (const amount of invalidAmounts) {
      expect(() =>
        Money.from({ amount, currency: 'BRL' })
      ).toThrow();
    }
  });

  test('rejects number input', () => {
    expect(() =>
      Money.from({
        amount: 25 as unknown as string,
        currency: 'BRL',
      })
    ).toThrow();
  });

  test('rejects invalid currencies', () => {
    expect(() =>
      Money.from({
        amount: '10.00',
        currency: 'XYZ',
      })
    ).toThrow();

    expect(() =>
      Money.from({
        amount: '10.00',
        currency: 'brl',
      })
    ).toThrow();
  });

  test('rejects values beyond database range', () => {
    expect(() =>
      Money.from({
        amount: '1000000000000000000.00',
        currency: 'BRL',
      })
    ).toThrow();
  });

  test('serializes with exactly two decimal places', () => {
    const money = Money.from({
      amount: '1.00',
      currency: 'BRL',
    });

    expect(money.toString()).toBe('1.00 BRL');
    expect(money.toJSON().amount).toBe('1.00');
  });

});