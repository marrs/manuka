import { expect } from 'chai';
import sinon from 'sinon';
import { format, partial, validate } from '../src/index.ts';
import {
  integer,
  and, or, eq, ne, lt, gt, gte
} from '../src/vocabulary.ts';

describe('format', () => {
  context('select', () => {
    it('returns an empty select expression if no column names are provided.', () => {
      expect(format({select: []})).to.eql("SELECT ");
    });

    it('returns a select expression for the given column names.', () => {
      expect(format({select: ['a', 'b']})).to.eql("SELECT a, b");
    });
  });

  context('from', () => {
    it('returns a from expression for a single table.', () => {
      expect(format({select: ['*'], from: ['users']})).to.eql("SELECT * FROM users");
    });

    it('returns a from expression for multiple tables.', () => {
      expect(format({select: ['*'], from: ['users', 'orders']})).to.eql("SELECT * FROM users, orders");
    });

  });

  context('where', () => {
    const selectFromUsers = partial({ select: ['*'], from: ['users'] });

    it('formats a simple equality condition.', () => {
      expect(format(selectFromUsers({
        where: [eq, 'id', '1']
      }))).to.eql("SELECT * FROM users WHERE id = 1");
    });

    it('formats a not-equal condition.', () => {
      expect(format(selectFromUsers({
        where: [ne, 'status', 'inactive']
      }))).to.eql("SELECT * FROM users WHERE status <> inactive");
    });

    it('formats an AND condition with multiple predicates.', () => {
      expect(format(selectFromUsers({
        where: [and, [eq, 'active', 'true'], [gt, 'age', '18']]
      }))).to.eql("SELECT * FROM users WHERE active = true AND age > 18");
    });

    it('formats an OR condition with multiple predicates.', () => {
      expect(format(selectFromUsers({
        where: [or, [eq, 'role', 'admin'], [eq, 'role', 'moderator']]
      }))).to.eql("SELECT * FROM users WHERE role = admin OR role = moderator");
    });

    it('formats nested logical operators.', () => {
      expect(format(selectFromUsers({
        where: [and, [eq, 'active', 'true'], [or, [eq, 'role', 'admin'], [eq, 'role', 'mod']]]
      }))).to.eql("SELECT * FROM users WHERE active = true AND (role = admin OR role = mod)");
    });

    it('formats the README example.', () => {
      expect(format({
        select: ['a', 'b', 'c'],
        from: ['t1'],
        where: [and, [ne, 'b', 'bar'], [eq, 't1.a', 'baz']]
      })).to.eql("SELECT a, b, c FROM t1 WHERE b <> bar AND t1.a = baz");
    });
  });
});

describe('format.print', () => {
  it('formats with newlines and logs to console.debug.', () => {
    const consoleDebugSpy = sinon.spy(console, 'debug');

    const result = format.print({
      select: ['*'],
      from: ['users']
    });

    expect(result).to.eql("SELECT *\nFROM users");
    expect(consoleDebugSpy.calledOnce).to.be.true;
    expect(consoleDebugSpy.calledWith("SELECT *\nFROM users")).to.be.true;

    consoleDebugSpy.restore();
  });

  it('returns the formatted output.', () => {
    const consoleDebugStub = sinon.stub(console, 'debug');

    const result = format.print({
      select: ['a', 'b'],
      from: ['t1']
    });

    expect(result).to.eql("SELECT a, b\nFROM t1");

    consoleDebugStub.restore();
  });
});

describe('format.pretty', () => {
  it('prettifies with right-aligned keywords.', () => {
    expect(format.pretty({
      select: ['*'],
      from: ['users'],
      orderBy: 'id',
    })).to.eql("  SELECT *\n    FROM users\nORDER BY id");
  });

  it('formats a complete query with right-aligned keywords and operators.', () => {
    expect(format.pretty({
      select: ['a', 'b', 'c'],
      from: ['t1'],
      where: [and, [ne, 'b', 'bar'], [eq, 't1.a', 'baz']]
    })).to.eql("SELECT a, b, c\n  FROM t1\n WHERE b <> bar\n   AND t1.a = baz");
  });
});

describe('format.pprint', () => {
  const selectFromUsers = partial({ select: ['*'], from: ['users'] });

  it('formats with pretty alignment and logs to console.debug.', () => {
    const consoleDebugSpy = sinon.spy(console, 'debug');

    const result = format.pprint(selectFromUsers({
      where: [eq, 'id', '1']
    }));

    expect(result).to.eql("SELECT *\n  FROM users\n WHERE id = 1");
    expect(consoleDebugSpy.calledOnce).to.be.true;
    expect(consoleDebugSpy.calledWith("SELECT *\n  FROM users\n WHERE id = 1")).to.be.true;

    consoleDebugSpy.restore();
  });

  it('returns the formatted output.', () => {
    const consoleDebugStub = sinon.stub(console, 'debug');

    const result = format.pprint({
      select: ['a', 'b'],
      from: ['t1']
    });

    expect(result).to.eql("SELECT a, b\n  FROM t1");

    consoleDebugStub.restore();
  });
});

