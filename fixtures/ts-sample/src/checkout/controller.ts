import { CheckoutService } from './service';
import type { Order } from '../orders/model';

export class CheckoutController {
  constructor(private readonly service: CheckoutService) {}

  async handleCheckout(body: unknown): Promise<{ status: number; paymentId?: string }> {
    const order = body as Order;
    const result = await this.service.checkout(order);
    if (!result.ok) {
      return { status: 402 };
    }
    return { status: 200, paymentId: result.paymentId };
  }
}
