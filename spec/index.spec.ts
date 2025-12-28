import { expect } from 'chai';
import sinon from 'sinon';
import {
  format, partial, param, $, formatter
} from '../src/index.ts';
import {
  all,
  and, or, eq, ne, gt,
} from '../src/vocabulary.ts';

describe('format', () => {
  let format: ReturnType<typeof formatter>;

  beforeEach(() => {
    format = formatter({
      schema: {
        tables: new Set(['t1', 'users', 'products', 'orders', 'calc']),
        columns: {
          // Generic test columns
          a: new Set(['t1']),
          b: new Set(['t1']),
          c: new Set(['t1']),
          't1.a': new Set(['t1']),
          // Users table columns
          id: new Set(['users', 'products', 'orders']),
          name: new Set(['users', 'products']),
          email: new Set(['users']),
          status: new Set(['users']),
          active: new Set(['users']),
          age: new Set(['users']),
          role: new Set(['users']),
          username: new Set(['users']),
          password: new Set(['users']),
          // Orders table columns
          user_id: new Set(['orders']),
          total: new Set(['orders']),
          // Products table columns
          price: new Set(['products']),
          description: new Set(['products'])
        }
      }
    });
  });

  context('select', () => {
    it('returns an empty select expression if no column names are provided.', () => {
      const [sql] = format({select: []});
      expect(sql).to.eql("SELECT ");
    });

    it('returns a select expression for the given column names.', () => {
      const [sql] = format({select: ['a', 'b']});
      expect(sql).to.eql("SELECT a, b");
    });

    it('throws error for unknown column in SELECT', () => {
      expect(() => {
        format({
          select: ['nonexistent'],
          from: ['users']
        });
      }).to.throw(/unknown column.*nonexistent.*users/i);
    });

    it('throws error when column exists in different table', () => {
      expect(() => {
        format({
          select: ['price'],  // price is in products, not users
          from: ['users']
        });
      }).to.throw(/unknown column.*price.*users/i);
    });

    it('matches column names case-sensitively', () => {
      expect(() => {
        format({
          select: ['Email'],  // Wrong case
          from: ['users']
        });
      }).to.throw(/unknown column.*Email/i);
    });

    it('allows SELECT * without column validation', () => {
      const [sql] = format({
        select: ['*'],
        from: ['users']
      });
      expect(sql).to.equal('SELECT * FROM users');
    });
  });

  context('from', () => {
    it('returns a from expression for a single table.', () => {
      const [sql] = format({select: ['*'], from: ['users']});
      expect(sql).to.eql("SELECT * FROM users");
    });

    it('returns a from expression for multiple tables.', () => {
      const [sql] = format({select: ['*'], from: ['users', 'orders']});
      expect(sql).to.eql("SELECT * FROM users, orders");
    });

    it('throws error for unknown table in FROM clause', () => {
      expect(() => {
        format({
          select: ['*'],
          from: ['nonexistent']
        });
      }).to.throw(/unknown table.*nonexistent/i);
    });

    it('matches table names case-sensitively', () => {
      expect(() => {
        format({
          select: ['*'],
          from: ['Users']  // Wrong case
        });
      }).to.throw(/unknown table.*Users/i);
    });
  });

  context('where', () => {
    const selectFromUsers = partial({ select: ['*'], from: ['users'] });

    it('formats a simple equality condition.', () => {
      const [sql, ...bindings] = format(selectFromUsers({
        where: [eq, 'id', '1']
      }));
      expect(sql).to.eql("SELECT * FROM users WHERE id = ?");
      expect(bindings).to.deep.equal(['1']);
    });

    it('formats a not-equal condition.', () => {
      const [sql, ...bindings] = format(selectFromUsers({
        where: [ne, 'status', 'inactive']
      }));
      expect(sql).to.eql("SELECT * FROM users WHERE status <> ?");
      expect(bindings).to.deep.equal(['inactive']);
    });

    it('formats an AND condition with multiple predicates.', () => {
      const [sql, ...bindings] = format(selectFromUsers({
        where: [and, [eq, 'active', 'true'], [gt, 'age', '18']]
      }));
      expect(sql).to.eql("SELECT * FROM users WHERE active = ? AND age > ?");
      expect(bindings).to.deep.equal(['true', '18']);
    });

    it('formats an OR condition with multiple predicates.', () => {
      const [sql, ...bindings] = format(selectFromUsers({
        where: [or, [eq, 'role', 'admin'], [eq, 'role', 'moderator']]
      }));
      expect(sql).to.eql("SELECT * FROM users WHERE role = ? OR role = ?");
      expect(bindings).to.deep.equal(['admin', 'moderator']);
    });

    it('formats nested logical operators.', () => {
      const [sql, ...bindings] = format(selectFromUsers({
        where: [and, [eq, 'active', 'true'], [or, [eq, 'role', 'admin'], [eq, 'role', 'mod']]]
      }));
      expect(sql).to.eql("SELECT * FROM users WHERE active = ? AND (role = ? OR role = ?)");
      expect(bindings).to.deep.equal(['true', 'admin', 'mod']);
    });

    it('formats the README example.', () => {
      const [sql, ...bindings] = format({
        select: ['a', 'b', 'c'],
        from: ['t1'],
        where: [and, [ne, 'b', 'bar'], [eq, 't1.a', 'baz']]
      });
      expect(sql).to.eql("SELECT a, b, c FROM t1 WHERE b <> ? AND t1.a = ?");
      expect(bindings).to.deep.equal(['bar', 'baz']);
    });

    it('throws error for unknown column in WHERE', () => {
      expect(() => {
        format({
          select: ['*'],
          from: ['users'],
          where: ['=', 'nonexistent', $('value')]
        });
      }).to.throw(/unknown column.*nonexistent/i);
    });

    it('wraps string values as placeholders in WHERE', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: ['=', 'username', 'alice']  // Plain string, not $()
      });
      expect(sql).to.include('username = ?');
      expect(bindings).to.deep.equal(['alice']);
    });

    it('wraps number values as placeholders in WHERE', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['orders'],
        where: ['=', 'total', 100]  // Plain number
      });
      expect(sql).to.include('total = ?');
      expect(bindings).to.deep.equal([100]);
    });

    it('wraps boolean values as placeholders in WHERE', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: ['=', 'status', true]  // Plain boolean
      });
      expect(sql).to.include('status = ?');
      expect(bindings).to.deep.equal([true]);
    });

    it('does not wrap column names as placeholders', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: ['=', 'email', 'username']  // Column-to-column comparison
      });
      expect(sql).to.include('email = username');
      expect(bindings).to.deep.equal([]);  // No bindings
    });

    it.skip('place() forces a column name to be treated as a value placeholder', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: ['=', 'email', place('username')]  // Force 'username' as value
      });
      expect(sql).to.include('email = ?');
      expect(bindings).to.deep.equal(['username']);
    });

    it('wraps unknown strings as placeholders (not column names)', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: ['=', 'email', 'alice@example.com']  // Unknown string
      });
      expect(sql).to.include('email = ?');
      expect(bindings).to.deep.equal(['alice@example.com']);
    });

    it('handles mixed value types', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: ['and',
          ['=', 'id', 1],
          ['=', 'username', 'alice'],
          ['=', 'status', true]
        ]
      });
      expect(bindings).to.deep.equal([1, 'alice', true]);
    });

    it('transforms [=, col, null] to IS NULL', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: ['=', 'email', null]
      });
      expect(sql).to.include('email IS NULL');
      expect(bindings).to.deep.equal([]);  // No binding for IS NULL
    });

    it('transforms [<>, col, null] to IS NOT NULL', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: ['<>', 'email', null]
      });
      expect(sql).to.include('email IS NOT NULL');
      expect(bindings).to.deep.equal([]);
    });

    it('throws error for other operators with null', () => {
      expect(() => {
        format({
          select: ['*'],
          from: ['users'],
          where: ['>', 'id', null]
        });
      }).to.throw(/cannot use .* with null/i);
    });

    it('handles NULL in complex expressions', () => {
      const [sql] = format({
        select: ['*'],
        from: ['users'],
        where: ['and',
          ['=', 'email', null],
          ['>', 'id', 100]
        ]
      });
      expect(sql).to.include('email IS NULL');
      expect(sql).to.include('id > ?');
    });
  });

  context('insert', () => {
    it('formats basic INSERT statement', () => {
      const [sql, ...bindings] = format({
        insertInto: 'users',
        values: [[1, 'John', 'john@example.com']]
      });
      expect(sql).to.eql("INSERT INTO users VALUES (?, ?, ?)");
      expect(bindings).to.deep.equal([1, 'John', 'john@example.com']);
    });

    it('formats INSERT with column list and multi-row', () => {
      const [sql, ...bindings] = format({
        insertInto: 'users',
        columns: ['id', 'name'],
        values: [[1, 'John'], [2, 'Jane']]
      });
      expect(sql).to.eql("INSERT INTO users (id, name) VALUES (?, ?), (?, ?)");
      expect(bindings).to.deep.equal([1, 'John', 2, 'Jane']);
    });

    it('formats INSERT with expressions and operator precedence', () => {
      const [sql, ...bindings] = format({
        insertInto: 'calc',
        values: [[['*', ['+', 2, 3], 4]]]
      });
      expect(sql).to.eql("INSERT INTO calc VALUES ((? + ?) * ?)");
      expect(bindings).to.deep.equal([2, 3, 4]);
    });

    context('insert with formatters', () => {
      it('format.print() outputs INSERT with newlines', () => {
        const [sql, ...bindings] = format.print({
          insertInto: 'users',
          columns: ['id', 'name'],
          values: [[1, 'John']]
        });
        expect(sql).to.eql("INSERT INTO users (id, name)\nVALUES (?, ?)");
        expect(bindings).to.deep.equal([1, 'John']);
      });

      it('format.pretty() outputs INSERT with right-aligned keywords', () => {
        const [sql] = format.pretty({
          insertInto: 'users',
          columns: ['id', 'name'],
          values: [[1, 'John']]
        });
        expect(sql).to.eql("INSERT INTO users (id, name)\n     VALUES (1, 'John')");
      });

      it('format.pretty() handles multi-row INSERT', () => {
        const [sql] = format.pretty({
          insertInto: 'users',
          values: [[1, 'John'], [2, 'Jane']]
        });
        expect(sql).to.eql("INSERT INTO users\n     VALUES (1, 'John'), (2, 'Jane')");
      });
    });

    it('validates INSERT INTO table exists', () => {
      const [sql] = format({
        insertInto: 'users',
        values: [[$(1), $('alice')]]
      });
      expect(sql).to.include('INSERT INTO users');
    });

    it('throws error for unknown table in INSERT INTO', () => {
      expect(() => {
        format({
          insertInto: 'nonexistent',
          values: [[$(1)]]
        });
      }).to.throw(/unknown table.*nonexistent/i);
    });

    it('validates INSERT columns exist', () => {
      const [sql] = format({
        insertInto: 'users',
        columns: ['id', 'email'],
        values: [[$(1), $('test@example.com')]]
      });
      expect(sql).to.include('id, email');
    });

    it('throws error for unknown column in INSERT', () => {
      expect(() => {
        format({
          insertInto: 'users',
          columns: ['nonexistent'],
          values: [[$(1)]]
        });
      }).to.throw(/unknown column.*nonexistent/i);
    });

    it('wraps all values in INSERT VALUES', () => {
      const [sql, ...bindings] = format({
        insertInto: 'users',
        columns: ['id', 'username', 'email'],
        values: [[1, 'alice', 'alice@example.com']]  // Plain values
      });
      expect(sql).to.include('VALUES (?, ?, ?)');
      expect(bindings).to.deep.equal([1, 'alice', 'alice@example.com']);
    });
  });

  context('parameter binding', () => {
    it('generates query with ? placeholders for common dialect', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: [eq, 'id', param(0)]
      }, {dialect: 'common', params: [123]});

      expect(sql).to.equal('SELECT * FROM users WHERE id = ?');
      expect(bindings).to.deep.equal([123]);
    });

    it('generates query with $1, $2 placeholders for pg dialect', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: [and, [eq, 'id', param(0)], [eq, 'status', param(1)]]
      }, {dialect: 'pg', params: [123, 'active']});

      expect(sql).to.equal('SELECT * FROM users WHERE id = $1 AND status = $2');
      expect(bindings).to.deep.equal([123, 'active']);
    });

    it('handles named placeholders with object bindings', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: [eq, 'email', param('email')]
      }, {dialect: 'common', params: { email: 'test@example.com' }});

      expect(sql).to.equal('SELECT * FROM users WHERE email = ?');
      expect(bindings).to.deep.equal(['test@example.com']);
    });

    it('validates positional binding count matches placeholder count', () => {
      expect(() => {
        format({
          where: [and, [eq, 'id', param(0)], [eq, 'status', param(1)]]
        }, {params: [123]}); // Only 1 binding for 2 placeholders
      }).to.throw(/parameter/i);
    });

    it('validates named binding keys exist', () => {
      expect(() => {
        format({
          where: [eq, 'email', param('email')]
        }, {params: { wrongKey: 'test@example.com' }});
      }).to.throw(/email/i);
    });

    // XXX Is this spec needed?
    it('optionally disables validation of bindings against parameters', () => {
      const [sql] = format({
        where: [eq, 'id', param(0)]
      }, {validateBindings: false, params: []});

      expect(sql).to.equal('WHERE id = ?');
    });

    it('handles placeholders in INSERT VALUES', () => {
      const [sql, ...bindings] = format({
        insertInto: 'users',
        columns: ['id', 'name', 'email'],
        values: [[param(0), param(1), param(2)]]
      }, {dialect: 'common', params: [1, 'John', 'john@example.com']});

      expect(sql).to.equal("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
      expect(bindings).to.deep.equal([1, 'John', 'john@example.com']);
    });
  });

  context('direct variable binding', () => {
    it('generates query with ? placeholders for common dialect', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: [eq, 'id', $(123)]
      }, {dialect: 'common'});

      expect(sql).to.equal('SELECT * FROM users WHERE id = ?');
      expect(bindings).to.deep.equal([123]);
    });

    it('generates query with $1, $2 placeholders for pg dialect', () => {
      const [sql, ...bindings] = format({
        select: ['*'],
        from: ['users'],
        where: [and, [eq, 'id', $(123)], [eq, 'status', $('active')]]
      }, {dialect: 'pg'});

      expect(sql).to.equal('SELECT * FROM users WHERE id = $1 AND status = $2');
      expect(bindings).to.deep.equal([123, 'active']);
    });

    it('handles placeholders in INSERT VALUES', () => {
      const [sql, ...bindings] = format({
        insertInto: 'users',
        columns: ['id', 'name', 'email'],
        values: [[$(1), $('John'), $('john@example.com')]]
      }, {dialect: 'common'});

      expect(sql).to.equal("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
      expect(bindings).to.deep.equal([1, 'John', 'john@example.com']);
    });

    it('handles null value in direct placeholder', () => {
      const [sql, ...bindings] = format({
        where: [eq, 'status', $(null)]
      }, {dialect: 'common'});

      expect(sql).to.equal('WHERE status = ?');
      expect(bindings).to.deep.equal([null]);
    });

    it('handles undefined value in direct placeholder', () => {
      const [sql, ...bindings] = format({
        where: [eq, 'field', $(undefined)]
      }, {dialect: 'common'});

      expect(sql).to.equal('WHERE field = ?');
      expect(bindings).to.deep.equal([undefined]);
    });

    it('handles boolean true value in direct placeholder', () => {
      const [sql, ...bindings] = format({
        where: [eq, 'active', $(true)]
      }, {dialect: 'common'});

      expect(sql).to.equal('WHERE active = ?');
      expect(bindings).to.deep.equal([true]);
    });

    it('handles boolean false value in direct placeholder', () => {
      const [sql, ...bindings] = format({
        where: [eq, 'active', $(false)]
      }, {dialect: 'common'});

      expect(sql).to.equal('WHERE active = ?');
      expect(bindings).to.deep.equal([false]);
    });
  });

  context('mixed param and direct placeholder', () => {
    it('handles placeholders in INSERT VALUES', () => {
      const [sql, ...bindings] = format({
        insertInto: 'users',
        columns: ['id', 'name', 'email'],
        values: [[$(1), $('John'), param('email')]]
      }, {dialect: 'common', params: {email: 'john@example.com'}});

      expect(sql).to.equal("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
      expect(bindings).to.deep.equal([1, 'John', 'john@example.com']);
    });
  });

});

