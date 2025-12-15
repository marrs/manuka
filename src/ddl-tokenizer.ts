import type {
  CommonDdl, ExprToken, ColumnDef, TableConstraint,
  ColumnType, Constraint, Expr, IfExists, Atom, SqlValue,
} from './types.ts';

import { formatSqlValue } from './tokenizer/core.ts';

import {
  byDefault,
  ifExists,
  ifNotExists,
  not,
  primaryKey,
  foreignKey,
  unique,
  composite,
  references,
  check,
} from './vocabulary.ts';
import { upperCaseSqlKeyword } from './core.ts';

export function tokenizeDdl(dsl: CommonDdl): ExprToken[] {
  const tokens: ExprToken[] = [];

  if (dsl.createTable) {
    tokens.push(...tokenizeCreateTable(dsl));
  }

  if (dsl.createIndex) {
    tokens.push(...tokenizeCreateIndex(dsl));
  }

  if (dsl.dropTable) {
    tokens.push(...tokenizeDropTable(dsl.dropTable));
  }

  if (dsl.dropIndex) {
    tokens.push(...tokenizeDropIndex(dsl.dropIndex));
  }

  return tokens;
}

function tokenizeCreateTable(dsl: CommonDdl): ExprToken[] {
  const tokens: ExprToken[] = [];

  if (!dsl.createTable) return tokens;

  // Handle table name with optional IF NOT EXISTS
  const tableName = typeof dsl.createTable === 'string'
    ? dsl.createTable
    : dsl.createTable[0];

  const doesNotExist = Array.isArray(dsl.createTable) && dsl.createTable[1] === ifNotExists;

  // Build CREATE TABLE clause with correct IF NOT EXISTS placement
  let createClause = doesNotExist? `${upperCaseSqlKeyword(ifNotExists)} ${tableName}` : tableName;

  // Handle columns - combine into parenthesized list
  if (dsl.withColumns && dsl.withColumns.length > 0) {
    const columnDefs: string[] = [];
    const constraints: string[] = [];

    for (const column of dsl.withColumns) {
      if (isTableConstraint(column)) {
        constraints.push(tokenizeTableConstraint(column));
      } else {
        columnDefs.push(tokenizeColumnDef(column));
      }
    }

    // Combine columns and constraints
    const allDefs = [...columnDefs, ...constraints];
    createClause += ` (${allDefs.join(', ')})`;
  }

  tokens.push(['CREATE TABLE', createClause]);

  return tokens;
}

function tokenizeTableConstraint(constraint: TableConstraint): string {
  // TableConstraint is an array containing constraint definitions
  const [firstPart, ...rest] = constraint;

  if (Array.isArray(firstPart)) {
    const [keyword, ...args] = firstPart;

    if (keyword === primaryKey) {
      // Composite primary key: [[primaryKey, 'col1', 'col2']]
      return `${upperCaseSqlKeyword(keyword)} (${args.join(', ')})`;
    } else if (keyword === unique) {
      // Composite unique: [[unique, [composite, 'col1', 'col2']]]
      const compositeArgs = args[0];
      if (Array.isArray(compositeArgs) && compositeArgs[0] === composite) {
        const [, ...columns] = compositeArgs;
        return `${upperCaseSqlKeyword(keyword)} (${columns.join(', ')})`;
      }
    } else if (keyword === foreignKey) {
      // Foreign key: [[foreignKey, 'col'], [references, ['table', 'column']]]
      const columnName = args[0];
      const refs = rest[0];
      if (Array.isArray(refs) && refs[0] === references) {
        const [table, column] = refs[1] as [string, string];
        return `${upperCaseSqlKeyword(foreignKey)} (${columnName}) ${upperCaseSqlKeyword(references)} ${table}(${column})`;
      }
    } else if (keyword === check) {
      // Table-level check: [['CHECK', expr]]
      return `${upperCaseSqlKeyword(check)} (${formatExpr(args[0] as Expr)})`;
    }
  }

  return '';
}

function tokenizeColumnDef(columnDef: ColumnDef): string {
  const [name, type, ...constraints] = columnDef;

  let result = `${name} ${formatColumnType(type)}`;

  for (const constraint of constraints) {
    result += ` ${tokenizeConstraint(constraint)}`;
  }

  return result;
}

