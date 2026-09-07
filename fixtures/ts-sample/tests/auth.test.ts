import { AuthService } from '../src/auth/service';
import { UserService } from '../src/users/service';
import { UserRepository } from '../src/db/repository';

export async function testLoginUnknownUserFails(): Promise<boolean> {
  const service = new AuthService(new UserService(new UserRepository()));
  const session = await service.authenticate('missing@example.com', 'pw');
  return session === undefined;
}
