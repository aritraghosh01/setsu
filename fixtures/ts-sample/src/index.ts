import { buildRoutes } from './routes';
import { config } from './config';

export function main(): void {
  const routes = buildRoutes();
  console.log(`ts-sample listening on ${config.port} with ${routes.length} routes`);
}