describe('format.print', () => {
  let format: ReturnType<typeof formatter>;

  beforeEach(() => {
    format = formatter({
      schema: {
        tables: new Set(['users', 't1']),
        columns: {
          a: new Set(['t1']),
          b: new Set(['t1']),
          id: new Set(['users']),
          status: new Set(['users']),
          email: new Set(['users']),
          field: new Set(['users'])
        }
      }
    });
  });

  it('formats with newlines and logs to console.debug.', () => {
    const consoleDebugSpy = sinon.spy(console, 'debug');

    const [sql] = format.print({
      select: ['*'],
      from: ['users']
    });

    expect(sql).to.eql("SELECT *\nFROM users");
    expect(consoleDebugSpy.calledOnce).to.be.true;
    expect(consoleDebugSpy.calledWith("SELECT *\nFROM users")).to.be.true;

    consoleDebugSpy.restore();
  });

  it('returns the formatted output.', () => {
    const consoleDebugStub = sinon.stub(console, 'debug');

    const [sql] = format.print({
      select: ['a', 'b'],
      from: ['t1']
    });

    expect(sql).to.eql("SELECT a, b\nFROM t1");

    consoleDebugStub.restore();
  });

  context('with parameter bindings', () => {
    // FIXME: This test is wrong.
    it('substitutes values in logged output when bindings provided', () => {
      const consoleDebugStub = sinon.stub(console, 'debug');

      const [sql] = format.print({
        where: [eq, 'id', param(0)]
      }, {dialect: 'common', params: [123]});

      expect(sql).to.include('id = ?');  // FIXME: 'id = 123'
      consoleDebugStub.restore();
    });

    it('substitutes values in logged output when bindings provided', () => {
      const consoleDebugStub = sinon.stub(console, 'debug');

      format.print({
        where: [eq, 'id', param(0)]
      }, {dialect: 'common', params: [123]});

      expect(consoleDebugStub).to.have.been.calledWithMatch('id = 123');
      consoleDebugStub.restore();
    });

    it('shows placeholder syntax in logged output when no bindings provided', () => {
      const consoleDebugStub = sinon.stub(console, 'debug');

      format.print({
        where: [and, [eq, 'id', param(0)], [eq, 'status', param(1)]]
      }, {dialect: 'common', params: []});

      expect(consoleDebugStub).to.have.been.calledWithMatch('id = param(0)');
      expect(consoleDebugStub).to.have.been.calledWithMatch('status = param(1)');
      consoleDebugStub.restore();
    });

    it('returns prepared statement when no bindings provided', () => {
      const consoleDebugStub = sinon.stub(console, 'debug');

      const [sql] = format.print({
        where: [and, [eq, 'id', param(0)], [eq, 'status', param(1)]]
      }, {dialect: 'common', params: []});

      expect(sql).to.match(/id = \?/);
      expect(sql).to.match(/status = \?/);
      consoleDebugStub.restore();
    });

    it('shows named placeholder syntax in logged output for named placeholders', () => {
      const consoleDebugStub = sinon.stub(console, 'debug');

      format.print({
        where: [eq, 'email', param('email')]
      }, {dialect: 'common', params: {}});

      expect(consoleDebugStub).to.have.been.calledWithMatch('email = param(email)');
      consoleDebugStub.restore();
    });
  });

  context('direct placeholders - display behavior', () => {
    it('shows direct placeholder values in print() logged output', () => {
      const consoleDebugStub = sinon.stub(console, 'debug');

      format.print({
        where: [eq, 'id', $(123)]
      }, {dialect: 'common'});

      expect(consoleDebugStub).to.have.been.calledWithMatch('id = 123');
      consoleDebugStub.restore();
    });

    it('distinguishes between $(value) and param(key) in print() display', () => {
      const consoleDebugStub = sinon.stub(console, 'debug');

      format.print({
        where: [and, [eq, 'id', $(123)], [eq, 'email', param('email')]]
      }, {dialect: 'common', params: {}});

      // Should show: id = 123 AND email = param(email)
      expect(consoleDebugStub).to.have.been.calledWithMatch('id = 123');
      expect(consoleDebugStub).to.have.been.calledWithMatch('email = param(email)');
      consoleDebugStub.restore();
    });

    it('substitutes direct placeholder values in pretty format', () => {
      const [sql] = format.pretty({
        where: [eq, 'id', $(123)]
      }, {dialect: 'common'});

      expect(sql).to.include('id = 123');
    });
  });
});

