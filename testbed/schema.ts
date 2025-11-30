import type { CommonDdl } from '../src/types.ts';
import { ifNotExists, eq, gte, gt, lt, and } from '../src/vocabulary.ts';

// ============================================================================
// E-Commerce Database Schema
// ============================================================================
// 10 tables covering all relationship types and constraint types
// Using CommonDdl only (portable SQL, no database-specific extensions)

// 1. USERS - Core entity
export const users: CommonDdl = {
  createTable: ['users', ifNotExists],
  withColumns: [
    ['id', 'INTEGER', ['PRIMARY KEY']],
    ['email', 'TEXT', ['UNIQUE'], ['NOT', null]],
    ['username', 'TEXT', ['UNIQUE'], ['NOT', null]],
    ['password_hash', 'TEXT', ['NOT', null]],
    ['created_at', 'INTEGER', ['NOT', null]],
    ['updated_at', 'INTEGER', ['NOT', null]],
    ['is_active', 'INTEGER', ['DEFAULT', 1]]
  ]
};

// 2. USER_PROFILES - One-to-One with users
export const userProfiles: CommonDdl = {
  createTable: ['user_profiles', ifNotExists],
  withColumns: [
    ['user_id', 'INTEGER', ['PRIMARY KEY']],
    ['first_name', 'TEXT'],
    ['last_name', 'TEXT'],
    ['bio', 'TEXT'],
    ['avatar_url', 'TEXT'],
    ['birth_date', 'TEXT'],
    [['FOREIGN KEY', 'user_id'], ['REFERENCES', ['users', 'id']]]
  ]
};

// 3. CATEGORIES - Hierarchical (self-referencing)
export const categories: CommonDdl = {
  createTable: ['categories', ifNotExists],
  withColumns: [
    ['id', 'INTEGER', ['PRIMARY KEY']],
    ['parent_id', 'INTEGER'],
    ['name', 'TEXT', ['NOT', null]],
    ['slug', 'TEXT', ['UNIQUE'], ['NOT', null]],
    ['description', 'TEXT'],
    [['FOREIGN KEY', 'parent_id'], ['REFERENCES', ['categories', 'id']]]
  ]
};

// 4. PRODUCTS - One-to-Many with categories
export const products: CommonDdl = {
  createTable: ['products', ifNotExists],
  withColumns: [
    ['id', 'INTEGER', ['PRIMARY KEY']],
    ['category_id', 'INTEGER', ['NOT', null]],
    ['sku', 'TEXT', ['UNIQUE'], ['NOT', null]],
    ['name', 'TEXT', ['NOT', null]],
    ['description', 'TEXT'],
    ['price', 'REAL', ['NOT', null], ['CHECK', [gte, 'price', 0]]],
    ['stock_quantity', 'INTEGER', ['DEFAULT', 0], ['CHECK', [gte, 'stock_quantity', 0]]],
    ['weight_kg', 'REAL'],
    ['is_available', 'INTEGER', ['DEFAULT', 1]],
    ['created_at', 'INTEGER', ['NOT', null]],
    ['image_data', 'BLOB'],
    [['FOREIGN KEY', 'category_id'], ['REFERENCES', ['categories', 'id']]]
  ]
};

// 5. TAGS - Many-to-Many with products
export const tags: CommonDdl = {
  createTable: ['tags', ifNotExists],
  withColumns: [
    ['id', 'INTEGER', ['PRIMARY KEY']],
    ['name', 'TEXT', ['UNIQUE'], ['NOT', null]],
    ['color', 'TEXT', ['DEFAULT', '#808080']]
  ]
};

// 6. PRODUCT_TAGS - Junction table (Many-to-Many)
export const productTags: CommonDdl = {
  createTable: ['product_tags', ifNotExists],
  withColumns: [
    ['product_id', 'INTEGER', ['NOT', null]],
    ['tag_id', 'INTEGER', ['NOT', null]],
    [['PRIMARY KEY', 'product_id', 'tag_id']],
    [['FOREIGN KEY', 'product_id'], ['REFERENCES', ['products', 'id']]],
    [['FOREIGN KEY', 'tag_id'], ['REFERENCES', ['tags', 'id']]]
  ]
};

