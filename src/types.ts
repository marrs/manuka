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
