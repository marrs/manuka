# Manuka

A javascript SQL builder based on HoneySQL.

Similar to HoneySQL, Manuka allows the user to represent an SQL query as data,
which you can provide to Manuka for operations such as formatting.

The main advantage of using an AST to represent SQL is that it makes it
trivially easy to compose a more complicated SQL query from simpler parts.

A secondary advantage of using an AST is that different formatters can be used
to render the SQL string depending on use.  For example, Manuka includes a
formatter for pretty printing SQL to the console.

## Examples

### Basic queries

A simple query:
```javascript
import { format } from 'manuka';
format({
  select: ['a', 'b', 'c'],
  from: ['t1'],
  where: [
    'and',
    ['<>', 'b', 'bar'], ['=', 't1.a', 'baz'],
  ],
})
```

### Prepared statements

A simple prepared statement:
```javascript
import { format, $ } from 'manuka';
format({
  select: ['a', 'b', 'c'],
  from: ['t1'],
  where: [
    'and',
    ['<>', 'b', $], ['=', 't1.a', $],
  ],
}, ['bar', 'baz'])
```

A prepared statement using an object to represent the data:
```javascript
import { format, $ } from 'manuka';
format({
  select: ['a', 'b', 'c'],
  from: ['t1'],
  where: [
    'and',
    ['<>', 'b', $('bar')], ['=', 't1.a', $('baz')],
  ],
}, {bar: 'bar', baz: 'baz'})
```

A prepared statement using a nested object to represent the data:
```javascript
import { format, $ } from 'manuka';
format({
  select: ['a', 'b', 'c'],
  from: ['t1'],
  where: [
    'and',
    ['<>', 'b', $('foo.bar')], ['=', 't1.a', $('foo.baz')],
  ],
}, {
  foo: {
    bar: 'bar',
    baz: 'baz',
  }
})
```

In case the `.` character is used within property names already,
a different delimiter can be used to delimit nested properties:
```javascript
import { format } from 'manuka';
format($ => {
  $.delimiter('#');
  return {
    select: ['a', 'b', 'c'],
    from: ['t1'],
    where: [
      'and',
      ['<>', 'b', $('foo#bar')], ['=', 't1.a', $('foo#baz')],
    ],
  };
}), {
  foo: {
    bar: 'bar',
    baz: 'baz',
  }
})
```

When `format` receives a function as its first argument, it passes a
version of `$` to it that is scoped only to the function, and which
has an additional method for controlling its behaviour.

### Composing queries

One of the main advantages of representing SQL as data is composability.
You can build complex queries from simpler parts:

```javascript
import { format } from 'manuka';

// Build a base query
const baseQuery = {
  select: ['id', 'email', 'username'],
  from: 'users',
};

// Compose it with additional constraints
const activeUsersQuery = {
  ...baseQuery,
  where: ['=', 'is_active', 1],
};

const adminUsersQuery = {
  ...baseQuery,
  where: ['=', 'role', 'admin'],
  orderBy: [['created_at', 'DESC']],
};

// Format either query
format(activeUsersQuery);
// SELECT id, email, username FROM users WHERE is_active = 1

format(adminUsersQuery);
// SELECT id, email, username FROM users WHERE role = 'admin' ORDER BY created_at DESC
```

This composability extends to DDL (Data Definition Language) operations as well.
For example, you can define portable table schemas and specialize them for
specific databases:

```typescript
// Build base schema (portable across databases)
const baseUserTable = {
  createTable: 'users',
  withColumns: [
    ['id', 'INTEGER', ['PRIMARY KEY']],
    ['email', 'TEXT', ['UNIQUE'], ['NOT', null]],
  ],
};

// Compose with SQLite-specific optimizations
const sqliteUserTable = {
  ...baseUserTable,
  strict: true,        // SQLite 3.37+ strict type checking
  without: 'ROWID',    // Optimization for tables with explicit primary key
};

// Compose with PostgreSQL-specific features
const pgUserTable = {
  ...baseUserTable,
  tablespace: 'users_ts',
  unlogged: false,     // Ensure crash-safety
};

// Each can be formatted for its target database
formatSqliteDdl(sqliteUserTable);
formatPostgresDdl(pgUserTable);
```

You can also create functions that conditionally add database-specific features:

```typescript
function createUserTable(options: {
  database: 'sqlite' | 'postgres' | 'mysql';
  optimized?: boolean;
}) {
  const base = {
    createTable: 'users',
    withColumns: [['id', 'INTEGER', ['PRIMARY KEY']]],
  };

  if (!options.optimized) {
    return base;  // Return portable DDL
  }

  // Add optimizations for each database
  switch (options.database) {
    case 'sqlite':
      return { ...base, strict: true, without: 'ROWID' };
    case 'postgres':
      return { ...base, tablespace: 'fast_ssd' };
    case 'mysql':
      return { ...base, engine: 'InnoDB' };
  }
}

// Create optimized or portable schemas as needed
const portableSchema = createUserTable({ database: 'sqlite', optimized: false });
const optimizedSchema = createUserTable({ database: 'sqlite', optimized: true });
```

## Inspired by HoneySQL

Manuka's AST design is inspired by [HoneySQL](https://github.com/seancorfield/honeysql),
a Clojure SQL builder.  Its name is a nod to that project.
