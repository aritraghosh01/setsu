import type { Order } from '../orders/model';
import { validateOrder } from '../orders/validation';
import type { PaymentGateway, PaymentResult } from '../payments/gateway';
import { UserService } from '../users/service';
import { OrderRepository } from '../db/repository';

/** Orchestrates checkout: validate, charge, persist. */
export class CheckoutService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly userService: UserService,
    private readonly orderRepository: OrderRepository,
  ) {}

  async checkout(order: Order): Promise<PaymentResult> {
    const user = await this.userService.findUser(order.userId);
    if (!user) {
      return { ok: false, paymentId: '', errorCode: 'user_not_found' };
    }
    validateOrder(order, user);
    const result = await this.gateway.charge(order.total, user.id);
    if (result.ok) {
      await this.orderRepository.saveOrder(order);
    }
    return result;
  }
}
