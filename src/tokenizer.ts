import type {
  CommonDml, Expr, Atom, CompoundExpr, ExprToken,
  ComparisonExpr, LogicalExpr, LogicalOp, ValueRow,
  Placeholder, PlaceholderDirect, PlaceholderNamed, PlaceholderContext
} from './types.ts';

import { formatSqlValue } from './tokenizer/core.ts';

// Helper to detect if a value is a placeholder
function isPlaceholder(value: unknown): value is Placeholder {
  // Check if it's a placeholder object (PlaceholderDirect or PlaceholderNamed)
  return (typeof value === 'object' && value !== null && '__placeholder' in value);
}

function isPlaceholderDirect(value: Placeholder): value is PlaceholderDirect {
  return isPlaceholder(value) && 'value' in value;
}

function isPlaceholderNamed(value: Placeholder): value is PlaceholderNamed {
  return isPlaceholder(value) && 'key' in value;
}

// Handle placeholder detection and create marker
function handlePlaceholder(value: Placeholder, context?: PlaceholderContext): string {
  if (!context) {
    // No context provided - shouldn't happen in normal flow
    return '?';
  }

  const index = context.placeholders.length;

  // Check if it's a direct placeholder (has 'value' property)
  //if (typeof value === 'object' && '__placeholder' in value && 'value' in value) {
  if (isPlaceholderDirect(value)) {
    context.placeholders.push({ type: 'direct', value: value.value });
  } else if (isPlaceholderNamed(value)) {
    context.placeholders.push({ type: 'named', key: value.key });
  }

  return `\x00MANUKA_PH_${index}\x00`;
}

export function tokenizeDml(dsl: CommonDml, context?: PlaceholderContext) {
  const tokens: ExprToken[] = [];

  // INSERT (process before SELECT)
  if (dsl.insertInto) {
    tokens.push(...tokenizeInsert(dsl, context));
  }

  if (dsl.select) {
    tokens.push(['SELECT', dsl.select.join(', ')]);
  }

  if (dsl.from) {
    tokens.push(['FROM', dsl.from.join(', ')]);
  }

  if (dsl.where) {
    tokens.push(...tokenizeWhere(dsl.where, context));
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

// XXX Deprecated. Use `tokenizeDml` instead.
export function tokenize(dsl: CommonDml, context?: PlaceholderContext) {
  return tokenizeDml(dsl, context);
}

function tokenizeWhere(expr: Expr, context?: PlaceholderContext): ExprToken[] {
  return tokenizeExpr(expr, 'WHERE', context);
}

function tokenizeExpr(expr: Expr, keyword: string, context?: PlaceholderContext): ExprToken[] {
  if (!isCompoundExpr(expr)) {
    return [[keyword, formatValue(expr, context)]];
  }

  if (isComparisonExpr(expr)) {
    const [operator, left, right] = expr;
    return [[keyword, `${left} ${operator} ${formatValue(right, context)}`]];
  }

  if (isLogicalExpr(expr)) {
    const [operator, ...operands] = expr;
    return tokenizeLogical(operator, operands, keyword, context);
  }

  return [];
}

function tokenizeLogical(
  operator: LogicalOp,
  operands: Expr[],
  firstKeyword: string,
  context?: PlaceholderContext
): ExprToken[] {
  const tokens: ExprToken[] = [];
  const keyword = operator.toUpperCase();

  for (let i = 0; i < operands.length; i++) {
    const operand = operands[i];
    const currentKeyword = i === 0 ? firstKeyword : keyword;

    if (!isCompoundExpr(operand)) {
      // Simple atom
      tokens.push([currentKeyword, formatValue(operand, context)]);
    } else if (isComparisonExpr(operand)) {
      // Comparison predicate
      const [op, left, right] = operand;
      tokens.push([currentKeyword, `${left} ${op} ${formatValue(right, context)}`]);
    } else if (isLogicalExpr(operand)) {
      // Nested logical expression
      const [op, ...subOperands] = operand;

      // Precedence rule: OR inside AND needs nesting, AND inside OR flattens
      if (operator === 'and' && op === 'or') {
        // OR inside AND: create nested array
        const nestedTokens = tokenizeLogical(op, subOperands, '', context);
        tokens.push([currentKeyword, nestedTokens]);
      } else {
        // AND inside OR or same operator: flatten
        const flatTokens = tokenizeLogical(op, subOperands, currentKeyword, context);
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

function formatValue(value: Atom, context?: PlaceholderContext): string {
  // Check for placeholder first
  if (isPlaceholder(value)) {
    return handlePlaceholder(value, context);
  }

  return formatSqlValue(value);
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

function tokenizeInsert(dsl: CommonDml, context?: PlaceholderContext): ExprToken[] {
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
  tokens.push(['VALUES', tokenizeValues(dsl.values, context)]);

  return tokens;
}

function tokenizeValues(values: ValueRow[], context?: PlaceholderContext): string {
  // HoneySQL convention: values is always array of arrays
  const formattedRows = values.map(row => {
    const formattedValues = row.map(val => formatValueExpr(val, null, false, context));
    return `(${formattedValues.join(', ')})`;
  });

  return formattedRows.join(', ');
}

function formatValueExpr(value: Atom | Expr, parentOp: string | null, isRightOperand: boolean = false, context?: PlaceholderContext): string {
  // Handle atoms (string, number, null)
  if (!isCompoundExpr(value)) {
    return formatInsertValue(value as Atom, context);
  }

  // Handle arithmetic expressions
  if (isArithmeticExpr(value)) {
    const [operator, left, right] = value;

    // Format left and right operands with current operator as parent
    const leftStr = formatValueExpr(left, operator, false, context);
    const rightStr = formatValueExpr(right, operator, true, context);

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
    return `${left} ${operator} ${formatInsertValue(right, context)}`;
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

function formatInsertValue(value: Atom, context?: PlaceholderContext): string {
  // Check for placeholder first
  if (isPlaceholder(value)) {
    return handlePlaceholder(value, context);
  }

  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  // String values - add quotes for INSERT VALUES
  return `'${value}'`;
}

function isArithmeticExpr(expr: CompoundExpr): boolean {
  return ['+', '-', '*', '/', '||', '%'].includes(expr[0] as string);
}
