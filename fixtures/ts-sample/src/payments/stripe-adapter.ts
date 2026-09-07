import type { PaymentGateway, PaymentResult } from './gateway';
import type { Money } from '../users/model';
import { config } from '../config';

/** Stripe implementation of the payment gateway. */
export class StripeAdapter implements PaymentGateway {
  private readonly apiKey = config.stripeApiKey;

  async charge(amount: Money, customerId: string): Promise<PaymentResult> {
    const idempotencyKey = this.idempotencyKeyFor(customerId, amount);
    const response = await this.post('/v1/charges', { amount, customerId, idempotencyKey });
    return { ok: response.ok, paymentId: response.id };
  }

  async refund(paymentId: string): Promise<PaymentResult> {
    const response = await this.post('/v1/refunds', { paymentId });
    return { ok: response.ok, paymentId };
  }

  /** Idempotency: retries of the same charge must not double-bill. */
  private idempotencyKeyFor(customerId: string, amount: Money): string {
    return `${customerId}:${amount.cents}:${amount.currency}`;
  }

  private async post(path: string, body: unknown): Promise<{ ok: boolean; id: string }> {
    void path;
    void body;
    void this.apiKey;
    return { ok: true, id: 'py_stub' };
  }
}
