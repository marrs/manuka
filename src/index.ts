import type { AST, Atom, CompoundExpr, Expr } from './types.ts';
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

function prettyFormat(ast: AST): string {
  const tokens = tokenize(ast);
  return prettyFormatter(tokens);
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
