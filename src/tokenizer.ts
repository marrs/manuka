import type { AST, Expr, Atom, CompoundExpr, ExprToken } from './types.ts';

export function tokenize(ast: AST) {
  const tokens: ExprToken[] = [];

  if (ast.select) {
    tokens.push(['SELECT', ast.select.join(', ')]);
  }

  if (ast.from) {
    tokens.push(['FROM', ast.from.join(', ')]);
  }

  if (ast.where) {
    tokens.push(...tokenizeWhere(ast.where));
  }

  if (ast.orderBy) {
    const parts = ast.orderBy as any;
    tokens.push(['ORDER BY', `${parts[0]} ${parts[1].toUpperCase()}`]);
  }

  return tokens;
}

function tokenizeWhere(expr: Expr): ExprToken[] {
  return tokenizeExpr(expr, 'WHERE');
}

function tokenizeExpr(expr: Expr, keyword: string): ExprToken[] {
  if (!isCompoundExpr(expr)) {
    return [[keyword, formatValue(expr)]];
  }

  const [operator, ...operands] = expr;

  if (isComparisonOperator(operator)) {
    const [left, right] = operands;
    return [[keyword, `${left} ${operator} ${formatValue(right)}`]];
  }

  if (operator === 'and' || operator === 'or') {
    return tokenizeLogical(operator, operands, keyword);
  }

  return [];
}

function tokenizeLogical(
  operator: 'and' | 'or',
  operands: Expr[],
  firstKeyword: string
): ExprToken[] {
  const tokens: ExprToken[] = [];
  const keyword = operator.toUpperCase();

  for (let i = 0; i < operands.length; i++) {
    const operand = operands[i];
    const currentKeyword = i === 0 ? firstKeyword : keyword;

    if (!isCompoundExpr(operand)) {
      // Simple atom
      tokens.push([currentKeyword, formatValue(operand)]);
    } else {
      const [op, ...subOperands] = operand;

      if (isComparisonOperator(op)) {
        // Comparison predicate
        const [left, right] = subOperands;
        tokens.push([currentKeyword, `${left} ${op} ${formatValue(right)}`]);
      } else if (op === 'and' || op === 'or') {
        // Nested logical expression
        // Precedence rule: OR inside AND needs nesting, AND inside OR flattens
        if (operator === 'and' && op === 'or') {
          // OR inside AND: create nested array
          const nestedTokens = tokenizeLogical(op, subOperands, '');
          tokens.push([currentKeyword, nestedTokens]);
        } else {
          // AND inside OR or same operator: flatten
          const flatTokens = tokenizeLogical(op, subOperands, currentKeyword);
          tokens.push(...flatTokens);
        }
      }
    }
  }

  return tokens;
}

function isComparisonOperator(op: string): boolean {
  return ['=', '<>', '<', '>', '<=', '>=', 'LIKE'].includes(op);
}

function formatValue(value: Atom): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return value;
}

function isCompoundExpr(expr: Expr): expr is CompoundExpr {
  return Array.isArray(expr);
}
