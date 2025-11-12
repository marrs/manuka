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

function prettyFormat(ast: AST, indent: string = ''): string {
  const lines: Array<{keyword: string, content: string}> = [];

  // Collect clauses with their keywords
  if (ast.select) {
    lines.push({keyword: 'SELECT', content: ast.select.join(', ')});
  }

  if (ast.from) {
    lines.push({keyword: 'FROM', content: ast.from.join(', ')});
  }

  if (ast.orderBy) {
    lines.push({keyword: 'ORDER BY', content: ast.orderBy});
  }

  if (ast.where) {
    // For WHERE with logical operators, we need to split them
    const whereClauses = prettyFormatWhereClause(ast.where);
    lines.push(...whereClauses);
  }

  const longestKeyword = lines.reduce((acc, line) => {
    return line.keyword.length > acc? line.keyword.length : acc;
  }, 0);

  return lines.map(line => {
      const padding = ' '.repeat(longestKeyword - line.keyword.length);
      return indent + padding + line.keyword + ' ' + line.content;
  }).join('\n');
}

function prettyFormatWhereClause(expr: Expr): Array<{keyword: string, content: string}> {
  if (isToken(expr)) {
    return [{keyword: 'WHERE', content: stringifyToken(expr as Token)}];
  }

  const [op, ...args] = expr as CompoundExpr;

  // For AND at the top level, split into multiple lines
  if (op === 'and') {
    const result: Array<{keyword: string, content: string}> = [];
    for (let i = 0; i < args.length; i++) {
      const formatted = formatExpression(args[i]);
      if (i === 0) {
        result.push({keyword: 'WHERE', content: formatted});
      } else {
        result.push({keyword: 'AND', content: formatted});
      }
    }
    return result;
  }

  // For OR at the top level, split into multiple lines
  if (op === 'or') {
    const result: Array<{keyword: string, content: string}> = [];
    for (let i = 0; i < args.length; i++) {
      const formatted = formatExpression(args[i]);
      if (i === 0) {
        result.push({keyword: 'WHERE', content: formatted});
      } else {
        result.push({keyword: 'OR', content: formatted});
      }
    }
    return result;
  }

  // Otherwise, format as a single expression
  return [{keyword: 'WHERE', content: formatExpression(expr)}];
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
