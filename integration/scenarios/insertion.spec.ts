import { expect } from 'chai';
import { format } from '../../src/index.ts';
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

    // Test complex nested expression with operator precedence:
    // price = (base * markup) + shipping - discount
    // sku = category || '-' || id
    const [insertSql] = format({
      insertInto: 'products',
      columns: ['id', 'category_id', 'sku', 'name', 'price', 'created_at'],
      values: [
        [1, 1, [cat, [cat, 'ELEC', '-'], '001'], 'Laptop', [sub, [add, [mul, 100, 1.2], 10], 5], 1234567890],
        [2, 1, [cat, [cat, 'ELEC', '-'], '002'], 'Mouse', [mul, 20, 2], 1234567890]
      ]
    });
    await db.execute(insertSql);

    // Verify complex calculation: (100 * 1.2) + 10 - 5 = 125
    const [selectSql] = format({
      select: ['id', 'sku', 'price'],
      from: ['products'],
      where: [eq, 'category_id', 1]
    });
    const result = await db.execute(selectSql);

    expect(result.rows).to.have.lengthOf(2);

    const laptop = result.rows.find((r: any) => r.id === 1);
    expect(laptop.sku).to.equal('ELEC-001');
    expect(laptop.price).to.equal(125); // (100 * 1.2) + 10 - 5

    const mouse = result.rows.find((r: any) => r.id === 2);
    expect(mouse.sku).to.equal('ELEC-002');
    expect(mouse.price).to.equal(40); // 20 * 2
  });
});
