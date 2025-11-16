/*
**Pretty Formatter Specification**

The pretty formatter converts token arrays into right-aligned, visually formatted SQL strings.

**How it Works:**
1. Calculate longest keyword across all tokens at each nesting level
2. Apply padding to right-align each keyword within its level
3. Handle nested predicates:
   - Recursively apply alignment to nested token arrays
   - Decide whether to render on single line or multiple lines
   - Add parentheses and indentation for multi-line nested predicates
4. Join with newlines

**Example Output:**
```sql
  SELECT id, name, email
    FROM users
   WHERE active = true
     AND age > 18
ORDER BY name
```

**Nested Predicate Handling:**

The formatter receives structured nested arrays and decides layout:

Single-line (simple case):
```sql
AND (role = admin OR role = mod)
```

Multi-line (complex case):
```sql
AND (role = admin
  OR role = mod
)
```
*/

import { expect } from 'chai';
import { prettyFormatter } from '../src/formatters.ts';

describe('pretty formatter', () => {
  context('where', () => {
    it('should format WHERE with single simple predicate', () => {
      expect(prettyFormatter(['WHERE', 'id = 1'])).to.eql('WHERE id = 1');
    });

    it('should format WHERE with token value', () => {
      expect(prettyFormatter(['WHERE', '1'])).to.eql('WHERE 1');
    });

    it('should right-align WHERE with other clauses', () => {
      expect(prettyFormatter([
        ['SELECT', 'id'],
        ['FROM', 'users'],
        ['WHERE', 'active = true']
      ])).to.eql('SELECT id\n  FROM users\n WHERE active = true');
    });

    describe('simple predicates', () => {
      it('should format AND with simple predicate', () => {
        expect(prettyFormatter([
          ['WHERE', 'status = active'],
          ['AND', 'age > 18']
        ])).to.eql('WHERE status = active\n  AND age > 18');
      });

      it('should format OR with simple predicate', () => {
        expect(prettyFormatter([
          ['WHERE', 'role = admin'],
          ['OR', 'role = mod']
        ])).to.eql('WHERE role = admin\n   OR role = mod');
      });

      it('should right-align multiple AND predicates', () => {
        expect(prettyFormatter([
          ['WHERE', 'status = active'],
          ['AND', 'age > 18'],
          ['AND', 'role = admin']
        ])).to.eql('WHERE status = active\n  AND age > 18\n  AND role = admin');
      });
    });

    describe('top-level logical operators', () => {
      it('should format split top-level AND predicates on separate lines', () => {
        expect(prettyFormatter([
          ['WHERE', 'status = active'],
          ['AND', 'age > 18']
        ])).to.eql('WHERE status = active\n  AND age > 18');
      });

      it('should format split top-level OR predicates on separate lines', () => {
        expect(prettyFormatter([
          ['WHERE', 'role = admin'],
          ['OR', 'role = mod']
        ])).to.eql('WHERE role = admin\n   OR role = mod');
      });

      it('should handle multiple predicates (>2) with alignment', () => {
        expect(prettyFormatter([
          ['WHERE', 'a = 1'],
          ['AND', 'b = 2'],
          ['AND', 'c = 3'],
          ['AND', 'd = 4']
        ])).to.eql('WHERE a = 1\n  AND b = 2\n  AND c = 3\n  AND d = 4');
      });
    });

    describe('nested predicates', () => {
      it('should render simple nested array on single line', () => {
        expect(prettyFormatter([
          ['WHERE', 'active = true'],
          ['AND', [
            ['', 'role = admin'],
            ['OR', 'role = mod']
          ]]
        ])).to.eql('WHERE active = true\n  AND (role = admin OR role = mod)');
      });

      it('should render complex nested array on multiple lines', () => {
        expect(prettyFormatter([
          ['WHERE', 'active = true'],
          ['AND', [
            ['', 'shipping_country = US'],
            ['OR', 'shipping_country = CA'],
            ['OR', 'shipping_country = MX']
          ]]
        ])).to.eql('WHERE active = true\n  AND (shipping_country = US\n    OR shipping_country = CA\n    OR shipping_country = MX\n  )');
      });

      it('should handle empty string operator for first predicate', () => {
        expect(prettyFormatter([
          ['AND', [
            ['', 'predicate'],
            ['OR', 'other']
          ]]
        ])).to.eql('AND (predicate OR other)');
      });

      it('should right-align operators within nested arrays', () => {
        expect(prettyFormatter([
          ['WHERE', [
            ['', 'a'],
            ['AND', 'b'],
            ['OR', 'c']
          ]]
        ])).to.eql('WHERE (a\n   AND b\n    OR c\n)');
      });

      it('should handle deeply nested predicates', () => {
        expect(prettyFormatter([
          ['WHERE', 'active = true'],
          ['AND', [
            ['', 'status = pending'],
            ['OR', [
              ['', 'role = admin'],
              ['AND', 'dept = IT']
            ]]
          ]]
        ])).to.eql('WHERE active = true\n  AND (status = pending OR (role = admin AND dept = IT))');
      });
    });

    describe('layout decisions', () => {
      it('should render 2-predicate nested array on single line', () => {
        expect(prettyFormatter([
          ['AND', [
            ['', 'a'],
            ['OR', 'b']
          ]]
        ])).to.eql('AND (a OR b)');
      });

      it('should render 3+ predicate nested array on multiple lines', () => {
        expect(prettyFormatter([
          ['AND', [
            ['', 'a'],
            ['OR', 'b'],
            ['OR', 'c']
          ]]
        ])).to.eql('AND (a\n  OR b\n  OR c\n)');
      });
    });
  });

  describe('select', () => {
    it('should format SELECT clause', () => {
      expect(prettyFormatter(['SELECT', 'id, name, email'])).to.eql('SELECT id, name, email');
    });

    it('should right-align SELECT with other clauses', () => {
      expect(prettyFormatter([
        ['SELECT', 'id'],
        ['FROM', 'users']
      ])).to.eql('SELECT id\n  FROM users');
    });
  });

  describe('from', () => {
    it('should format FROM clause', () => {
      expect(prettyFormatter(['FROM', 'users, accounts'])).to.eql('FROM users, accounts');
    });

    it('should right-align FROM with other clauses', () => {
      expect(prettyFormatter([
        ['SELECT', 'id'],
        ['FROM', 'users'],
        ['WHERE', 'active = true']
      ])).to.eql('SELECT id\n  FROM users\n WHERE active = true');
    });
  });

  describe('order by', () => {
    it('should format ORDER BY clause', () => {
      expect(prettyFormatter(['ORDER BY', 'name ASC'])).to.eql('ORDER BY name ASC');
    });

    it('should right-align ORDER BY with other clauses', () => {
      expect(prettyFormatter([
        ['SELECT', 'id'],
        ['ORDER BY', 'name']
      ])).to.eql('  SELECT id\nORDER BY name');
    });
  });

  describe('complete expression', () => {
    it('should format all clauses with right-alignment', () => {
      expect(prettyFormatter([
        ['SELECT', 'id, name'],
        ['FROM', 'users'],
        ['WHERE', 'active = true'],
        ['ORDER BY', 'name']
      ])).to.eql('  SELECT id, name\n    FROM users\n   WHERE active = true\nORDER BY name');
    });

    it('should format expression with nested predicates', () => {
      expect(prettyFormatter([
        ['SELECT', 'id'],
        ['FROM', 'users'],
        ['WHERE', 'active = true'],
        ['AND', [
          ['', 'role = admin'],
          ['OR', 'role = mod']
        ]]
      ])).to.eql('SELECT id\n  FROM users\n WHERE active = true\n   AND (role = admin OR role = mod)');
    });

    it('should format expression with multiple top-level AND predicates', () => {
      expect(prettyFormatter([
        ['SELECT', 'id'],
        ['FROM', 'users'],
        ['WHERE', 'status = active'],
        ['AND', 'age > 18'],
        ['AND', 'role = admin']
      ])).to.eql('SELECT id\n  FROM users\n WHERE status = active\n   AND age > 18\n   AND role = admin');
    });

    it('should format expression with mixed AND/OR at top level', () => {
      expect(prettyFormatter([
        ['SELECT', 'id'],
        ['WHERE', 'status = active'],
        ['AND', 'age > 18'],
        ['OR', 'role = admin']
      ])).to.eql('SELECT id\n WHERE status = active\n   AND age > 18\n    OR role = admin');
    });
  });
});