// 7. ORDERS - One-to-Many with users
export const orders: CommonDdl = {
  createTable: ['orders', ifNotExists],
  withColumns: [
    ['id', 'INTEGER', ['PRIMARY KEY']],
    ['user_id', 'INTEGER', ['NOT', null]],
    ['order_number', 'TEXT', ['UNIQUE'], ['NOT', null]],
    ['status', 'TEXT'],
    ['subtotal', 'REAL', ['NOT', null], ['CHECK', [gte, 'subtotal', 0]]],
    ['tax', 'REAL', ['NOT', null], ['CHECK', [gte, 'tax', 0]]],
    ['shipping', 'REAL', ['NOT', null], ['CHECK', [gte, 'shipping', 0]]],
    ['total', 'REAL', ['NOT', null], ['CHECK', [gte, 'total', 0]]],
    ['created_at', 'INTEGER', ['NOT', null]],
    ['shipped_at', 'INTEGER'],
    [['FOREIGN KEY', 'user_id'], ['REFERENCES', ['users', 'id']]]
  ]
};

// 8. ORDER_ITEMS - Many-to-Many with products through orders
export const orderItems: CommonDdl = {
  createTable: ['order_items', ifNotExists],
  withColumns: [
    ['id', 'INTEGER', ['PRIMARY KEY']],
    ['order_id', 'INTEGER', ['NOT', null]],
    ['product_id', 'INTEGER', ['NOT', null]],
    ['quantity', 'INTEGER', ['NOT', null], ['CHECK', [gt, 'quantity', 0]]],
    ['unit_price', 'REAL', ['NOT', null], ['CHECK', [gte, 'unit_price', 0]]],
    ['subtotal', 'REAL', ['NOT', null], ['CHECK', [gte, 'subtotal', 0]]],
    [['UNIQUE', ['COMPOSITE', 'order_id', 'product_id']]],
    [['FOREIGN KEY', 'order_id'], ['REFERENCES', ['orders', 'id']]],
    [['FOREIGN KEY', 'product_id'], ['REFERENCES', ['products', 'id']]]
  ]
};

// 9. REVIEWS - Many-to-One with products and users
export const reviews: CommonDdl = {
  createTable: ['reviews', ifNotExists],
  withColumns: [
    ['id', 'INTEGER', ['PRIMARY KEY']],
    ['product_id', 'INTEGER', ['NOT', null]],
    ['user_id', 'INTEGER', ['NOT', null]],
    ['rating', 'INTEGER', ['NOT', null], ['CHECK', [and, [gte, 'rating', 1], [gte, 5, 'rating']]]],
    ['title', 'TEXT'],
    ['comment', 'TEXT'],
    ['created_at', 'INTEGER', ['NOT', null]],
    [['UNIQUE', ['COMPOSITE', 'product_id', 'user_id']]],
    [['FOREIGN KEY', 'product_id'], ['REFERENCES', ['products', 'id']]],
    [['FOREIGN KEY', 'user_id'], ['REFERENCES', ['users', 'id']]]
  ]
};

// 10. ADDRESSES - One-to-Many with users
export const addresses: CommonDdl = {
  createTable: ['addresses', ifNotExists],
  withColumns: [
    ['id', 'INTEGER', ['PRIMARY KEY']],
    ['user_id', 'INTEGER', ['NOT', null]],
    ['type', 'TEXT'],
    ['street', 'TEXT', ['NOT', null]],
    ['city', 'TEXT', ['NOT', null]],
    ['state', 'TEXT'],
    ['postal_code', 'TEXT', ['NOT', null]],
    ['country', 'TEXT', ['NOT', null], ['DEFAULT', 'US']],
    ['is_default', 'INTEGER', ['DEFAULT', 0]],
    [['FOREIGN KEY', 'user_id'], ['REFERENCES', ['users', 'id']]]
  ]
};

// ============================================================================
// Indexes
// ============================================================================

// Index for fast product category lookups
export const idxProductsCategory: CommonDdl = {
  createIndex: {
    name: ['idx_products_category', ifNotExists],
    on: ['products', 'category_id']
  }
};

// Index for user orders by creation date
export const idxOrdersUserCreated: CommonDdl = {
  createIndex: {
    name: ['idx_orders_user_created', ifNotExists],
    on: ['orders', 'user_id', 'created_at']
  }
};

// Partial index for active users' emails
export const idxActiveUsersEmail: CommonDdl = {
  createIndex: {
    name: ['idx_active_users_email', ifNotExists],
    on: ['users', 'email'],
    unique: true,
    where: [eq, 'is_active', 1]
  }
};

// ============================================================================
// Schema Export - All DDL statements in dependency order
// ============================================================================

export const allTables = [
  users,
  userProfiles,
  categories,
  products,
  tags,
  productTags,
  orders,
  orderItems,
  reviews,
  addresses
];

export const allIndexes = [
  idxProductsCategory,
  idxOrdersUserCreated,
  idxActiveUsersEmail
];

export const allDdl = [
  ...allTables,
  ...allIndexes
];
