# Test database

This database is used to test the features of Manuka to ensure it is capable of
dealing with a real world database.

The following schema should be used for all supported databases.

## Tables and Relationships

### 1. **users** (Core entity)
```
users
├── id (INTEGER PRIMARY KEY)
├── email (TEXT UNIQUE NOT NULL)
├── username (TEXT UNIQUE NOT NULL)
├── password_hash (TEXT NOT NULL)
├── created_at (INTEGER NOT NULL)  -- Unix timestamp
├── updated_at (INTEGER NOT NULL)
└── is_active (INTEGER DEFAULT 1)  -- Boolean (0/1)
```

### 2. **user_profiles** (One-to-One with users)
```
user_profiles
├── user_id (INTEGER PRIMARY KEY)  -- FK to users.id
├── first_name (TEXT)
├── last_name (TEXT)
├── bio (TEXT)
├── avatar_url (TEXT)
└── birth_date (TEXT)  -- ISO 8601 format
```

### 3. **categories** (Hierarchical - self-referencing)
```
categories
├── id (INTEGER PRIMARY KEY)
├── parent_id (INTEGER)  -- FK to categories.id (nullable)
├── name (TEXT NOT NULL)
├── slug (TEXT UNIQUE NOT NULL)
└── description (TEXT)
```

### 4. **products** (One-to-Many with categories)
```
products
├── id (INTEGER PRIMARY KEY)
├── category_id (INTEGER NOT NULL)  -- FK to categories.id
├── sku (TEXT UNIQUE NOT NULL)
├── name (TEXT NOT NULL)
├── description (TEXT)
├── price (REAL NOT NULL CHECK (price >= 0))
├── stock_quantity (INTEGER DEFAULT 0 CHECK (stock_quantity >= 0))
├── weight_kg (REAL)
├── is_available (INTEGER DEFAULT 1)
├── created_at (INTEGER NOT NULL)
└── image_data (BLOB)  -- Binary data
```

### 5. **tags** (Many-to-Many with products)
```
tags
├── id (INTEGER PRIMARY KEY)
├── name (TEXT UNIQUE NOT NULL)
└── color (TEXT DEFAULT '#808080')
```

### 6. **product_tags** (Junction table)
```
product_tags
├── product_id (INTEGER NOT NULL)  -- FK to products.id
├── tag_id (INTEGER NOT NULL)      -- FK to tags.id
└── PRIMARY KEY (product_id, tag_id)
```

### 7. **orders** (One-to-Many with users)
```
orders
├── id (INTEGER PRIMARY KEY)
├── user_id (INTEGER NOT NULL)  -- FK to users.id
├── order_number (TEXT UNIQUE NOT NULL)
├── status (TEXT CHECK (status IN ('pending','processing','shipped','delivered','cancelled')))
├── subtotal (REAL NOT NULL CHECK (subtotal >= 0))
├── tax (REAL NOT NULL CHECK (tax >= 0))
├── shipping (REAL NOT NULL CHECK (shipping >= 0))
├── total (REAL NOT NULL CHECK (total >= 0))
├── created_at (INTEGER NOT NULL)
└── shipped_at (INTEGER)
```

### 8. **order_items** (Many-to-Many with products through orders)
```
order_items
├── id (INTEGER PRIMARY KEY)
├── order_id (INTEGER NOT NULL)    -- FK to orders.id
├── product_id (INTEGER NOT NULL)  -- FK to products.id
├── quantity (INTEGER NOT NULL CHECK (quantity > 0))
├── unit_price (REAL NOT NULL CHECK (unit_price >= 0))
├── subtotal (REAL NOT NULL CHECK (subtotal >= 0))
└── UNIQUE (order_id, product_id)
```

### 9. **reviews** (Many-to-One with products and users)
```
reviews
├── id (INTEGER PRIMARY KEY)
├── product_id (INTEGER NOT NULL)  -- FK to products.id
├── user_id (INTEGER NOT NULL)     -- FK to users.id
├── rating (INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5))
├── title (TEXT)
├── comment (TEXT)
├── created_at (INTEGER NOT NULL)
└── UNIQUE (product_id, user_id)  -- One review per user per product
```

### 10. **addresses** (One-to-Many with users)
```
addresses
├── id (INTEGER PRIMARY KEY)
├── user_id (INTEGER NOT NULL)  -- FK to users.id
├── type (TEXT CHECK (type IN ('billing', 'shipping')))
├── street (TEXT NOT NULL)
├── city (TEXT NOT NULL)
├── state (TEXT)
├── postal_code (TEXT NOT NULL)
├── country (TEXT NOT NULL DEFAULT 'US')
└── is_default (INTEGER DEFAULT 0)
```

## Relationship Summary
- **One-to-One**: users ↔ user_profiles
- **One-to-Many**:
  - users → orders
  - users → addresses
  - users → reviews
  - categories → products
  - categories → categories (self-referencing)
  - products → reviews
  - orders → order_items
- **Many-to-Many**:
  - products ↔ tags (via product_tags)
  - products ↔ orders (via order_items)
