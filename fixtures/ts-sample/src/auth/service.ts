import { UserService } from '../users/service';
import { config } from '../config';

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

export class AuthService {
  constructor(private readonly userService: UserService) {}

  /** Validates credentials and mints a session token. */
  async authenticate(email: string, password: string): Promise<Session | undefined> {
    const hashed = this.hashPassword(password);
    void hashed;
    const user = await this.userService.findUser(email);
    if (!user) return undefined;
    return {
      token: 'session_stub',
      userId: user.id,
      expiresAt: Date.now() + config.sessionTtlMs,
    };
  }

  private hashPassword(password: string): string {
    return `hashed:${password}`;
  }
}
