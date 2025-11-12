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

function formatWithSeparator(ast: AST, separator: string): string {
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

  return result.join(separator);
}

function formatPretty(ast: AST, indent: string = '  '): string {
  // Validate clause dependencies
  if (ast.from && !ast.select) {
    throw new Error('FROM clause requires SELECT clause');
  }
  if (ast.where && !ast.from) {
    throw new Error('WHERE clause requires FROM clause');
  }

  const lines: Array<{keyword: string, content: string}> = [];

  // Collect clauses with their keywords
  if (ast.select) {
    lines.push({keyword: 'SELECT', content: ast.select.join(', ')});
  }

  if (ast.from) {
    lines.push({keyword: 'FROM', content: ast.from.join(', ')});
  }

  if (ast.where) {
    // For WHERE with logical operators, we need to split them
    const whereClauses = formatWhereClause(ast.where);
    lines.push(...whereClauses);
  }

  // Format each line with proper indentation and alignment
  // SELECT starts at position 0
  // FROM gets indented by `indent.length` spaces
  // WHERE/AND/OR are right-aligned so their END position matches FROM's END position

  const indentLength = indent.length;
  const fromKeywordLength = 'FROM'.length; // 4
  const fromEndPosition = indentLength + fromKeywordLength;

  return lines.map((line, i) => {
    const keyword = line.keyword;

    if (keyword === 'SELECT') {
      // SELECT at position 0
      return keyword + ' ' + line.content;
    } else if (keyword === 'FROM') {
      // FROM indented by indent.length
      return indent + keyword + ' ' + line.content;
    } else {
      // WHERE/AND/OR right-aligned to match FROM's end position
      const padding = ' '.repeat(fromEndPosition - keyword.length);
      return padding + keyword + ' ' + line.content;
    }
  }).join('\n');
}

function formatWhereClause(expr: Expr): Array<{keyword: string, content: string}> {
  if (typeof expr === 'string' || typeof expr === 'number') {
    return [{keyword: 'WHERE', content: String(expr)}];
  }

  const [op, ...args] = expr;

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

format.pretty = function(ast: AST, indent: string = '  '): string {
  return formatPretty(ast, indent);
};

format.pprint = function(ast: AST, indent: string = '  '): string {
  const output = formatPretty(ast, indent);
  console.debug(output);
  return output;
};
