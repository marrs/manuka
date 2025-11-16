# Manuka Architecture

## Overview

Manuka is a lightweight SQL query builder for JavaScript/TypeScript that converts structured AST objects into formatted SQL strings. The architecture is designed around three core principles:

1. **Separation of Concerns**: Clear boundaries between AST structure, tokenization, and formatting
2. **Performance**: Optimized for runtime SQL generation with minimal overhead
3. **Extensibility**: Support for multiple output formats without code duplication

## Design Philosophy

### Inspired by HoneySQL

Manuka's AST design is inspired by [HoneySQL](https://github.com/seancorfield/honeysql), a Clojure SQL builder. The tuple-based predicate representation enables:

- Natural recursive processing of nested expressions
- Type-safe handling of different operator types
- Clean separation between tokens (literals) and compound expressions
- Easy parenthesis insertion based on operator precedence

### Why Not an ORM or Query Builder DSL?

Manuka intentionally avoids the fluent/chainable API pattern common in JavaScript query builders. Instead, it uses plain data structures (objects and arrays) because:

- **Composability**: AST fragments can be easily merged and manipulated
- **Serialization**: Plain objects can be JSON serialized
- **Simplicity**: Method chaining can be in any order:
  - `select(all).from('table')` is equivalent to `from('table').select(all)`
- **Flexibility**: Easy to programmatically generate queries

## Architecture Layers

```
┌─────────────────────────────────────────────────┐
│              Application Layer                  │
│  (Builds AST objects with plain JS/TS)          │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│               Tokenizer Layer                   │
│  Converts AST → Token Array                     │
│  - Walks clause structure (SELECT, FROM, etc.)  │
│  - Processes WHERE predicate trees              │
│  - Formats leaf expressions                     │
│  - Returns flat array of tokens                 │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│               Formatter Layer                   │
│  Converts Token Array → Formatted String        │
│  - Joins clauses with separators                │
│  - Applies alignment/indentation                │
│  - Handles presentation concerns                │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│                 SQL String                      │
│  (Sent to database or used in application)      │
└─────────────────────────────────────────────────┘
```

## Core Concepts

### AST (Abstract Syntax Tree)

The AST is a plain JavaScript object representing a SQL query structure:

```typescript
type Token = string | number | null;
type CompoundExpr = [string, ...Expr[]];
type Expr = Token | CompoundExpr;

type AST = {
  select?: string[];
  from?: string[];
  where?: Expr;
  orderBy?: string;
}
```

**Example:**
```typescript
{
  select: ['id', 'name', 'email'],
  from: ['users'],
  where: ['and',
    ['=', 'active', 'true'],
    ['>', 'age', '18']
  ],
  orderBy: 'name'
}
```

**Predicate Structure:**
- Binary operators: `[operator, leftOperand, rightOperand]`
  - Example: `['=', 'id', '1']` → `id = 1`
- Logical operators: `[operator, ...predicates]`
  - Example: `['and', pred1, pred2]` → `pred1 AND pred2`

### Tokens

Tokens are the intermediate representation between AST and formatted SQL:

```typescript
type ExprToken = [string, string[]];
```

Each token is a tuple of `[keyword, [operands]]`:
- **Keyword**: SQL clause keyword (SELECT, FROM, WHERE, AND, OR, etc.)
- **Operands**: Array of strings representing the clause content

**Example Token Array:**
```typescript
[
  ['SELECT', ['id, name, email']],
  ['FROM', ['users']],
  ['WHERE', ['active = true']],
  ['AND', ['age > 18']],
  ['ORDER BY', ['name']]
]
```

### Tokenizers

Tokenizers convert AST objects into token arrays. Different tokenizers can produce different levels of detail:

#### Lightweight Tokenizer (Current Implementation)

Pre-formats predicates into strings for minimal overhead:

```typescript
// Input AST
where: ['=', 'role', 'admin']

// Output Token
['WHERE', ['role = admin']]
```

**Use Case:** Runtime SQL generation for database queries

**Characteristics:**
- Pre-formatted predicate strings
- Minimal memory allocation
- Fast processing
- Suitable for high-frequency operations

### Formatters

Formatters convert token arrays into formatted SQL strings. Each formatter handles presentation concerns:

#### Separator Formatter

Joins tokens with a configurable separator (space or newline):

```typescript
// With space separator
SELECT id, name FROM users WHERE active = true

// With newline separator
SELECT id, name
FROM users
WHERE active = true
```

#### Pretty Formatter

