#!/usr/bin/env tsx

import { initDb, executeDdl, verifyDatabase, closeDb } from './create-db.ts';
import { allTables, allIndexes } from './schema.ts';
import type { CommonDdl } from '../src/types.ts';

/**
 * Test database utilities and create full e-commerce schema
 */
async function main() {
  console.log('🧪 Testing database utilities...\n');

  try {
    // Initialize database (reset if exists)
    initDb({ reset: true });

    // PART 1: Simple smoke test
    console.log('📋 Part 1: Simple smoke test\n');

    const testTable: CommonDdl = {
      createTable: ['test_users', 'if not exists'],
      withColumns: [
        ['id', 'integer', ['primary key']],
        ['name', 'text', ['not', null]],
        ['email', 'text', ['unique'], ['not', null]],
        ['created_at', 'integer', ['default', 0]]
      ]
    };

    await executeDdl(testTable, 'Creating test_users table');

    const testIndex: CommonDdl = {
      createIndex: {
        name: ['idx_test_users_email', 'if not exists'],
        on: ['test_users', 'email'],
        unique: true
      }
    };

    await executeDdl(testIndex, 'Creating index on email');

    console.log('\n✅ Smoke test passed!\n');

    // PART 2: Create full e-commerce schema
    console.log('═'.repeat(60));
    console.log('📦 Part 2: Creating E-Commerce Schema\n');

    console.log('📋 Creating tables...\n');

    for (let i = 0; i < allTables.length; i++) {
      const tableNum = i + 1;
      await executeDdl(allTables[i], `Creating table ${tableNum}/${allTables.length}`);
    }

    console.log('\n📇 Creating indexes...\n');

    for (let i = 0; i < allIndexes.length; i++) {
      const indexNum = i + 1;
      await executeDdl(allIndexes[i], `Creating index ${indexNum}/${allIndexes.length}`);
    }

    console.log('\n');

    // Verify complete database
    await verifyDatabase();

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 All tests passed!');
    console.log(`   Tables: ${allTables.length + 1} (including test_users)`);
    console.log(`   Indexes: ${allIndexes.length + 1} (including test index)`);

  } catch (error) {
    console.error('\n💥 Test failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
