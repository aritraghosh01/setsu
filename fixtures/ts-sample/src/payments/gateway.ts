import type { Money } from '../users/model';

/** Abstraction over external payment providers. */
export interface PaymentGateway {
  charge(amount: Money, customerId: string): Promise<PaymentResult>;
  refund(paymentId: string): Promise<PaymentResult>;
}

export interface PaymentResult {
  ok: boolean;
  paymentId: string;
  errorCode?: string;
}
