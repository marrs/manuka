import { getDb } from '../../testbed/create-db.ts';
import { format } from '../../src/index.ts';
import { add, sub, mul, cat, eq } from '../../src/vocabulary.ts';

export type SeedMode = 'seed' | 'test';


export async function createAccount(
  params: { id: number; email: string; username: string },
  mode: SeedMode = 'seed'
): Promise<any> {
  const db = getDb();
  const { id, email, username } = params;

  const insertSql = format({
    insertInto: 'users',
    columns: ['id', 'email', 'username', 'password_hash', 'created_at', 'updated_at', 'is_active'],
    values: [[id, email, username, 'hash', 1234567890, 1234567890, 1]]
  });
  await db.execute(insertSql);

  const selectSql = format({
    select: ['email', 'username'],
    from: ['users'],
    where: [eq, 'id', id]
  });
  const result = await db.execute(selectSql);

  if (mode === 'seed') {
    if (result.rows[0].email !== email || result.rows[0].username !== username) {
      throw new Error(`User ${id} mismatch: expected ${email}/${username}, got ${result.rows[0].email}/${result.rows[0].username}`);
    }
  }

  return result;
}

export async function addCategory(
  params: { id: number; name: string; slug: string; parentId?: number | null },
  mode: SeedMode = 'seed'
): Promise<any> {
  const db = getDb();
  const { id, name, slug, parentId = null } = params;

  const insertSql = format({
    insertInto: 'categories',
    columns: ['id', 'parent_id', 'name', 'slug', 'description'],
    values: [[id, parentId, name, slug, `${name} category`]]
  });
  await db.execute(insertSql);

  const selectSql = format({
    select: ['name', 'slug'],
    from: ['categories'],
    where: [eq, 'id', id]
  });
  const result = await db.execute(selectSql);

  if (mode === 'seed') {
    if (result.rows[0].name !== name || result.rows[0].slug !== slug) {
      throw new Error(`Category ${id} mismatch: expected ${name}/${slug}, got ${result.rows[0].name}/${result.rows[0].slug}`);
    }
  }

  return result;
}

export async function addProductWithCalculatedPrice(
  params: { id: number; basePrice: number; markup: number },
  mode: SeedMode = 'seed'
): Promise<any> {
  const db = getDb();
  const { id, basePrice, markup } = params;

  const insertSql = format({
    insertInto: 'products',
    columns: ['id', 'category_id', 'sku', 'name', 'price', 'created_at'],
    values: [[id, 1, `PROD-${id}`, 'Product', [add, basePrice, markup], 1234567890]]
  });
  await db.execute(insertSql);

  const selectSql = format({
    select: ['price'],
    from: ['products'],
    where: [eq, 'id', id]
  });
  const result = await db.execute(selectSql);
  const expectedPrice = basePrice + markup;

  if (mode === 'seed') {
    if (result.rows[0].price !== expectedPrice) {
      throw new Error(`Product ${id} price mismatch: expected ${expectedPrice}, got ${result.rows[0].price}`);
    }
  }

  return result;
}

export async function addProductWithGeneratedSKU(
  params: { id: number; categoryPrefix: string; productId: string },
  mode: SeedMode = 'seed'
): Promise<any> {
  const db = getDb();
  const { id, categoryPrefix, productId } = params;

  const insertSql = format({
    insertInto: 'products',
    columns: ['id', 'category_id', 'sku', 'name', 'price', 'created_at'],
    values: [[id, 1, [cat, [cat, categoryPrefix, '-'], productId], 'Monitor', 299.99, 1234567890]]
  });
  await db.execute(insertSql);

  const selectSql = format({
    select: ['sku'],
    from: ['products'],
    where: [eq, 'id', id]
  });
  const result = await db.execute(selectSql);
  const expectedSKU = `${categoryPrefix}-${productId}`;

  if (mode === 'seed') {
    if (result.rows[0].sku !== expectedSKU) {
      throw new Error(`Product ${id} SKU mismatch: expected ${expectedSKU}, got ${result.rows[0].sku}`);
    }
  }

  return result;
}

