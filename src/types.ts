// Atom values
export type Atom = string | number | null;

// Comparison expressions: operator, field name, value
export type ComparisonOp = '=' | '<>' | '<' | '>' | '<=' | '>=' | 'LIKE';
export type ComparisonExpr = [ComparisonOp, string, Atom];

// Logical expressions: operator, at least 2 operands
export type LogicalOp = 'and' | 'or';
export type LogicalExpr = [LogicalOp, Expr, Expr, ...Expr[]];

// Compound expressions are either comparison or logical
export type CompoundExpr = ComparisonExpr | LogicalExpr;

// An expression is either an atom or a compound expression
export type Expr = Atom | CompoundExpr;

// Token types
export type ExprToken = [string, string | ExprToken[]];

export type CommonDml = {
  select?: string[],
  from?: string[],
  where?: Expr,
  orderBy?: string | [string, string],
}

// ============================================================================
// DDL Types (Data Definition Language)
// ============================================================================

export type IfNotExists = 'if not exists';
export type IfExists = 'if exists';

// Column data types
export type ColumnType =
  | 'integer'
  | 'text'
  | 'real'
  | 'blob'
  | 'null'
  | ['varchar', number]
  | ['decimal', number, number];

// Constraint types
export type NotNull = ['not', null];
export type Default = ['default', string | number | null];
export type PrimaryKey = 'primary key';
export type ForeignKey = 'foreign key';
export type Unique = 'unique';
export type Composite = 'composite';
export type Check = 'check';
export type References = 'references';

export type Constraint =
  | NotNull
  | Default
  | [PrimaryKey]
  | [Unique]
  | [Check, Expr]
  | [References, [string, string]]
  | [ForeignKey, string];

// Column definition: [name, type, ...constraints]
export type ColumnDef = [string, ColumnType, ...Constraint[]];

// Table-level constraints
export type TableConstraint =
  | [[PrimaryKey, ...string[]]]          // Composite PK
  | [[Unique, [Composite, ...string[]]]] // Composite unique
  | [[ForeignKey, string], [References, [string, string]]]
  | [[Check, Expr]];

// DDL property keys (used for runtime type detection)
export const DDL_KEYS = [
  'createTable',
  'withColumns',
  'createIndex',
  'dropTable',
  'dropIndex'
] as const;

// Common SQL DDL (portable across all databases)
export type CommonDdl = {
  // CREATE TABLE with column definitions
  createTable?: string | [string, IfNotExists];
  withColumns?: (ColumnDef | TableConstraint)[];

  // CREATE INDEX
  createIndex?: {
    name: string | [string, IfNotExists];
    on: [string, ...string[]];  // [table, col1, col2, ...]
    unique?: boolean;
    where?: Expr;  // Partial index
  };

  // DROP operations
  dropTable?: string | [string, IfExists];
  dropIndex?: string | [string, IfExists];
};

// Compile-time validation that DDL_KEYS matches CommonDdl keys
type ValidateDdlKeys = typeof DDL_KEYS[number] extends keyof CommonDdl ? true : never;
const _validateDdlKeys: ValidateDdlKeys = true;
