import { createClient } from '@libsql/client';
import { format } from '../src/index.ts';
import type { CommonDdl } from '../src/types.ts';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const DB_PATH = path.join(__dirname, 'ecommerce.db');

// Database client instance
let db: ReturnType<typeof createClient> | null = null;

/**
 * Initialize database connection
 */
export function initDb(options: { reset?: boolean } = {}): ReturnType<typeof createClient> {
  if (options.reset && fs.existsSync(DB_PATH)) {
    console.log('🗑️  Removing existing database...');
    fs.unlinkSync(DB_PATH);
  }

  console.log(`📂 Initializing database at: ${DB_PATH}`);

  db = createClient({
    url: `file:${DB_PATH}`
  });

  return db;
}

/**
 * Get current database connection
 */
export function getDb(): ReturnType<typeof createClient> {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    console.log('✅ Database connection closed');
  }
}

/**
 * Execute DDL statement from DSL
 */
export async function executeDdl(ddl: CommonDdl, description?: string): Promise<void> {
  const connection = getDb();
  const [sql, ...args] = format(ddl);

  try {
    console.log(`🔨 ${description || 'Executing DDL'}...`);
    console.log(`   SQL: ${sql.substring(0, 80)}${sql.length > 80 ? '...' : ''}`);

    await connection.execute({sql, args});
    console.log(`✅ Success`);
  } catch (error) {
    console.error(`❌ Failed to execute DDL`);
    console.error(`   SQL: ${sql}`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Execute multiple DDL statements in sequence
 */
export async function executeDdls(ddls: Array<{ ddl: CommonDdl; description?: string }>): Promise<void> {
  for (const item of ddls) {
    await executeDdl(item.ddl, item.description);
  }
}

/**
 * Execute raw SQL statement
 */
export async function executeRaw(sql: string, description?: string): Promise<void> {
  const connection = getDb();

  try {
    console.log(`🔨 ${description || 'Executing SQL'}...`);
    console.log(`   SQL: ${sql.substring(0, 80)}${sql.length > 80 ? '...' : ''}`);

    await connection.execute(sql);
    console.log(`✅ Success`);
  } catch (error) {
    console.error(`❌ Failed to execute SQL`);
    console.error(`   SQL: ${sql}`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Verify database was created successfully
 */
export async function verifyDatabase(): Promise<void> {
  const connection = getDb();

  console.log('🔍 Verifying database...');

  try {
    // Query SQLite master table to get all tables
    const result = await connection.execute(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'index', 'view', 'trigger') ORDER BY type, name"
    );

    console.log('\n📋 Database objects:');

    if (result.rows.length === 0) {
      console.log('   (empty)');
    } else {
      const grouped = result.rows.reduce((acc, row) => {
        const type = String(row.type);
        if (!acc[type]) acc[type] = [];
        acc[type].push(String(row.name));
        return acc;
      }, {} as Record<string, string[]>);

      for (const [type, names] of Object.entries(grouped)) {
        console.log(`\n   ${type}s:`);
        for (const name of names) {
          console.log(`     - ${name}`);
        }
      }
    }

    console.log('\n✅ Database verification complete');
  } catch (error) {
    console.error('❌ Database verification failed');
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