export async function batchAddProducts(
  products: Array<{ id: number; sku: string; name: string; operation: any; operandA: number; operandB: number }>,
  mode: SeedMode = 'seed'
): Promise<any> {
  const db = getDb();

  const values = products.map(p => [p.id, 1, p.sku, p.name, [p.operation, p.operandA, p.operandB], 1234567890]);
  const insertSql = format({
    insertInto: 'products',
    columns: ['id', 'category_id', 'sku', 'name', 'price', 'created_at'],
    values
  });
  await db.execute(insertSql);

  const selectSql = format({
    select: ['id', 'price'],
    from: ['products'],
    where: [eq, 'category_id', 1]
  });
  const result = await db.execute(selectSql);

  const expectedPrices = products.map(p => {
    if (p.operation === add) return p.operandA + p.operandB;
    if (p.operation === sub) return p.operandA - p.operandB;
    if (p.operation === mul) return p.operandA * p.operandB;
    throw new Error(`Unknown operator: ${p.operation}`);
  });

  if (mode === 'seed') {
    products.forEach((p, i) => {
      const row = result.rows.find((r: any) => r.id === p.id);
      if (!row || row.price !== expectedPrices[i]) {
        throw new Error(`Product ${p.id} price mismatch: expected ${expectedPrices[i]}, got ${row?.price}`);
      }
    });
  }

  return result;
}

export async function createOrderWithCalculatedTotals(
  params: { id: number; subtotal: number; tax: number; shipping: number },
  mode: SeedMode = 'seed'
): Promise<any> {
  const db = getDb();
  const { id, subtotal, tax, shipping } = params;

  const insertSql = format({
    insertInto: 'orders',
    columns: ['id', 'user_id', 'order_number', 'status', 'subtotal', 'tax', 'shipping', 'total', 'created_at'],
    values: [[id, 1, `ORD-${String(id).padStart(3, '0')}`, 'pending', subtotal, tax, shipping, [add, [add, subtotal, tax], shipping], 1234567890]]
  });
  await db.execute(insertSql);

  const selectSql = format({
    select: ['subtotal', 'tax', 'shipping', 'total'],
    from: ['orders'],
    where: [eq, 'id', id]
  });
  const result = await db.execute(selectSql);
  const expectedTotal = subtotal + tax + shipping;

  if (mode === 'seed') {
    const row = result.rows[0];
    if (row.subtotal !== subtotal || row.tax !== tax || row.shipping !== shipping || row.total !== expectedTotal) {
      throw new Error(`Order ${id} mismatch: expected total ${expectedTotal}, got ${row.total}`);
    }
  }

  return result;
}

export async function addOrderItemWithQuantityPricing(
  params: { id: number; orderId: number; productId: number; quantity: number; unitPrice: number },
  mode: SeedMode = 'seed'
): Promise<any> {
  const db = getDb();
  const { id, orderId, productId, quantity, unitPrice } = params;

  const insertSql = format({
    insertInto: 'order_items',
    columns: ['id', 'order_id', 'product_id', 'quantity', 'unit_price', 'subtotal'],
    values: [[id, orderId, productId, quantity, unitPrice, [mul, quantity, unitPrice]]]
  });
  await db.execute(insertSql);

  const selectSql = format({
    select: ['quantity', 'unit_price', 'subtotal'],
    from: ['order_items'],
    where: [eq, 'id', id]
  });
  const result = await db.execute(selectSql);
  const expectedSubtotal = quantity * unitPrice;

  if (mode === 'seed') {
    const row = result.rows[0];
    if (row.quantity !== quantity || row.unit_price !== unitPrice || row.subtotal !== expectedSubtotal) {
      throw new Error(`Order item ${id} mismatch: expected subtotal ${expectedSubtotal}, got ${row.subtotal}`);
    }
  }

  return result;
}
