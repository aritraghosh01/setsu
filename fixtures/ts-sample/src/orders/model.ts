import type { Money, UserId } from '../users/model';

export interface OrderLine {
  sku: string;
  quantity: number;
  unitPrice: Money;
}

export interface Order {
  id: string;
  userId: UserId;
  lines: OrderLine[];
  total: Money;
}
