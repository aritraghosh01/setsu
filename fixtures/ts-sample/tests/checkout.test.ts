import { CheckoutService } from '../src/checkout/service';
import { UserService } from '../src/users/service';
import { UserRepository, OrderRepository } from '../src/db/repository';
import { CustomerStatus } from '../src/users/model';
import type { PaymentGateway } from '../src/payments/gateway';

const fakeGateway: PaymentGateway = {
  async charge() {
    return { ok: true, paymentId: 'py_fake' };
  },
  async refund() {
    return { ok: true, paymentId: 'py_fake' };
  },
};

export async function testCheckoutChargesActiveCustomer(): Promise<boolean> {
  const users = new UserRepository();
  await users.saveUser({ id: 'u1', email: 'a@b.c', status: CustomerStatus.Active });
  const service = new CheckoutService(fakeGateway, new UserService(users), new OrderRepository());
  const result = await service.checkout({
    id: 'o1',
    userId: 'u1',
    lines: [{ sku: 's', quantity: 1, unitPrice: { cents: 100, currency: 'usd' } }],
    total: { cents: 100, currency: 'usd' },
  });
  return result.ok;
}
