import { expect } from 'chai';
import sinon from 'sinon';
import { format, partial, param, $ } from '../src/index.ts';
import {
  all,
  integer,
  and, or, eq, ne, lt, gt, gte
} from '../src/vocabulary.ts';

describe('format', () => {
  context('select', () => {
    it('returns an empty select expression if no column names are provided.', () => {
      const [sql] = format({select: []});
      expect(sql).to.eql("SELECT ");
    });

    it('returns a select expression for the given column names.', () => {
      const [sql] = format({select: ['a', 'b']});
      expect(sql).to.eql("SELECT a, b");
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

  });

  context('where', () => {
    const selectFromUsers = partial({ select: ['*'], from: ['users'] });

    it('formats a simple equality condition.', () => {
      const [sql] = format(selectFromUsers({
        where: [eq, 'id', '1']
      }));
      expect(sql).to.eql("SELECT * FROM users WHERE id = 1");
    });

    it('formats a not-equal condition.', () => {
      const [sql] = format(selectFromUsers({
        where: [ne, 'status', 'inactive']
      }));
      expect(sql).to.eql("SELECT * FROM users WHERE status <> inactive");
    });

    it('formats an AND condition with multiple predicates.', () => {
      const [sql] = format(selectFromUsers({
        where: [and, [eq, 'active', 'true'], [gt, 'age', '18']]
      }));
      expect(sql).to.eql("SELECT * FROM users WHERE active = true AND age > 18");
    });

    it('formats an OR condition with multiple predicates.', () => {
      const [sql] = format(selectFromUsers({
        where: [or, [eq, 'role', 'admin'], [eq, 'role', 'moderator']]
      }));
      expect(sql).to.eql("SELECT * FROM users WHERE role = admin OR role = moderator");
    });

    it('formats nested logical operators.', () => {
      const [sql] = format(selectFromUsers({
        where: [and, [eq, 'active', 'true'], [or, [eq, 'role', 'admin'], [eq, 'role', 'mod']]]
      }));
      expect(sql).to.eql("SELECT * FROM users WHERE active = true AND (role = admin OR role = mod)");
    });

    it('formats the README example.', () => {
      const [sql] = format({
        select: ['a', 'b', 'c'],
        from: ['t1'],
        where: [and, [ne, 'b', 'bar'], [eq, 't1.a', 'baz']]
      });
      expect(sql).to.eql("SELECT a, b, c FROM t1 WHERE b <> bar AND t1.a = baz");
    });
  });
});

describe('format.print', () => {
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
});

describe('format.pretty', () => {
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
    expect(sql).to.eql("SELECT a, b, c\n  FROM t1\n WHERE b <> bar\n   AND t1.a = baz");
  });
});

describe('format.pprint', () => {
  const selectFromUsers = partial({ select: ['*'], from: ['users'] });

  it('formats with pretty alignment and logs to console.debug.', () => {
    const consoleDebugSpy = sinon.spy(console, 'debug');

    const [sql] = format.pprint(selectFromUsers({
      where: [eq, 'id', '1']
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

describe('format with unified DML/DDL API', () => {
  it('handles DML queries', () => {
    const [sql] = format({ select: ['*'], from: ['users'] });
    expect(sql).to.eql("SELECT * FROM users");
  });

  it('handles DDL statements', () => {
    const [sql] = format({
      createTable: 'users',
      withColumns: [['id', integer]]
    });
    expect(sql).to.eql("CREATE TABLE users (id INTEGER)");
  });
});

describe('insert', () => {
  it('formats basic INSERT statement', () => {
    const [sql] = format({
      insertInto: 'users',
      values: [[1, 'John', 'john@example.com']]
    });
    expect(sql).to.eql("INSERT INTO users VALUES (1, 'John', 'john@example.com')");
  });

  it('formats INSERT with column list and multi-row', () => {
    const [sql] = format({
      insertInto: 'users',
      columns: ['id', 'name'],
      values: [[1, 'John'], [2, 'Jane']]
    });
    expect(sql).to.eql("INSERT INTO users (id, name) VALUES (1, 'John'), (2, 'Jane')");
  });

  it('formats INSERT with expressions and operator precedence', () => {
    const [sql] = format({
      insertInto: 'calc',
      values: [[['*', ['+', 2, 3], 4]]]
    });
    expect(sql).to.eql("INSERT INTO calc VALUES ((2 + 3) * 4)");
  });

  context('insert with formatters', () => {
    it('format.print() outputs INSERT with newlines', () => {
      const [sql] = format.print({
        insertInto: 'users',
        columns: ['id', 'name'],
        values: [[1, 'John']]
      });
      expect(sql).to.eql("INSERT INTO users (id, name)\nVALUES (1, 'John')");
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
});

describe('placeholders for params option', () => {
  context('format() with placeholders', () => {
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

  context('format.print() with placeholders', () => {
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

    it.skip('returns prepared statement when no bindings provided', () => {
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

  context('format.pretty() with placeholders', () => {
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

describe('placeholders for direct parameter binding', () => {
  context('format() with placeholders', () => {
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
});

describe('mixed param and direct placeholder', () => {
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

describe('direct placeholders - display behavior', () => {
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
