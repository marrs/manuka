import type {
  CommonDml, Expr, Atom, CompoundExpr, ExprToken,
  ComparisonExpr, LogicalExpr, LogicalOp, ValueRow
} from './types.ts';

export function tokenizeDml(dsl: CommonDml) {
  const tokens: ExprToken[] = [];

  // INSERT (process before SELECT)
  if (dsl.insertInto) {
    tokens.push(...tokenizeInsert(dsl));
  }

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

// Backwards compatibility
export function tokenize(dsl: CommonDml) {
  return tokenizeDml(dsl);
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

// ============================================================================
// INSERT tokenization
// ============================================================================

// Operator precedence map (higher number = higher precedence)
const PRECEDENCE: Record<string, number> = {
  '||': 1,  // Concatenation (lowest)
  '+': 2,   // Addition
  '-': 2,   // Subtraction
  '*': 3,   // Multiplication
  '/': 3,   // Division
  '%': 3,   // Modulo (highest)
};

function tokenizeInsert(dsl: CommonDml): ExprToken[] {
  const tokens: ExprToken[] = [];

  if (!dsl.insertInto || !dsl.values) {
    return tokens;
  }

  // Build INSERT INTO clause with optional column list
  let insertClause = dsl.insertInto;
  if (dsl.columns && dsl.columns.length > 0) {
    insertClause += ` (${dsl.columns.join(', ')})`;
  }

  tokens.push(['INSERT INTO', insertClause]);
  tokens.push(['VALUES', tokenizeValues(dsl.values)]);

  return tokens;
}

function tokenizeValues(values: ValueRow[]): string {
  // HoneySQL convention: values is always array of arrays
  const formattedRows = values.map(row => {
    const formattedValues = row.map(val => formatValueExpr(val, null));
    return `(${formattedValues.join(', ')})`;
  });

  return formattedRows.join(', ');
}

function formatValueExpr(value: Atom | Expr, parentOp: string | null, isRightOperand: boolean = false): string {
  // Handle atoms (string, number, null)
  if (!isCompoundExpr(value)) {
    return formatInsertValue(value as Atom);
  }

  // Handle arithmetic expressions
  if (isArithmeticExpr(value)) {
    const [operator, left, right] = value;

    // Format left and right operands with current operator as parent
    const leftStr = formatValueExpr(left, operator, false);
    const rightStr = formatValueExpr(right, operator, true);

    const result = `${leftStr} ${operator} ${rightStr}`;

    // Add parentheses if this operator has lower precedence than parent
    if (parentOp && needsParentheses(operator, parentOp, isRightOperand)) {
      return `(${result})`;
    }

    return result;
  }

  // Handle other expression types (comparison, logical) - not typical in VALUES
  // but forward to existing logic
  if (isComparisonExpr(value)) {
    const [operator, left, right] = value;
    return `${left} ${operator} ${formatInsertValue(right)}`;
  }

  return '';
}

function needsParentheses(currentOp: string, parentOp: string, isRightOperand: boolean): boolean {
  const currentPrecedence = PRECEDENCE[currentOp] || 0;
  const parentPrecedence = PRECEDENCE[parentOp] || 0;

  // Need parentheses if current operator has lower precedence than parent
  if (currentPrecedence < parentPrecedence) {
    return true;
  }

  // For same precedence on right side of - or /, need parentheses
  // e.g., 10 - (5 - 2) != 10 - 5 - 2
  // e.g., 10 / (5 / 2) != 10 / 5 / 2
  if (currentPrecedence === parentPrecedence &&
      isRightOperand &&
      (parentOp === '-' || parentOp === '/')) {
    return true;
  }

  return false;
}

function formatInsertValue(value: Atom): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  // String values - add quotes for INSERT VALUES
  return `'${value}'`;
}

function isArithmeticExpr(expr: CompoundExpr): boolean {
  return ['+', '-', '*', '/', '||', '%'].includes(expr[0] as string);
}
