import { AuthService } from './service';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  async handleLogin(body: { email: string; password: string }): Promise<{ status: number; token?: string }> {
    const session = await this.service.authenticate(body.email, body.password);
    if (!session) return { status: 401 };
    return { status: 200, token: session.token };
  }
}
