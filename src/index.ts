import type { CommonDml, CommonDdl, Atom, CompoundExpr, Expr, Dialect, PlaceholderContext } from './types.ts';
import { DDL_KEYS } from './types.ts';
import { tokenize } from './tokenizer.ts';
import { tokenizeDdl } from './ddl-tokenizer.ts';
import { prettyFormatter, separatorFormatter } from './formatters.ts';

// Re-export $ from vocabulary
export { $ } from './vocabulary.ts';

// Placeholder formatters for different dialects
const PLACEHOLDER_FORMATTERS = {
  common: (_index: number) => '?',
  pg: (index: number) => `$${index + 1}`
};

// Validate bindings match placeholders
function validateBindings(context: PlaceholderContext, bindings: unknown[] | Record<string, unknown>): void {
  const { placeholders } = context;

  if (Array.isArray(bindings)) {
    // Positional bindings
    if (bindings.length !== placeholders.length) {
      throw new Error(
        `Parameter count mismatch: expected ${placeholders.length} parameters but received ${bindings.length}`
      );
    }
  } else {
    // Named bindings
    for (const placeholder of placeholders) {
      if (typeof placeholder === 'string' && !(placeholder in bindings)) {
        throw new Error(`Missing parameter: ${placeholder}`);
      }
    }
  }
}

// Replace placeholder markers with display format for print/pprint
function replacePlaceholdersForDisplay(text: string, context: PlaceholderContext, bindings?: unknown[] | Record<string, unknown>): string {
  if (!bindings) {
    // No bindings provided - show placeholder syntax
    return text.replace(/\x00MANUKA_PH_(\d+)\x00/g, (_, indexStr) => {
      const index = parseInt(indexStr, 10);
      const placeholder = context.placeholders[index];

      if (typeof placeholder === 'string') {
        return `$('${placeholder}')`;
      } else {
        return `$(${index})`;
      }
    });
  } else {
    // Bindings provided - substitute actual values
    return text.replace(/\x00MANUKA_PH_(\d+)\x00/g, (_, indexStr) => {
      const index = parseInt(indexStr, 10);
      const key = context.placeholders[index];
      const value = bindings[key as keyof typeof bindings];

      if (typeof value === 'string') {
        return `'${value}'`;
      } else if (value === null) {
        return 'NULL';
      } else {
        return String(value);
      }
    });
  }
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

function isDdl(dsl: CommonDml | CommonDdl): dsl is CommonDdl {
  return DDL_KEYS.some(key => key in dsl);
}

function formatWithSeparator(
  separator: string,
  dsl: CommonDml | CommonDdl,
  context?: PlaceholderContext
): string {
  const tokens = isDdl(dsl) ? tokenizeDdl(dsl) : tokenize(dsl, context);
  return separatorFormatter(separator, tokens, context);
}

function prettyFormat(dsl: CommonDml | CommonDdl, context?: PlaceholderContext): string {
  const tokens = isDdl(dsl) ? tokenizeDdl(dsl) : tokenize(dsl, context);
  return prettyFormatter(tokens, context);
}

export function format(
  dsl: CommonDml | CommonDdl,
  bindings?: unknown[] | Record<string, unknown>,
  dialect: Dialect = 'common'
): string {
  const context: PlaceholderContext = {
    placeholders: [],
    dialect,
    formatPlaceholder: PLACEHOLDER_FORMATTERS[dialect]
  };
  const result = formatWithSeparator(' ', dsl, context);

  // Validate bindings if provided
  if (bindings !== undefined && context.placeholders.length > 0) {
    validateBindings(context, bindings);
  }

  return result;
}

format.print = function(
  dsl: CommonDml | CommonDdl,
  bindings?: unknown[] | Record<string, unknown>,
  dialect: Dialect = 'common'
): string {
  const context: PlaceholderContext = {
    placeholders: [],
    dialect,
    formatPlaceholder: PLACEHOLDER_FORMATTERS[dialect]
  };
  // For print, we don't pass context to formatter - we handle placeholders ourselves
  const tokens = isDdl(dsl) ? tokenizeDdl(dsl) : tokenize(dsl, context);
  let output = separatorFormatter('\n', tokens); // No context = no replacement yet

  // Replace placeholders for display
  if (context.placeholders.length > 0) {
    output = replacePlaceholdersForDisplay(output, context, bindings);
  }

  console.debug(output);
  return output;
};

format.pretty = function(
  dsl: CommonDml | CommonDdl,
  bindings?: unknown[] | Record<string, unknown>,
  dialect: Dialect = 'common'
): string {
  const context: PlaceholderContext = {
    placeholders: [],
    dialect,
    formatPlaceholder: PLACEHOLDER_FORMATTERS[dialect]
  };
  const tokens = isDdl(dsl) ? tokenizeDdl(dsl) : tokenize(dsl, context);
  let result = prettyFormatter(tokens); // No context = no replacement yet

  // Validate bindings if provided
  if (bindings !== undefined && context.placeholders.length > 0) {
    validateBindings(context, bindings);
  }

  // Replace placeholders for display
  if (context.placeholders.length > 0) {
    return replacePlaceholdersForDisplay(result, context, bindings);
  }

  return result;
};

format.pprint = function(
  dsl: CommonDml | CommonDdl,
  bindings?: unknown[] | Record<string, unknown>,
  dialect: Dialect = 'common'
): string {
  const context: PlaceholderContext = {
    placeholders: [],
    dialect,
    formatPlaceholder: PLACEHOLDER_FORMATTERS[dialect]
  };
  const tokens = isDdl(dsl) ? tokenizeDdl(dsl) : tokenize(dsl, context);
  let output = prettyFormatter(tokens); // No context = no replacement yet

  // Replace placeholders for display
  if (context.placeholders.length > 0) {
    output = replacePlaceholdersForDisplay(output, context, bindings);
  }

  console.debug(output);
  return output;
};
