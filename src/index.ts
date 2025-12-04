import type { CommonDml, CommonDdl, Atom, CompoundExpr, Expr, Dialect, PlaceholderContext } from './types.ts';
import { DDL_KEYS } from './types.ts';
import { tokenizeDml } from './tokenizer.ts';
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

function initPlaceholderContext(dialect: Dialect): PlaceholderContext {
  return {
    placeholders: [],
    dialect,
    formatPlaceholder: PLACEHOLDER_FORMATTERS[dialect]
  }
}

// Replace placeholder markers with display format for print/pprint
function replacePlaceholdersForDisplay(text: string, context: PlaceholderContext, bindings: unknown[] | Record<string, unknown>): string {
  if (!bindings.length) {
    // No bindings provided - show placeholder syntax
    return text.replace(/\x00MANUKA_PH_(\d+)\x00/g, (_, indexStr) => {
      const index = parseInt(indexStr, 10);
      const placeholder = context.placeholders[index];

      if (typeof placeholder === 'string') {
        return `$(${placeholder})`;
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

type FormatOptions = {
  dialect?: Dialect,
  validateBindings?: boolean,
};

function formatWithContext(
  context: PlaceholderContext,
  separator: string,
  dsl: CommonDml | CommonDdl,
  bindings: unknown[] | Record<string, unknown> = [],
  options: FormatOptions = {
    dialect: 'common',
    validateBindings: true,
  },
): string {
  const { validateBindings: doValidateBindings } = options;
  const tokens = isDdl(dsl) ? tokenizeDdl(dsl) : tokenizeDml(dsl, context);
  const result = separatorFormatter(separator, tokens, context);

  // Validate bindings if provided
  if (doValidateBindings && context.placeholders.length > 0) {
    validateBindings(context, bindings);
  }

  return result;
}

export function format(
  dsl: CommonDml | CommonDdl,
  bindings: unknown[] | Record<string, unknown> = [],
  {
    dialect = 'common',
    validateBindings = true,
  }: FormatOptions = {}
): string {
  const context: PlaceholderContext = {
    placeholders: [],
    dialect,
    formatPlaceholder: PLACEHOLDER_FORMATTERS[dialect]
  };
  return formatWithContext(context, ' ', dsl, bindings, {dialect, validateBindings});
}

format.print = function(
  dsl: CommonDml | CommonDdl,
  bindings: unknown[] | Record<string, unknown> = [],
  {
    dialect = 'common',
    validateBindings = false,
  }: FormatOptions = {}
): string {
  let context: PlaceholderContext = initPlaceholderContext(dialect);
  let result = '';
  const tokens = isDdl(dsl) ? tokenizeDdl(dsl) : tokenizeDml(dsl, context);
  result = separatorFormatter('\n', tokens);
  const output = replacePlaceholdersForDisplay(result, context, bindings);
  console.debug(output, bindings);

  context = initPlaceholderContext(dialect);
  result = formatWithContext(context, '\n', dsl, bindings, {dialect, validateBindings});
  return result;
};

format.pretty = function(
  dsl: CommonDml | CommonDdl,
  bindings: unknown[] | Record<string, unknown> = [],
  {
    dialect = 'common',
    validateBindings: doValidateBindings = true,
  }: FormatOptions = {}
): string {
  const context: PlaceholderContext = initPlaceholderContext(dialect);
  const tokens = isDdl(dsl) ? tokenizeDdl(dsl) : tokenizeDml(dsl, context);
  let result = prettyFormatter(tokens); // No context = no replacement yet

  // Validate bindings if provided
  if (doValidateBindings && bindings.length && context.placeholders.length > 0) {
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
  bindings: unknown[] | Record<string, unknown> = [],
  options: FormatOptions = {}
): string {
  const output = format.pretty(dsl, bindings ?? [], options);
  console.debug(output);
  return output;
};
