import type { User, UserId } from '../users/model';
import type { Order } from '../orders/model';

export class UserRepository {
  private readonly users = new Map<UserId, User>();

  async findUser(id: UserId): Promise<User | undefined> {
    return this.users.get(id);
  }

  async saveUser(user: User): Promise<void> {
    this.users.set(user.id, user);
  }
}

export class OrderRepository {
  private readonly orders = new Map<string, Order>();

  async findOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async saveOrder(order: Order): Promise<void> {
    this.orders.set(order.id, order);
  }
}
