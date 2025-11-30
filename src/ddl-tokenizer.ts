import type {
  CommonDdl, ExprToken, ColumnDef, TableConstraint,
  ColumnType, Constraint, Expr
} from './types.ts';

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

  const ifNotExists = Array.isArray(dsl.createTable) && dsl.createTable[1] === 'IF NOT EXISTS';

  const createClause = ifNotExists
    ? `${tableName} IF NOT EXISTS`
    : tableName;

  tokens.push(['CREATE TABLE', createClause]);

  // Handle columns
  if (dsl.withColumns && dsl.withColumns.length > 0) {
    const columnTokens = tokenizeColumns(dsl.withColumns);
    tokens.push(...columnTokens);
  }

  return tokens;
}

function tokenizeColumns(columns: (ColumnDef | TableConstraint)[]): ExprToken[] {
  const tokens: ExprToken[] = [];

  for (const column of columns) {
    if (isTableConstraint(column)) {
      tokens.push(...tokenizeTableConstraint(column));
    } else {
      tokens.push(['COLUMN', tokenizeColumnDef(column)]);
    }
  }

  return tokens;
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

function tokenizeTableConstraint(constraint: TableConstraint): ExprToken[] {
  const tokens: ExprToken[] = [];

  // TableConstraint is an array containing constraint definitions
  const [firstPart, ...rest] = constraint;

  if (Array.isArray(firstPart)) {
    const [keyword, ...args] = firstPart;

    if (keyword === 'PRIMARY KEY') {
      // Composite primary key: [['PRIMARY KEY', 'col1', 'col2']]
      tokens.push(['PRIMARY KEY', `(${args.join(', ')})`]);
    } else if (keyword === 'UNIQUE') {
      // Composite unique: [['UNIQUE', ['COMPOSITE', 'col1', 'col2']]]
      const compositeArgs = args[0];
      if (Array.isArray(compositeArgs) && compositeArgs[0] === 'COMPOSITE') {
        const [, ...columns] = compositeArgs;
        tokens.push(['UNIQUE', `(${columns.join(', ')})`]);
      }
    } else if (keyword === 'FOREIGN KEY') {
      // Foreign key: [['FOREIGN KEY', 'col'], ['REFERENCES', [table, column]]]
      const columnName = args[0];
      const references = rest[0];
      if (Array.isArray(references) && references[0] === 'REFERENCES') {
        const [table, column] = references[1] as [string, string];
        tokens.push(['FOREIGN KEY', `(${columnName}) REFERENCES ${table}(${column})`]);
      }
    } else if (keyword === 'CHECK') {
      // Table-level check: [['CHECK', expr]]
      tokens.push(['CHECK', `(${formatExpr(args[0] as Expr)})`]);
    }
  }

  return tokens;
}

function tokenizeCreateIndex(dsl: CommonDdl): ExprToken[] {
  const tokens: ExprToken[] = [];

  if (!dsl.createIndex) return tokens;

  const { name, on, unique, where } = dsl.createIndex;

  // Handle index name with optional IF NOT EXISTS
  const indexName = typeof name === 'string' ? name : name[0];
  const ifNotExists = Array.isArray(name) && name[1] === 'IF NOT EXISTS';

  const keyword = unique ? 'CREATE UNIQUE INDEX' : 'CREATE INDEX';
  const nameClause = ifNotExists ? `${indexName} IF NOT EXISTS` : indexName;

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

function tokenizeDropTable(drop: string | [string, 'IF EXISTS']): ExprToken[] {
  const tableName = typeof drop === 'string' ? drop : drop[0];
  const ifExists = Array.isArray(drop) && drop[1] === 'IF EXISTS';

  const clause = ifExists ? `${tableName} IF EXISTS` : tableName;

  return [['DROP TABLE', clause]];
}

function tokenizeDropIndex(drop: string | [string, 'IF EXISTS']): ExprToken[] {
  const indexName = typeof drop === 'string' ? drop : drop[0];
  const ifExists = Array.isArray(drop) && drop[1] === 'IF EXISTS';

  const clause = ifExists ? `${indexName} IF EXISTS` : indexName;

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
  // String values are returned as-is (formatter will handle quoting)
  return value;
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