describe('format.pretty', () => {
  let format: ReturnType<typeof formatter>;

  beforeEach(() => {
    format = formatter({
      schema: {
        tables: new Set(['users', 't1']),
        columns: {
          a: new Set(['t1']),
          b: new Set(['t1']),
          c: new Set(['t1']),
          't1.a': new Set(['t1']),
          id: new Set(['users']),
          email: new Set(['users'])
        }
      }
    });
  });

  it('prettifies with right-aligned keywords.', () => {
    const [sql] = format.pretty({
      select: ['*'],
      from: ['users'],
      orderBy: 'id',
    });
    expect(sql).to.eql("  SELECT *\n    FROM users\nORDER BY id");
  });

  it('formats a complete query with right-aligned keywords and operators.', () => {
    const [sql] = format.pretty({
      select: ['a', 'b', 'c'],
      from: ['t1'],
      where: [and, [ne, 'b', 'bar'], [eq, 't1.a', 'baz']]
    });
    expect(sql).to.eql("SELECT a, b, c\n  FROM t1\n WHERE b <> 'bar'\n   AND t1.a = 'baz'");
  });

  it('quotes strings', () => {
    const [sql] = format.pretty({
      select: [all],
      from: ['users'],
      where: [eq, 'id', '1']
    });
    expect(sql).to.eql("SELECT *\n  FROM users\n WHERE id = '1'");
  });

  it('does not quote numbers', () => {
    const [sql] = format.pretty({
      select: [all],
      from: ['users'],
      where: [eq, 'id', 1]
    });
    expect(sql).to.eql("SELECT *\n  FROM users\n WHERE id = 1");
  });

  context('with parameter bindings', () => {
    it('substitutes values when bindings provided', () => {
      const [sql] = format.pretty({
        select: [all],
        where: [eq, 'id', param(0)]
      }, {dialect: 'common', params: [123]});

      expect(sql).to.include('id = 123');
    });

    it('shows placeholder syntax when no bindings provided', () => {
      const [sql] = format.pretty({
        where: [and, [eq, 'id', param(0)], [eq, 'email', param('email')]]
      });

      expect(sql).to.include('param(0)');
      expect(sql).to.include("param(email)");
    });
  });
});