function formatColumnType(type: ColumnType): string {
  if (typeof type === 'string') {
    return upperCaseSqlKeyword(type);
  }

  // Handle parameterized types: ['VARCHAR', 255] or ['DECIMAL', 10, 2]
  const [typeName, ...params] = type;
  return `${upperCaseSqlKeyword(typeName)}(${params.join(', ')})`;
}

function tokenizeConstraint(constraint: Constraint): string {
  const [keyword, value] = constraint;

  if (keyword === not) {
    return 'NOT NULL';
  }

  if (keyword === byDefault) {
    return `${upperCaseSqlKeyword(byDefault)} ${formatValue(value)}`;
  }

  if (keyword === primaryKey) {
    return upperCaseSqlKeyword(keyword);
  }

  if (keyword === unique) {
    return upperCaseSqlKeyword(keyword);
  }

  if (keyword === check) {
    // For CHECK constraints, value is an Expr
    return `${upperCaseSqlKeyword(keyword)} (${formatExpr(value as Expr)})`;
  }

  if (keyword === references) {
    // value is [table, column]
    const [table, column] = value as [string, string];
    return `${upperCaseSqlKeyword(keyword)} ${table}(${column})`;
  }

  if (keyword === foreignKey) {
    return `${upperCaseSqlKeyword(keyword)} (${value})`;
  }

  return '';
}


function tokenizeCreateIndex(dsl: CommonDdl): ExprToken[] {
  const tokens: ExprToken[] = [];

  if (!dsl.createIndex) return tokens;

  const { name, on, unique, where } = dsl.createIndex;

  // Handle index name with optional IF NOT EXISTS
  const indexName = typeof name === 'string' ? name : name[0];
  const doesNotExist = Array.isArray(name) && name[1] === ifNotExists;

  const keyword = unique ? 'CREATE UNIQUE INDEX' : 'CREATE INDEX';
  const nameClause = doesNotExist ? `${upperCaseSqlKeyword(ifNotExists)} ${indexName}` : indexName;

  tokens.push([keyword, nameClause]);

  // ON clause: [table, col1, col2, ...]
  const [table, ...columns] = on;
  tokens.push(['ON', `${table} (${columns.join(', ')})`]);

  // Optional WHERE clause for partial index
  if (where) {
    tokens.push(['WHERE', formatExpr(where)]);
  }

  return tokens;
}

function tokenizeDropTable(drop: string | [string, IfExists]): ExprToken[] {
  const tableName = typeof drop === 'string' ? drop : drop[0];
  const doesExist = Array.isArray(drop) && drop[1] === ifExists;

  const clause = doesExist ? `${upperCaseSqlKeyword(ifExists)} ${tableName}` : tableName;

  return [['DROP TABLE', clause]];
}

function tokenizeDropIndex(drop: string | [string, IfExists]): ExprToken[] {
  const indexName = typeof drop === 'string' ? drop : drop[0];
  const doesExist = Array.isArray(drop) && drop[1] === ifExists;

  const clause = doesExist ? `${upperCaseSqlKeyword(ifExists)} ${indexName}` : indexName;

  return [['DROP INDEX', clause]];
}

// Helper functions

function isTableConstraint(item: ColumnDef | TableConstraint): item is TableConstraint {
  // TableConstraint has nested arrays as first element
  return Array.isArray(item[0]) && Array.isArray(item[0]);
}

function formatValue(value: Atom): string {
  // Placeholders shouldn't appear in DDL, but handle them just in case
  if (typeof value === 'object' && value !== null && '__placeholder' in value) {
    throw new Error('Placeholders are not supported in DDL expressions');
  }
  if (typeof value === 'function') {
    throw new Error('Placeholder functions are not supported in DDL expressions');
  }

  if (typeof value === 'string') {
    return `'${value}'`;
  }
  return formatSqlValue(value);
}

function formatExpr(expr: Expr): string {
  // Simple atom values
  if (!Array.isArray(expr)) {
    return formatValue(expr);
  }

  const [op, ...args] = expr;

  // Comparison operators
  const comparisonOps = ['=', '<>', '<', '>', '<=', '>=', 'LIKE'];
  if (comparisonOps.includes(op as string)) {
    const [left, right] = args;
    return `${left} ${op} ${formatValue(right as string | number | null)}`;
  }

  // Logical operators
  if (op === 'and') {
    return args.map(arg => formatExpr(arg as Expr)).join(' AND ');
  }

  if (op === 'or') {
    const formatted = args.map(arg => formatExpr(arg as Expr)).join(' OR ');
    return `(${formatted})`;
  }

  return '';
}
