import { expect } from 'chai';
import { tokenize } from '../src/tokenizer.ts';

describe('tokenizer', () => {
  context('where clause', () => {
    it('handles WHERE with single simple predicate', () => {
      expect(tokenize({where: ['=', 'id', '1']})).to.eql([['WHERE', 'id = 1']]);
    });

    it('handles WHERE with single token value', () => {
      expect(tokenize({where: '1'})).to.eql([['WHERE', '1']]);
    });

    it('handles null values in predicates', () => {
      expect(tokenize({
        where: ['=', 'deleted_at', null]
      })).to.eql([
        ['WHERE', 'deleted_at = NULL']
      ]);
    });

    it('handles numeric values in predicates', () => {
      expect(tokenize({
        where: ['>', 'age', 18]
      })).to.eql([
        ['WHERE', 'age > 18']
      ]);
    });

    context('comparators', () => {
      it('tokenises the equality operator', () => {
        expect(tokenize({where: ['=', 'a', 'b']})).to.eql([['WHERE', 'a = b']]);
      });
      it('tokenises the inequality operator', () => {
        expect(tokenize({where: ['<>', 'a', 'b']})).to.eql([['WHERE', 'a <> b']]);
      });
      it('tokenises the less than operator', () => {
        expect(tokenize({where: ['<', 'a', 'b']})).to.eql([['WHERE', 'a < b']]);
      });
      it('tokenises the greater than operator', () => {
        expect(tokenize({where: ['>', 'a', 'b']})).to.eql([['WHERE', 'a > b']]);
      });
      it('tokenises the less than or equal to operator', () => {
        expect(tokenize({where: ['<=', 'a', 'b']})).to.eql([['WHERE', 'a <= b']]);
      });
      it('tokenises the greater than or equal to operator', () => {
        expect(tokenize({where: ['>=', 'a', 'b']})).to.eql([['WHERE', 'a >= b']]);
      });
      it('tokenises the LIKE operator', () => {
        expect(tokenize({where: ['LIKE', 'a', 'b']})).to.eql([['WHERE', 'a LIKE b']]);
      });
    });

    describe('top-level logical operators', () => {
      it('tokenises AND predicates in the order in which they were provided', () => {
        expect(tokenize({
          where: ['and',
            ['=', 'a', '1'],
            ['=', 'b', '2'],
            ['=', 'c', '3'],
            ['=', 'd', '4']]
        })).to.eql([
          ['WHERE', 'a = 1'],
          ['AND', 'b = 2'],
          ['AND', 'c = 3'],
          ['AND', 'd = 4']
        ]);
      });

      it('tokenises OR predicates in the order in which they were provided', () => {
        expect(tokenize({where: ['or', ['=', 'status', 'active'], ['=', 'status', 'pending'], ['=', 'status', 'draft']]})).to.eql([
          ['WHERE', 'status = active'],
          ['OR', 'status = pending'],
          ['OR', 'status = draft']
        ]);
      });
    });

    describe('nested predicates', () => {
      it('creates a nested array for OR nested inside AND', () => {
        expect(tokenize({
          where: ['and',
            ['=', 'active', 'true'],
            ['or',
              ['=', 'role', 'admin'],
              ['=', 'role', 'mod']
            ]
          ]
        })).to.eql([
          ['WHERE', 'active = true'],
          ['AND', [
            ['', 'role = admin'],
            ['OR', 'role = mod']
          ]]
        ]);
      });

      it('does not create a nested array for AND nested inside OR (flattened due to precedence)', () => {
        expect(tokenize({
          where: ['or',
            ['and',
              ['=', 'status', 'active'],
              ['>', 'age', '18']],
            ['=', 'role', 'admin']
          ]
        })).to.eql([
          ['WHERE', 'status = active'],
          ['AND', 'age > 18'],
          ['OR', 'role = admin']
        ]);
      });

      it('handles deeply nested predicates', () => {
        expect(tokenize({
          where: ['and',
            ['=', 'active', 'true'],
            ['or',
              ['and',
                ['=', 'role', 'admin'],
                ['=', 'dept', 'IT']],
              ['and',
                ['=', 'role', 'manager'],
                ['or',
                  ['=', 'dept', 'Sales'],
                  ['=', 'dept', 'Marketing']
                ]
              ]
            ]
          ]
        })).to.eql([
          ['WHERE', 'active = true'],
          ['AND', [
            ['', 'role = admin'],
            ['AND', 'dept = IT'],
            ['OR', 'role = manager'],
            ['AND', [
              ['', 'dept = Sales'],
              ['OR', 'dept = Marketing']
            ]]
          ]]
        ]);
      });
    });

    describe('operator precedence', () => {
      it('handles mixed AND/OR at same level correctly', () => {
        // Based on operator precedence rules
        expect(tokenize({
          where: ['or',
            ['=', 'a', 'b'],
            ['and',
              ['=', 'c', 'd'],
              ['=', 'e', 'f']
            ],
            ['=', 'g', 'h']
          ]
        })).to.eql([
          ['WHERE', 'a = b'],
          ['OR', 'c = d'],
          ['AND', 'e = f'],
          ['OR', 'g = h']
        ]);
      });
    });
  });

  context('select clause', () => {
    it('tokenizes SELECT clause', () => {
      expect(tokenize({
        select: ['id', 'name', 'email']
      })).to.eql([
        ['SELECT', 'id, name, email']
      ]);
    });
  });

  context('from clause', () => {
    it('should tokenize FROM clause', () => {
      // AST: from: ['users', 'accounts']
      // Token: ['FROM', 'users, accounts']
      expect(tokenize({
        from: ['a', 'b',]
      })).to.eql([
        ['FROM', 'a, b']
      ]);
    });
  });

  context('order by clause', () => {
    it('should tokenize ORDER BY clause', () => {
      expect(tokenize({
        orderBy: ['id', 'asc',]
      })).to.eql([
        ['ORDER BY', 'id ASC']
      ]);
    });
  });

  context('complete expression', () => {
    it('should combine all clauses in correct order', () => {
      expect(tokenize({
        select: ['id', 'name', 'email'],
        from: ['a', 'b',]
      })).to.eql([
        ['SELECT', 'id, name, email'],
        ['FROM', 'a, b']
      ]);
    });
  });
});
