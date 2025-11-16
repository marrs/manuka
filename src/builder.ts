type Token = string | number | null;
type CompoundExpr = [string, ...Expr[]]
type Expr = Token | CompoundExpr;

type AST = {
  select?: string[],
  from?: string[],
  where?: Expr,
  orderBy?: string,
}

function stringifyToken(token: number | string | null) {
  if (typeof token === 'string' || typeof token === 'number') {
    return String(token);
  }

  if (typeof token === null) {
    return "NULL";
  }

  return '';
}

function isToken(expr: Expr) {
  if (typeof expr === 'string'
  || typeof expr === 'number'
  || typeof expr === null) {
    return true
  }
  return false;
}

function formatExpression(expr: Expr, parentOp?: string): string {
  // Base case: literals (strings, numbers)
  if (isToken(expr)) {
    return stringifyToken(expr as Token);
  }

  const [op, ...args] = expr as CompoundExpr;

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

export function validate(ast: Partial<AST>): void {
  if (ast.from && !ast.select) {
    throw new Error('FROM clause requires SELECT clause');
  }
  if (ast.where && !ast.from) {
    throw new Error('WHERE clause requires FROM clause');
  }
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

function formatWithSeparator(ast: AST, separator: string): string {
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

  return result.join(separator);
}

type ExprToken = [string, string];

function prettyFormat(ast: AST, indent: string = ''): string {
  const lines: Array<ExprToken> = [];

  // Collect clauses with their keywords
  if (ast.select) {
    lines.push(['SELECT', ast.select.join(', ')]);
  }

  if (ast.from) {
    lines.push(['FROM', ast.from.join(', ')]);
  }

  if (ast.where) {
    // For WHERE with logical operators, we need to split them
    const whereClauses = prettyFormatWhereClause(ast.where);
    lines.push(...whereClauses);
  }

  if (ast.orderBy) {
    lines.push(['ORDER BY', ast.orderBy]);
  }

  const longestKeyword = lines.reduce((acc, line) => {
    return line[0].length > acc? line[0].length : acc;
  }, 0);

  return lines.map(line => {
    const keyword = line[0];
    const padding = ' '.repeat(longestKeyword - keyword.length);
    return indent + padding + keyword + ' ' + line[1];
  }).join('\n');
}

function prettyFormatWhereClause(expr: Expr): Array<ExprToken> {
  if (isToken(expr)) {
    return [['WHERE', stringifyToken(expr as Token)]];
  }

  const [op, ...args] = expr as CompoundExpr;

  // For AND at the top level, split into multiple lines
  if (op === 'and') {
    const result: Array<ExprToken> = [];
    for (let i = 0; i < args.length; i++) {
      const formatted = formatExpression(args[i]);
      if (i === 0) {
        result.push(['WHERE', formatted]);
      } else {
        result.push(['AND', formatted]);
      }
    }
    return result;
  }

  // For OR at the top level, split into multiple lines
  if (op === 'or') {
    const result: Array<ExprToken> = [];
    for (let i = 0; i < args.length; i++) {
      const formatted = formatExpression(args[i]);
      if (i === 0) {
        result.push(['WHERE', formatted]);
      } else {
        result.push(['OR', formatted]);
      }
    }
    return result;
  }

  // Otherwise, format as a single expression
  return [['WHERE', formatExpression(expr)]];
}

export function format(ast: AST): string {
  return formatWithSeparator(ast, ' ');
}

format.newline = function(ast: AST): string {
  return formatWithSeparator(ast, '\n');
};

format.nlprint = function(ast: AST): string {
  const output = formatWithSeparator(ast, '\n');
  console.debug(output);
  return output;
};

format.pretty = function(ast: AST): string {
  return prettyFormat(ast);
};

format.pprint = function(ast: AST): string {
  const output = prettyFormat(ast);
  console.debug(output);
  return output;
};
