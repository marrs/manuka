# Design Decisions: SQL Formatter Architecture

## Overview

This document explains the architectural choices made for Manuka's SQL formatter, which converts JavaScript AST objects into valid SQL statements.

The core challenge: SQL has a strict grammar with clause ordering rules (e.g., FROM must follow SELECT, WHERE requires FROM). We need a formatter that respects these rules while remaining maintainable and extensible.

## Design 2: Grammar Rule Engine

### Concept

Define SQL grammar as a formal data structure with dependency rules, then use topological sorting to determine the correct clause order dynamically.

### Implementation

```typescript
type Rule = {
  clause: string;
  required: boolean;
  requires: string[];      // Must come after these
  conflicts: string[];     // Cannot coexist with these
  formatter: (data: any) => string;
};

const SQL_GRAMMAR: Rule[] = [
  {
    clause: 'select',
    required: true,
    requires: [],
    conflicts: [],
    formatter: (cols) => `SELECT ${cols.join(', ')}`
  },
  {
    clause: 'from',
    required: false,
    requires: ['select'],
    conflicts: [],
    formatter: (tables) => `FROM ${tables.join(', ')}`
  },
  {
    clause: 'where',
    required: false,
    requires: ['from'],
    conflicts: [],
    formatter: (expr) => `WHERE ${formatExpression(expr)}`
  },
  {
    clause: 'having',
    required: false,
    requires: ['groupBy'],
    conflicts: [],
    formatter: (expr) => `HAVING ${formatExpression(expr)}`
  }
];

function topologicalSort(grammar: Rule[], ast: AST): Rule[] {
  // Build dependency graph from rules
  const graph = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  // Filter only rules present in AST
  const activeRules = grammar.filter(rule => ast[rule.clause] !== undefined);

  // Initialize graph
  for (const rule of activeRules) {
    graph.set(rule.clause, new Set(rule.requires));
    inDegree.set(rule.clause, rule.requires.length);
  }

  // Kahn's algorithm for topological sort
  const queue: Rule[] = [];
  const result: Rule[] = [];

  // Find nodes with no dependencies
  for (const rule of activeRules) {
    if (inDegree.get(rule.clause) === 0) {
      queue.push(rule);
    }
  }

  while (queue.length > 0) {
    const rule = queue.shift()!;
    result.push(rule);

    // Reduce in-degree for dependent nodes
    for (const other of activeRules) {
      const deps = graph.get(other.clause)!;
      if (deps.has(rule.clause)) {
        deps.delete(rule.clause);
        const newDegree = inDegree.get(other.clause)! - 1;
        inDegree.set(other.clause, newDegree);
        if (newDegree === 0) {
          queue.push(other);
        }
      }
    }
  }

  // Check for cycles
  if (result.length !== activeRules.length) {
    throw new Error('Circular dependency in SQL clauses');
  }

  return result;
}

function format(ast: AST): string {
  const sorted = topologicalSort(SQL_GRAMMAR, ast);
  return sorted.map(rule => rule.formatter(ast[rule.clause])).join(' ');
}
```

### Pros

- **Declarative**: Grammar is data, easy to understand at a glance
- **Flexible**: Can handle complex dependency chains automatically
- **Extensible**: Adding new clauses just means adding rules
- **Conflict detection**: Built-in support for mutually exclusive clauses
- **Cycle detection**: Catches invalid dependency graphs

### Cons

- **Over-engineered**: ~50-80 lines for topological sort alone
- **Extra abstractions**: Rule type, graph structures, sorting algorithm
- **Harder to debug**: Must understand graph algorithms to troubleshoot
- **Performance overhead**: Graph building and sorting on every format call
- **Unused features**: `conflicts` and `required` fields may never be needed

### Complexity Sources

1. **Data structure overhead**: 5 fields per rule vs 1 function
2. **Algorithm complexity**: Topological sort is non-trivial to implement and test
3. **Indirection**: Multiple layers between "format this" and actual formatting
4. **Maintenance**: Graph algorithms need edge case handling (cycles, disconnected nodes)

## Design 5: Hybrid - Ordered Formatters + Recursive Expressions

### Concept

Use a simple predefined clause order (matching SQL standard), with specialized formatters for each clause. Recursive expression formatter handles nested structures like WHERE conditions.

### Implementation

