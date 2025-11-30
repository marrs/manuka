#!/usr/bin/env tsx

import { initDb, executeDdl, verifyDatabase, closeDb } from './create-db.ts';
import { allTables, allIndexes } from './schema.ts';

/**
 * Create e-commerce database schema
 * Creates all tables and indexes in dependency order
 */
async function main() {
  console.log('📦 Creating E-Commerce Database Schema...\n');

  try {
    // Initialize database (reset if exists)
    initDb({ reset: true });

    console.log('📋 Creating tables...\n');

    // Execute all table DDL statements in dependency order
    for (let i = 0; i < allTables.length; i++) {
      const tableNum = i + 1;
      await executeDdl(allTables[i], `Creating table ${tableNum}/${allTables.length}`);
    }

    console.log('\n📇 Creating indexes...\n');

    // Execute all index DDL statements
    for (let i = 0; i < allIndexes.length; i++) {
      const indexNum = i + 1;
      await executeDdl(allIndexes[i], `Creating index ${indexNum}/${allIndexes.length}`);
    }

    console.log('\n');

    // Verify database creation
    await verifyDatabase();

    console.log('\n✅ Schema creation complete!');
    console.log(`   Tables: ${allTables.length}`);
    console.log(`   Indexes: ${allIndexes.length}`);

  } catch (error) {
    console.error('\n💥 Schema creation failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