Right-aligns keywords for visual clarity:

```typescript
  SELECT id, name
    FROM users
   WHERE active = true
     AND age > 18
ORDER BY name
```

**How it Works:**
1. Calculate longest keyword across all tokens
2. Apply padding to right-align each keyword
3. Join with newlines

### Formatter Builder

The formatter builder creates configured format functions with variants:

```typescript
const format = formatter({
  tokenizer: lightweightTokenizer,
  formatter: separatorFormatter
});

// API:
format(ast)           // Space-separated
format.newline(ast)   // Newline-separated
format.pretty(ast)    // Right-aligned pretty print
```

## Two-Pass Architecture

### Why Two Passes?

The architecture uses a two-pass approach for all formatters:

1. **Pass 1 (Tokenization)**: AST → Token Array
2. **Pass 2 (Formatting)**: Token Array → String

**Benefits:**

- **Separation of Concerns**: Tokenizers handle structure, formatters handle presentation
- **Consistency**: All formatters work the same way
- **Testability**: Each layer can be tested independently
- **Extensibility**: New formatters work with existing tokenizers
- **Clarity**: Clear data flow with explicit intermediate representation

**Performance Considerations:**

The two-pass approach involves an intermediate token array allocation. However:

- Token arrays are small (3-7 elements for typical queries)
- Modern JS engines optimize small array allocations
- AST traversal (WHERE predicate trees) dominates processing time
- The overhead is negligible compared to database network I/O

**Measurement:**
- Tokenization + formatting: ~microseconds for typical queries
- Database round-trip: ~milliseconds
- The tokenization cost is <1% of total query execution time

### Alternative: Single-Pass Processing

A single-pass approach (tokenize and format each clause immediately) was considered:

**Pros:**
- No intermediate array allocation
- Potentially lower memory usage

**Cons:**
- Cannot calculate metadata across all clauses (e.g., max keyword length for alignment)
- Mixed responsibilities (structure + presentation in one pass)
- More complex to implement and reason about
- Negligible performance benefit for typical use cases

**Decision:** The clean separation and clarity of two-pass architecture outweighs the minimal performance cost.

## Handling WHERE Predicates

### Operator Precedence

The tokenizer handles operator precedence to ensure correct parenthesization:

**AST:**
```typescript
where: ['and',
  ['=', 'active', 'true'],
  ['or',
    ['=', 'role', 'admin'],
    ['=', 'role', 'mod']
  ]
]
```

**Tokens:**
```typescript
[
  ['WHERE', ['active = true']],
  ['AND', ['(role = admin OR role = mod)']]
]
```

**Rules:**
- OR nested inside AND gets parentheses
- AND nested inside OR does not need parentheses (AND has higher precedence)
- Single predicates never need parentheses

### Splitting Top-Level AND

Top-level AND predicates are split into separate tokens for pretty formatting:

**AST:**
```typescript
where: ['and',
  ['<>', 'status', 'deleted'],
  ['>', 'age', '18'],
  ['=', 'active', 'true']
]
```

**Tokens:**
```typescript
[
  ['WHERE', ['status <> deleted']],
  ['AND', ['age > 18']],
  ['AND', ['active = true']]
]
```

This enables the pretty formatter to align each AND on its own line:

```sql
 WHERE status <> deleted
   AND age > 18
   AND active = true
```

## Extensibility

### Adding New Formatters

New formatters can be added without modifying existing code:

```typescript
// JSON formatter for debugging
function jsonFormatter(tokens: ExprToken[]): string {
  return JSON.stringify(tokens, null, 2);
}

const debugFormat = formatter({
  tokenizer: lightweightTokenizer,
  formatter: jsonFormatter
});
```

### Adding New Tokenizers

Detailed tokenizers can be implemented for specialized use cases:

```typescript
// HTML syntax highlighting tokenizer
function htmlTokenizer(ast: AST): ExprToken[] {
  // Preserve operator/operand structure
  // Return tokens with nested arrays
}

const htmlFormat = formatter({
  tokenizer: htmlTokenizer,
  formatter: htmlFormatter  // Applies CSS classes to operators vs operands
});
```

### Use Cases for Custom Formatters

- **SQL Dialect Translation**: Convert tokens to MySQL, PostgreSQL, SQLite syntax
- **Query Analysis**: Inspect token structure for optimization suggestions
- **Documentation Generation**: Extract query patterns for API docs
- **Query Debugging**: Pretty-print with execution plan annotations
- **Testing**: Generate test fixtures from AST structures

