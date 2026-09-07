import { CustomerStatus, type User, type UserId } from './model';
import { UserRepository } from '../db/repository';

export class UserService {
  constructor(private readonly repository: UserRepository) {}

  async findUser(id: UserId): Promise<User | undefined> {
    return this.repository.findUser(id);
  }

  async suspend(id: UserId): Promise<void> {
    const user = await this.repository.findUser(id);
    if (!user) return;
    user.status = CustomerStatus.Suspended;
    await this.repository.saveUser(user);
  }
}
