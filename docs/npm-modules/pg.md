# PostgreSQL Node.js Interface: `pg` (node-postgres)

## How `pg` Receives and Handles Prepared Statements

Based on studying the library code and documentation, here's how `pg` receives and handles prepared statements.

### Query Method Signature

The `client.query()` method accepts parameters in several ways:

```typescript
// From lib/client.js:520
query(config, values, callback)
```

### Three Usage Patterns

#### 1. String SQL + Values Array (most common)
```javascript
client.query('SELECT * FROM users WHERE id = $1', [123])
```

#### 2. Query Config Object
```javascript
client.query({
  text: 'SELECT * FROM users WHERE id = $1 AND status = $2',
  values: [123, 'active']
})
```

#### 3. Named Prepared Statement
```javascript
client.query({
  name: 'fetch-user',
  text: 'SELECT * FROM users WHERE id = $1',
  values: [123]
})
```

### Parameter Placeholder Format

PostgreSQL uses **positional placeholders**: `$1`, `$2`, `$3`, etc.

```javascript
const text = 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *'
const values = ['brianc', '[email protected]']
const res = await client.query(text, values)
```

### How It Works Internally

From `lib/query.js`:

#### 1. Query Normalisation (line 12)
```javascript
config = utils.normalizeQueryConfig(config, values, callback)
```

Converts string queries to config objects and merges parameters.

#### 2. Preparation Decision (line 35-58)
```javascript
requiresPreparation() {
  if (this.queryMode === 'extended') return true
  if (this.name) return true  // Named queries are always prepared
  if (this.rows) return true
  if (!this.text || !this.values) return false
  return this.values.length > 0  // Prepare if values exist
}
```

Queries with values are automatically prepared using the extended query protocol.

#### 3. Extended Query Protocol (line 209-241)
When preparation is required, pg uses PostgreSQL's extended query protocol:
- **Parse**: Sends the SQL with placeholders
- **Bind**: Binds the actual values to placeholders
- **Describe**: Gets result metadata
- **Execute**: Runs the query

#### 4. Value Preparation (utils.js:50-80)
Converts JavaScript types to PostgreSQL wire protocol format:
- `null` and `undefined` → `NULL`
- `Buffer` → binary data
- `Date` → ISO 8601 timestamp
- `Array` → PostgreSQL array literal
- Custom types via `toPostgres()` method
- Primitives → string representation

### Named Prepared Statements

Named statements are cached and reused:

```javascript
// First time - prepares and caches
await client.query({
  name: 'fetch-user',
  text: 'SELECT * FROM users WHERE id = $1',
  values: [123]
})

// Subsequent calls - reuses prepared statement
await client.query({
  name: 'fetch-user',
  values: [456]
})
```

From line 156-159:
```javascript
const previous = connection.parsedStatements[this.name]
if (this.text && previous && this.text !== previous) {
  return new Error(`Prepared statements must be unique`)
}
```

Each named statement must have the same SQL text on subsequent uses.

### Query Config Options

From the Query constructor (lib/query.js:9-33):

```typescript
{
  text: string,           // SQL query string
  values: any[],          // Parameter values
  name: string,           // Named prepared statement identifier
  queryMode: string,      // 'extended' or 'simple'
  binary: boolean,        // Use binary result format
  portal: string,         // Portal name for extended protocol
  rows: number,           // Max rows per fetch
  rowMode: string,        // Result row format
  types: object,          // Custom type parsers
  callback: function      // Result callback
}
```

### Key Characteristics

1. **Automatic preparation**: Queries with values are automatically prepared
2. **Positional parameters**: Uses `$1`, `$2`, `$3` syntax
3. **Type safety**: Automatically handles type conversion
4. **Caching**: Named statements are cached and reused
5. **Wire protocol**: Uses PostgreSQL extended query protocol for prepared statements
6. **Promise-based**: Returns promises when no callback provided

### Sources

- [Queries – node-postgres](https://node-postgres.com/features/queries)
- [Node Postgres - PostgreSQL Integration in JavaScript](https://zetcode.com/javascript/nodepostgres/)
- [FAQ · brianc/node-postgres Wiki](https://github.com/brianc/node-postgres/wiki/FAQ)
- Source code: `node_modules/pg/lib/client.js`, `node_modules/pg/lib/query.js`, `node_modules/pg/lib/utils.js`