describe('format.pprint', () => {
  let format: ReturnType<typeof formatter>;

  beforeEach(() => {
    format = formatter({
      schema: {
        tables: new Set(['users', 't1']),
        columns: {
          a: new Set(['t1']),
          b: new Set(['t1']),
          id: new Set(['users'])
        }
      }
    });
  });

  it('formats with pretty alignment and logs to console.debug.', () => {
    const consoleDebugSpy = sinon.spy(console, 'debug');
    const selectFromUsers = partial({ select: ['*'], from: ['users'] });

    const [sql] = format.pprint(selectFromUsers({
      where: [eq, 'id', 1]
    }));

    expect(sql).to.eql("SELECT *\n  FROM users\n WHERE id = 1");
    expect(consoleDebugSpy.calledOnce).to.be.true;
    expect(consoleDebugSpy.calledWith("SELECT *\n  FROM users\n WHERE id = 1")).to.be.true;

    consoleDebugSpy.restore();
  });

  it('returns the formatted output.', () => {
    const consoleDebugStub = sinon.stub(console, 'debug');

    const [sql] = format.pprint({
      select: ['a', 'b'],
      from: ['t1']
    });

    expect(sql).to.eql("SELECT a, b\n  FROM t1");

    consoleDebugStub.restore();
  });
});