```typescript
type Formatter = (data: any) => string;
type Expr = string | number | [string, ...Expr[]];

// Standard SQL clause order
const CLAUSE_ORDER = [
  'with',
  'select',
  'from',
  'join',
  'where',
  'groupBy',
  'having',
  'window',
  'orderBy',
  'limit'
];

// Simple map of clause name to formatter function
const FORMATTERS: Record<string, Formatter> = {
  select: (cols: string[]) => `SELECT ${cols.join(', ')}`,
  from: (tables: string[]) => `FROM ${tables.join(', ')}`,
  where: (expr: Expr) => `WHERE ${formatExpression(expr)}`,
  groupBy: (cols: string[]) => `GROUP BY ${cols.join(', ')}`,
  having: (expr: Expr) => `HAVING ${formatExpression(expr)}`,
  orderBy: (cols: any[]) => `ORDER BY ${formatOrderBy(cols)}`,
  limit: (n: number) => `LIMIT ${n}`,
};

// Recursive expression formatter for WHERE, HAVING, etc.
function formatExpression(expr: Expr): string {
  if (typeof expr === 'string' || typeof expr === 'number') {
    return String(expr);
  }

  const [op, ...args] = expr;

  // Binary operators
  if (['=', '<>', '<', '>', '<=', '>=', 'LIKE'].includes(op)) {
    return `${formatExpression(args[0])} ${op} ${formatExpression(args[1])}`;
  }

  // Logical operators
  if (op === 'and' || op === 'AND') {
    return args.map(formatExpression).join(' AND ');
  }
  if (op === 'or' || op === 'OR') {
    return args.map(formatExpression).join(' OR ');
  }

  // Functions (COUNT, SUM, etc.)
  return `${op}(${args.map(formatExpression).join(', ')})`;
}

function format(ast: AST): string {
  // Validate required dependencies (explicit and clear)
  if (ast.from && !ast.select) {
    throw new Error('FROM clause requires SELECT clause');
  }
  if (ast.where && !ast.from) {
    throw new Error('WHERE clause requires FROM clause');
  }
  if (ast.having && !ast.groupBy) {
    throw new Error('HAVING clause requires GROUP BY clause');
  }

  // Format in proper order (just filter and map)
  return CLAUSE_ORDER
    .filter(clause => ast[clause] !== undefined)
    .map(clause => FORMATTERS[clause](ast[clause]))
    .join(' ');
}
```

### Pros

- **Simple**: ~10 lines for main format function
- **Explicit**: Order is visible and obvious
- **Easy to debug**: Can console.log at each step
- **No algorithms**: Just filter/map array operations
- **Clear separation**: Clause formatting vs expression formatting
- **Testable**: Each formatter can be unit tested independently

### Cons

- **Manual ordering**: Must maintain CLAUSE_ORDER array
- **Validation separate**: Dependencies checked with if-statements, not in data
- **Less flexible**: Can't dynamically reorder clauses

### Simplicity Sources

1. **Direct data structures**: Just an array and a map
2. **No algorithms**: Standard JavaScript array methods
3. **Explicit validation**: Plain conditionals, easy to understand
4. **Single responsibility**: Each formatter does one thing

## Complexity Comparison

### Adding a new clause

**Design 2:**
```typescript
// Add to grammar array (6 lines + object overhead)
const SQL_GRAMMAR: Rule[] = [
  // ... existing rules
  {
    clause: 'offset',
    required: false,
    requires: ['limit'],
    conflicts: [],
    formatter: (n) => `OFFSET ${n}`
  }
];
```

**Design 5:**
```typescript
// Add to order (1 line)
const CLAUSE_ORDER = ['select', 'from', 'where', 'limit', 'offset'];

// Add formatter (1 line)
const FORMATTERS = {
  // ... existing
  offset: (n) => `OFFSET ${n}`
};

// Add validation if needed (2-3 lines)
if (ast.offset && !ast.limit) {
  throw new Error('OFFSET requires LIMIT');
}
```

**Total: 4-5 lines vs 6+ lines, but more importantly: simpler mental model**

### Maintenance burden

| Aspect | Design 2 | Design 5 |
|--------|----------|----------|
| Algorithm maintenance | Must maintain topological sort | None |
| Debugging complexity | Graph traversal tracing | Array filter/map |
| Test coverage needed | Graph algorithm edge cases | Formatter functions |
| Lines of code | ~100-150 | ~40-60 |
| Abstraction layers | 3-4 | 1-2 |

## When Design 2 Would Be Required

### SQL Features Analysis

#### ✅ Case 1: Plugin/Extension System

**Scenario**: Third-party developers add custom clauses with arbitrary dependencies.

```typescript
// Plugin adds custom clause
registerClause({
  name: 'mysqlHint',
  requires: ['select'],
  mustComeBefore: ['from'],
  formatter: (hint) => `/*+ ${hint} */`
});
```

**Why Design 2 helps**: Without knowing all clauses in advance, you can't hardcode `CLAUSE_ORDER`. Topological sort resolves the dependency graph dynamically.

**Design 5 workaround**: Provide insertion points in the order array, or allow plugins to specify their position numerically.

**Verdict**: Design 2 genuinely valuable here.

#### ❌ Case 2: CTEs (Common Table Expressions) with Dependencies

**Example:**
```sql
WITH
  users_active AS (SELECT * FROM users WHERE active = true),
  user_orders AS (SELECT * FROM orders JOIN users_active USING (user_id)),
  order_stats AS (SELECT * FROM user_orders GROUP BY user_id)
SELECT * FROM order_stats;
```

