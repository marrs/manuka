import type { CommonDml, Atom, CompoundExpr, Expr } from './types.ts';
import { tokenize } from './tokenizer.ts';
import { prettyFormatter, separatorFormatter } from './formatters.ts';

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
    return stringifyToken(expr as Atom);
  }

  const [op, ...args] = expr as CompoundExpr;

  // Binary operators
  const binaryOps = ['=', '<>', '<', '>', '<=', '>=', 'LIKE', 'like'];
  if (binaryOps.includes(op)) {
    return `${formatExpression(args[0], op)} ${op} ${formatExpression(args[1], op)}`;
  }

  // Logical operators
  if (op === 'and') {
    const formatted = args.map((arg: Expr) => formatExpression(arg, 'and')).join(' AND ');
    return formatted;
  }

  if (op === 'or') {
    const formatted = args.map((arg: Expr) => formatExpression(arg, 'or')).join(' OR ');
    // Add parentheses if OR is nested inside AND
    if (parentOp === 'and') {
      return `(${formatted})`;
    }
    return formatted;
  }

  // Functions (COUNT, SUM, etc.) - for future use
  return `${op}(${args.map((arg: Expr) => formatExpression(arg, op)).join(', ')})`;
}

export function partial(...partials: Partial<CommonDml>[]): (target: Partial<CommonDml>) => Partial<CommonDml> {
  return (target: Partial<CommonDml>) => {
    for (const p of partials) {
      Object.assign(target, p);
    }
    return target;
  };
}

function formatWithSeparator(separator: string, dsl: CommonDml): string {
  const tokens = tokenize(dsl);
  return separatorFormatter(separator, tokens);
}

function prettyFormat(dsl: CommonDml): string {
  const tokens = tokenize(dsl);
  return prettyFormatter(tokens);
}

export function format(dsl: CommonDml): string {
  return formatWithSeparator(' ', dsl);
}

format.print = function(dsl: CommonDml): string {
  const output = formatWithSeparator('\n', dsl);
  console.debug(output);
  return output;
};

format.pretty = function(dsl: CommonDml): string {
  return prettyFormat(dsl);
};

format.pprint = function(dsl: CommonDml): string {
  const output = prettyFormat(dsl);
  console.debug(output);
  return output;
};
