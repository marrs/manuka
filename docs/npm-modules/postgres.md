# PostgreSQL Node.js Interface: `postgres` (postgres.js)

## How `postgres` Receives and Handles Prepared Statements

Based on studying the library code and documentation, here's how `postgres` handles queries using tagged template literals and automatic prepared statements.

### Tagged Template Literal Syntax

The `sql` function is a [tagged template function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#Tagged_templates) that processes query parameters before interpolation:

```javascript
import postgres from 'postgres'

const sql = postgres({ /* options */ })

// Basic query with parameters
const users = await sql`
  select name, age
  from users
  where age > ${ age }
`
```

### How It Works Internally

From studying `src/index.js` and `src/types.js`:

#### 1. Tagged Template Processing (index.js:110-116)
```javascript
function sql(strings, ...args) {
  const query = strings && Array.isArray(strings.raw)
    ? new Query(strings, args, handler, cancel)
    : typeof strings === 'string' && !args.length
      ? new Identifier(options.transform.column.to ? options.transform.column.to(strings) : strings)
      : new Builder(strings, args)
  return query
}
```

When you write:
```javascript
sql`SELECT * FROM users WHERE id = ${id} AND status = ${status}`
```

The function receives:
- `strings`: `['SELECT * FROM users WHERE id = ', ' AND status = ', '']`
- `args`: `[id, status]`

#### 2. Parameter Extraction (connection.js:219-239)
```javascript
function build(q) {
  const parameters = []
      , types = []

  const string = stringify(q, q.strings[0], q.args[0], parameters, types, options)

  !q.tagged && q.args.forEach(x => handleValue(x, parameters, types, options))

  q.prepare = options.prepare && ('prepare' in q.options ? q.options.prepare : true)
  q.string = string
  q.signature = q.prepare && types + string
  q.onlyDescribe && (delete statements[q.signature])
  q.parameters = q.parameters || parameters
  q.prepared = q.prepare && q.signature in statements
  q.describeFirst = q.onlyDescribe || (parameters.length && !q.prepared)
  q.statement = q.prepared
    ? statements[q.signature]
    : { string, types, name: q.prepare ? statementId + statementCount++ : '' }
}
```

The `stringify` function (types.js:98-105) builds the SQL string by replacing template values with `$N` placeholders:

```javascript
export function stringify(q, string, value, parameters, types, options) {
  for (let i = 1; i < q.strings.length; i++) {
    string += (stringifyValue(string, value, parameters, types, options)) + q.strings[i]
    value = q.args[i]
  }
  return string
}
```

#### 3. Value Handling (types.js:75-94)
```javascript
export function handleValue(x, parameters, types, options) {
  let value = x instanceof Parameter ? x.value : x
  if (value === undefined) {
    x instanceof Parameter
      ? x.value = options.transform.undefined
      : value = x = options.transform.undefined

    if (value === undefined)
      throw Errors.generic('UNDEFINED_VALUE', 'Undefined values are not allowed')
  }

  return '$' + (types.push(
    x instanceof Parameter
      ? (parameters.push(x.value), x.array
        ? x.array[x.type || inferType(x.value)] || x.type || firstIsString(x.value)
        : x.type
      )
      : (parameters.push(x), inferType(x))
  ))
}
```

This function:
- Adds the value to the `parameters` array
- Infers the PostgreSQL type
- Returns the placeholder string `$1`, `$2`, etc.

### Parameter Placeholder Format

Like `pg`, postgres.js uses **positional placeholders**: `$1`, `$2`, `$3`, etc.

```javascript
const name = 'Murray'
    , age = 68

await sql`
  insert into users (name, age)
  values (${name}, ${age})
  returning *
`
```

Internally becomes:
```sql
-- SQL string:
insert into users (name, age) values ($1, $2) returning *

-- Parameters:
['Murray', 68]
```

### Automatic Prepared Statements

From connection.js:202-217, queries are automatically prepared by default:

```javascript
function prepared(q) {
  return Buffer.concat([
    Bind(q.parameters, q.statement.types, q.statement.name, q.cursorName),
    q.cursorFn
      ? Execute('', q.cursorRows)
      : ExecuteUnnamed
  ])
}

function unnamed(q) {
  return Buffer.concat([
    Parse(q.statement.string, q.parameters, q.statement.types),
    DescribeUnnamed,
    prepared(q)
  ])
}
```

#### Statement Caching

Prepared statements are cached by signature (line 229):
```javascript
q.signature = q.prepare && types + string
```

The signature is a combination of parameter types and SQL string. When the same query with the same parameter types is executed again, the cached prepared statement is reused (line 232-236):

```javascript
q.prepared = q.prepare && q.signature in statements
q.statement = q.prepared
  ? statements[q.signature]
  : { string, types, name: q.prepare ? statementId + statementCount++ : '' }
```

#### Disabling Prepared Statements

You can disable prepared statements globally or per-query:

```javascript
// Globally disable
const sql = postgres({ prepare: false })

// Per-query disable
await sql`SELECT * FROM users`.simple()
```

The `prepare` option defaults to `true` (line 227):
```javascript
q.prepare = options.prepare && ('prepare' in q.options ? q.options.prepare : true)
```

### Extended Query Protocol (connection.js:928-967)

Like `pg`, postgres.js uses PostgreSQL's extended query protocol:

#### Parse (line 952-956)
```javascript
function Parse(str, parameters, types, name = '') {
  b().P().str(name + b.N).str(str + b.N).i16(parameters.length)
  parameters.forEach((x, i) => b.i32(types[i] || 0))
  return b.end()
}
```

#### Bind (line 928-950)
```javascript
function Bind(parameters, types, statement = '', portal = '') {
  let prev, type

  b().B().str(portal + b.N).str(statement + b.N).i16(0).i16(parameters.length)

  parameters.forEach((x, i) => {
    if (x === null)
      return b.i32(0xFFFFFFFF)

    type = types[i]
    parameters[i] = x = type in options.serializers
      ? options.serializers[type](x)
      : '' + x

    prev = b.i
    b.inc(4).str(x).i32(b.i - prev - 4, prev)
  })

  b.i16(0)
  return b.end()
}
```

#### Execute (line 962-967)
```javascript
function Execute(portal = '', rows = 0) {
  return Buffer.concat([
    b().E().str(portal + b.N).i32(rows).end(),
    Flush
  ])
}
```

### Dynamic Query Building

postgres.js provides powerful query building helpers:

#### Dynamic Columns
```javascript
const columns = ['name', 'age']

await sql`
  select ${ sql(columns) }
  from users
`

// Results in: SELECT "name", "age" FROM users
```

#### Dynamic Inserts
```javascript
const user = { name: 'Murray', age: 68 }

await sql`
  insert into users ${ sql(user, 'name', 'age') }
`

// Results in: INSERT INTO users ("name", "age") VALUES ($1, $2)
```

#### Multiple Rows
```javascript
const users = [
  { name: 'Murray', age: 68 },
  { name: 'Walter', age: 80 }
]

await sql`insert into users ${ sql(users, 'name', 'age') }`

// Results in: INSERT INTO users ("name", "age") VALUES ($1, $2), ($3, $4)
```

### Unsafe Queries (index.js:119-127)

For raw SQL without automatic parameterization:

```javascript
function unsafe(string, args = [], options = {}) {
  arguments.length === 2 && !Array.isArray(args) && (options = args, args = [])
  const query = new Query([string], args, handler, cancel, {
    prepare: false,
    ...options,
    simple: 'simple' in options ? options.simple : args.length === 0
  })
  return query
}
```

Usage:
```javascript
// Raw SQL (dangerous - can lead to SQL injection!)
sql.unsafe('SELECT * FROM users WHERE id = ' + userId)

// Can still pass parameters
sql.unsafe('SELECT * FROM users WHERE id = $1', [userId])

// Unsafe is useful for dynamic identifiers
await sql`
  CREATE TRIGGER ${sql.unsafe(triggerName)}
  AFTER ${sql.unsafe('INSERT')} ON users
`
```

**Note**: By default, `unsafe()` disables prepared statements (`prepare: false`). You can re-enable them with `{ prepare: true }`.

### Key Characteristics

1. **Tagged template literals**: Natural, safe syntax for parameterized queries
2. **Automatic preparation**: Queries are prepared by default, cached by signature
3. **Positional parameters**: Uses `$1`, `$2`, `$3` syntax (same as `pg`)
4. **Type inference**: Automatically infers PostgreSQL types from JavaScript values
5. **Statement caching**: Prepared statements cached by `types + string` signature
6. **Extended protocol**: Uses Parse/Bind/Execute for prepared statements
7. **Dynamic queries**: Rich helpers for building queries (`sql()` for columns, inserts, etc.)
8. **Simple protocol option**: Can use simple protocol with `.simple()` or `prepare: false`

### Comparison with `pg`

| Feature | `pg` | `postgres` |
|---------|------|------------|
| Query syntax | Explicit positional: `query(sql, [params])` | Tagged templates: `` sql`...` `` |
| Parameter format | Manual `$1, $2` in SQL string | Automatic from template literals |
| Prepared statements | Manual via `name` property | Automatic by default |
| Statement caching | By `name` property | By signature (types + SQL) |
| Raw SQL | Just pass SQL string | `sql.unsafe()` method |
| Dynamic building | Manual string concatenation | Built-in helpers (`sql()` function) |

### Sources

- [postgres - The Fastest full featured PostgreSQL client for Node.js](https://github.com/porsager/postgres)
- [Tagged template functions - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#Tagged_templates)
- Source code: `node_modules/postgres/src/index.js`, `node_modules/postgres/src/connection.js`, `node_modules/postgres/src/types.js`, `node_modules/postgres/src/query.js`
