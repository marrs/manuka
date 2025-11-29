# MySQL Client Protocol Documentation

> [!NOTE]
> The `mysql` npm library is used as a reference client implementation.

---

## Table of Contents

1. [MySQL Protocol Overview](#mysql-protocol-overview)
2. [Text Protocol vs Binary Protocol](#text-protocol-vs-binary-protocol)
3. [Parameter Placeholders](#parameter-placeholders)
4. [Value Escaping and Formatting](#value-escaping-and-formatting)
5. [Type System](#type-system)
6. [Practical Examples](#practical-examples)
7. [Quick Reference](#quick-reference)

---

## MySQL Protocol Overview

### Client-Server Architecture

MySQL is a **client-server database** that communicates over TCP/IP (or Unix
sockets) using the MySQL protocol.

**Protocol Flow:**
```
Client → MySQL Protocol (TCP/IP) → MySQL Server
         (Text or Binary Protocol)
```

### Two Distinct Protocols

**MySQL Server supports TWO protocols for query execution:**

1. **Text Protocol** (COM_QUERY)
   - SQL sent as complete text string
   - Values embedded/escaped in the SQL
   - What `mysql` npm package uses by default
   - No server-side statement caching

2. **Binary Protocol** (COM_STMT_PREPARE/EXECUTE)
   - True prepared statements
   - Parameters sent separately
   - Server-side statement caching
   - More efficient for repeated queries
   - Not commonly used by Node.js mysql library

---

## Text Protocol vs Binary Protocol

### Text Protocol (COM_QUERY)

**What the `mysql` npm package uses:**

```
Client:
  1. Format SQL with escaped values embedded
  2. Send COM_QUERY packet with complete SQL string

Server:
  1. Parse and execute SQL
  2. Return result set
```

**Example:**
```javascript
// Client prepares:
const sql = "SELECT * FROM users WHERE id = 123 AND name = 'John'"

// Server receives complete SQL string, executes it
```

**With Placeholders (mysql library):**
```javascript
// mysql library does client-side substitution:
connection.query('SELECT * FROM users WHERE id = ?', [123])

// Actually sends to server:
// "SELECT * FROM users WHERE id = 123"
```

**Key Point:** The `?` placeholder in the mysql npm package is **client-side string formatting**, NOT a MySQL server feature!

### Binary Protocol (COM_STMT)

**True MySQL prepared statements (rarely used in Node.js):**

```
Client:
  1. Send COM_STMT_PREPARE with SQL containing ? placeholders
  2. Server responds with statement ID
  3. Send COM_STMT_EXECUTE with statement ID + parameters
  4. Server executes with bound parameters

Server:
  1. Parses and caches statement plan
  2. Binds parameters
  3. Executes
  4. Returns results
```

**Packet Sequence:**
```
Client → Server:  COM_STMT_PREPARE ('SELECT * FROM users WHERE id = ?')
Server → Client:  Statement ID (e.g., 1), parameter count
Client → Server:  COM_STMT_EXECUTE (statement_id=1, params=[123])
Server → Client:  Result set
Client → Server:  COM_STMT_CLOSE (statement_id=1)
```

**MySQL Requirement:**
- Placeholders: `?` only (positional, no numbers, no names)
- Parameters sent in binary format with type information
- Server caches prepared statement plan per-connection

> [!NOTE]
> The `mysql` npm package does NOT use the binary protocol by default. There are
> other libraries like `mysql2` that support it.

---

## Parameter Placeholders

### MySQL Text Protocol (What mysql Package Uses)

**Placeholder: `?` (positional only)**

```sql
-- MySQL text protocol
SELECT * FROM users WHERE id = ? AND status = ?
```

**Binding: Array (positional order)**
```javascript
connection.query('SELECT * FROM users WHERE id = ? AND status = ?', [123, 'active'])
```

### Important Distinctions

**MySQL Text Protocol `?`:**
- **Client-side replacement** (mysql library)
- Values are escaped and substituted before sending to server
- Server receives complete SQL with no placeholders
- NOT real prepared statements

**MySQL Binary Protocol `?`:**
- **Server-side parameter markers**
- Parameters sent separately in binary format
- Server caches prepared statement
- True prepared statements

**Comparison:**

| Database | Placeholder | Server-Side? |
|----------|-------------|--------------|
| PostgreSQL `$1` | Yes | Yes (Parse/Bind) |
| SQLite `?` | Yes | Yes (C API bind) |
| MySQL `?` (binary) | Yes | Yes (COM_STMT) |
| MySQL `?` (text/mysql lib) | **No** | **Client-side** |

### No Named Parameters

**MySQL does NOT support named parameters** in either protocol:

```sql
-- NOT SUPPORTED by MySQL
SELECT * FROM users WHERE id = :id
SELECT * FROM users WHERE id = @id
SELECT * FROM users WHERE id = $id
```

**Only positional:**
```sql
-- MySQL binary protocol
SELECT * FROM users WHERE id = ? AND name = ?
```

---

## Value Escaping and Formatting

### MySQL Requirement: Escaping for SQL Injection Prevention

**When using text protocol**, values must be properly escaped to prevent SQL injection.

### mysql Package Escaping Rules

**The `mysql` library escapes values based on JavaScript type:**

| JavaScript Type | MySQL Escaping | Example Input | Example Output |
|----------------|----------------|---------------|----------------|
| `number` | No escaping | `123` | `123` |
| `boolean` | Convert to keyword | `true` | `true` / `false` |
| `Date` | ISO 8601 string | `new Date()` | `'2024-01-15 10:30:00'` |
| `Buffer` | Hex string | `Buffer.from([0xFF])` | `X'FF'` |
| `string` | Escape quotes/backslashes | `"O'Reilly"` | `'O\'Reilly'` |
| `null` / `undefined` | NULL keyword | `null` | `NULL` |
| `NaN` / `Infinity` | As-is (causes error) | `NaN` | `NaN` |
| `Array` | Comma-separated list | `[1, 2, 3]` | `1, 2, 3` |
| `Nested Array` | Grouped lists | `[[1,2], [3,4]]` | `(1, 2), (3, 4)` |
| `Object` | key=value pairs | `{a: 1, b: 2}` | `` `a` = 1, `b` = 2 `` |

### Escaping Functions

**mysql package provides:**

```javascript
// Escape values
mysql.escape(value)
connection.escape(value)

// Escape identifiers (table/column names)
mysql.escapeId(identifier)
connection.escapeId(identifier)

// Format with placeholders
mysql.format(sql, values)
```

### Examples

**Value escaping:**
```javascript
// Numbers - no quotes
connection.escape(123)           // 123
connection.escape(123.45)        // 123.45

// Strings - quoted and escaped
connection.escape("Hello")       // 'Hello'
connection.escape("O'Reilly")    // 'O\'Reilly'
connection.escape("Test\nLine")  // 'Test\\nLine'

// NULL
connection.escape(null)          // NULL
connection.escape(undefined)     // NULL

// Dates
connection.escape(new Date('2024-01-15'))  // '2024-01-15 00:00:00'

// Buffers (binary data)
connection.escape(Buffer.from([0xFF, 0xFE]))  // X'FFFE'

// Arrays (for IN clauses)
connection.escape([1, 2, 3])     // 1, 2, 3
connection.escape(['a', 'b'])    // 'a', 'b'

// Nested arrays (for bulk inserts)
connection.escape([[1, 'a'], [2, 'b']])  // (1, 'a'), (2, 'b')

// Objects (for SET clauses)
connection.escape({name: 'John', age: 30})  // `name` = 'John', `age` = 30
```

**Identifier escaping:**
```javascript
// Table/column names
connection.escapeId('users')           // `users`
connection.escapeId('user.name')       // `user`.`name`
connection.escapeId('table-name')      // `table-name`

// Preserve dots
connection.escapeId('column.2', true)  // `column.2`
```

### Placeholder Usage

**`?` for values:**
```javascript
connection.query('SELECT * FROM users WHERE id = ?', [123])
// Server receives: SELECT * FROM users WHERE id = 123

connection.query('INSERT INTO users SET ?', {name: 'John', age: 30})
// Server receives: INSERT INTO users SET `name` = 'John', `age` = 30
```

**`??` for identifiers:**
```javascript
connection.query('SELECT ?? FROM ??', ['username', 'users'])
// Server receives: SELECT `username` FROM `users`

const columns = ['id', 'name', 'email']
connection.query('SELECT ?? FROM users', [columns])
// Server receives: SELECT `id`, `name`, `email` FROM users
```

### Custom Formatting

**The mysql library allows custom placeholder formats:**

```javascript
connection.config.queryFormat = function (query, values) {
  if (!values) return query
  return query.replace(/\:(\w+)/g, function (txt, key) {
    if (values.hasOwnProperty(key)) {
      return this.escape(values[key])
    }
    return txt
  }.bind(this))
}

// Now can use :name syntax (not MySQL native, just client-side)
connection.query("UPDATE posts SET title = :title", { title: "Hello" })
// Server receives: UPDATE posts SET title = 'Hello'
```

---

## Type System

### MySQL Data Types

MySQL has a **strict type system** with many specific types:

**Numeric Types:**
- `TINYINT`, `SMALLINT`, `MEDIUMINT`, `INT`, `BIGINT`
- `FLOAT`, `DOUBLE`, `DECIMAL`
- `BIT`

**String Types:**
- `CHAR`, `VARCHAR`
- `TINYTEXT`, `TEXT`, `MEDIUMTEXT`, `LONGTEXT`
- `BINARY`, `VARBINARY`
- `TINYBLOB`, `BLOB`, `MEDIUMBLOB`, `LONGBLOB`
- `ENUM`, `SET`

**Date/Time Types:**
- `DATE`, `TIME`, `DATETIME`, `TIMESTAMP`, `YEAR`

**JSON Type:**
- `JSON` (native as of MySQL 5.7.8)

**Spatial Types:**
- `GEOMETRY`, `POINT`, `LINESTRING`, `POLYGON`, etc.

### Type Conversion and Coercion

**MySQL performs automatic type conversion when possible:**

```sql
-- String to number
SELECT * FROM users WHERE age = '25'  -- '25' converted to 25

-- Number to string
SELECT * FROM users WHERE name = 123  -- 123 converted to '123'

-- NULL handling
SELECT * FROM users WHERE nickname IS NULL
```

### JavaScript to MySQL Type Mapping

**mysql package converts JavaScript types to MySQL values:**

| JavaScript | MySQL Type | Notes |
|-----------|------------|-------|
| `number` (integer) | `INT`, `BIGINT` | May lose precision for large integers (> 2^53) |
| `number` (float) | `FLOAT`, `DOUBLE` | Precision depends on MySQL type |
| `string` | `VARCHAR`, `TEXT`, `CHAR` | UTF-8 encoded |
| `boolean` | `TINYINT(1)` | Stored as 0 or 1, or `true`/`false` keywords |
| `Date` | `DATETIME`, `TIMESTAMP` | Formatted as 'YYYY-MM-DD HH:MM:SS' |
| `Buffer` | `BLOB`, `BINARY` | Binary data |
| `null` | `NULL` | SQL NULL value |
| `Array` | Multiple rows (INSERT) | For bulk inserts |
| `Object` | Column-value pairs | For INSERT/UPDATE SET |

### JSON Handling

**MySQL 5.7.8+ has native JSON type:**

```javascript
const data = { userId: 123, action: 'login' }

// Must stringify
connection.query(
  'INSERT INTO logs (data) VALUES (?)',
  [JSON.stringify(data)]
)

// Query with JSON functions
connection.query(
  "SELECT JSON_EXTRACT(data, '$.userId') as userId FROM logs WHERE id = ?",
  [1]
)
```

**Comparison:**
- **PostgreSQL:** json/jsonb types with type OIDs
- **SQLite:** No native JSON type, JSON1 extension
- **MySQL:** Native JSON type (5.7.8+), JSON functions

### Arrays (No Native Support)

**MySQL has NO native array type:**

```javascript
// Must use workarounds:

// Option 1: Comma-separated values (not recommended)
connection.query('SELECT * FROM users WHERE id IN (?)', [[1, 2, 3]])
// Server receives: SELECT * FROM users WHERE id IN (1, 2, 3)

// Option 2: JSON array
connection.query(
  'INSERT INTO data (tags) VALUES (?)',
  [JSON.stringify(['tag1', 'tag2', 'tag3'])]
)

// Option 3: Separate table (normalized)
// CREATE TABLE user_tags (user_id INT, tag VARCHAR(50))
```

---

## Practical Examples

### Example 1: Simple Query with Positional Parameters

**Goal:** Execute SELECT with parameters

**Manuka's Responsibility:**
- Generate SQL with `?` placeholders
- Prepare values array in order

**mysql Implementation:**
```javascript
const mysql = require('mysql')
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'mydb'
})

// Manuka prepares:
const sql = 'SELECT * FROM users WHERE id = ? AND status = ?'
const params = [123, 'active']

// Hand off to mysql:
connection.query(sql, params, (error, results, fields) => {
  if (error) throw error
  console.log(results)
})
```

**What server receives:**
```sql
SELECT * FROM users WHERE id = 123 AND status = 'active'
```

### Example 2: INSERT with Object

**Goal:** Insert row using object notation

**Manuka's Responsibility:**
- Prepare object with column-value pairs
- Use `?` placeholder for object

**mysql Implementation:**
```javascript
// Manuka prepares:
const sql = 'INSERT INTO users SET ?'
const userData = {
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  created_at: new Date()
}

// Hand off to mysql:
connection.query(sql, userData, (error, results) => {
  if (error) throw error
  console.log('Inserted ID:', results.insertId)
})
```

**What server receives:**
```sql
INSERT INTO users SET `name` = 'John Doe', `email` = 'john@example.com', `age` = 30, `created_at` = '2024-01-15 10:30:00'
```

### Example 3: UPDATE with Multiple Parameters

**Goal:** Update rows with WHERE clause

**mysql Implementation:**
```javascript
// Manuka prepares:
const sql = 'UPDATE users SET name = ?, email = ? WHERE id = ?'
const params = ['Jane Doe', 'jane@example.com', 123]

// Hand off to mysql:
connection.query(sql, params, (error, results) => {
  if (error) throw error
  console.log('Rows changed:', results.changedRows)
  console.log('Rows affected:', results.affectedRows)
})
```

**What server receives:**
```sql
UPDATE users SET name = 'Jane Doe', email = 'jane@example.com' WHERE id = 123
```

### Example 4: IN Clause with Array

**Goal:** Query with multiple values in IN clause

**Manuka's Responsibility:**
- Prepare array of values
- Use single `?` placeholder for array

**mysql Implementation:**
```javascript
const ids = [1, 2, 3, 5, 8]

// Manuka prepares:
const sql = 'SELECT * FROM users WHERE id IN (?)'
const params = [ids]  // Note: array wrapped in array

// Hand off to mysql:
connection.query(sql, params, (error, results) => {
  if (error) throw error
  console.log(results)
})
```

**What server receives:**
```sql
SELECT * FROM users WHERE id IN (1, 2, 3, 5, 8)
```

### Example 5: Bulk INSERT

**Goal:** Insert multiple rows in one query

**Manuka's Responsibility:**
- Prepare nested array of rows
- Use VALUES syntax

**mysql Implementation:**
```javascript
// Manuka prepares:
const sql = 'INSERT INTO users (name, email) VALUES ?'
const values = [
  ['Alice', 'alice@example.com'],
  ['Bob', 'bob@example.com'],
  ['Carol', 'carol@example.com']
]
const params = [values]  // Note: nested array wrapped in array

// Hand off to mysql:
connection.query(sql, params, (error, results) => {
  if (error) throw error
  console.log('Inserted rows:', results.affectedRows)
})
```

**What server receives:**
```sql
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com'), ('Bob', 'bob@example.com'), ('Carol', 'carol@example.com')
```

### Example 6: Escaping Identifiers

**Goal:** Use dynamic table/column names safely

**Manuka's Responsibility:**
- Use `??` for identifier placeholders
- Prepare identifiers in values array

**mysql Implementation:**
```javascript
const tableName = 'users'
const columns = ['id', 'name', 'email']
const userId = 123

// Manuka prepares:
const sql = 'SELECT ?? FROM ?? WHERE id = ?'
const params = [columns, tableName, userId]

// Hand off to mysql:
connection.query(sql, params, (error, results) => {
  if (error) throw error
  console.log(results)
})
```

**What server receives:**
```sql
SELECT `id`, `name`, `email` FROM `users` WHERE id = 123
```

### Example 7: NULL Values

**Goal:** Insert NULL into nullable column

**mysql Implementation:**
```javascript
// Manuka prepares:
const sql = 'INSERT INTO users (name, nickname, bio) VALUES (?, ?, ?)'
const params = ['John Doe', null, undefined]

// Hand off to mysql:
connection.query(sql, params, (error, results) => {
  if (error) throw error
})
```

**What server receives:**
```sql
INSERT INTO users (name, nickname, bio) VALUES ('John Doe', NULL, NULL)
```

### Example 8: JSON Data

**Goal:** Store JSON in JSON column (MySQL 5.7.8+)

**Manuka's Responsibility:**
- Serialize JavaScript objects to JSON strings

**mysql Implementation:**
```javascript
const metadata = {
  userId: 123,
  action: 'login',
  timestamp: Date.now(),
  ip: '192.168.1.1'
}

// Manuka prepares:
const sql = 'INSERT INTO audit_logs (event_type, metadata) VALUES (?, ?)'
const params = ['user_login', JSON.stringify(metadata)]

// Hand off to mysql:
connection.query(sql, params, (error, results) => {
  if (error) throw error
})
```

**What server receives:**
```sql
INSERT INTO audit_logs (event_type, metadata) VALUES ('user_login', '{"userId":123,"action":"login",...}')
```

**Querying JSON:**
```javascript
connection.query(
  "SELECT JSON_EXTRACT(metadata, '$.userId') as userId FROM audit_logs WHERE id = ?",
  [1],
  (error, results) => {
    console.log(results[0].userId)
  }
)
```

### Example 9: Binary Data (BLOBs)

**Goal:** Store binary file data

**mysql Implementation:**
```javascript
const imageData = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...])

// Manuka prepares:
const sql = 'INSERT INTO files (filename, data, size) VALUES (?, ?, ?)'
const params = ['photo.jpg', imageData, imageData.length]

// Hand off to mysql:
connection.query(sql, params, (error, results) => {
  if (error) throw error
})
```

**What server receives:**
```sql
INSERT INTO files (filename, data, size) VALUES ('photo.jpg', X'FFD8FFE0...', 12345)
```

### Example 10: Transactions

**Goal:** Execute multiple queries atomically

**mysql Implementation:**
```javascript
connection.beginTransaction((err) => {
  if (err) throw err

  connection.query('INSERT INTO users SET ?', {name: 'Alice'}, (error, results) => {
    if (error) {
      return connection.rollback(() => { throw error })
    }

    const userId = results.insertId

    connection.query('INSERT INTO profiles SET ?', {user_id: userId, bio: 'Hello'}, (error, results) => {
      if (error) {
        return connection.rollback(() => { throw error })
      }

      connection.commit((err) => {
        if (err) {
          return connection.rollback(() => { throw err })
        }
        console.log('Transaction complete')
      })
    })
  })
})
```

---

## Quick Reference

### Placeholder Syntax

| Placeholder | Purpose | Example |
|-------------|---------|---------|
| `?` | Value placeholder | `WHERE id = ?` |
| `??` | Identifier placeholder | `SELECT ?? FROM ??` |

**Binding:**
```javascript
// Values in order
query('... WHERE a = ? AND b = ?', [val1, val2])

// Single value
query('... WHERE id = ?', [123])

// Array for IN clause
query('... WHERE id IN (?)', [[1, 2, 3]])

// Object for SET
query('INSERT INTO table SET ?', {col1: val1, col2: val2})

// Identifiers
query('SELECT ?? FROM ??', ['column', 'table'])
```

### Escaping Reference

**Value Escaping:**
```javascript
mysql.escape(value)        // Escape any value
mysql.format(sql, values)  // Format SQL with placeholders
```

**Identifier Escaping:**
```javascript
mysql.escapeId(identifier)  // Escape table/column name
```

**Type-Specific Escaping:**

| Type | Input | Output |
|------|-------|--------|
| Number | `123` | `123` |
| String | `"O'Reilly"` | `'O\'Reilly'` |
| Boolean | `true` | `true` |
| Date | `new Date('2024-01-15')` | `'2024-01-15 00:00:00'` |
| Buffer | `Buffer.from([0xFF])` | `X'FF'` |
| null/undefined | `null` | `NULL` |
| Array | `[1, 2, 3]` | `1, 2, 3` |
| Nested Array | `[[1, 2], [3, 4]]` | `(1, 2), (3, 4)` |
| Object | `{a: 1, b: 'x'}` | `` `a` = 1, `b` = 'x' `` |

### Query Result Properties

**For SELECT:**
```javascript
results          // Array of row objects
fields           // Array of field metadata
results[0].col   // Access column value
```

**For INSERT:**
```javascript
results.insertId      // Auto-increment ID of inserted row
results.affectedRows  // Number of rows inserted
```

**For UPDATE/DELETE:**
```javascript
results.affectedRows  // Number of rows matched
results.changedRows   // Number of rows actually changed
```

### Common Patterns

**Conditional WHERE:**
```javascript
const conditions = []
const params = []

if (name) {
  conditions.push('name = ?')
  params.push(name)
}
if (age) {
  conditions.push('age > ?')
  params.push(age)
}

const sql = 'SELECT * FROM users' +
  (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '')

connection.query(sql, params, callback)
```

**Pagination:**
```javascript
const page = 2
const perPage = 20
const offset = (page - 1) * perPage

connection.query(
  'SELECT * FROM users LIMIT ? OFFSET ?',
  [perPage, offset],
  callback
)
```

**Dynamic Sorting:**
```javascript
const sortColumn = 'created_at'
const sortOrder = 'DESC'

connection.query(
  'SELECT * FROM users ORDER BY ?? ' + sortOrder,
  [sortColumn],
  callback
)
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `ER_ACCESS_DENIED_ERROR` | Wrong credentials | Check username/password |
| `ER_BAD_DB_ERROR` | Database doesn't exist | Check database name or CREATE DATABASE |
| `ER_DUP_ENTRY` | Duplicate unique key | Check for existing records |
| `ER_NO_SUCH_TABLE` | Table doesn't exist | Check table name or CREATE TABLE |
| `ER_PARSE_ERROR` | SQL syntax error | Check SQL syntax |
| `ER_BAD_FIELD_ERROR` | Unknown column | Check column names |
| `PROTOCOL_CONNECTION_LOST` | Connection closed | Implement reconnection logic |
| `ER_TOO_MANY_USER_CONNECTIONS` | Connection limit reached | Use connection pooling |

---

## Summary: Manuka's Responsibilities for MySQL

When preparing statements and parameters for MySQL (via mysql package), Manuka must:

### 1. SQL Statement Formatting

**Use `?` for value placeholders:**
```javascript
'SELECT * FROM users WHERE id = ? AND status = ?'
'INSERT INTO users (name, email) VALUES (?, ?)'
'UPDATE users SET name = ?, email = ? WHERE id = ?'
```

**Use `??` for identifier placeholders:**
```javascript
'SELECT ?? FROM ??'  // For dynamic column/table names
```

**Important:** MySQL only supports `?` (not numbered like `?1`, not named like `:name`)

### 2. Parameter Value Preparation

**Basic Types** (pass through):
- Numbers → No escaping needed (library handles it)
- Strings → Library will escape quotes/backslashes
- Booleans → Converted to `true`/`false` keywords
- Dates → Converted to 'YYYY-MM-DD HH:MM:SS' format
- Buffers → Converted to hex strings `X'...'`
- `null`/`undefined` → Converted to `NULL`

**Complex Types:**
- **Objects** → For `SET ?` syntax: `{col1: val1, col2: val2}`
- **Arrays** → For `IN (?)` syntax: `[1, 2, 3]`
- **Nested Arrays** → For bulk INSERT: `[[1, 'a'], [2, 'b']]`
- **JSON** → Must use `JSON.stringify()`

**Critical:** mysql package does client-side escaping, so proper value formatting is essential for security.

### 3. Parameter Binding Format

**Positional array (most common):**
```javascript
query('SELECT * FROM users WHERE id = ? AND name = ?', [123, 'John'])
```

**Single value:**
```javascript
query('SELECT * FROM users WHERE id = ?', [123])
// or
query('SELECT * FROM users WHERE id = ?', 123)
```

**Object for SET:**
```javascript
query('INSERT INTO users SET ?', {name: 'John', age: 30})
query('UPDATE users SET ? WHERE id = ?', [{name: 'John'}, 123])
```

**Array for IN:**
```javascript
query('SELECT * FROM users WHERE id IN (?)', [[1, 2, 3]])
```

### 4. Type Considerations

**MySQL has strict typing but performs automatic conversion:**
- String '123' → INT 123 (when column is INT)
- Number 123 → VARCHAR '123' (when column is VARCHAR)
- Date objects → DATETIME strings
- Buffers → BLOB binary data

**Manuka should:**
- Provide values in their natural JavaScript type
- Use `JSON.stringify()` for JSON columns
- Use `Buffer` for binary data
- Let the library handle escaping

### 5. Special Cases

**JSON data:**
```javascript
// MySQL 5.7.8+ has native JSON type
const data = { userId: 123 }
query('INSERT INTO logs (data) VALUES (?)', [JSON.stringify(data)])
```

**Arrays (IN clause):**
```javascript
const ids = [1, 2, 3]
query('SELECT * FROM users WHERE id IN (?)', [ids])
// mysql library converts array to: 1, 2, 3
```

**Bulk inserts:**
```javascript
const rows = [['Alice', 'alice@ex.com'], ['Bob', 'bob@ex.com']]
query('INSERT INTO users (name, email) VALUES ?', [rows])
// mysql library converts to: ('Alice', 'alice@ex.com'), ('Bob', 'bob@ex.com')
```

**Identifiers (dynamic table/column names):**
```javascript
const table = 'users'
const columns = ['id', 'name']
query('SELECT ?? FROM ??', [columns, table])
// mysql library escapes to: `id`, `name` FROM `users`
```

### 6. Hand-off to mysql Library

Manuka prepares:
- SQL text with `?` and/or `??` placeholders
- Parameter values (array, single value, or object)
- Proper format for chosen syntax

Then hands off to mysql package, which:
- **Escapes values** using `mysql.escape()`
- **Escapes identifiers** using `mysql.escapeId()`
- **Replaces placeholders** with escaped values
- **Sends complete SQL** to MySQL server via COM_QUERY (text protocol)

> [!NOTE]
> Unlike PostgreSQL (Parse/Bind/Execute) and SQLite (sqlite3_prepare/bind), the
> mysql package does **client-side formatting**. The MySQL server receives
> complete SQL text with values already embedded - NOT a prepared statement with
> separate parameters (unless using the binary protocol with a different library
> like mysql2).
