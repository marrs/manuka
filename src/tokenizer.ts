import type {
  DataDSL, Expr, Atom, CompoundExpr, ExprToken,
  ComparisonExpr, LogicalExpr, LogicalOp
} from './types.ts';

export function tokenize(dsl: DataDSL) {
  const tokens: ExprToken[] = [];

  if (dsl.select) {
    tokens.push(['SELECT', dsl.select.join(', ')]);
  }

  if (dsl.from) {
    tokens.push(['FROM', dsl.from.join(', ')]);
  }

  if (dsl.where) {
    tokens.push(...tokenizeWhere(dsl.where));
  }

  if (dsl.orderBy) {
    if (typeof dsl.orderBy === 'string') {
      tokens.push(['ORDER BY', dsl.orderBy]);
    } else {
      const [field, direction] = dsl.orderBy;
      tokens.push(['ORDER BY', `${field} ${direction.toUpperCase()}`]);
    }
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

  if (isComparisonExpr(expr)) {
    const [operator, left, right] = expr;
    return [[keyword, `${left} ${operator} ${formatValue(right)}`]];
  }

  if (isLogicalExpr(expr)) {
    const [operator, ...operands] = expr;
    return tokenizeLogical(operator, operands, keyword);
  }

  return [];
}

function tokenizeLogical(
  operator: LogicalOp,
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
    } else if (isComparisonExpr(operand)) {
      // Comparison predicate
      const [op, left, right] = operand;
      tokens.push([currentKeyword, `${left} ${op} ${formatValue(right)}`]);
    } else if (isLogicalExpr(operand)) {
      // Nested logical expression
      const [op, ...subOperands] = operand;

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

  return tokens;
}

function isCompoundExpr(expr: Expr): expr is CompoundExpr {
  return Array.isArray(expr);
}

function isComparisonExpr(expr: CompoundExpr): expr is ComparisonExpr {
  return isComparisonOperator(expr[0]);
}

function isLogicalExpr(expr: CompoundExpr): expr is LogicalExpr {
  const op = expr[0];
  return op === 'and' || op === 'or';
}

function isComparisonOperator(op: string): boolean {
  return ['=', '<>', '<', '>', '<=', '>=', 'LIKE'].includes(op);
}

function formatValue(value: Atom): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return value;
}
