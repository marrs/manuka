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
import { prettyFormatter } from '../src/formatters.ts';

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
