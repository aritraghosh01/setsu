import type { Order } from './model';
import { CustomerStatus, type User } from '../users/model';

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

/** Orders from suspended or closed customers must never reach payment. */
export function validateOrder(order: Order, user: User): void {
  if (user.status !== CustomerStatus.Active) {
    throw new OrderValidationError(`customer ${user.id} is ${user.status}`);
  }
  if (order.lines.length === 0) {
    throw new OrderValidationError('order has no lines');
  }
  if (order.total.cents <= 0) {
    throw new OrderValidationError('order total must be positive');
  }
}
