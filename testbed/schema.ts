import type { CommonDdl } from '../src/types.ts';
import {
  ifNotExists, eq, gte, lte, gt, and, not,
  integer, text, real, primaryKey, foreignKey,
  references, unique, byDefault, check,
  composite,
} from '../src/vocabulary.ts';

// ============================================================================
// E-Commerce Database Schema
// ============================================================================
// 10 tables covering all relationship types and constraint types
// Using CommonDdl only (portable SQL, no database-specific extensions)

// 1. USERS - Core entity
export const users: CommonDdl = {
  createTable: ['users', ifNotExists],
  withColumns: [
    ['id', integer, [primaryKey]],
    ['email', text, [unique], [not, null]],
    ['username', text, [unique], [not, null]],
    ['password_hash', text, [not, null]],
    ['created_at', integer, [not, null]],
    ['updated_at', integer, [not, null]],
    ['is_active', integer, [byDefault, 1]]
  ]
};

// 2. USER_PROFILES - One-to-One with users
export const userProfiles: CommonDdl = {
  createTable: ['user_profiles', ifNotExists],
  withColumns: [
    ['user_id', integer, [primaryKey]],
    ['first_name', text],
    ['last_name', text],
    ['bio', text],
    ['avatar_url', text],
    ['birth_date', text],
    [[foreignKey, 'user_id'], [references, ['users', 'id']]]
  ]
};

// 3. CATEGORIES - Hierarchical (self-referencing)
export const categories: CommonDdl = {
  createTable: ['categories', ifNotExists],
  withColumns: [
    ['id', integer, [primaryKey]],
    ['parent_id', integer],
    ['name', text, [not, null]],
    ['slug', text, [unique], [not, null]],
    ['description', text],
    [[foreignKey, 'parent_id'], [references, ['categories', 'id']]]
  ]
};

// 4. PRODUCTS - One-to-Many with categories
export const products: CommonDdl = {
  createTable: ['products', ifNotExists],
  withColumns: [
    ['id', integer, [primaryKey]],
    ['category_id', integer, [not, null]],
    ['sku', text, [unique], [not, null]],
    ['name', text, [not, null]],
    ['description', text],
    ['price', real, [not, null], [check, [gte, 'price', 0]]],
    ['stock_quantity', integer, [byDefault, 0], [check, [gte, 'stock_quantity', 0]]],
    ['weight_kg', real],
    ['is_available', integer, [byDefault, 1]],
    ['created_at', integer, [not, null]],
    ['image_data', 'blob'],
    [[foreignKey, 'category_id'], [references, ['categories', 'id']]]
  ]
};

// 5. TAGS - Many-to-Many with products
export const tags: CommonDdl = {
  createTable: ['tags', ifNotExists],
  withColumns: [
    ['id', integer, [primaryKey]],
    ['name', text, [unique], [not, null]],
    ['color', text, [byDefault, '#808080']]
  ]
};

// 6. PRODUCT_TAGS - Junction table (Many-to-Many)
export const productTags: CommonDdl = {
  createTable: ['product_tags', ifNotExists],
  withColumns: [
    ['product_id', integer, [not, null]],
    ['tag_id', integer, [not, null]],
    [[primaryKey, 'product_id', 'tag_id']],
    [[foreignKey, 'product_id'], [references, ['products', 'id']]],
    [[foreignKey, 'tag_id'], [references, ['tags', 'id']]]
  ]
};

// 7. ORDERS - One-to-Many with users
export const orders: CommonDdl = {
  createTable: ['orders', ifNotExists],
  withColumns: [
    ['id', integer, [primaryKey]],
    ['user_id', integer, [not, null]],
    ['order_number', text, [unique], [not, null]],
    ['status', text],
    ['subtotal', real, [not, null], [check, [gte, 'subtotal', 0]]],
    ['tax', real, [not, null], [check, [gte, 'tax', 0]]],
    ['shipping', real, [not, null], [check, [gte, 'shipping', 0]]],
    ['total', real, [not, null], [check, [gte, 'total', 0]]],
    ['created_at', integer, [not, null]],
    ['shipped_at', integer],
    [[foreignKey, 'user_id'], [references, ['users', 'id']]]
  ]
};

// 8. ORDER_ITEMS - Many-to-Many with products through orders
export const orderItems: CommonDdl = {
  createTable: ['order_items', ifNotExists],
  withColumns: [
    ['id', integer, [primaryKey]],
    ['order_id', integer, [not, null]],
    ['product_id', integer, [not, null]],
    ['quantity', integer, [not, null], [check, [gt, 'quantity', 0]]],
    ['unit_price', real, [not, null], [check, [gte, 'unit_price', 0]]],
    ['subtotal', real, [not, null], [check, [gte, 'subtotal', 0]]],
    [[unique, [composite, 'order_id', 'product_id']]],
    [[foreignKey, 'order_id'], [references, ['orders', 'id']]],
    [[foreignKey, 'product_id'], [references, ['products', 'id']]]
  ]
};

// 9. REVIEWS - Many-to-One with products and users
export const reviews: CommonDdl = {
  createTable: ['reviews', ifNotExists],
  withColumns: [
    ['id', integer, [primaryKey]],
    ['product_id', integer, [not, null]],
    ['user_id', integer, [not, null]],
    ['rating', integer, [not, null], [check, [and, [gte, 'rating', 1], [gte, 5, 'rating']]]],
    ['title', text],
    ['comment', text],
    ['created_at', integer, [not, null]],
    [[unique, [composite, 'product_id', 'user_id']]],
    [[foreignKey, 'product_id'], [references, ['products', 'id']]],
    [[foreignKey, 'user_id'], [references, ['users', 'id']]]
  ]
};

// 10. ADDRESSES - One-to-Many with users
export const addresses: CommonDdl = {
  createTable: ['addresses', ifNotExists],
  withColumns: [
    ['id', integer, [primaryKey]],
    ['user_id', integer, [not, null]],
    ['type', text],
    ['street', text, [not, null]],
    ['city', text, [not, null]],
    ['state', text],
    ['postal_code', text, [not, null]],
    ['country', text, [not, null], [byDefault, 'US']],
    ['is_default', integer, [byDefault, 0]],
    [[foreignKey, 'user_id'], [references, ['users', 'id']]]
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
