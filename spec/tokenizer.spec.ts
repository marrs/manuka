import { expect } from 'chai';
import { tokenize } from '../src/tokenizer.ts';
import { $ } from '../src/index.ts';

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
    it('tokenises FROM clause', () => {
      expect(tokenize({
        from: ['a', 'b',]
      })).to.eql([
        ['FROM', 'a, b']
      ]);
    });
  });

  context('order by clause', () => {
    it('tokenises ORDER BY clause with field and direction', () => {
      expect(tokenize({
        orderBy: ['id', 'asc',]
      })).to.eql([
        ['ORDER BY', 'id ASC']
      ]);
    });

    it('tokenises ORDER BY clause with just field name', () => {
      expect(tokenize({
        orderBy: 'id'
      })).to.eql([
        ['ORDER BY', 'id']
      ]);
    });
  });

  context('complete expression', () => {
    it('combines all clauses in correct order', () => {
      expect(tokenize({
        select: ['id', 'name', 'email'],
        from: ['a', 'b',]
      })).to.eql([
        ['SELECT', 'id, name, email'],
        ['FROM', 'a, b']
      ]);
    });
  });

  context('insert clause', () => {
    context('basic INSERT', () => {
      it('tokenizes INSERT INTO without column list', () => {
        expect(tokenize({
          insertInto: 'users',
          values: [[1, 'John']]
        })).to.eql([
          ['INSERT INTO', 'users'],
          ['VALUES', "(1, 'John')"]
        ]);
      });

      it('tokenizes INSERT INTO with column list', () => {
        expect(tokenize({
          insertInto: 'users',
          columns: ['id', 'name'],
          values: [[1, 'John']]
        })).to.eql([
          ['INSERT INTO', 'users (id, name)'],
          ['VALUES', "(1, 'John')"]
        ]);
      });

      it('tokenizes multi-row INSERT', () => {
        expect(tokenize({
          insertInto: 'users',
          values: [[1, 'John'], [2, 'Jane'], [3, 'Bob']]
        })).to.eql([
          ['INSERT INTO', 'users'],
          ['VALUES', "(1, 'John'), (2, 'Jane'), (3, 'Bob')"]
        ]);
      });

      it('tokenizes INSERT with NULL values', () => {
        expect(tokenize({
          insertInto: 'users',
          values: [[1, null, 'active']]
        })).to.eql([
          ['INSERT INTO', 'users'],
          ['VALUES', "(1, NULL, 'active')"]
        ]);
      });

      it('tokenizes INSERT with numeric values', () => {
        expect(tokenize({
          insertInto: 'products',
          values: [[1, 99.99, 10]]
        })).to.eql([
          ['INSERT INTO', 'products'],
          ['VALUES', '(1, 99.99, 10)']
        ]);
      });

      it('tokenizes INSERT with single value', () => {
        expect(tokenize({
          insertInto: 'counters',
          values: [[42]]
        })).to.eql([
          ['INSERT INTO', 'counters'],
          ['VALUES', '(42)']
        ]);
      });
    });

    context('INSERT with expressions', () => {
      it('tokenizes arithmetic addition', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['+', 10, 5]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '(10 + 5)']
        ]);
      });

      it('tokenizes arithmetic subtraction', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['-', 20, 8]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '(20 - 8)']
        ]);
      });

      it('tokenizes arithmetic multiplication', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['*', 2, 3]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '(2 * 3)']
        ]);
      });

      it('tokenizes arithmetic division', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['/', 100, 10]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '(100 / 10)']
        ]);
      });

      it('tokenizes modulo operator', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['%', 17, 5]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '(17 % 5)']
        ]);
      });

      it('tokenizes string concatenation', () => {
        expect(tokenize({
          insertInto: 'names',
          values: [[['||', 'John', ' Doe']]]
        })).to.eql([
          ['INSERT INTO', 'names'],
          ['VALUES', "('John' || ' Doe')"]
        ]);
      });

      it('tokenizes multiple expressions in single row', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['+', 10, 5], ['*', 2, 3], ['-', 20, 8]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '(10 + 5, 2 * 3, 20 - 8)']
        ]);
      });

      it('tokenizes mixed atoms and expressions', () => {
        expect(tokenize({
          insertInto: 'mixed',
          values: [[1, ['+', 10, 5], 'test']]
        })).to.eql([
          ['INSERT INTO', 'mixed'],
          ['VALUES', "(1, 10 + 5, 'test')"]
        ]);
      });

      it('tokenizes nested arithmetic expressions', () => {
        expect(tokenize({
          insertInto: 'nested',
          values: [[['+', ['*', 2, 3], 5]]]
        })).to.eql([
          ['INSERT INTO', 'nested'],
          ['VALUES', '(2 * 3 + 5)']
        ]);
      });
    });

    context('operator precedence', () => {
      it('handles multiplication before addition (no parens needed)', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['+', 2, ['*', 3, 4]]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '(2 + 3 * 4)']
        ]);
      });

      it('adds parentheses for addition before multiplication', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['*', ['+', 2, 3], 4]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '((2 + 3) * 4)']
        ]);
      });

      it('adds parentheses for subtraction on right side of subtraction', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['-', 10, ['-', 5, 2]]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '(10 - (5 - 2))']
        ]);
      });

      it('no parentheses for subtraction on left side of subtraction', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['-', ['-', 10, 5], 2]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '(10 - 5 - 2)']
        ]);
      });

      it('adds parentheses for division on right side of division', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['/', 100, ['/', 20, 4]]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '(100 / (20 / 4))']
        ]);
      });

      it('handles concatenation with lower precedence than arithmetic', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['||', ['+', 2, 3], 'x']]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', "(2 + 3 || 'x')"]
        ]);
      });

      it('adds parentheses for concatenation nested in multiplication', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['*', ['||', 'a', 'b'], 2]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', "(('a' || 'b') * 2)"]
        ]);
      });

      it('handles complex nested expressions with correct precedence', () => {
        expect(tokenize({
          insertInto: 'calc',
          values: [[['-', ['*', ['+', 2, 3], 4], 5]]]
        })).to.eql([
          ['INSERT INTO', 'calc'],
          ['VALUES', '((2 + 3) * 4 - 5)']
        ]);
      });
    });

    context('edge cases', () => {
      it('returns empty tokens when insertInto is missing', () => {
        expect(tokenize({
          values: [[1, 2]]
        })).to.eql([]);
      });

      it('returns empty tokens when values is missing', () => {
        expect(tokenize({
          insertInto: 'users'
        })).to.eql([]);
      });

      it('handles empty column list', () => {
        expect(tokenize({
          insertInto: 'users',
          columns: [],
          values: [[1, 'John']]
        })).to.eql([
          ['INSERT INTO', 'users'],
          ['VALUES', "(1, 'John')"]
        ]);
      });
    });
  });

  context('placeholders', () => {
    context('positional placeholder', () => {
      it('converts to marker with common dialect', () => {
        const context = { placeholders: [], dialect: 'common' as const };

        const result = tokenize({
          where: ['=', 'id', $]
        }, context);

        expect(context.placeholders).to.deep.equal([0]);
        expect(result).to.deep.include(['WHERE', 'id = \x00MANUKA_PH_0\x00']);
      });

      it('converts to marker with pg dialect', () => {
        const context = { placeholders: [], dialect: 'pg' as const };

        const result = tokenize({
          where: ['=', 'id', $]
        }, context);

        expect(context.placeholders).to.deep.equal([0]);
        expect(result).to.deep.include(['WHERE', 'id = \x00MANUKA_PH_0\x00']);
      });
    });

    context('named placeholder', () => {
      it('converts to marker with common dialect', () => {
        const context = { placeholders: [], dialect: 'common' as const };

        const result = tokenize({
          where: ['=', 'email', $('userEmail')]
        }, context);

        expect(context.placeholders).to.deep.equal(['userEmail']);
        expect(result).to.deep.include(['WHERE', 'email = \x00MANUKA_PH_0\x00']);
      });

      it('converts to marker with pg dialect', () => {
        const context = { placeholders: [], dialect: 'pg' as const };

        const result = tokenize({
          where: ['=', 'email', $('userEmail')]
        }, context);

        expect(context.placeholders).to.deep.equal(['userEmail']);
        expect(result).to.deep.include(['WHERE', 'email = \x00MANUKA_PH_0\x00']);
      });
    });

    context('multiple placeholders', () => {
      it('tracks placeholders sequentially with common dialect', () => {
        const context = { placeholders: [], dialect: 'common' as const };

        tokenize({
          where: ['and', ['=', 'id', $], ['=', 'status', $]]
        }, context);

        expect(context.placeholders).to.deep.equal([0, 1]);
      });

      it('tracks placeholders sequentially with pg dialect', () => {
        const context = { placeholders: [], dialect: 'pg' as const };

        tokenize({
          where: ['and', ['=', 'id', $], ['=', 'status', $]]
        }, context);

        expect(context.placeholders).to.deep.equal([0, 1]);
      });

      it('handles mixed positional and named placeholders', () => {
        const context = { placeholders: [], dialect: 'common' as const };

        tokenize({
          where: ['and', ['=', 'id', $], ['=', 'email', $('email')]]
        }, context);

        expect(context.placeholders).to.deep.equal([0, 'email']);
      });
    });
  });
});
