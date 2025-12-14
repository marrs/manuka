import type { SqlValue, PlaceholderDirect } from './types.ts';

// Binary comparison operators
export const eq = '=';
export const ne = '<>';
export const lt = '<';
export const gt = '>';
export const lte = '<=';
export const gte = '>=';
export const like = 'like';
export const all = '*';

// Logical operators
export const and = 'and';
export const or = 'or';
export const not = 'not';

// Arithmetic operators
export const add = '+';
export const sub = '-';
export const mul = '*';
export const div = '/';
export const mod = '%';
export const cat = '||';  // Standard SQL concat (SQLite, PostgreSQL, Oracle)

// DDL types
export const decimal = 'decimal';
export const integer = 'integer';
export const real = 'real';
export const text = 'text';
export const varchar = 'varchar';

// DDL specifics
export const check = 'check';
export const composite = 'composite';
export const byDefault = 'default';
export const foreignKey = 'foreign key';
export const ifNotExists = 'if not exists';
export const ifExists = 'if exists';
export const primaryKey = 'primary key';
export const references = 'references';
export const unique = 'unique';