describe('formatter()', () => {
  describe('initialization', () => {
    it('returns a format function', () => {
      const format = formatter();

      expect(format).to.be.a('function');
    });

    it('accepts schema with dialect option', () => {
      const format = formatter({
        dialect: 'pg',
        schema: {
          columns: {
            id: { users: true }
          }
        }
      });

      // Verify pg dialect is used ($1, $2 for placeholders)
      const [sql] = format({
        select: ['id'],
        from: ['users'],
        where: [eq, 'id', $(1)]
      });

      expect(sql).to.include('$1');
      expect(sql).to.not.include('?');
    });

    it('uses "common" dialect by default', () => {
      const format = formatter({
        schema: {
          columns: {
            id: { users: true }
          }
        }
      });

      // Verify common dialect is used (? for placeholders)
      const [sql] = format({
        select: ['id'],
        from: ['users'],
        where: [eq, 'id', $(1)]
      });

      expect(sql).to.include('?');
      expect(sql).to.not.include('$1');
    });
  });

  // @CLAUDE: We'll implement these as part of the validator work.
  describe.skip('schema variants', () => {
    const dml = {
      select: ['id'],
      from: ['users'],
    };

    it('accepts modern schema (Map/Set)', () => {
      const format = formatter({
        schema: {
          columns: new Map([
            ['id', new Set(['users'])],
            ['name', new Set(['users'])]
          ])
        }
      });

      const [sql] = format(dml);

      expect(sql).to.be('SELECT id FROM users');
    });

    it('accepts classic schema (object literals)', () => {
      const format = formatter({
        schema: {
          columns: {
            id: { users: true },
            name: { users: true }
          }
        }
      });

      const [sql] = format(dml);

      expect(sql).to.be('SELECT id FROM users');
    });

    it('accepts mixed schema', () => {
      const format = formatter({
        schema: {
          columns: {
            id: new Set(['users']),
            name: { users: true }
          }
        }
      });

      const [sql] = format(dml);

      expect(sql).to.be('SELECT id FROM users');
    });
  });

  describe('schema with tables property', () => {
    it('accepts modern schema with Set for tables', () => {
      const format = formatter({
        schema: {
          tables: new Set(['users', 'products']),
          columns: new Map([
            ['id', new Set(['users', 'products'])]
          ])
        }
      });

      expect(format).to.be.a('function');
      expect(format.schema).to.exist;
      expect(format.schema.tables).to.be.instanceOf(Set);
      expect(format.schema.tables.has('users')).to.be.true;
      expect(format.schema.tables.has('products')).to.be.true;
    });

    it('accepts classic schema with object for tables', () => {
      const format = formatter({
        schema: {
          tables: { users: true, products: true },
          columns: {
            id: { users: true, products: true }
          }
        }
      });

      expect(format).to.be.a('function');
      expect(format.schema).to.exist;
      expect(format.schema.tables).to.deep.include(
        { users: true, products: true }
      );
    });

    it('accepts mixed schema (Set tables, object columns)', () => {
      const format = formatter({
        schema: {
          tables: new Set(['users']),
          columns: {
            id: { users: true }
          }
        }
      });

      expect(format).to.be.a('function');
      expect(format.schema).to.exist;
      expect(format.schema.tables).to.be.instanceOf(Set);
      expect(format.schema.tables.has('users')).to.be.true;
    });

    it('allows schema without tables property (optional)', () => {
      const format = formatter({
        schema: {
          columns: { id: { users: true } }
        } as any
      });

      expect(format).to.be.a('function');
      expect(format.schema).to.exist;
      expect(format.schema.tables).to.be.undefined;
    });
  });
});