## Performance Optimization Strategies

### For High-Frequency Queries

If SQL generation becomes a bottleneck (rare), consider:

1. **Caching**: Memoize formatted SQL strings
   ```typescript
   const cache = new Map();
   function cachedFormat(ast) {
     const key = JSON.stringify(ast);
     if (!cache.has(key)) {
       cache.set(key, format(ast));
     }
     return cache.get(key);
   }
   ```

2. **Prepared Statements**: Use parameterized queries instead of regenerating SQL
   ```typescript
   // Instead of regenerating SQL for each user ID
   SELECT * FROM users WHERE id = ?
   ```

3. **Template Literals**: For simple queries, use template strings directly
   ```typescript
   const sql = `SELECT ${columns.join(', ')} FROM ${table}`;
   ```

### When to Use Manuka

Manuka is intended for:
- ✅ Programmatically generated queries
- ✅ Dynamic clause composition
- ✅ Query manipulation and transformation
- ✅ Multiple output formats from same AST
- ✅ Complex joins and subqueries (may be clearer in raw SQL)

## Design Rationale

### Why Flat Token Arrays?

Tokens are returned as flat arrays rather than nested structures:

```typescript
// Flat (what we use)

// Nested (alternative)
[
  ['WHERE', ['active = true', 'age > 18']]
]
```

**Rationale:**
- Flat structure makes each AND/OR explicit for pretty formatting
- Easier to calculate keyword alignment across all tokens
- Simpler iteration in formatters
- More flexible for token manipulation

### Why Pre-Formatted Strings in Lightweight Tokenizer?

The lightweight tokenizer formats predicates during tokenization rather than in the formatter:

```typescript
// Pre-formatted (what we use)
['WHERE', ['role = admin']]

// Structured (alternative)
['WHERE', [['=', 'role', 'admin']]]
```

**Rationale:**
- Formatters don't need to understand operator semantics
- Reduces formatter complexity
- Performance: avoids re-traversing predicate structures
- Separation: predicate formatting belongs in tokenizer (structure concern)

### Why Tuple-Based AST?

Predicates use tuple arrays `[operator, ...operands]` rather than objects:

```typescript
// Tuple (what we use)
['=', 'role', 'admin']

// Object (alternative)
{ operator: '=', left: 'role', right: 'admin' }
```

**Rationale:**
- More concise syntax
- Easier to pattern match and destructure
- Inspired by Lisp/Clojure s-expressions (proven design)
- Natural recursive processing
- Less verbose for hand-written queries

## Future Enhancements

### Detailed Tokenizer

Implement structured token output for rich rendering:

```typescript
type DetailedToken = [string, (string | DetailedToken)[]];

// Example
['WHERE', [
  { type: 'operator', value: '=' },
  { type: 'column', value: 'role' },
  { type: 'literal', value: 'admin' }
]]
```

### Query Validation

Add AST validation before tokenization:

- Check for valid operator usage
- Validate clause combinations
- Type checking for operands

### SQL Dialect Support

Extend tokenizers to support different SQL dialects:

- MySQL: Backtick identifiers, LIMIT syntax
- PostgreSQL: Double-quote identifiers, OFFSET syntax
- SQLite: Different date/time functions

### Raw Expression Support

Add escape hatch for unsupported SQL features:

```typescript
{
  select: ['id', { raw: 'COUNT(*) OVER (PARTITION BY category)' }],
  from: ['products']
}
```

## Terminology

To align with standard SQL terminology:

- **Clause**: Top-level SQL keywords (SELECT, FROM, WHERE, ORDER BY, etc.)
- **Predicate**: Boolean expression in WHERE/HAVING (e.g., `id = 1`)
- **Expression**: Value-producing component (e.g., column name, literal, function call)
- **Compound Predicate**: Multiple predicates joined with AND/OR
- **Subquery**: Nested SELECT statement within a clause

## Summary

Manuka's architecture prioritizes:

1. **Clarity**: Clean separation between structure, tokenization, and presentation
2. **Performance**: Optimized for runtime SQL generation with minimal overhead
3. **Extensibility**: Easy to add new formatters and tokenizers without code duplication
4. **Simplicity**: Plain data structures, no classes or complex APIs
5. **Correctness**: Proper operator precedence and parenthesization

The two-pass tokenizer/formatter architecture provides a solid foundation for
generating SQL from structured data while remaining flexible enough to support
future enhancements like syntax highlighting, query analysis, and multi-dialect
support.
