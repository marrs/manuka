import type {
  CommonDml,
  CommonDdl,
  Expr,
  Dialect,
  PlaceholderContext,
  PlaceholderDirectFn,
  PlaceholderDirect,
  PlaceholderNamed,
  SqlValue,
  FormatterSchema,
  FormatterOptions,
  Atom,
  ValueRow,
  ComparisonOp,
} from './types.ts';
import { DDL_KEYS } from './types.ts';
import { tokenizeDml } from './tokenizer/dml.ts';
import { tokenizeDdl } from './tokenizer/ddl.ts';
import { prettyFormatter, separatorFormatter } from './formatters.ts';
import { hasTable, hasColumn } from './schema-helpers.ts';

// Placeholder formatters for different dialects
const PLACEHOLDER_FORMATTERS = {
  common: (_index: number) => '?',
  pg: (index: number) => `$${index + 1}`
};
//
// Placeholder function for direct value binding
// Usage: place(123), place('active'), place(null), place(true), etc.
export const place: PlaceholderDirectFn = function(value: SqlValue): PlaceholderDirect {
  return { __placeholder: true, value };
};

// Validate bindings match placeholders
function validateBindings(context: PlaceholderContext, bindings: unknown[] | Record<string, unknown>): void {
  const { placeholders } = context;

  // Check that each named placeholder key exists in params
  // Direct placeholders don't need validation as they have values embedded
  for (const placeholder of placeholders) {
    if (placeholder.type === 'named' && !(placeholder.key in bindings)) {
      throw new Error(`Missing parameter: ${placeholder.key}`);
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

export function param(name: string | number): PlaceholderNamed {
  return { __placeholder: true, key: name };
}

// Replace placeholder markers with display format for print/pprint
function replacePlaceholdersForDisplay(text: string, context: PlaceholderContext, bindings: unknown[] | Record<string, unknown>): string {
  return text.replace(/\x00MANUKA_PH_(\d+)\x00/g, (_, indexStr) => {
    const index = parseInt(indexStr, 10);
    const placeholder = context.placeholders[index];

    let value: unknown;

    if (placeholder.type === 'direct') {
      // Direct placeholder - use value directly
      value = placeholder.value;
    } else {
      // Named placeholder
      if (!bindings || (Array.isArray(bindings) && bindings.length === 0) || (typeof bindings === 'object' && Object.keys(bindings).length === 0)) {
        // No bindings provided - show param(key) syntax for named placeholders
        return `param(${placeholder.key})`;
      }
      // Bindings provided - lookup value
      value = (bindings as any)[placeholder.key];
    }

    // Format the value for display
    if (typeof value === 'string') {
      return `'${value}'`;
    } else if (value === null) {
      return 'NULL';
    } else if (value === undefined) {
      return 'undefined';
    } else {
      return String(value);
    }
  });
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

/**
 * Check if a value is a placeholder (direct or named).
 */
function isPlaceholder(value: Atom): value is PlaceholderDirect | PlaceholderNamed {
  return typeof value === 'object' && value !== null && '__placeholder' in value;
}

/**
 * Validate and transform DSL with schema.
 * - Validates table names
 * - Validates column names
 * - Auto-wraps unknown values as placeholders
 * - Transforms NULL comparisons to IS NULL / IS NOT NULL
 */
function validateAndTransformDsl(
  dsl: CommonDml,
  schema: FormatterSchema,
  currentTable?: string
): CommonDml {
  const result: CommonDml = {};

  // Validate and copy FROM clause
  if (dsl.from) {
    result.from = dsl.from.map(table => {
      if (!hasTable(schema, table)) {
        throw new Error(`Unknown table: ${table}`);
      }
      return table;
    });
    // Use first table as current table context
    currentTable = result.from[0];
  }

  // Validate and copy INSERT INTO
  if (dsl.insertInto) {
    if (!hasTable(schema, dsl.insertInto)) {
      throw new Error(`Unknown table: ${dsl.insertInto}`);
    }
    result.insertInto = dsl.insertInto;
    currentTable = dsl.insertInto;
  }

  // Validate SELECT columns
  if (dsl.select) {
    result.select = dsl.select.map(col => {
      // Skip '*' wildcard
      if (col === '*') {
        return col;
      }
      if (currentTable && !hasColumn(schema, currentTable, col)) {
        throw new Error(`Unknown column '${col}' in table '${currentTable}'`);
      }
      return col;
    });
  }

  // Validate INSERT columns
  if (dsl.columns) {
    result.columns = dsl.columns.map(col => {
      if (currentTable && !hasColumn(schema, currentTable, col)) {
        throw new Error(`Unknown column '${col}' in table '${currentTable}'`);
      }
      return col;
    });
  }

  // Validate and transform WHERE clause
  if (dsl.where) {
    result.where = validateAndTransformExpr(dsl.where, schema, currentTable);
  }

  // Auto-wrap INSERT VALUES
  if (dsl.values) {
    result.values = dsl.values.map(row =>
      row.map(value => wrapValuesInExpr(value)) as ValueRow
    );
  }

  // Copy other properties
  if (dsl.orderBy) {
    result.orderBy = dsl.orderBy;
  }

  return result;
}

/**
 * Validate and transform an expression.
 * - Validates column names
 * - Auto-wraps unknown values
 * - Transforms NULL comparisons
 */
function validateAndTransformExpr(
  expr: Expr,
  schema: FormatterSchema,
  currentTable?: string
): Expr {
  // Atom - validate as value
  if (!Array.isArray(expr)) {
    return validateAtom(expr, 'value', schema, currentTable);
  }

  const [operator, ...operands] = expr;

  // Handle comparison operators
  if (isComparisonOp(operator)) {
    const column = validateAtom(operands[0], 'column-name', schema, currentTable);
    const value = operands[1];

    // NULL special case - transform to IS NULL / IS NOT NULL
    if (value === null) {
      if (operator === '=') {
        return ['IS NULL', column as string];
      }
      if (operator === '<>') {
        return ['IS NOT NULL', column as string];
      }
      throw new Error(`Cannot use ${operator} with null value`);
    }

    const wrappedValue = validateAtom(value, 'value', schema, currentTable);
    return [operator, column, wrappedValue];
  }

  // Handle logical operators (recursive)
  if (operator === 'and' || operator === 'or') {
    return [operator, ...operands.map(op => validateAndTransformExpr(op, schema, currentTable))] as any;
  }

  // Handle arithmetic operators
  return [operator, ...operands.map(op => validateAtom(op, 'value', schema, currentTable))] as any;
}

/**
 * Validate an atom value.
 * Position determines validation behavior:
 * - 'column-name': Must be valid column, throws if not
 * - 'value': Can be column (column-to-column) or wrapped as placeholder
 */
function validateAtom(
  value: Atom,
  position: 'column-name' | 'value',
  schema: FormatterSchema,
  currentTable?: string
): Atom {
  // Already a placeholder - pass through
  if (isPlaceholder(value)) {
    return value;
  }

  // Non-string → auto-wrap as placeholder if in value position
  if (typeof value !== 'string') {
    if (position === 'value') {
      return { __placeholder: true, value } as PlaceholderDirect;
    }
    throw new Error(`Expected string identifier, got ${typeof value}`);
  }

  // String validation based on position
  if (position === 'column-name') {
    if (currentTable && !hasColumn(schema, currentTable, value)) {
      throw new Error(`Unknown column '${value}' in table '${currentTable}'`);
    }
    return value;  // Valid column
  }

  // position === 'value'
  // Check if it's a column name (for column-to-column comparison)
  if (currentTable && hasColumn(schema, currentTable, value)) {
    return value;  // Column comparison
  }

  // Unknown string → auto-wrap as placeholder
  return { __placeholder: true, value } as PlaceholderDirect;
}

/**
 * Check if operator is a comparison operator.
 */
function isComparisonOp(op: any): op is ComparisonOp {
  return op === '=' || op === '<>' || op === '<' || op === '>' ||
         op === '<=' || op === '>=' || op === 'LIKE';
}

/**
 * Recursively wrap values in expressions (including arithmetic).
 * Keeps already-wrapped placeholders, wraps everything else.
 */
function wrapValuesInExpr(expr: Expr): Expr {
  // Atom - wrap if not already a placeholder
  if (!Array.isArray(expr)) {
    if (isPlaceholder(expr)) {
      return expr;
    }
    return { __placeholder: true, value: expr } as PlaceholderDirect;
  }

  // Array expression - recursively wrap operands
  const [op, ...operands] = expr;
  return [op, ...operands.map(operand => wrapValuesInExpr(operand))] as any;
}

type FormatOptions = {
  dialect?: Dialect,
  validateBindings?: boolean,
  params?: Record<string, unknown> | unknown[],
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

  // Validate and transform DSL if schema is available and it's DML
  let processedDsl = dsl;
  if (context.schema && !isDdl(dsl)) {
    processedDsl = validateAndTransformDsl(dsl as CommonDml, context.schema);
  }

  const tokens = isDdl(processedDsl) ? tokenizeDdl(processedDsl) : tokenizeDml(processedDsl, context);
  const result = separatorFormatter(separator, tokens, context);

  // Validate bindings if provided
  if (doValidateBindings && context.placeholders.length > 0) {
    validateBindings(context, bindings);
  }

  return result;
}

function validateSql(schema, sql) {
}

export function format(
  this: FormatterOptions,
  dsl: CommonDml | CommonDdl,
  {
    dialect = this?.dialect ?? 'common',
    validateBindings = true,
    params = [],
  }: FormatOptions = {}
): [string, ...unknown[]] {
  const context: PlaceholderContext = {
    placeholders: [],
    dialect,
    formatPlaceholder: PLACEHOLDER_FORMATTERS[dialect],
    schema: this?.schema
  };
  const sql = formatWithContext(
    context, ' ', dsl, params, {dialect, validateBindings}
  );

  // Extract bindings from params based on placeholder order
  const bindings: unknown[] = [];
  for (const placeholder of context.placeholders) {
    if (placeholder.type === 'direct') {
      // Direct placeholder - use value directly
      bindings.push(placeholder.value);
    } else {
      // Named placeholder - lookup in params by key
      bindings.push((params as any)[placeholder.key]);
    }
  }

  return [sql, ...bindings];
}

format.print = function(
  this: FormatterOptions,
  dsl: CommonDml | CommonDdl,
  {
    dialect = this?.dialect ?? 'common',
    validateBindings = false,
    params = [],
  }: FormatOptions = {}
): [string, ...unknown[]] {
  let context: PlaceholderContext = {
    ...initPlaceholderContext(dialect),
    schema: this?.schema
  };
  let result = '';

  // Validate and transform DSL if schema is available and it's DML
  let processedDsl = dsl;
  if (context.schema && !isDdl(dsl)) {
    processedDsl = validateAndTransformDsl(dsl as CommonDml, context.schema);
  }

  const tokens = isDdl(processedDsl) ? tokenizeDdl(processedDsl) : tokenizeDml(processedDsl, context);
  result = separatorFormatter('\n', tokens);
  const output = replacePlaceholdersForDisplay(result, context, params);

  // Extract bindings from params for logging
  const bindings: unknown[] = [];
  for (const placeholder of context.placeholders) {
    if (placeholder.type === 'direct') {
      bindings.push(placeholder.value);
    } else {
      bindings.push((params as any)[placeholder.key]);
    }
  }

  console.debug(output, bindings);

  context = {
    ...initPlaceholderContext(dialect),
    schema: this?.schema
  };
  result = formatWithContext(context, '\n', dsl, params, {dialect, validateBindings});
  return [result, ...bindings];
};

format.pretty = function(
  this: FormatterOptions,
  dsl: CommonDml | CommonDdl,
  {
    dialect = this?.dialect ?? 'common',
    validateBindings: doValidateBindings = true,
    params = [],
  }: FormatOptions = {}
): [string, ...unknown[]] {
  const context: PlaceholderContext = {
    ...initPlaceholderContext(dialect),
    schema: this?.schema
  };

  // Validate and transform DSL if schema is available and it's DML
  let processedDsl = dsl;
  if (context.schema && !isDdl(dsl)) {
    processedDsl = validateAndTransformDsl(dsl as CommonDml, context.schema);
  }

  const tokens = isDdl(processedDsl) ? tokenizeDdl(processedDsl) : tokenizeDml(processedDsl, context);
  let result = prettyFormatter(tokens); // Don't pass context - keep markers for display replacement

  // Extract bindings from params
  const bindings: unknown[] = [];
  for (const placeholder of context.placeholders) {
    if (placeholder.type === 'direct') {
      bindings.push(placeholder.value);
    } else {
      bindings.push((params as any)[placeholder.key]);
    }
  }

  // Validate bindings if provided
  if (doValidateBindings && params && (params as unknown[]).length > 0 && context.placeholders.length > 0) {
    validateBindings(context, params);
  }

  // Replace placeholder markers with values for display
  if (context.placeholders.length > 0) {
    return [replacePlaceholdersForDisplay(result, context, params), ...bindings];
  }

  return [result, ...bindings];
};

format.pprint = function(
  this: FormatterOptions,
  dsl: CommonDml | CommonDdl,
  options: FormatOptions = {}
): [string, ...unknown[]] {
  const result = format.pretty.call(this, dsl, options);
  console.debug(result[0]);
  return result;
};

/**
 * Create a format function with schema context.
 * Uses bind() to attach dialect and schema to format's this context.
 * Schema validation will be added in a later phase.
 */
export function formatter<S extends FormatterSchema = FormatterSchema>(
  options: FormatterOptions<S> = {}
) {
  const { schema, dialect = 'common' } = options;

  // Create context and bind to format
  const context = { schema, dialect };
  const boundFormat = format.bind(context) as typeof format;

  // Manually attach methods (bind doesn't copy properties)
  boundFormat.print = format.print.bind(context);
  boundFormat.pretty = format.pretty.bind(context);
  boundFormat.pprint = format.pprint.bind(context);

  // Expose schema for inspection
  boundFormat.schema = schema;

  return boundFormat;
}
