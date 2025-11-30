import type {
  CommonDdl, ExprToken, ColumnDef, TableConstraint,
  ColumnType, Constraint, Expr, IfExists,
} from './types.ts';

import { ifExists, ifNotExists, sqlKeywords } from './vocabulary.ts';

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
  let createClause = doesNotExist? `${sqlKeywords.ifNotExists} ${tableName}` : tableName;

  // Handle columns - combine into parenthesized list
  if (dsl.withColumns && dsl.withColumns.length > 0) {
    const columnDefs: string[] = [];
    const constraints: string[] = [];

    for (const column of dsl.withColumns) {
      if (isTableConstraint(column)) {
        constraints.push(formatTableConstraint(column));
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

function formatTableConstraint(constraint: TableConstraint): string {
  // TableConstraint is an array containing constraint definitions
  const [firstPart, ...rest] = constraint;

  if (Array.isArray(firstPart)) {
    const [keyword, ...args] = firstPart;

    if (keyword === 'PRIMARY KEY') {
      // Composite primary key: [['PRIMARY KEY', 'col1', 'col2']]
      return `PRIMARY KEY (${args.join(', ')})`;
    } else if (keyword === 'UNIQUE') {
      // Composite unique: [['UNIQUE', ['COMPOSITE', 'col1', 'col2']]]
      const compositeArgs = args[0];
      if (Array.isArray(compositeArgs) && compositeArgs[0] === 'COMPOSITE') {
        const [, ...columns] = compositeArgs;
        return `UNIQUE (${columns.join(', ')})`;
      }
    } else if (keyword === 'FOREIGN KEY') {
      // Foreign key: [['FOREIGN KEY', 'col'], ['REFERENCES', [table, column]]]
      const columnName = args[0];
      const references = rest[0];
      if (Array.isArray(references) && references[0] === 'REFERENCES') {
        const [table, column] = references[1] as [string, string];
        return `FOREIGN KEY (${columnName}) REFERENCES ${table}(${column})`;
      }
    } else if (keyword === 'CHECK') {
      // Table-level check: [['CHECK', expr]]
      return `CHECK (${formatExpr(args[0] as Expr)})`;
    }
  }

  return '';
}

function tokenizeColumnDef(columnDef: ColumnDef): string {
  const [name, type, ...constraints] = columnDef;

  let result = `${name} ${formatColumnType(type)}`;

  for (const constraint of constraints) {
    result += ` ${formatConstraint(constraint)}`;
  }

  return result;
}

function formatColumnType(type: ColumnType): string {
  if (typeof type === 'string') {
    return type;
  }

  // Handle parameterized types: ['VARCHAR', 255] or ['DECIMAL', 10, 2]
  const [typeName, ...params] = type;
  return `${typeName}(${params.join(', ')})`;
}

function formatConstraint(constraint: Constraint): string {
  const [keyword, value] = constraint;

  if (keyword === 'NOT') {
    return 'NOT NULL';
  }

  if (keyword === 'DEFAULT') {
    return `DEFAULT ${formatValue(value)}`;
  }

  if (keyword === 'PRIMARY KEY') {
    return 'PRIMARY KEY';
  }

  if (keyword === 'UNIQUE') {
    return 'UNIQUE';
  }

  if (keyword === 'CHECK') {
    // For CHECK constraints, value is an Expr
    return `CHECK (${formatExpr(value as Expr)})`;
  }

  if (keyword === 'REFERENCES') {
    // value is [table, column]
    const [table, column] = value as [string, string];
    return `REFERENCES ${table}(${column})`;
  }

  if (keyword === 'FOREIGN KEY') {
    return `FOREIGN KEY (${value})`;
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
  const nameClause = doesNotExist ? `${sqlKeywords.ifNotExists} ${indexName}` : indexName;

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

  const clause = doesExist ? `${sqlKeywords.ifExists} ${tableName}` : tableName;

  return [['DROP TABLE', clause]];
}

function tokenizeDropIndex(drop: string | [string, IfExists]): ExprToken[] {
  const indexName = typeof drop === 'string' ? drop : drop[0];
  const doesExist = Array.isArray(drop) && drop[1] === ifExists;

  const clause = doesExist ? `${sqlKeywords.ifExists} ${indexName}` : indexName;

  return [['DROP INDEX', clause]];
}

// Helper functions

function isTableConstraint(item: ColumnDef | TableConstraint): item is TableConstraint {
  // TableConstraint has nested arrays as first element
  return Array.isArray(item[0]) && Array.isArray(item[0]);
}

function formatValue(value: string | number | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  // String values need to be quoted in SQL
  return `'${value}'`;
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
