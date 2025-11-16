export type AST = {
  select?: string[],
  from?: string[],
  where?: Expr,
  orderBy?: string,
}

export type Atom = string | number | null;
export type CompoundExpr = [string, ...Expr[]]
export type Expr = Atom | CompoundExpr;

export type ExprToken = [string, string | ExprToken[]];
