# Manuka Architecture

## Overview

Manuka is a lightweight SQL query builder for JavaScript/TypeScript that
converts structured AST objects into formatted SQL strings. The architecture is
designed around three core principles:

1. **Separation of Concerns**: Clear boundaries between AST structure,
   tokenization, and formatting
2. **Performance**: Optimized for runtime SQL generation with minimal overhead
3. **Extensibility**: Support for multiple output formats.

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
│  - Returns flat array of tokens that can be     |
|    easily formatted.                            │
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

If the provided tokenizer and formatter are not suitable, you can provide your
own.

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
type ExprToken = [string, string | ExprToken[]];
```

Each token is a tuple of `[keyword, operand]`:
- **Keyword**: SQL clause keyword (SELECT, FROM, WHERE, AND, OR, etc.)
- **Operand**: Either a string (for simple clauses) or a nested array of
  ExprTokens (for compound predicates)

**Example Token Array (Simple):**
```typescript
[
  ['SELECT', 'id, name, email'],
  ['FROM', 'users'],
  ['WHERE', 'active = true'],
  ['AND', 'age > 18'],
  ['ORDER BY', 'name']
]
```

**Example Token Array (With Nested Predicates):**
```typescript
[
  ['SELECT', 'id, name'],
  ['FROM', 'users'],
  ['WHERE', 'active = true'],
  ['AND', [
    ['', 'role = admin'],
    ['OR', 'role = mod']
  ]]
]
```

### Tokenizers

Tokenizers convert AST objects into token arrays. Manuka comes with just one
tokenizer, but the formatter builder can be provided with a custom tokenizer
and formatter at runtime to to fulfill the needs of the user.

The tokenizer provided by Manuka is designed to produce a data structure from
which the formatter can easily render the pretty-printed string.

To this end, each line of the expression is represented by a tuple containing 2
elements.  The 1st element contains the left hand side of the expression, while
the 2nd element contains the right hand side.

The 2nd element can also provide a nested expression that will be indented in
the formatted output.

See an example output of the pretty formatter below.

This tokenizer is also used by the separator formatter, which provides the string for
the db query interface.

### Formatters

Formatters convert token arrays into formatted SQL strings. Each formatter
handles presentation concerns:

#### Separator Formatter

Joins tokens with a configurable separator (space, newline, or any other string):

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

### Alternative: Single-Pass Processing

A single-pass approach (tokenize and format each clause immediately) was considered:

**Pros:**
- No intermediate array allocation
- Potentially lower memory usage

**Cons:**
- Cannot calculate metadata across all clauses (e.g., max keyword length for
  alignment)
- Negligible performance benefit for typical use cases

**Decision:** The clean separation and clarity of two-pass architecture
outweighs the minimal performance cost.

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
function htmlTokenizer(ast: AST): HtmlExprToken[] {
  // Preserve operator/operand structure
  // Return tokens with nested arrays
}

function htmlFormatter(tokens: HtmlExprToken[]): string {
  // ...
}

const htmlFormat = formatter({
  tokenizer: htmlTokenizer,
  formatter: htmlFormatter  // Applies CSS classes to operators vs operands
});
```
### Why Tokenizer Produces Structured Tokens?

The lightweight tokenizer converts predicates to strings but preserves structure for compound expressions:

```typescript
// Simple predicate (formatted string)
['WHERE', 'role = admin']

// Compound predicate (structured nested array)
['WHERE', [
  ['', 'role = admin'],
  ['OR', 'role = mod']
]]
```

**Rationale:**
- Simple predicates are formatted once by tokenizer (efficient)
- Compound predicates preserve structure for formatter decisions
- Formatter controls layout (single-line vs. multi-line) based on complete token array
- Clear separation: tokenizer handles structure/precedence, formatter handles presentation
- Enables recursive right-alignment at each nesting level

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
