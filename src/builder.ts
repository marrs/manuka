type Expr = string | number | [string, ...Expr[]];

type AST = {
  select?: string[],
  from?: string[],
  where?: Expr,
}

function formatExpression(expr: Expr, parentOp?: string): string {
  // Base case: literals (strings, numbers)
  if (typeof expr === 'string' || typeof expr === 'number') {
    return String(expr);
  }

  const [op, ...args] = expr;

  // Binary operators
  const binaryOps = ['=', '<>', '<', '>', '<=', '>=', 'LIKE', 'like'];
  if (binaryOps.includes(op)) {
    return `${formatExpression(args[0], op)} ${op} ${formatExpression(args[1], op)}`;
  }

  // Logical operators
  if (op === 'and') {
    const formatted = args.map(arg => formatExpression(arg, 'and')).join(' AND ');
    return formatted;
  }

  if (op === 'or') {
    const formatted = args.map(arg => formatExpression(arg, 'or')).join(' OR ');
    // Add parentheses if OR is nested inside AND
    if (parentOp === 'and') {
      return `(${formatted})`;
    }
    return formatted;
  }

  // Functions (COUNT, SUM, etc.) - for future use
  return `${op}(${args.map(arg => formatExpression(arg, op)).join(', ')})`;
}

export function merge(target: Partial<AST>, source: Partial<AST>): Partial<AST> {
  Object.assign(target, source);
  return target;
}

export function partial(...partials: Partial<AST>[]): (target: Partial<AST>) => Partial<AST> {
  return (target: Partial<AST>) => {
    for (const p of partials) {
      Object.assign(target, p);
    }
    return target;
  };
}

export function format(ast: AST) {
  // Validate clause dependencies
  if (ast.from && !ast.select) {
    throw new Error('FROM clause requires SELECT clause');
  }
  if (ast.where && !ast.from) {
    throw new Error('WHERE clause requires FROM clause');
  }

  let result: string[] = [];
  if (ast.select) {
    result.push(`SELECT ${ast.select.join(', ')}`);
  }

  if (ast.from) {
    result.push(`FROM ${ast.from.join(', ')}`);
  }

  if (ast.where) {
    result.push(`WHERE ${formatExpression(ast.where)}`);
  }

  return result.join(' ');
}
