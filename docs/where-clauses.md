# WHERE Clause Examples

This document demonstrates complex WHERE clauses with nested predicates,
showing both the AST structure, the pretty-formatted SQL output, and the
intermediate token array used to generate it.

The token array is generated internally and represents an intermediate
language for describing the basic formatting of the formatted SQL.
In it:
- each line is represented by a tuple (except in the case of nested predicates
  which have further rules)
- the tuple separates the parts of the statement into left-hand-side and right-
  hand-side components.  This is needed for pretty printing.

## Example 1: E-commerce Order Search

**AST:**
```typescript
{
  select: ['order_id', 'customer_name', 'total', 'status'],
  from: ['orders'],
  where: ['and',
    ['=', 'status', 'pending'],
    ['or',
      ['>=', 'total', '100'],
      ['=', 'priority_customer', 'true']
    ],
    ['>', 'created_at', '2025-01-01'],
    ['or',
      ['=', 'shipping_country', 'US'],
      ['=', 'shipping_country', 'CA'],
      ['=', 'shipping_country', 'MX']
    ]
  ]
}
```

**Pretty-formatted SQL:**
```sql
  SELECT order_id, customer_name, total, status
    FROM orders
   WHERE status = pending
     AND (total >= 100 OR priority_customer = true)
     AND created_at > 2025-01-01
     AND (shipping_country = US
       OR shipping_country = CA
       OR shipping_country = MX
     )
```

**Token Array (Lightweight Tokenizer):**
```typescript
[
  ['SELECT', 'order_id, customer_name, total, status'],
  ['FROM', 'orders'],
  ['WHERE', 'status = pending'],
  ['AND', [
    ['', 'total >= 100'],
    ['OR', 'priority_customer = true']
  ]],
  ['AND', 'created_at > 2025-01-01'],
  ['AND', [
    ['', 'shipping_country = US'],
    ['OR', 'shipping_country = CA'],
    ['OR', 'shipping_country = MX']
  ]]
]
```

## Example 2: User Access Control

**AST:**
```typescript
{
  select: ['user_id', 'username', 'role'],
  from: ['users'],
  where: ['and',
    ['=', 'active', 'true'],
    ['or',
      ['and',
        ['=', 'role', 'admin'],
        ['=', 'department', 'IT']
      ],
      ['and',
        ['=', 'role', 'manager'],
        ['or',
          ['=', 'department', 'Sales'],
          ['=', 'department', 'Marketing']
        ]
      ],
      ['=', 'user_id', '1']
    ],
    ['<>', 'status', 'suspended']
  ]
}
```

**Pretty-formatted SQL:**
```sql
  SELECT user_id, username, role
    FROM users
   WHERE active = true
     AND ( role = admin
       AND department = IT
        OR role = manager
       AND (department = Sales OR department = Marketing)
        OR user_id = 1)
     AND status <> suspended
```

**Token Array (Lightweight Tokenizer):**
```typescript
[
  ['SELECT', 'user_id, username, role'],
  ['FROM', 'users'],
  ['WHERE', 'active = true'],
  ['AND', [
    ['', 'role = admin'],
    ['AND', 'department = IT'],
    ['OR', 'role = manager'],
    ['AND', '(department = Sales OR department = Marketing)'],
    ['OR', 'user_id = 1']
  ]],
  ['AND', 'status <> suspended']
]
```

## Example 3: Product Inventory Search

**AST:**
```typescript
{
  select: ['product_id', 'name', 'stock', 'price'],
  from: ['products'],
  where: ['or',
    ['and',
      ['<', 'stock', '10'],
      ['>', 'price', '50'],
      ['=', 'category', 'electronics']
    ],
    ['and',
      ['=', 'stock', '0'],
      ['=', 'reorder_pending', 'false']
    ],
    ['and',
      ['like', 'name', '%clearance%'],
      ['<', 'price', '20']
    ]
  ]
}
```

**Pretty-formatted SQL:**
```sql
  SELECT product_id, name, stock, price
    FROM products
   WHERE stock < 10
     AND price > 50
     AND category = electronics
      OR stock = 0
     AND reorder_pending = false
      OR name LIKE %clearance%
     AND price < 20
```

**Token Array (Lightweight Tokenizer):**
```typescript
[
  ['SELECT', 'product_id, name, stock, price'],
  ['FROM', 'products'],
  ['WHERE', 'stock < 10'],
  ['AND', 'price > 50'],
  ['AND', 'category = electronics'],
  ['OR', 'stock = 0'],
  ['AND', 'reorder_pending = false'],
  ['OR', 'name LIKE %clearance%'],
  ['AND', 'price < 20']
]
```

## Specifications

### Operator Precedence & Parenthesization

The tokenizer handles operator precedence to ensure correct parenthesization:

- **OR nested inside AND** gets parentheses:
  ```sql
  active = true AND (role = admin OR role = mod)
  ```

- **AND nested inside OR** does NOT get parentheses (AND has higher precedence):
  ```sql
  role = admin AND dept = IT OR user_id = 1
  ```

- **Multiple nested levels** work correctly:
  ```sql
  AND (role = manager AND (dept = Sales OR dept = Marketing))
  ```

### Top-Level Splitting

Top-level logical operators are split into separate tokens for pretty formatting:

- **Top-level AND predicates** are split into separate lines, each getting its own `AND` keyword
- **Top-level OR predicates** are split into separate lines, each getting its own `OR` keyword
- The first predicate uses `WHERE`, subsequent predicates use `AND`/`OR`

This splitting enables the pretty formatter to right-align each logical operator on its own line.

### Nested Predicates

Nested predicates use a structured nested array format:

```typescript
['AND', [
  ['', 'total >= 100'],
  ['OR', 'priority_customer = true']
]]
```

The nested array structure:
- Contains an array of token tuples `[operator, predicate]`
- First tuple has empty string `''` as operator (the predicate appears directly after the opening parenthesis)
- Subsequent tuples have their logical operator (`AND`, `OR`)

**Tokenizer responsibilities:**
- Determining when parentheses are needed (based on operator precedence)
- Converting nested compound expressions to nested array format

**Formatter responsibilities:**
- Deciding whether to render nested arrays on a single line or multiple lines
- Adding parentheses around nested expressions
- Applying indentation for multi-line nested predicates
- Right-aligning operators within each nesting level

**Examples of formatter output:**

Single-line (simple nested expression):
```sql
AND (total >= 100 OR priority_customer = true)
```

Multi-line (complex nested expression):
```sql
AND (shipping_country = US
  OR shipping_country = CA
  OR shipping_country = MX
)
```

Both use the same nested array token structure; the formatter chooses the
layout based on the number of predicates or other heuristics.
