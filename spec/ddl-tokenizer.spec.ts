import { expect } from 'chai';
import { tokenizeDdl } from '../src/ddl-tokenizer.ts';

describe('ddl-tokenizer', () => {
  context('CREATE TABLE', () => {
    it('handles simple CREATE TABLE', () => {
      expect(tokenizeDdl({
        createTable: 'users'
      })).to.eql([
        ['CREATE TABLE', 'users']
      ]);
    });

    it('handles CREATE TABLE IF NOT EXISTS', () => {
      expect(tokenizeDdl({
        createTable: ['users', 'if not exists']
      })).to.eql([
        ['CREATE TABLE', 'IF NOT EXISTS users']
      ]);
    });

    it('handles CREATE TABLE with single column', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['id', 'INTEGER']
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (id INTEGER)']
      ]);
    });

    it('handles CREATE TABLE with multiple columns', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['id', 'INTEGER'],
          ['name', 'TEXT'],
          ['email', 'TEXT']
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (id INTEGER, name TEXT, email TEXT)']
      ]);
    });

    it('handles VARCHAR with length parameter', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['username', ['VARCHAR', 255]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (username VARCHAR(255))']
      ]);
    });

    it('handles DECIMAL with precision and scale', () => {
      expect(tokenizeDdl({
        createTable: 'products',
        withColumns: [
          ['price', ['DECIMAL', 10, 2]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'products (price DECIMAL(10, 2))']
      ]);
    });
  });

  context('Column constraints', () => {
    it('handles NOT NULL constraint', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['id', 'INTEGER', ['NOT', null]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (id INTEGER NOT NULL)']
      ]);
    });

    it('handles PRIMARY KEY constraint', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['id', 'INTEGER', ['PRIMARY KEY']]
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (id INTEGER PRIMARY KEY)']
      ]);
    });

    it('handles UNIQUE constraint', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['email', 'TEXT', ['UNIQUE']]
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (email TEXT UNIQUE)']
      ]);
    });

    it('handles DEFAULT constraint with string value', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['status', 'TEXT', ['DEFAULT', 'active']]
        ]
      })).to.eql([
        ['CREATE TABLE', "users (status TEXT DEFAULT 'active')"]
      ]);
    });

    it('handles DEFAULT constraint with numeric value', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['balance', 'INTEGER', ['DEFAULT', 0]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (balance INTEGER DEFAULT 0)']
      ]);
    });

    it('handles DEFAULT constraint with null value', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['deleted_at', 'TEXT', ['DEFAULT', null]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (deleted_at TEXT DEFAULT NULL)']
      ]);
    });

    it('handles CHECK constraint with simple expression', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['age', 'INTEGER', ['CHECK', ['>=', 'age', 18]]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (age INTEGER CHECK (age >= 18))']
      ]);
    });

    it('handles REFERENCES constraint', () => {
      expect(tokenizeDdl({
        createTable: 'orders',
        withColumns: [
          ['user_id', 'INTEGER', ['REFERENCES', ['users', 'id']]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'orders (user_id INTEGER REFERENCES users(id))']
      ]);
    });

    it('handles multiple constraints on single column', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['email', 'TEXT', ['NOT', null], ['UNIQUE']]
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (email TEXT NOT NULL UNIQUE)']
      ]);
    });

    it('handles all constraints combined', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['id', 'INTEGER', ['PRIMARY KEY'], ['NOT', null]],
          ['email', 'TEXT', ['NOT', null], ['UNIQUE']],
          ['age', 'INTEGER', ['DEFAULT', 0], ['CHECK', ['>=', 'age', 0]]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (id INTEGER PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, age INTEGER DEFAULT 0 CHECK (age >= 0))']
      ]);
    });
  });

  context('Table constraints', () => {
    it('handles composite PRIMARY KEY', () => {
      expect(tokenizeDdl({
        createTable: 'user_roles',
        withColumns: [
          ['user_id', 'INTEGER'],
          ['role_id', 'INTEGER'],
          [['PRIMARY KEY', 'user_id', 'role_id']]
        ]
      })).to.eql([
        ['CREATE TABLE', 'user_roles (user_id INTEGER, role_id INTEGER, PRIMARY KEY (user_id, role_id))']
      ]);
    });

    it('handles composite UNIQUE constraint', () => {
      expect(tokenizeDdl({
        createTable: 'users',
        withColumns: [
          ['first_name', 'TEXT'],
          ['last_name', 'TEXT'],
          [['UNIQUE', ['COMPOSITE', 'first_name', 'last_name']]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'users (first_name TEXT, last_name TEXT, UNIQUE (first_name, last_name))']
      ]);
    });

    it('handles table-level FOREIGN KEY', () => {
      expect(tokenizeDdl({
        createTable: 'orders',
        withColumns: [
          ['id', 'INTEGER'],
          ['user_id', 'INTEGER'],
          [['FOREIGN KEY', 'user_id'], ['REFERENCES', ['users', 'id']]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'orders (id INTEGER, user_id INTEGER, FOREIGN KEY (user_id) REFERENCES users(id))']
      ]);
    });

    it('handles table-level CHECK constraint', () => {
      expect(tokenizeDdl({
        createTable: 'products',
        withColumns: [
          ['price', 'INTEGER'],
          ['discount_price', 'INTEGER'],
          [['CHECK', ['<', 'discount_price', 'price']]]
        ]
      })).to.eql([
        ['CREATE TABLE', "products (price INTEGER, discount_price INTEGER, CHECK (discount_price < 'price'))"]
      ]);
    });
  });

  context('CREATE INDEX', () => {
    it('handles simple CREATE INDEX', () => {
      expect(tokenizeDdl({
        createIndex: {
          name: 'idx_users_email',
          on: ['users', 'email']
        }
      })).to.eql([
        ['CREATE INDEX', 'idx_users_email'],
        ['ON', 'users (email)']
      ]);
    });

    it('handles CREATE INDEX IF NOT EXISTS', () => {
      expect(tokenizeDdl({
        createIndex: {
          name: ['idx_users_email', 'if not exists'],
          on: ['users', 'email']
        }
      })).to.eql([
        ['CREATE INDEX', 'IF NOT EXISTS idx_users_email'],
        ['ON', 'users (email)']
      ]);
    });

    it('handles CREATE UNIQUE INDEX', () => {
      expect(tokenizeDdl({
        createIndex: {
          name: 'idx_users_email',
          on: ['users', 'email'],
          unique: true
        }
      })).to.eql([
        ['CREATE UNIQUE INDEX', 'idx_users_email'],
        ['ON', 'users (email)']
      ]);
    });

    it('handles composite index', () => {
      expect(tokenizeDdl({
        createIndex: {
          name: 'idx_users_name',
          on: ['users', 'first_name', 'last_name']
        }
      })).to.eql([
        ['CREATE INDEX', 'idx_users_name'],
        ['ON', 'users (first_name, last_name)']
      ]);
    });

    it('handles partial index with WHERE clause', () => {
      expect(tokenizeDdl({
        createIndex: {
          name: 'idx_active_users',
          on: ['users', 'email'],
          where: ['=', 'active', 'true']
        }
      })).to.eql([
        ['CREATE INDEX', 'idx_active_users'],
        ['ON', 'users (email)'],
        ['WHERE', "active = 'true'"]
      ]);
    });
  });

  context('DROP TABLE', () => {
    it('handles simple DROP TABLE', () => {
      expect(tokenizeDdl({
        dropTable: 'users'
      })).to.eql([
        ['DROP TABLE', 'users']
      ]);
    });

    it('handles DROP TABLE IF EXISTS', () => {
      expect(tokenizeDdl({
        dropTable: ['users', 'if exists']
      })).to.eql([
        ['DROP TABLE', 'IF EXISTS users']
      ]);
    });
  });

  context('DROP INDEX', () => {
    it('handles simple DROP INDEX', () => {
      expect(tokenizeDdl({
        dropIndex: 'idx_users_email'
      })).to.eql([
        ['DROP INDEX', 'idx_users_email']
      ]);
    });

    it('handles DROP INDEX IF EXISTS', () => {
      expect(tokenizeDdl({
        dropIndex: ['idx_users_email', 'if exists']
      })).to.eql([
        ['DROP INDEX', 'IF EXISTS idx_users_email']
      ]);
    });
  });

  context('Complex schemas', () => {
    it('handles complete table with all features', () => {
      expect(tokenizeDdl({
        createTable: ['users', 'if not exists'],
        withColumns: [
          ['id', 'INTEGER', ['PRIMARY KEY'], ['NOT', null]],
          ['email', ['VARCHAR', 255], ['NOT', null], ['UNIQUE']],
          ['age', 'INTEGER', ['DEFAULT', 18], ['CHECK', ['>=', 'age', 18]]],
          ['created_at', 'TEXT', ['DEFAULT', null]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'IF NOT EXISTS users (id INTEGER PRIMARY KEY NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, age INTEGER DEFAULT 18 CHECK (age >= 18), created_at TEXT DEFAULT NULL)']
      ]);
    });

    it('handles junction table with composite primary key', () => {
      expect(tokenizeDdl({
        createTable: 'user_roles',
        withColumns: [
          ['user_id', 'INTEGER', ['NOT', null]],
          ['role_id', 'INTEGER', ['NOT', null]],
          [['PRIMARY KEY', 'user_id', 'role_id']],
          [['FOREIGN KEY', 'user_id'], ['REFERENCES', ['users', 'id']]],
          [['FOREIGN KEY', 'role_id'], ['REFERENCES', ['roles', 'id']]]
        ]
      })).to.eql([
        ['CREATE TABLE', 'user_roles (user_id INTEGER NOT NULL, role_id INTEGER NOT NULL, PRIMARY KEY (user_id, role_id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (role_id) REFERENCES roles(id))']
      ]);
    });
  });
});
