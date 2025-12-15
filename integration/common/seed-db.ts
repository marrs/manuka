import { getDb } from '../../testbed/create-db.ts';
import { format } from '../../src/index.ts';
import { eq } from '../../src/vocabulary.ts';

import type { ResultSet } from '@libsql/client';

export type SeedMode = 'seed' | 'test';


export async function createAccount(
  params: { id: number; email: string; username: string },
  mode: SeedMode = 'seed'
): Promise<any> {
  const db = getDb();
  const { id, email, username } = params;

  const [insertSql] = format({
    insertInto: 'users',
    columns: ['id', 'email', 'username', 'password_hash', 'created_at', 'updated_at', 'is_active'],
    values: [[id, email, username, 'hash', 1234567890, 1234567890, 1]]
  });
  await db.execute(insertSql);

  const [selectSql] = format({
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
): Promise<ResultSet> {
  const db = getDb();
  const { id, name, slug, parentId = null } = params;

  const [insertSql] = format({
    insertInto: 'categories',
    columns: ['id', 'parent_id', 'name', 'slug', 'description'],
    values: [[id, parentId, name, slug, `${name} category`]]
  });
  await db.execute(insertSql);

  const [selectSql] = format({
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