describe('format with unified DML/DDL API', () => {
  it('handles DML queries', () => {
    expect(format({ select: ['*'], from: ['users'] })).to.eql("SELECT * FROM users");
  });

  it('handles DDL statements', () => {
    expect(format({
      createTable: 'users',
      withColumns: [['id', integer]]
    })).to.eql("CREATE TABLE users (id INTEGER)");
  });
});

describe('insert', () => {
  context('basic insert', () => {
    it('formats basic INSERT with single row', () => {
      expect(format({
        insertInto: 'users',
        values: [[1, 'John', 'john@example.com']]
      })).to.eql("INSERT INTO users VALUES (1, 'John', 'john@example.com')");
    });

    it('formats INSERT with column list', () => {
      expect(format({
        insertInto: 'users',
        columns: ['id', 'name', 'email'],
        values: [[1, 'John', 'john@example.com']]
      })).to.eql("INSERT INTO users (id, name, email) VALUES (1, 'John', 'john@example.com')");
    });

    it('formats multi-row INSERT', () => {
      expect(format({
        insertInto: 'users',
        values: [[1, 'John'], [2, 'Jane'], [3, 'Bob']]
      })).to.eql("INSERT INTO users VALUES (1, 'John'), (2, 'Jane'), (3, 'Bob')");
    });

    it('formats INSERT with NULL values', () => {
      expect(format({
        insertInto: 'users',
        values: [[1, null, 'active']]
      })).to.eql("INSERT INTO users VALUES (1, NULL, 'active')");
    });

    it('formats INSERT with numeric values', () => {
      expect(format({
        insertInto: 'products',
        values: [[1, 99.99, 10]]
      })).to.eql("INSERT INTO products VALUES (1, 99.99, 10)");
    });

    it('formats INSERT with single value', () => {
      expect(format({
        insertInto: 'counters',
        values: [[42]]
      })).to.eql("INSERT INTO counters VALUES (42)");
    });
  });

  context('insert with expressions', () => {
    it('formats INSERT with arithmetic addition', () => {
      expect(format({
        insertInto: 'calculations',
        values: [[['+', 10, 5]]]
      })).to.eql("INSERT INTO calculations VALUES (10 + 5)");
    });

    it('formats INSERT with multiple arithmetic operations', () => {
      expect(format({
        insertInto: 'calculations',
        values: [[['+', 10, 5], ['*', 2, 3], ['-', 20, 8]]]
      })).to.eql("INSERT INTO calculations VALUES (10 + 5, 2 * 3, 20 - 8)");
    });

    it('formats INSERT with string concatenation', () => {
      expect(format({
        insertInto: 'names',
        values: [[['||', 'John', ' Doe']]]
      })).to.eql("INSERT INTO names VALUES ('John' || ' Doe')");
    });

    it('formats INSERT with mixed atoms and expressions', () => {
      expect(format({
        insertInto: 'mixed',
        values: [[1, ['+', 10, 5], 'test', ['*', 2, 3]]]
      })).to.eql("INSERT INTO mixed VALUES (1, 10 + 5, 'test', 2 * 3)");
    });

    it('formats INSERT with nested arithmetic expressions', () => {
      expect(format({
        insertInto: 'nested',
        values: [[['+', ['*', 2, 3], 5]]]
      })).to.eql("INSERT INTO nested VALUES (2 * 3 + 5)");
    });

    it('formats INSERT with division and modulo', () => {
      expect(format({
        insertInto: 'math',
        values: [[['/', 100, 10], ['%', 17, 5]]]
      })).to.eql("INSERT INTO math VALUES (100 / 10, 17 % 5)");
    });
  });

  context('insert with formatters', () => {
    it('format.print() outputs INSERT with newlines', () => {
      const result = format.print({
        insertInto: 'users',
        columns: ['id', 'name'],
        values: [[1, 'John']]
      });
      expect(result).to.eql("INSERT INTO users (id, name)\nVALUES (1, 'John')");
    });

    it('format.pretty() outputs INSERT with right-aligned keywords', () => {
      const result = format.pretty({
        insertInto: 'users',
        columns: ['id', 'name'],
        values: [[1, 'John']]
      });
      expect(result).to.eql("INSERT INTO users (id, name)\n     VALUES (1, 'John')");
    });

    it('format.pretty() handles multi-row INSERT', () => {
      const result = format.pretty({
        insertInto: 'users',
        values: [[1, 'John'], [2, 'Jane']]
      });
      expect(result).to.eql("INSERT INTO users\n     VALUES (1, 'John'), (2, 'Jane')");
    });
  });
});
