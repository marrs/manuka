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

import { expect, use } from 'chai';
import chaiString from 'chai-string';

use(chaiString);
import './chai-extensions';
import { prettyFormatter, separatorFormatter } from '../src/formatters.ts';

describe('pretty formatter', () => {
  context('where clause', () => {
    it('renders a clause with a single predicate on one line', () => {
      expect(prettyFormatter(['WHERE', 'id = 1'])).to.eql('WHERE id = 1');
    });

    it('is renders on a clause with a single token value on one line', () => {
      expect(prettyFormatter(['WHERE', '1'])).to.eql('WHERE 1');
    });

    it('is indented so that WHERE is right-aligned with other clauses', () => {
      expect(prettyFormatter([
        ['SELECT', 'id'],
        ['FROM', 'users'],
        ['WHERE', 'active = true']
      ])).to.eql('SELECT id\n  FROM users\n WHERE active = true');
    });

    it('renders and right-aligns a single AND clause on the next line', () => {
      const result = prettyFormatter([
        ['WHERE', 'status = active'],
        ['AND', 'age > 18']
      ]).split('\n');
      expect(result[0]).to.have.leadingSpaces(0);  // WHERE has no leading spaces
      expect(result[1]).to.have.leadingSpaces(2);  // AND has 2 leading spaces
    });

    it('renders and right-aligns multiple AND predicates on their own lines', () => {
      const result = prettyFormatter([
        ['WHERE', 'status = active'],
        ['AND', 'age > 18'],
        ['AND', 'role = admin']
      ]).split('\n');
      expect(result[1]).to.match(/^  AND/);
      expect(result[2]).to.match(/^  AND/);
    });

    it('renders and right-aligns a single OR clause on the next line', () => {
      const result = prettyFormatter([
        ['WHERE', 'role = admin'],
        ['OR', 'role = mod']
      ]).split('\n');
      expect(result[1]).to.match(/^   OR/);
    });

    it('renders and right-aligns multiple OR predicates on their own lines', () => {
      const result = prettyFormatter([
        ['WHERE', 'status = active'],
        ['OR', 'age > 18'],
        ['OR', 'role = admin']
      ]).split('\n');
      expect(result[1]).to.match(/^   OR/);
      expect(result[2]).to.match(/^   OR/);
    });

    describe('nested predicates', () => {
      it('brackets a nested predicate', () => {
        expect(prettyFormatter([
          ['AND', [
            ['', 'role = admin'],
            ['OR', 'role = mod']
          ]]
        ])).to.eql('AND (role = admin OR role = mod)');
      });

      it('renders a nested single predicate on single line', () => {
        expect(prettyFormatter([
          ['AND', [
            ['', 'role = admin'],
            ['OR', 'role = mod']
          ]]
        ])).to.eql('AND (role = admin OR role = mod)');
      });

      it('renders nested multiple predicates across multiple lines', () => {
        expect(prettyFormatter([
          ['AND', [
            ['', 'shipping_country = US'],
            ['OR', 'shipping_country = CA'],
            ['OR', 'shipping_country = MX']
          ]]
        ]).split('\n').length).to.eql(4);
      });

      it('renders the first operand of the nested predicate inline with the opening bracket', () => {
        expect(prettyFormatter([
          ['AND', [
            ['', 'shipping_country = US'],
            ['OR', 'shipping_country = CA'],
            ['OR', 'shipping_country = MX'],
          ]]
        ])).to.startWith('AND (shipping_country = US\n');
      });

      it('renders the remaining operand of the nested predicate inline with the opening bracket', () => {
        expect(prettyFormatter([
          ['AND', [
            ['', 'shipping_country = US'],
            ['OR', 'shipping_country = CA'],
            ['OR', 'shipping_country = MX'],
          ]]
        ])).to.startWith('AND (shipping_country = US\n');
      });

      it('renders nested multiple predicates across multiple lines', () => {
        expect(prettyFormatter([
          ['WHERE', 'active = true'],
          ['AND', [
            ['', 'shipping_country = US'],
            ['OR', 'shipping_country = CA'],
            ['OR', 'shipping_country = MX']
          ]]
        ])).to.eql('WHERE active = true\n  AND (shipping_country = US\n    OR shipping_country = CA\n    OR shipping_country = MX\n  )');
      });

      it('right-aligns operators within nested arrays', () => {
        expect(prettyFormatter([
          ['WHERE', [
            ['', 'a'],
            ['AND', 'b'],
            ['OR', 'c']
          ]]
        ])).to.eql('WHERE (a\n   AND b\n    OR c\n)');
      });

      it('handles deeply nested predicates', () => {
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

      it('renders 3+ predicate nested array on multiple lines', () => {
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

  describe('clause operator alignment', () => {
    const result = prettyFormatter([
      ['SELECT', 'id, name'],
      ['FROM', 'users'],
      ['WHERE', 'active = true'],
      ['AND', 'id > 4'],
      ['OR', 'name = Bob'],
      ['ORDER BY', 'name']
    ]).split('\n');
    it('left aligns the longest clause operator', () => {
      expect(result[5]).to.have.leadingSpaces(0);
    });

    it('right aligns other operators to the longest operator', () => {
      expect(result[0]).to.have.leadingSpaces(2);
      expect(result[1]).to.have.leadingSpaces(4);
      expect(result[2]).to.have.leadingSpaces(3);
      expect(result[3]).to.have.leadingSpaces(5);
      expect(result[4]).to.have.leadingSpaces(6);
    });
  });

  describe('complete expression', () => {
    it('correctly formats an expression with nested predicates', () => {
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
  });
});

describe('separator formatter', () => {
  context('where clause', () => {
    it('renders a clause with a single predicate on one line', () => {
      expect(separatorFormatter('\n', ['WHERE', 'id = 1'])).to.eql('WHERE id = 1');
    });

    it('renders a clause with a single token value on one line', () => {
      expect(separatorFormatter('\n', ['WHERE', '1'])).to.eql('WHERE 1');
    });

    it('joins multiple clauses with newlines without indentation', () => {
      expect(separatorFormatter('\n', [
        ['SELECT', 'id'],
        ['FROM', 'users'],
        ['WHERE', 'active = true']
      ])).to.eql('SELECT id\nFROM users\nWHERE active = true');
    });

    it('separates AND clauses with newlines without alignment', () => {
      const result = separatorFormatter('\n', [
        ['WHERE', 'status = active'],
        ['AND', 'age > 18']
      ]).split('\n');
      expect(result[0]).to.have.leadingSpaces(0);
      expect(result[1]).to.have.leadingSpaces(0);  // No indentation
      expect(result[1]).to.eql('AND age > 18');
    });

    it('separates multiple AND predicates with newlines', () => {
      const result = separatorFormatter('\n', [
        ['WHERE', 'status = active'],
        ['AND', 'age > 18'],
        ['AND', 'role = admin']
      ]).split('\n');
      expect(result[0]).to.eql('WHERE status = active');
      expect(result[1]).to.eql('AND age > 18');
      expect(result[2]).to.eql('AND role = admin');
    });

    it('separates OR clauses with newlines without alignment', () => {
      const result = separatorFormatter('\n', [
        ['WHERE', 'role = admin'],
        ['OR', 'role = mod']
      ]).split('\n');
      expect(result[0]).to.have.leadingSpaces(0);
      expect(result[1]).to.have.leadingSpaces(0);  // No indentation
    });

    it('separates multiple OR predicates with newlines', () => {
      const result = separatorFormatter('\n', [
        ['WHERE', 'status = active'],
        ['OR', 'age > 18'],
        ['OR', 'role = admin']
      ]).split('\n');
      expect(result[0]).to.eql('WHERE status = active');
      expect(result[1]).to.eql('OR age > 18');
      expect(result[2]).to.eql('OR role = admin');
    });

    describe('nested predicates', () => {
      it('brackets a nested predicate on one line', () => {
        expect(separatorFormatter('\n', [
          ['AND', [
            ['', 'role = admin'],
            ['OR', 'role = mod']
          ]]
        ])).to.eql('AND (role = admin OR role = mod)');
      });

      it('renders all nested predicates on single line regardless of count', () => {
        expect(separatorFormatter('\n', [
          ['AND', [
            ['', 'shipping_country = US'],
            ['OR', 'shipping_country = CA'],
            ['OR', 'shipping_country = MX']
          ]]
        ])).to.eql('AND (shipping_country = US OR shipping_country = CA OR shipping_country = MX)');
      });

      it('formats nested predicates inline with parent clause', () => {
        expect(separatorFormatter('\n', [
          ['WHERE', 'active = true'],
          ['AND', [
            ['', 'shipping_country = US'],
            ['OR', 'shipping_country = CA'],
            ['OR', 'shipping_country = MX']
          ]]
        ])).to.eql('WHERE active = true\nAND (shipping_country = US OR shipping_country = CA OR shipping_country = MX)');
      });

      it('handles deeply nested predicates inline', () => {
        expect(separatorFormatter('\n', [
          ['WHERE', 'active = true'],
          ['AND', [
            ['', 'status = pending'],
            ['OR', [
              ['', 'role = admin'],
              ['AND', 'dept = IT']
            ]]
          ]]
        ])).to.eql('WHERE active = true\nAND (status = pending OR (role = admin AND dept = IT))');
      });

      it('formats 2-predicate nested array on single line', () => {
        expect(separatorFormatter('\n', [
          ['AND', [
            ['', 'a'],
            ['OR', 'b']
          ]]
        ])).to.eql('AND (a OR b)');
      });

      it('formats 3+ predicate nested array on single line', () => {
        expect(separatorFormatter('\n', [
          ['AND', [
            ['', 'a'],
            ['OR', 'b'],
            ['OR', 'c']
          ]]
        ])).to.eql('AND (a OR b OR c)');
      });
    });
  });

  describe('no alignment behavior', () => {
    it('does not align clause operators', () => {
      const result = separatorFormatter('\n', [
        ['SELECT', 'id, name'],
        ['FROM', 'users'],
        ['WHERE', 'active = true'],
        ['AND', 'id > 4'],
        ['OR', 'name = Bob'],
        ['ORDER BY', 'name']
      ]).split('\n');

      // All lines should have no leading spaces
      result.forEach(line => {
        expect(line).to.have.leadingSpaces(0);
      });
    });
  });

  describe('complete expression', () => {
    it('correctly formats an expression with nested predicates', () => {
      expect(separatorFormatter('\n', [
        ['SELECT', 'id'],
        ['FROM', 'users'],
        ['WHERE', 'active = true'],
        ['AND', [
          ['', 'role = admin'],
          ['OR', 'role = mod']
        ]]
      ])).to.eql('SELECT id\nFROM users\nWHERE active = true\nAND (role = admin OR role = mod)');
    });

    it('formats complex expressions without any indentation', () => {
      const result = separatorFormatter('\n', [
        ['SELECT', 'id, name'],
        ['FROM', 'users'],
        ['WHERE', 'active = true'],
        ['AND', [
          ['', 'shipping_country = US'],
          ['OR', 'shipping_country = CA']
        ]],
        ['ORDER BY', 'name']
      ]);
      expect(result).to.eql('SELECT id, name\nFROM users\nWHERE active = true\nAND (shipping_country = US OR shipping_country = CA)\nORDER BY name');
    });
  });

  context('DDL formatting', () => {
    describe('prettyFormatter with DDL', () => {
      it('right-aligns keywords with single space between keyword and operand', () => {
        expect(prettyFormatter([
          ['CREATE TABLE', 'users'],
          ['COLUMN', 'id INTEGER'],
          ['COLUMN', 'name TEXT']
        ])).to.eql('CREATE TABLE users\n      COLUMN id INTEGER\n      COLUMN name TEXT');
      });

      it('handles DDL tokens without nested arrays (flat structure)', () => {
        expect(prettyFormatter([
          ['CREATE TABLE', 'user_roles'],
          ['COLUMN', 'user_id INTEGER NOT NULL'],
          ['COLUMN', 'role_id INTEGER NOT NULL'],
          ['PRIMARY KEY', '(user_id, role_id)'],
          ['FOREIGN KEY', '(user_id) REFERENCES users(id)'],
          ['FOREIGN KEY', '(role_id) REFERENCES roles(id)']
        ])).to.eql('CREATE TABLE user_roles\n      COLUMN user_id INTEGER NOT NULL\n      COLUMN role_id INTEGER NOT NULL\n PRIMARY KEY (user_id, role_id)\n FOREIGN KEY (user_id) REFERENCES users(id)\n FOREIGN KEY (role_id) REFERENCES roles(id)');
      });

      it('calculates right-alignment padding based on longest keyword', () => {
        const result = prettyFormatter([
          ['CREATE TABLE', 'products'],
          ['COLUMN', 'id INTEGER'],
          ['CHECK', '(price > 0)']
        ]).split('\n');
        expect(result[0]).to.have.leadingSpaces(0);
        expect(result[1]).to.have.leadingSpaces(6); // 'CREATE TABLE' is 12 chars, 'COLUMN' is 6, so 6 spaces
        expect(result[2]).to.have.leadingSpaces(7); // 'CHECK' is 5 chars, so 7 spaces
      });
    });

    describe('separatorFormatter with DDL', () => {
      it('joins DDL tokens with newlines without alignment or indentation', () => {
        expect(separatorFormatter('\n', [
          ['CREATE TABLE', 'users'],
          ['COLUMN', 'id INTEGER'],
          ['COLUMN', 'name TEXT']
        ])).to.eql('CREATE TABLE users\nCOLUMN id INTEGER\nCOLUMN name TEXT');
      });

      it('joins DDL tokens with custom separator (space)', () => {
        expect(separatorFormatter(' ', [
          ['CREATE TABLE', 'users'],
          ['COLUMN', 'id INTEGER']
        ])).to.eql('CREATE TABLE users COLUMN id INTEGER');
      });
    });
  });
});
