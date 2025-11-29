# SQLite Client Protocol Documentation

> [!NOTE]
> The `sqlite` npm library is used as a reference client implementation.

---

## Table of Contents

1. [SQLite vs PostgreSQL Overview](#sqlite-vs-postgresql-overview)
2. [Parameter Placeholder Syntax](#parameter-placeholder-syntax)
3. [Prepared Statements](#prepared-statements)
4. [Parameter Binding](#parameter-binding)
5. [Type System](#type-system)
6. [Practical Examples](#practical-examples)
7. [Quick Reference](#quick-reference)

---

## Parameter Placeholder Syntax

### SQLite Requirement: Multiple Placeholder Styles

**SQLite supports FIVE different placeholder syntaxes:**

1. **`?` - Anonymous positional parameter**
   ```sql
   SELECT * FROM users WHERE id = ? AND status = ?
   ```
   - Parameters bound by position (1-indexed)
   - Most common style

2. **`?NNN` - Numbered positional parameter**
   ```sql
   SELECT * FROM users WHERE id = ?1 AND status = ?2
   ```
   - Explicit position numbers
   - Can reuse: `WHERE min > ?1 AND max < ?1`

3. **`:name` - Named parameter (colon)**
   ```sql
   SELECT * FROM users WHERE id = :id AND status = :status
   ```
   - Most readable
   - Common in SQLite documentation

4. **`@name` - Named parameter (at-sign)**
   ```sql
   SELECT * FROM users WHERE id = @id AND status = @status
   ```
   - Alternative named syntax

5. **`$name` - Named parameter (dollar)**
   ```sql
   SELECT * FROM users WHERE id = $id AND status = $status
   ```
   - TCL-style syntax (SQLite's origin language)

### Binding Syntax Differences

**Positional (`?`):**
```javascript
// SQLite expects 1-indexed array or individual arguments
db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['John', 'john@example.com'])
// Or
db.run('INSERT INTO users (name, email) VALUES (?, ?)', 'John', 'john@example.com')
```

**Named (`:name`, `@name`, `$name`):**
```javascript
// SQLite expects object with matching keys (include prefix)
db.run('INSERT INTO users (name, email) VALUES (:name, :email)', {
  ':name': 'John',
  ':email': 'john@example.com'
})
```

**Numbered (`?NNN`):**
```javascript
// SQLite expects object with numeric keys
db.run('INSERT INTO users (name, email) VALUES (?1, ?2)', {
  1: 'John',
  2: 'john@example.com'
})
```

### Comparison with PostgreSQL


---

## Prepared Statements

### SQLite's Prepared Statement Lifecycle

**Unlike PostgreSQL** (which has Parse → Bind → Execute sequence), SQLite uses a simpler model:

1. **Prepare** - Compiles SQL into bytecode (creates a Statement object)
2. **Bind** - Binds parameter values to the statement
3. **Step** - Executes one row at a time
4. **Reset** - Resets statement for reuse with new parameters
5. **Finalize** - Destroys the statement

### sqlite Package API

**Creating Prepared Statements:**

```javascript
// Method 1: Explicit preparation
const stmt = await db.prepare('SELECT * FROM users WHERE id = ?')
await stmt.bind(123)
const row = await stmt.get()
await stmt.finalize()

// Method 2: Implicit preparation (one-shot)
const row = await db.get('SELECT * FROM users WHERE id = ?', 123)
// Statement automatically prepared, executed, and finalized
```

### Statement Caching

**sqlite Package Behavior:**
- Explicit `prepare()` - statement persists until `finalize()` called
- Implicit queries (`get()`, `all()`, `run()`) - statement auto-finalized after execution

**For Reuse:**
```javascript
const stmt = await db.prepare('INSERT INTO users (name) VALUES (?)')

// Reuse same statement with different values
await stmt.run('Alice')
await stmt.run('Bob')
await stmt.run('Carol')

await stmt.finalize()  // Clean up when done
```

### Binding vs Execution

**Important distinction:**

```javascript
// Binding does NOT execute
const stmt = await db.prepare('SELECT * FROM users WHERE id = ?')
await stmt.bind(123)  // Only binds, doesn't execute

// Execution methods:
const row = await stmt.get()      // Execute, return one row
const rows = await stmt.all()     // Execute, return all rows
await stmt.run()                  // Execute, no rows returned
await stmt.each((err, row) => {}) // Execute, callback per row
```

---

## Parameter Binding

### Value Types and Handling

**SQLite's C API Binding Functions:**

SQLite provides specific binding functions for different types:

| SQLite Function | JavaScript Type | Example |
|----------------|-----------------|---------|
| `sqlite3_bind_null()` | `null`, `undefined` | `null` |
| `sqlite3_bind_int()` | `number` (integer) | `123` |
| `sqlite3_bind_double()` | `number` (float) | `123.45` |
| `sqlite3_bind_text()` | `string` | `'hello'` |
| `sqlite3_bind_blob()` | `Buffer`, `Uint8Array` | `Buffer.from([0xFF])` |

### sqlite Package Value Preparation

**The `sqlite` package passes values directly to `sqlite3`:**

```javascript
// node_modules/sqlite/build/Statement.js (simplified concept)
async bind(...params) {
  // If object provided (named parameters)
  if (typeof params[0] === 'object' && !Array.isArray(params[0])) {
    for (const [key, value] of Object.entries(params[0])) {
      this.stmt.bind(key, value)  // sqlite3 handles type detection
    }
  }
  // If array or varargs (positional parameters)
  else {
    const values = Array.isArray(params[0]) ? params[0] : params
    values.forEach((value, index) => {
      this.stmt.bind(index + 1, value)  // 1-indexed
    })
  }
}
```

### Type Coercion

**SQLite automatically handles type conversion:**

```javascript
// Number → Text (column is TEXT)
db.run('INSERT INTO users (name) VALUES (?)', 123)
// SQLite converts: 123 → "123"

// Text → Number (column is INTEGER)
db.run('INSERT INTO users (age) VALUES (?)', "25")
// SQLite converts: "25" → 25

// Blob → Text (if possible)
db.run('INSERT INTO users (data) VALUES (?)', Buffer.from('hello'))
// May convert to text if column affinity is TEXT
```

### NULL Handling

**NULL is straightforward in SQLite:**

```javascript
// Both null and undefined become SQLite NULL
db.run('INSERT INTO users (name, nickname) VALUES (?, ?)', 'John', null)
db.run('INSERT INTO users (name, nickname) VALUES (?, ?)', 'Jane', undefined)

// In named parameters
db.run('INSERT INTO users (name, nickname) VALUES (:name, :nick)', {
  ':name': 'Bob',
  ':nick': null  // SQLite NULL
})
```

### Binary Data (Blobs)

**SQLite BLOB handling:**

```javascript
const imageData = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])

// Bind as BLOB
db.run('INSERT INTO files (name, data) VALUES (?, ?)', 'image.jpg', imageData)

// sqlite3 automatically uses sqlite3_bind_blob() for Buffer objects
```

---

## Type System

### SQLite's Dynamic Typing (Type Affinity)

**Unlike PostgreSQL's strict type system, SQLite uses "type affinity":**

#### Storage Classes

SQLite has **five storage classes** (actual types stored on disk):

1. **NULL** - NULL value
2. **INTEGER** - Signed integer (1, 2, 3, 4, 6, or 8 bytes)
3. **REAL** - Floating point (8-byte IEEE)
4. **TEXT** - Text string (UTF-8, UTF-16BE, or UTF-16LE)
5. **BLOB** - Binary data (byte-for-byte)

#### Type Affinity (Column Types)

When you declare a column type, SQLite assigns an **affinity** (preferred type):

| Declared Type | Affinity | Accepts |
|--------------|----------|---------|
| `INTEGER`, `INT`, `BIGINT` | INTEGER | Stores as INTEGER if possible |
| `REAL`, `FLOAT`, `DOUBLE` | REAL | Stores as REAL |
| `TEXT`, `VARCHAR`, `CHAR` | TEXT | Stores as TEXT |
| `BLOB` | BLOB | Stores as BLOB |
| `NUMERIC`, `DECIMAL`, `BOOLEAN` | NUMERIC | Tries INTEGER, then REAL, then TEXT |

**Key Difference from PostgreSQL:**
- **PostgreSQL:** Enforces types, rejects incompatible values
- **SQLite:** Suggests types, converts when possible

```javascript
// PostgreSQL would reject this:
// db.query('INSERT INTO users (age) VALUES ($1)', ['not a number'])
// ERROR: invalid input syntax for type integer

// SQLite accepts and converts:
db.run('INSERT INTO users (age) VALUES (?)', 'not a number')
// Stores as TEXT (column affinity is INTEGER, but TEXT is allowed)
```

### JSON Handling

**SQLite has JSON functions (JSON1 extension), but no native JSON type:**

```javascript
const data = { userId: 123, action: 'login' }

// Must stringify manually (like pg)
db.run('INSERT INTO logs (data) VALUES (?)', JSON.stringify(data))

// Query with JSON functions
const row = await db.get(
  "SELECT json_extract(data, '$.userId') as userId FROM logs WHERE id = ?",
  1
)
```

**Comparison:**
- **PostgreSQL:** `json`/`jsonb` types with type OIDs, automatic parsing
- **SQLite:** Store as TEXT, use `json_*()` functions to query

### Arrays

**SQLite has NO native array type:**

```javascript
// PostgreSQL
client.query('SELECT * FROM users WHERE id = ANY($1)', [[1, 2, 3]])

// SQLite - must use different approaches:

// Option 1: Multiple OR conditions
db.all('SELECT * FROM users WHERE id = ? OR id = ? OR id = ?', 1, 2, 3)

// Option 2: IN clause with string building (be careful of SQL injection!)
const ids = [1, 2, 3]
const placeholders = ids.map(() => '?').join(',')
db.all(`SELECT * FROM users WHERE id IN (${placeholders})`, ...ids)

// Option 3: Store as JSON
db.run('INSERT INTO data (ids) VALUES (?)', JSON.stringify([1, 2, 3]))
```

---

## Practical Examples

### Example 1: Positional Parameters (`?`)

**Goal:** Insert data using positional parameters

**sqlite Implementation:**
```javascript
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const db = await open({
  filename: './database.db',
  driver: sqlite3.Database
})

// Manuka prepares:
const sql = 'INSERT INTO users (name, email) VALUES (?, ?)'
const params = ['John Doe', 'john@example.com']

// Hand off to sqlite:
const result = await db.run(sql, params)
// result = { lastID: 1, changes: 1, stmt: Statement }
```

**Alternative (varargs):**
```javascript
await db.run('INSERT INTO users (name, email) VALUES (?, ?)', 'Jane', 'jane@example.com')
```

### Example 2: Named Parameters (`:name`)

**Goal:** Use readable named parameters

**Manuka's Responsibility:**
- Use `:name` syntax in SQL
- Prepare object with matching keys (include `:` prefix)

**sqlite Implementation:**
```javascript
// Manuka prepares:
const sql = 'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)'
const params = {
  ':name': 'Alice',
  ':email': 'alice@example.com',
  ':age': 30
}

// Hand off to sqlite:
await db.run(sql, params)
```

**Query with named parameters:**
```javascript
const row = await db.get(
  'SELECT * FROM users WHERE email = :email',
  { ':email': 'alice@example.com' }
)
```

### Example 3: Numbered Parameters (`?NNN`)

**Goal:** Reuse same parameter multiple times

**sqlite Implementation:**
```javascript
// Manuka prepares:
const sql = 'SELECT * FROM items WHERE price > ?1 AND discount < ?1'
const params = { 1: 100 }

// Hand off to sqlite:
const rows = await db.all(sql, params)
// Returns items where price > 100 AND discount < 100
```

**Multiple parameters with reuse:**
```javascript
const sql = `
  INSERT INTO ranges (min1, max1, min2, max2)
  VALUES (?1, ?2, ?1, ?2)
`
await db.run(sql, { 1: 10, 2: 100 })
// Inserts: (10, 100, 10, 100)
```

### Example 4: Prepared Statement Reuse

**Goal:** Prepare once, execute many times

**Manuka's Responsibility:**
- Generate consistent SQL
- Prepare different parameter values for each execution

**sqlite Implementation:**
```javascript
// Prepare statement once
const stmt = await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)')

// Execute multiple times with different values
await stmt.run('Alice', 'alice@example.com')
await stmt.run('Bob', 'bob@example.com')
await stmt.run('Carol', 'carol@example.com')

// Clean up
await stmt.finalize()
```

**With parameter objects:**
```javascript
const stmt = await db.prepare('INSERT INTO users (name, email) VALUES (:name, :email)')

const users = [
  { ':name': 'Dave', ':email': 'dave@example.com' },
  { ':name': 'Eve', ':email': 'eve@example.com' }
]

for (const user of users) {
  await stmt.run(user)
}

await stmt.finalize()
```

### Example 5: NULL Values

**Goal:** Insert NULL into nullable columns

**sqlite Implementation:**
```javascript
// Both null and undefined work
await db.run(
  'INSERT INTO users (name, nickname, bio) VALUES (?, ?, ?)',
  'John', null, undefined
)

// With named parameters
await db.run(
  'INSERT INTO users (name, nickname) VALUES (:name, :nick)',
  { ':name': 'Jane', ':nick': null }
)
```

### Example 6: Binary Data (BLOBs)

**Goal:** Store binary file data

**sqlite Implementation:**
```javascript
const imageData = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])

await db.run(
  'INSERT INTO files (name, data, size) VALUES (?, ?, ?)',
  'photo.jpg',
  imageData,
  imageData.length
)

// Retrieve
const file = await db.get('SELECT data FROM files WHERE name = ?', 'photo.jpg')
// file.data is a Buffer
```

### Example 7: JSON Data

**Goal:** Store and query JSON data

**Manuka's Responsibility:**
- Serialize JavaScript objects to JSON strings
- Use SQLite JSON functions for queries

**sqlite Implementation:**
```javascript
const metadata = { userId: 123, action: 'login', timestamp: Date.now() }

// Store (must stringify)
await db.run(
  'INSERT INTO logs (event, metadata) VALUES (?, ?)',
  'user_login',
  JSON.stringify(metadata)  // Must serialize!
)

// Query with JSON functions
const rows = await db.all(`
  SELECT
    event,
    json_extract(metadata, '$.userId') as userId,
    json_extract(metadata, '$.action') as action
  FROM logs
  WHERE json_extract(metadata, '$.userId') = ?
`, 123)
```

### Example 8: Dynamic IN Clause

**Goal:** Query with variable number of values (no native array support)

**Manuka's Responsibility:**
- Generate appropriate number of placeholders
- Flatten values for binding

**sqlite Implementation:**
```javascript
const ids = [1, 2, 3, 5, 8]

// Manuka generates:
const placeholders = ids.map(() => '?').join(', ')
const sql = `SELECT * FROM users WHERE id IN (${placeholders})`

// Hand off to sqlite:
const rows = await db.all(sql, ...ids)
// Note: spread operator (...ids) to pass as individual arguments
```

**With parameter limits:**
```javascript
// SQLite has a default limit of 999 parameters
// For larger arrays, use chunking or temporary tables

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

const ids = Array.from({ length: 5000 }, (_, i) => i + 1)
const chunks = chunkArray(ids, 999)
const allRows = []

for (const chunk of chunks) {
  const placeholders = chunk.map(() => '?').join(', ')
  const rows = await db.all(
    `SELECT * FROM users WHERE id IN (${placeholders})`,
    ...chunk
  )
  allRows.push(...rows)
}
```

---

## Quick Reference

### Placeholder Syntax Summary

| Syntax | Example SQL | Binding Example | Use Case |
|--------|------------|-----------------|----------|
| `?` | `WHERE id = ?` | `[123]` or `123` | Simple positional |
| `?NNN` | `WHERE id = ?1` | `{ 1: 123 }` | Numbered positional, reuse |
| `:name` | `WHERE id = :id` | `{ ':id': 123 }` | Named parameters (common) |
| `@name` | `WHERE id = @id` | `{ '@id': 123 }` | Named parameters (alt) |
| `$name` | `WHERE id = $id` | `{ '$id': 123 }` | Named parameters (TCL-style) |

### Statement Methods

**sqlite Package API:**

| Method | Purpose | Returns |
|--------|---------|---------|
| `db.prepare(sql)` | Create prepared statement | `Statement` object |
| `stmt.bind(...params)` | Bind parameters | Promise (does not execute) |
| `stmt.run(...params)` | Execute, return summary | `{ lastID, changes, stmt }` |
| `stmt.get(...params)` | Execute, return first row | Single row object or `undefined` |
| `stmt.all(...params)` | Execute, return all rows | Array of row objects |
| `stmt.each(callback)` | Execute, callback per row | Promise resolving to row count |
| `stmt.reset()` | Reset statement for reuse | Promise |
| `stmt.finalize()` | Destroy statement | Promise |

**One-shot methods (implicit prepare/finalize):**

| Method | Purpose |
|--------|---------|
| `db.run(sql, ...params)` | Execute once, return summary |
| `db.get(sql, ...params)` | Execute once, return first row |
| `db.all(sql, ...params)` | Execute once, return all rows |
| `db.each(sql, ...params, callback)` | Execute once, callback per row |
| `db.exec(sql)` | Execute SQL (no parameters, no results) |

### Type Affinity and Storage Classes

**Storage Classes:**
- `NULL` - NULL value
- `INTEGER` - Signed integer
- `REAL` - 8-byte float
- `TEXT` - UTF-8/UTF-16 string
- `BLOB` - Binary data

**JavaScript to SQLite Type Mapping:**

| JavaScript Type | SQLite Binding Function | Storage Class |
|----------------|------------------------|---------------|
| `null`, `undefined` | `sqlite3_bind_null()` | NULL |
| `number` (integer) | `sqlite3_bind_int()` | INTEGER |
| `number` (float) | `sqlite3_bind_double()` | REAL |
| `string` | `sqlite3_bind_text()` | TEXT |
| `Buffer`, `Uint8Array` | `sqlite3_bind_blob()` | BLOB |
| `boolean` | Converted to INTEGER | INTEGER (0 or 1) |
| `object`, `array` | Must stringify | TEXT (if stringified) |

### Common Patterns

**Insert with auto-increment:**
```javascript
const result = await db.run('INSERT INTO users (name) VALUES (?)', 'Alice')
const newId = result.lastID  // Auto-generated ID
```

**Update and check affected rows:**
```javascript
const result = await db.run('UPDATE users SET name = ? WHERE id = ?', 'Bob', 5)
if (result.changes === 0) {
  // No rows updated
}
```

**Transaction:**
```javascript
await db.exec('BEGIN TRANSACTION')
try {
  await db.run('INSERT INTO users (name) VALUES (?)', 'Alice')
  await db.run('INSERT INTO orders (user_id) VALUES (?)', 1)
  await db.exec('COMMIT')
} catch (err) {
  await db.exec('ROLLBACK')
  throw err
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `SQLITE_RANGE` | Parameter index out of bounds | Check parameter count matches placeholders |
| `SQLITE_MISUSE` | Statement finalized or in use | Don't finalize until done; don't use concurrently |
| `SQLITE_ERROR: no such column` | Column name typo or doesn't exist | Check schema |
| `SQLITE_CONSTRAINT` | Constraint violation (UNIQUE, FK, etc.) | Check data validity |
| `SQLITE_TOOBIG` | Too many parameters (default limit: 999) | Chunk large arrays or use temp tables |

---

## Summary: Manuka's Responsibilities for SQLite

When preparing statements and parameters for SQLite, Manuka must:

### 1. SQL Statement Formatting

**Choose Placeholder Style:**
- **`?` for simple positional** - Most common, simplest
- **`:name` for named parameters** - More readable
- **`?NNN` for parameter reuse** - When same value used multiple times

**Examples:**
```javascript
// Positional
'INSERT INTO users (name, email) VALUES (?, ?)'

// Named
'INSERT INTO users (name, email) VALUES (:name, :email)'

// Numbered with reuse
'SELECT * FROM items WHERE price > ?1 AND discount < ?1'
```

### 2. Parameter Value Preparation

**Basic Types** (pass through directly):
- Numbers → INTEGER or REAL
- Strings → TEXT
- Buffers → BLOB
- `null`/`undefined` → NULL
- Booleans → INTEGER (0 or 1)

**Complex Types** (must handle explicitly):
- **Objects** → `JSON.stringify()` (store as TEXT)
- **Arrays** → Either:
  - `JSON.stringify()` (store as TEXT)
  - Multiple placeholders for IN clauses
- **Dates** → Convert to ISO string or Unix timestamp

**Critical Differences from PostgreSQL:**
- No native array type - must use `?` repeated or JSON
- No native JSON type - stringify and use JSON functions
- No need for PostgreSQL array syntax (`{el1,el2}`)

### 3. Parameter Binding Format

**Match binding format to placeholder style:**

```javascript
// Positional (?) - array or varargs
db.run('... WHERE id = ? AND name = ?', [123, 'John'])
// or
db.run('... WHERE id = ? AND name = ?', 123, 'John')

// Named (:name) - object with prefixed keys
db.run('... WHERE id = :id AND name = :name', {
  ':id': 123,
  ':name': 'John'
})

// Numbered (?NNN) - object with numeric keys
db.run('... WHERE id = ?1 AND name = ?2', {
  1: 123,
  2: 'John'
})
```

### 4. Type Considerations

**SQLite is flexible with types:**
- No strict type enforcement
- Automatic conversion when reasonable
- Type affinity suggests preferred type

**Manuka should:**
- Prepare values in their natural JavaScript type
- Let SQLite handle conversion
- Only stringify for JSON storage
- Be aware of type affinity for query optimization

### 5. Special Cases

**Arrays/IN clauses:**
```javascript
// Must generate dynamic placeholders
const ids = [1, 2, 3]
const placeholders = ids.map(() => '?').join(',')
const sql = `SELECT * FROM users WHERE id IN (${placeholders})`
await db.all(sql, ...ids)  // Spread array
```

**JSON data:**
```javascript
// Must stringify explicitly
const data = { userId: 123 }
await db.run('INSERT INTO logs (data) VALUES (?)', JSON.stringify(data))
```

**Large parameter lists:**
```javascript
// SQLite default limit: 999 parameters
// Chunk if needed, or use temporary tables
```

### 6. Hand-off to sqlite Library

Manuka prepares:
- SQL text with appropriate placeholders (`?`, `:name`, etc.)
- Parameter values (array, object, or varargs)
- Proper format for chosen placeholder style

Then hands off to sqlite package, which:
- Calls `sqlite3` C API
- Binds parameters using appropriate `sqlite3_bind_*()` functions
- Executes statement
- Returns results

> [!NOTE]
> Unlike PostgreSQL, there's no wire protocol or message sequence - just
> direct C API calls to the embedded SQLite engine.