**Why Design 2 seems needed**: CTEs can reference each other, requiring dependency resolution.

**Design 5 solution**: Handle CTE ordering within the `with` formatter:

```typescript
formatters.with = (ctes: Record<string, AST>) => {
  const ordered = topologicalSortCTEs(ctes);  // Local sort, just for CTEs
  return `WITH ${ordered.map(formatCTE).join(', ')}`;
}
```

**Verdict**: Design 2 not required - solve locally in the formatter.

#### ❌ Case 3: Multiple SQL Dialects

**Example:**
```sql
-- MySQL
SELECT * FROM users LIMIT 10;

-- SQL Server
SELECT TOP 10 * FROM users;

-- PostgreSQL
SELECT * FROM users FETCH FIRST 10 ROWS ONLY;
```

**Why Design 2 seems needed**: Different dialects have different clause positions.

**Design 5 solution**: Dialect-specific formatter maps:

```typescript
const FORMATTERS_MYSQL = {
  limit: (n) => `LIMIT ${n}`
};

const FORMATTERS_SQLSERVER = {
  top: (n) => `TOP ${n}`,  // Inserted into SELECT
  limit: undefined
};

const FORMATTERS_POSTGRES = {
  limit: (n) => `FETCH FIRST ${n} ROWS ONLY`
};
```

**Verdict**: Design 2 not required - this is about syntax, not ordering.

#### ❌ Case 4: Window Function Definitions

**Example:**
```sql
SELECT
  emp_id,
  SUM(salary) OVER w1
FROM employees
WINDOW w1 AS (PARTITION BY dept)
ORDER BY emp_id;
```

**Why Design 2 seems needed**: `WINDOW` clause has a specific position in SQL grammar.

**Design 5 solution**: Just add `'window'` to `CLAUSE_ORDER` array at the correct position.

**Verdict**: Design 2 not required - fixed position in standard SQL order.

#### ❌ Case 5: Set Operations (UNION/INTERSECT/EXCEPT)

**Example:**
```sql
SELECT * FROM table1
UNION
SELECT * FROM table2
```

**Why Design 2 seems needed**: Combining multiple SELECT statements.

**Design 5 solution**: Set operations combine complete queries, not individual clauses. Handle at a higher level than clause ordering.

**Verdict**: Design 2 not required - different problem domain.

### The Key Insight

**SQL clause order is standardized by the SQL standard.** The order is:

```
WITH → SELECT → FROM → JOIN → WHERE → GROUP BY → HAVING → WINDOW → ORDER BY → LIMIT/OFFSET
```

This order is:
- Fixed across all major databases (with minor dialect variations in syntax, not order)
- Well-documented and understood by all SQL users
- Unlikely to change (backward compatibility guarantees)

**Local dependencies** (like CTEs referencing each other) can be solved within individual formatters using localized topological sorts, not at the top-level clause ordering.

## When Design 2 Becomes Valuable

Design 2's topological sort becomes valuable when:

1. ✅ **Plugin/extension system** - Third parties add clauses with unknown dependencies
2. ✅ **Highly dynamic SQL generation** - Clause order determined at runtime based on complex rules
3. ✅ **Domain-specific query language** - Building your own non-SQL query language with flexible ordering
4. ⚠️ **Future-proofing** - Anticipating major SQL extensions (but YAGNI principle applies)

None of these apply to a standard SQL builder library.

## Decision: Use Design 5

### Rationale

For Manuka (a HoneySQL-inspired SQL builder):

1. **Target use case**: Generate standard SQL with some dialect support
2. **SQL clause order**: Fixed and well-known
3. **User expectations**: Conventional SQL output
4. **Complexity budget**: Prefer simplicity over premature optimization

Design 5 provides:
- ✅ All needed functionality for standard SQL
- ✅ Easy to understand and maintain
- ✅ Simple to extend with new clauses
- ✅ Clear separation of concerns (clause formatting vs expression formatting)
- ✅ Follows YAGNI principle (You Aren't Gonna Need It)

### Migration Path

If we later need Design 2's features (e.g., adding a plugin system):

1. The formatter functions are already isolated and testable
2. Refactoring to Design 2 would be straightforward
3. Tests would remain largely unchanged
4. Don't pay the complexity cost until we have the actual requirement

### Pragmatic Middle Ground

Structure the code for future extensibility:
- Keep formatters as pure functions in a map
- Allow formatters to be overridden or extended
- Document the clause ordering assumptions

This gives us 90% of Design 2's flexibility with 20% of the complexity.

## Conclusion

**Choose simplicity until complexity is required.** Design 5 solves the actual problem (formatting SQL according to its grammar) with minimal machinery. Design 2's sophisticated dependency resolution is a solution looking for a problem in this context.

Start simple, refactor when needed. The code structure supports this evolution.
