import type { DataDSL, Atom, CompoundExpr, Expr } from './types.ts';
import { tokenize } from './tokenizer.ts';
import { prettyFormatter } from './formatters.ts';

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

export function validate(dsl: Partial<DataDSL>): void {
  if (dsl.from && !dsl.select) {
    throw new Error('FROM clause requires SELECT clause');
  }
  if (dsl.where && !dsl.from) {
    throw new Error('WHERE clause requires FROM clause');
  }
}

export function merge(target: Partial<DataDSL>, source: Partial<DataDSL>): Partial<DataDSL> {
  Object.assign(target, source);
  return target;
}

export function partial(...partials: Partial<DataDSL>[]): (target: Partial<DataDSL>) => Partial<DataDSL> {
  return (target: Partial<DataDSL>) => {
    for (const p of partials) {
      Object.assign(target, p);
    }
    return target;
  };
}

function formatWithSeparator(dsl: DataDSL, separator: string): string {
  let result: string[] = [];
  if (dsl.select) {
    result.push(`SELECT ${dsl.select.join(', ')}`);
  }

  if (dsl.from) {
    result.push(`FROM ${dsl.from.join(', ')}`);
  }

  if (dsl.where) {
    result.push(`WHERE ${formatExpression(dsl.where)}`);
  }

  return result.join(separator);
}

function prettyFormat(dsl: DataDSL): string {
  const tokens = tokenize(dsl);
  return prettyFormatter(tokens);
}

export function format(dsl: DataDSL): string {
  return formatWithSeparator(dsl, ' ');
}

format.newline = function(dsl: DataDSL): string {
  return formatWithSeparator(dsl, '\n');
};

format.nlprint = function(dsl: DataDSL): string {
  const output = formatWithSeparator(dsl, '\n');
  console.debug(output);
  return output;
};

format.pretty = function(dsl: DataDSL): string {
  return prettyFormat(dsl);
};

format.pprint = function(dsl: DataDSL): string {
  const output = prettyFormat(dsl);
  console.debug(output);
  return output;
};
