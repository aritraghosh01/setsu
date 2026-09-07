import { CheckoutController } from './checkout/controller';
import { AuthController } from './auth/controller';
import { CheckoutService } from './checkout/service';
import { AuthService } from './auth/service';
import { StripeAdapter } from './payments/stripe-adapter';
import { UserService } from './users/service';
import { UserRepository, OrderRepository } from './db/repository';

export interface Route {
  method: 'GET' | 'POST';
  path: string;
  handler: (body: unknown) => Promise<unknown>;
}

export function buildRoutes(): Route[] {
  const userRepository = new UserRepository();
  const orderRepository = new OrderRepository();
  const userService = new UserService(userRepository);
  const gateway = new StripeAdapter();
  const checkoutService = new CheckoutService(gateway, userService, orderRepository);
  const checkoutController = new CheckoutController(checkoutService);
  const authService = new AuthService(userService);
  const authController = new AuthController(authService);

  return [
    { method: 'POST', path: '/checkout', handler: (b) => checkoutController.handleCheckout(b) },
    {
      method: 'POST',
      path: '/login',
      handler: (b) => authController.handleLogin(b as { email: string; password: string }),
    },
  ];
}
