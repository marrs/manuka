import { initDb, getDb, closeDb, executeDdl } from '../../testbed/create-db.ts';
import { users, categories, products, orders, orderItems } from '../../testbed/schema.ts';

export async function setupTestDatabase() {
  initDb({ reset: true });

  // Create minimal schema for testing
  await executeDdl(users);
  await executeDdl(categories);
  await executeDdl(products);
  await executeDdl(orders);
  await executeDdl(orderItems);
}

export { getDb, closeDb };
