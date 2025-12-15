import { expect } from 'chai';
import { format, $ } from '../../src/index.ts';
import { add, sub, mul, cat, eq } from '../../src/vocabulary.ts';
import { setupTestDatabase, getDb, closeDb } from '../sqlite/util.ts';
import { createAccount, addCategory } from '../common/seed-db.ts';

describe('insertion', () => {
  before(async () => {
    await setupTestDatabase();

    // Create base data needed for FK constraints
    await createAccount({ id: 1, email: 'test@example.com', username: 'testuser' });
    await addCategory({ id: 1, name: 'Electronics', slug: 'electronics' });
  });

  after(async () => {
    await closeDb();
  });

  afterEach(async () => {
    const db = getDb();
    await db.execute('DELETE FROM products');
  });

  it('inserts rows with complex arithmetic expressions', async () => {
    const db = getDb();

    const date = 1234567890;
    const productData = [
      {skuCategory: 'ELEC', categoryId: 1, name: 'Laptop', price: {
        unit: 1.2, qty: 100, fee: 10, discount: 5,
      }, date},
      {skuCategory: 'ELEC', categoryId: 1, name: 'Mouse', price: {
        unit: 2, qty: 20, fee: 0, discount: 0,
      }, date},
    ];

    // Test complex nested expression with operator precedence:
    // price = (base * markup) + shipping - discount
    // sku = category || '-' || id
    let [sql, ...args] = format({
      insertInto: 'products',
      columns: ['id', 'category_id', 'sku', 'name', 'price', 'created_at'],
      values: productData.map(({categoryId, skuCategory, name, price, date}, idx): any => {
        const id = idx + 1;
        const skuId = `00${id}`;
        return [
          id, categoryId, [cat, [cat, $(skuCategory), '-'], $(skuId)],
          $(name), [sub, [add, [mul, price.qty, price.unit], price.fee], price.discount], $(date),
        ]
      }),
    });
    await db.execute({sql, args: args as any});

    // Verify complex calculation: (100 * 1.2) + 10 - 5 = 125
    [sql, ...args] = format({
      select: ['id', 'sku', 'price'],
      from: ['products'],
      where: [eq, 'category_id', $(1)]
    });
    const result = await db.execute({sql, args: args as any});

    expect(result.rows).to.have.lengthOf(2);

    const laptop = result.rows.find((r: any) => r.id === 1);
    expect(laptop).to.exist;
    expect(laptop!.sku).to.equal('ELEC-001');
    expect(laptop!.price).to.equal(125); // (100 * 1.2) + 10 - 5

    const mouse = result.rows.find((r: any) => r.id === 2);
    expect(mouse).to.exist;
    expect(mouse!.sku).to.equal('ELEC-002');
    expect(mouse!.price).to.equal(40); // 20 * 2
  });
});
