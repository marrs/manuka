# PostgreSQL Client Protocol Documentation

> [!NOTE]
> The `pg` npm library is used as a reference client implementation.

---

## Table of Contents

1. [Protocol Overview](#protocol-overview)
2. [Statement Preparation (Parse Message)](#statement-preparation-parse-message)
3. [Parameter Binding (Bind Message)](#parameter-binding-bind-message)
4. [Parameter Placeholders](#parameter-placeholders)
5. [Type System and Type OIDs](#type-system-and-type-oids)
6. [Prepared Statement Lifecycle](#prepared-statement-lifecycle)
7. [Practical Examples](#practical-examples)
8. [Quick Reference](#quick-reference)

---

## Protocol Overview

### PostgreSQL Requirement: Message-Based Communication

PostgreSQL uses a **binary, message-based protocol** over TCP/IP. All
communication consists of typed messages sent between client and server.

### Two Query Protocols

PostgreSQL defines two protocols for executing queries:

#### 1. Simple Query Protocol
- **PostgreSQL Requirement:** Single message containing complete SQL
- **Use Case:** Non-parameterized queries, multiple statements in one string
- **Message:** `Query` message with SQL text
- **Example:** `SELECT * FROM users`

**pg Implementation:**
```javascript
// node_modules/pg/lib/connection.js:154
query(text) {
  this._send(serialize.query(text))
}
```

#### 2. Extended Query Protocol
- **PostgreSQL Requirement:** Multi-message sequence for parameterized queries
- **Use Case:** Prepared statements, parameterized queries, cursors
- **Messages:** Parse → Bind → Describe → Execute → Sync
- **Example:** `SELECT * FROM users WHERE id = $1`

**When to Use Each:**
- **Simple:** No parameters, ad-hoc queries, multiple statements
- **Extended:** Parameterized queries, prepared statements, performance-critical queries

---

## Statement Preparation and Parameter Binding

The Extended Query Protocol is **PostgreSQL's standard** for prepared
statements. For Manuka's purposes, the two critical messages are:

1. **Parse** - Prepares a statement with parameter placeholders
2. **Bind** - Binds actual values to those parameters

```
Client → Server:  Parse (prepare SQL with placeholders $1, $2, ...)
Server → Client:  ParseComplete
Client → Server:  Bind (bind parameter values)
Server → Client:  BindComplete
```

After Bind, the client library (pg/postgres) handles execution and result
processing.

---

## Statement Preparation (Parse Message)

**PostgreSQL Requirement:**
- Message type: `'P'` (0x50)
- Statement name (string, can be empty for anonymous)
- SQL text with `$1, $2, $3, ...` placeholders
- Number of parameter types (int16)
- Type OID for each parameter (int32 each)

**Structure:**
```
Parse Message:
  Byte1('P')
  Int32(message length)
  String(statement name + \0)
  String(query string + \0)
  Int16(number of parameter types)
  For each parameter:
    Int32(type OID)
```

**pg Implementation:**
```javascript
// node_modules/pg/lib/connection.js:156-158
parse(query) {
  this._send(serialize.parse(query))
}

// Query object preparation - node_modules/pg/lib/query.js:209-217
prepare(connection) {
  if (!this.hasBeenParsed(connection)) {
    connection.parse({
      text: this.text,           // SQL with $1, $2 placeholders
      name: this.name,           // Statement name (optional)
      types: this.types,         // Array of type OIDs (optional)
    })
  }
  // ...continue with bind/execute
}
```

**Example:**
```javascript
// PostgreSQL receives:
// Statement name: 'getUserById'
// SQL text: 'SELECT * FROM users WHERE id = $1'
// Parameter types: [23]  (23 = int4 OID)

client.query({
  name: 'getUserById',
  text: 'SELECT * FROM users WHERE id = $1',
  values: [123],
  types: [23]  // Optional - PostgreSQL can infer
})
```

## Parameter Binding (Bind Message)

**PostgreSQL Requirement:**
- Message type: `'B'` (0x42)
- Portal name (string, usually empty)
- Statement name (string, must match Parse name)
- Number of parameter format codes (int16)
- Format codes (int16 each): 0=text, 1=binary
- Number of parameter values (int16)
- For each parameter value:
  - Length (int32): -1 for NULL, byte length otherwise
  - Value (bytes)

**Structure:**
```
Bind Message:
  Byte1('B')
  Int32(message length)
  String(portal name + \0)
  String(statement name + \0)
  Int16(number of format codes)
  For each format code:
    Int16(format: 0=text, 1=binary)
  Int16(number of parameters)
  For each parameter:
    Int32(value length, -1 for NULL)
    Byte[N](value)
  Int16(number of result formats)
  For each result format:
    Int16(format: 0=text, 1=binary)
```

> [!NOTE]
> The result format codes tell PostgreSQL what format to use when sending
> results back. For Manuka (which hands off to libraries), this is handled by
> the client library.

**pg Implementation:**
```javascript
// node_modules/pg/lib/connection.js:160-162
bind(config) {
  this._send(serialize.bind(config))
}

// Value preparation - node_modules/pg/lib/utils.js:50-79
const prepareValue = function (val, seen) {
  if (val == null) {
    return null  // PostgreSQL NULL
  }
  if (typeof val === 'object') {
    if (val instanceof Buffer) {
      return val  // Binary data
    }
    if (isDate(val)) {
      return dateToString(val)  // ISO8601 format
    }
    if (Array.isArray(val)) {
      return arrayString(val)  // PostgreSQL array syntax: {1,2,3}
    }
    return prepareObject(val, seen)
  }
  return val.toString()
}
```

**Example:**
```javascript
// PostgreSQL receives:
// Portal: ''
// Statement: 'getUserById'
// Format codes: [0] (text format)
// Parameter values: ['123']
// Result formats: [0] (text format)

client.query('SELECT * FROM users WHERE id = $1', [123])
// Value 123 converted to text '123' and sent
```

---

## Parameter Placeholders

### PostgreSQL Requirement: `$1, $2, $3, ...` Syntax

**PostgreSQL mandates** numbered parameter placeholders in SQL text sent via the Parse message.

```sql
-- PostgreSQL requires this syntax:
SELECT * FROM users WHERE id = $1 AND status = $2

-- NOT question marks (MySQL style):
SELECT * FROM users WHERE id = ? AND status = ?

-- NOT named parameters (Oracle style):
SELECT * FROM users WHERE id = :id AND status = :status
```

**Why Numbered Placeholders?**
- Allows same parameter to be referenced multiple times
- Clear ordering for the Bind message parameter array
- No ambiguity in parameter mapping

**Example:**
```sql
-- Same parameter used twice
SELECT * FROM items WHERE price > $1 AND discount < $1

-- Bind message provides one value, used in both positions
```

**Database Comparison:**

| Database | Placeholder Syntax | Wire Protocol |
|----------|-------------------|---------------|
| **PostgreSQL** | `$1, $2, $3` | Parse message with SQL text |
| MySQL | `?` | Positional markers |
| SQL Server | `@param1, @param2` | Named parameters |
| Oracle | `:param1, :param2` | Named bind variables |
| SQLite | `?` or `:name` | Multiple styles |

**pg Library Behavior:**
The `pg` library **passes SQL text directly** to PostgreSQL - no transformation of placeholders occurs. You must write SQL with `$1, $2, ...` syntax.

```javascript
// Correct - PostgreSQL requirement
client.query('SELECT * FROM users WHERE id = $1', [123])

// WRONG - PostgreSQL doesn't understand ?
client.query('SELECT * FROM users WHERE id = ?', [123])
// Error: syntax error at or near "?"
```

---

## Type System and Type OIDs

### PostgreSQL Requirement: Type OIDs

PostgreSQL uses **Type OIDs (Object Identifiers)** to identify data types. Every column, parameter, and value has a type OID from the `pg_catalog.pg_type` system catalog.

**In Protocol Messages:**
- **Parse Message:** Can optionally specify type OID for each parameter
- **Bind Message:** Values are serialized according to their type
- **RowDescription:** Server sends type OID for each result column

### Common Type OIDs

| PostgreSQL Type | OID | Description |
|----------------|-----|-------------|
| `bool` | 16 | Boolean |
| `bytea` | 17 | Binary data |
| `int8` (bigint) | 20 | 64-bit integer |
| `int2` (smallint) | 21 | 16-bit integer |
| `int4` (integer) | 23 | 32-bit integer |
| `text` | 25 | Variable-length text |
| `oid` | 26 | Object identifier |
| `float4` (real) | 700 | 32-bit float |
| `float8` (double) | 701 | 64-bit float |
| `varchar` | 1043 | Variable char with limit |
| `date` | 1082 | Date (no time) |
| `timestamp` | 1114 | Timestamp without timezone |
| `timestamptz` | 1184 | Timestamp with timezone |
| `json` | 114 | JSON data |
| `jsonb` | 3802 | Binary JSON data |
| `uuid` | 2950 | UUID |
| `int4[]` (array) | 1007 | Array of integers |
| `text[]` (array) | 1009 | Array of text |

**Special OID:**
- `0` = Unknown/unspecified - PostgreSQL infers from context

### Type Inference (OID 0)

**PostgreSQL Feature:** When type OID is 0 (unknown) in Parse message, PostgreSQL infers the type from:
1. Column type in the query (e.g., `WHERE int_col = $1` → $1 is integer)
2. Function signature (e.g., `age($1)` → $1 is timestamptz)
3. Explicit casts (e.g., `$1::integer`)

**pg Library Default:**
Most values sent with type OID 0, letting PostgreSQL infer:

```javascript
// pg sends type OID 0 for parameters
client.query('SELECT * FROM users WHERE id = $1', [123])
// PostgreSQL sees: id column is integer type
// PostgreSQL infers: $1 must be integer
// PostgreSQL casts: '123' (text) → 123 (integer)
```

**Explicit Type Specification:**
```javascript
// Optional - provide type OIDs in query config
client.query({
  text: 'SELECT * FROM users WHERE id = $1',
  values: [123],
  types: [23]  // 23 = int4 OID (explicit)
})
```

### When PostgreSQL Can Auto-Convert Types

PostgreSQL performs **implicit type casting** when the cast is defined and safe:

**Common Auto-Conversions:**
```sql
-- Text → Integer (if valid number)
SELECT * FROM users WHERE age = '25'  -- '25' → 25

-- Integer → Text (always works)
SELECT * FROM users WHERE name = 123  -- 123 → '123'

-- Timestamp → Date (truncates time)
SELECT * FROM events WHERE date = '2024-01-15 10:30:00'

-- Numeric → Float (precision change)
SELECT * FROM items WHERE price = 10  -- integer → numeric
```

**When Auto-Conversion Fails:**
```sql
-- Invalid text → integer
SELECT * FROM users WHERE age = 'abc'
-- ERROR: invalid input syntax for type integer: "abc"

-- Incompatible types
SELECT * FROM events WHERE date = 123
-- ERROR: operator does not exist: date = integer
```

### When Explicit Type OIDs Are Required

#### 1. Empty Arrays

**Problem:** No element to infer type from

```javascript
// PostgreSQL doesn't know array element type
client.query('SELECT * FROM users WHERE status = ANY($1)', [[]])
// ERROR: could not determine data type of parameter $1

// SOLUTION: Specify type OID explicitly
// (Would require custom type handling in pg)
```

#### 2. NULL Values

**Problem:** NULL has no inherent type

```javascript
// Ambiguous - what type of NULL?
client.query('INSERT INTO users (nickname) VALUES ($1)', [null])

// PostgreSQL infers from column:
// If nickname is TEXT → NULL::text works
// If column type unknown → may fail
```

**pg Handling:** Sends NULL as length -1 in Bind message; PostgreSQL infers from column.

#### 3. JSON vs JSONB

**Problem:** Both can store JSON data, but different OIDs

```javascript
// Plain object - how to serialize?
const data = { userId: 123 }

client.query('INSERT INTO logs (metadata) VALUES ($1)', [data])
// pg converts to string, PostgreSQL may fail or cast as text

// SOLUTION: Pre-serialize for JSON columns
client.query('INSERT INTO logs (metadata) VALUES ($1)', [JSON.stringify(data)])
```

#### 4. Custom Types

**Problem:** PostgreSQL custom types (enums, domains, composite) have unique OIDs

```sql
-- PostgreSQL custom enum
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'banned');
```

```javascript
// Must send as text, PostgreSQL casts to enum
client.query('UPDATE users SET status = $1 WHERE id = $2', ['active', 123])
// Works if PostgreSQL can cast text → user_status
```

#### 5. Binary Data (bytea)

**Problem:** Distinguish from text

```javascript
const buffer = Buffer.from([0xFF, 0xFE, 0xFD])

// pg sends as binary in Bind message
client.query('INSERT INTO files (data) VALUES ($1)', [buffer])
// Works - pg recognizes Buffer and uses appropriate format
```

### Binary vs Text Format

**PostgreSQL Requirement:** Bind message specifies format code for each parameter

**Format Codes:**
- `0` = Text format (human-readable, requires serialization)
- `1` = Binary format (native bytes, more efficient)

**pg Library Default:**
- **Text format** (format code 0) for most values
- **Binary format** (format code 1) for Buffer objects

```javascript
// Text format example
client.query('SELECT * FROM users WHERE id = $1', [123])
// Bind message: format=0, value='123' (text bytes)

// Binary format example
client.query('SELECT * FROM files WHERE id = $1', [Buffer.from([0x00, 0x01])])
// Bind message: format=1, value=[0x00, 0x01] (binary bytes)
```

**Serialization Requirements:**

| Type | Text Format | Binary Format |
|------|-------------|---------------|
| Integer | `'123'` | 4 bytes big-endian |
| Text | `'hello'` | UTF-8 bytes |
| Boolean | `'t'` or `'f'` | 1 byte: 0x01 or 0x00 |
| Timestamp | ISO8601 string | 8 bytes microseconds since 2000-01-01 |
| Array | `'{1,2,3}'` | Complex binary structure |
| NULL | Length -1 | Length -1 |

**pg Implementation:**
```javascript
// node_modules/pg/lib/utils.js:50-80
const prepareValue = function (val, seen) {
  // Converts JavaScript values to PostgreSQL text format

  if (val == null) {
    return null  // NULL
  }
  if (val instanceof Buffer) {
    return val  // Binary (format 1)
  }
  if (isDate(val)) {
    return dateToString(val)  // ISO8601
  }
  if (Array.isArray(val)) {
    return arrayString(val)  // '{elem1,elem2}'
  }
  return val.toString()  // Default: text
}
```

---

## Prepared Statement Lifecycle

### PostgreSQL Server-Side Behavior

**PostgreSQL Requirement:** Prepared statements exist per-session (per connection)

#### 1. Statement Preparation (Parse)

When PostgreSQL receives a Parse message:
1. **Parses SQL** and creates query plan
2. **Stores prepared statement** in session memory
3. **Associates with statement name** (or anonymous if empty)
4. **Validates parameter types** against usage in SQL
5. **Returns ParseComplete** to client

**Important:**
- Statement persists for the **entire connection session**
- **Different connections** have separate statement namespaces
- **Connection close** destroys all prepared statements

#### 2. Statement Caching

**Client-Side Caching (pg library):**
```javascript
// node_modules/pg/lib/connection.js:26
this.parsedStatements = {}  // { statementName → SQL text }

// Check if already parsed - node_modules/pg/lib/query.js:185-187
hasBeenParsed(connection) {
  return this.name && connection.parsedStatements[this.name]
}

// Skip Parse if cached - node_modules/pg/lib/query.js:209-217
prepare(connection) {
  if (!this.hasBeenParsed(connection)) {
    connection.parse({
      text: this.text,
      name: this.name,
      types: this.types,
    })
  }
  // Always send Bind and Execute
}
```

**Flow with Caching:**

**First Execution:**
```
Client → Parse('getUserById', 'SELECT * FROM users WHERE id = $1')
Client → Bind(values=[123])
Client → Execute
PostgreSQL: Creates statement, executes, returns results
pg: Stores in parsedStatements['getUserById']
```

**Subsequent Executions:**
```
Client → (Skip Parse - already cached)
Client → Bind(values=[456])
Client → Execute
PostgreSQL: Uses existing statement, executes, returns results
```

**Performance Benefit:**
- Skip parsing and query planning on subsequent executions
- Reduced network traffic (no Parse message)
- Faster execution (cached query plan)

#### 3. Statement Reuse

**PostgreSQL Behavior:**
- Same statement name can be reused with **same SQL text**
- Sending Parse with **different SQL** for same name **replaces** the statement

**pg Validation:**
```javascript
// node_modules/pg/lib/query.js:156-159
const previous = connection.parsedStatements[this.name]
if (this.text && previous && this.text !== previous) {
  return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`)
}
```

#### 4. Statement Cleanup

**PostgreSQL Provides:**
- `DEALLOCATE` SQL command to destroy prepared statement
- `DEALLOCATE ALL` to destroy all prepared statements
- Automatic cleanup on connection close

**pg Library:**
Does not automatically deallocate. Statements remain for connection lifetime.

```javascript
// Manual cleanup (if needed)
client.query('DEALLOCATE getUserById')
```

---

## Practical Examples

### Example 1: Simple Parameterized Query

**Goal:** Prepare and bind a basic SELECT with one parameter

**Manuka's Responsibility:**
1. Format SQL text with `$1` placeholder
2. Prepare parameter value for binding

**pg Implementation:**
```javascript
const { Client } = require('pg')
const client = new Client()
await client.connect()

// Manuka would prepare these:
const sql = 'SELECT * FROM users WHERE id = $1'  // ← PostgreSQL requires $1 syntax
const params = [123]                              // ← Values array

// Then hand off to pg:
const result = await client.query(sql, params)
```

**Wire Protocol Messages (relevant to Manuka):**

```
Client → Server:
  Parse:
    name: ''                    (anonymous statement)
    query: 'SELECT * FROM users WHERE id = $1'
    types: [0]                 (type OID 0 = unknown, PostgreSQL infers)

  Bind:
    portal: ''
    statement: ''
    formats: [0]               (text format)
    values: ['123']            (text representation of 123)

(pg handles: Describe, Execute, Sync, and result processing)
```

**Value Preparation:**
```javascript
// node_modules/pg/lib/utils.js - how pg prepares the value
prepareValue(123)  // → '123' (converted to string)
```

### Example 2: Named Prepared Statement with Caching

**Goal:** Prepare statement once, bind different values multiple times

**Manuka's Responsibility:**
- Generate SQL with consistent placeholders
- Prepare different parameter values for each execution
- Provide statement name for caching

**pg Implementation:**
```javascript
// First execution - sends Parse
const result1 = await client.query({
  name: 'get-user-by-id',                    // ← Statement name for caching
  text: 'SELECT * FROM users WHERE id = $1',
  values: [123]
})

// Second execution - skips Parse (cached on server)
const result2 = await client.query({
  name: 'get-user-by-id',                    // ← Same name
  text: 'SELECT * FROM users WHERE id = $1', // ← Same SQL
  values: [456]                              // ← Different values (Manuka prepares these)
})
```

**Key Insight:** PostgreSQL caches prepared statements per-connection. Once
parsed, only Bind messages are needed for subsequent executions with different
parameter values.

### Example 3: Array Parameter Binding

**Goal:** Prepare array values for PostgreSQL

**Manuka's Responsibility:**
- Convert JavaScript arrays to PostgreSQL array syntax: `{elem1,elem2,elem3}`
- Handle escaping and NULL values within arrays

**PostgreSQL Array Format:**
```javascript
['active', 'pending', 'approved']  →  '{active,pending,approved}'
[1, 2, 3]                         →  '{1,2,3}'
[null, 'value']                   →  '{NULL,value}'
[[1,2], [3,4]]                    →  '{{1,2},{3,4}}'  // Nested arrays
```

**pg Implementation:**
```javascript
// node_modules/pg/lib/utils.js:14-44
function arrayString(val) {
  let result = '{'
  for (let i = 0; i < val.length; i++) {
    if (i > 0) result = result + ','
    if (val[i] === null || typeof val[i] === 'undefined') {
      result = result + 'NULL'
    } else if (Array.isArray(val[i])) {
      result = result + arrayString(val[i])  // Recursive for nested arrays
    } else {
      result += escapeElement(prepareValue(val[i]))  // Escape quotes, backslashes
    }
  }
  result = result + '}'
  return result
}
```

**Usage:**
```javascript
const statuses = ['active', 'pending', 'approved']
client.query('SELECT * FROM users WHERE status = ANY($1::text[])', [statuses])
// Parameter bound as: '{active,pending,approved}'
```

### Example 4: JSON/JSONB Type Specification

**Goal:** Prepare JavaScript objects for JSON/JSONB columns

**Manuka's Responsibility:**
- Serialize JavaScript objects to JSON strings
- Ensure valid JSON format

**Critical Issue:** Plain objects must be stringified before binding.

```javascript
const metadata = { userId: 123, action: 'login' }

// WRONG - object.toString() gives '[object Object]'
client.query('INSERT INTO logs (data) VALUES ($1)', [metadata])
// Binds: '[object Object]' → PostgreSQL error

// CORRECT - pre-serialize to JSON
client.query('INSERT INTO logs (data) VALUES ($1)', [JSON.stringify(metadata)])
// Binds: '{"userId":123,"action":"login"}' → PostgreSQL parses as JSON/JSONB
```

**pg's Default Behavior:**
```javascript
// node_modules/pg/lib/utils.js:79
return val.toString()  // Object.prototype.toString() → '[object Object]'
```

Manuka must handle JSON serialization explicitly.

### Example 5: Handling NULL Values

**Goal:** Bind NULL values to parameters

**Manuka's Responsibility:**
- Recognize JavaScript `null` and `undefined` as NULL
- Ensure NULL is properly represented in Bind message

**pg Implementation:**
```javascript
// Both null and undefined become PostgreSQL NULL
client.query(
  'INSERT INTO users (name, nickname) VALUES ($1, $2)',
  ['John Doe', null]  // ← NULL for nickname
)
```

**How NULL is Sent:**
```
Bind Message:
  values: [
    { length: 8, value: 'John Doe' },
    { length: -1 }                   // ← length -1 indicates NULL
  ]
```

**Value Preparation:**
```javascript
// node_modules/pg/lib/utils.js:50-54
const prepareValue = function (val, seen) {
  if (val == null) {  // Checks both null and undefined
    return null
  }
  // ... other type handling
}
```

### Example 6: Binary Data (bytea)

**Goal:** Bind binary data (Buffer objects)

**Manuka's Responsibility:**
- Recognize Buffer objects as binary data
- Set format code 1 for binary parameters

**pg Implementation:**
```javascript
const fileData = Buffer.from([0xFF, 0xFE, 0xFD, 0xFC])

client.query(
  'INSERT INTO files (name, data) VALUES ($1, $2)',
  ['image.png', fileData]  // ← Buffer object
)
```

**How Binary Data is Sent:**
```
Bind Message:
  formats: [0, 1]                    // ← Text for $1, Binary for $2
  values: [
    'image.png',                     // ← Text format
    [0xFF, 0xFE, 0xFD, 0xFC]        // ← Raw binary bytes
  ]
```

**Value Preparation:**
```javascript
// node_modules/pg/lib/utils.js:56-58
if (val instanceof Buffer) {
  return val  // Pass Buffer through unchanged
}
```

PostgreSQL receives format code 1 and interprets the bytes as bytea.

---

## Quick Reference

### Protocol Message Types (Relevant to Manuka)

**Client → Server (Statement Preparation & Binding):**

| Message | Type Byte | Purpose |
|---------|-----------|---------|
| Parse | `'P'` (0x50) | Prepare statement with placeholders |
| Bind | `'B'` (0x42) | Bind parameter values to statement |
| Query | `'Q'` (0x51) | Simple query (no parameters) |

**Server Responses:**

| Message | Type Byte | Purpose |
|---------|-----------|---------|
| ParseComplete | `'1'` (0x31) | Parse successful |
| BindComplete | `'2'` (0x32) | Bind successful |
| ErrorResponse | `'E'` (0x45) | Error occurred |

> [!NOTE]
> Execute, Sync, Describe, and result-related messages (RowDescription,
> DataRow, etc.) are handled by the client library (pg/postgres) after Manuka
> hands off the prepared statement.

### Type OID Quick Reference

**Numeric Types:**
- `16` = bool
- `20` = int8 (bigint)
- `21` = int2 (smallint)
- `23` = int4 (integer)
- `700` = float4 (real)
- `701` = float8 (double precision)
- `1700` = numeric (decimal)

**Text Types:**
- `25` = text
- `1043` = varchar
- `18` = char
- `19` = name

**Date/Time Types:**
- `1082` = date
- `1083` = time
- `1114` = timestamp
- `1184` = timestamptz

**Binary/JSON:**
- `17` = bytea
- `114` = json
- `3802` = jsonb

**Arrays:**
- `1000` = bool[]
- `1005` = int2[]
- `1007` = int4[]
- `1009` = text[]
- `1016` = int8[]

**Special:**
- `0` = unknown (let PostgreSQL infer)
- `2950` = uuid

### Format Codes

| Code | Format | Usage |
|------|--------|-------|
| `0` | Text | Human-readable strings, requires serialization |
| `1` | Binary | Native binary format, more efficient |

### Common Error Messages

**PostgreSQL Protocol Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| `syntax error at or near "?"` | Used `?` instead of `$1` | Use PostgreSQL's `$N` syntax |
| `bind message supplies N parameters, but prepared statement requires M` | Parameter count mismatch | Match values array to placeholder count |
| `could not determine data type of parameter $N` | Type ambiguity | Add explicit cast: `$1::type` or provide type OID |
| `invalid input syntax for type X` | Type conversion failed | Ensure value matches column type |
| `prepared statement "name" does not exist` | Statement deallocated or connection changed | Re-prepare or check connection |

---

## Summary: Manuka's Responsibilities

When preparing statements and parameters for PostgreSQL client libraries
(pg/postgres), Manuka must:

### 1. SQL Statement Formatting
- **Use `$1, $2, $3, ...` placeholders** - PostgreSQL protocol requirement, not library convention
- Generate SQL with numbered parameters matching the values array order
- Maintain consistent placeholders for cached/named statements

### 2. Parameter Value Preparation

**Basic Types:**
- Numbers, strings, booleans → Convert to string representation
- `null` / `undefined` → NULL (length -1 in Bind message)
- Dates → ISO8601 format strings
- Buffers → Pass through for binary format

**Complex Types:**
- **Arrays** → PostgreSQL array syntax: `['a','b']` → `'{a,b}'`
  - Escape quotes and backslashes in elements
  - Handle NULL elements: `[null,'x']` → `'{NULL,x}'`
  - Support nested arrays: `[[1,2],[3,4]]` → `'{{1,2},{3,4}}'`

- **JSON/JSONB** → Must serialize explicitly: `JSON.stringify(obj)`
  - Plain objects become `'[object Object]'` if not stringified
  - PostgreSQL expects valid JSON string

**Critical Edge Cases:**
- Empty arrays → Type cannot be inferred; may need explicit type OID
- Plain objects → Will not serialize correctly without `JSON.stringify()`
- Large integers (> 2^53) → Consider BigInt for precision

### 3. Type Awareness
- Most types can use OID 0 (unknown) - PostgreSQL infers from context
- Explicit type OIDs needed for:
  - Empty arrays (no element to infer from)
  - NULL values in ambiguous contexts
  - JSON vs JSONB disambiguation

### 4. Format Codes
- Text format (0) - default for most values
- Binary format (1) - for Buffer objects (bytea)

### 5. Hand-off to Client Library
Manuka prepares:
- SQL text with `$1, $2, ...` placeholders
- Parameter values array (properly serialized)
- Optional: statement name for caching
- Optional: type OIDs for explicit typing

Then hands off to pg/postgres library, which handles:
- Parse message (statement preparation)
- Bind message (parameter binding)
- Execute, Sync, result processing
