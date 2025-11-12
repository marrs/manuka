import { expect } from 'chai';
import sinon from 'sinon';
import { format, partial } from '../src/builder.ts'

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

    it('requires a select clause.', () => {
      expect(() => format({from: ['t1']})).to.throw(/FROM clause requires SELECT clause/);
    });
  });

  context('where', () => {
    const selectFromUsers = partial({ select: ['*'], from: ['users'] });

    it('formats a simple equality condition.', () => {
      expect(format(selectFromUsers({
        where: ['=', 'id', '1']
      }))).to.eql("SELECT * FROM users WHERE id = 1");
    });

    it('formats a not-equal condition.', () => {
      expect(format(selectFromUsers({
        where: ['<>', 'status', 'inactive']
      }))).to.eql("SELECT * FROM users WHERE status <> inactive");
    });

    it('formats an AND condition with multiple predicates.', () => {
      expect(format(selectFromUsers({
        where: ['and', ['=', 'active', 'true'], ['>', 'age', '18']]
      }))).to.eql("SELECT * FROM users WHERE active = true AND age > 18");
    });

    it('formats an OR condition with multiple predicates.', () => {
      expect(format(selectFromUsers({
        where: ['or', ['=', 'role', 'admin'], ['=', 'role', 'moderator']]
      }))).to.eql("SELECT * FROM users WHERE role = admin OR role = moderator");
    });

    it('formats nested logical operators.', () => {
      expect(format(selectFromUsers({
        where: ['and', ['=', 'active', 'true'], ['or', ['=', 'role', 'admin'], ['=', 'role', 'mod']]]
      }))).to.eql("SELECT * FROM users WHERE active = true AND (role = admin OR role = mod)");
    });

    it('formats the README example.', () => {
      expect(format({
        select: ['a', 'b', 'c'],
        from: ['t1'],
        where: ['and', ['<>', 'b', 'bar'], ['=', 't1.a', 'baz']]
      })).to.eql("SELECT a, b, c FROM t1 WHERE b <> bar AND t1.a = baz");
    });
  });
});

describe('format.newline', () => {
  it('formats clauses with newlines.', () => {
    expect(format.newline({
      select: ['*'],
      from: ['users']
    })).to.eql("SELECT *\nFROM users");
  });

  it('formats a complete query with newlines.', () => {
    expect(format.newline({
      select: ['a', 'b', 'c'],
      from: ['t1'],
      where: ['and', ['<>', 'b', 'bar'], ['=', 't1.a', 'baz']]
    })).to.eql("SELECT a, b, c\nFROM t1\nWHERE b <> bar AND t1.a = baz");
  });
});

describe('format.nlprint', () => {
  it('formats with newlines and logs to console.debug.', () => {
    const consoleDebugSpy = sinon.spy(console, 'debug');

    const result = format.nlprint({
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

    const result = format.nlprint({
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
      from: ['users']
    })).to.eql("SELECT *\n  FROM users");
  });

  it('formats a complete query with right-aligned keywords and operators.', () => {
    expect(format.pretty({
      select: ['a', 'b', 'c'],
      from: ['t1'],
      where: ['and', ['<>', 'b', 'bar'], ['=', 't1.a', 'baz']]
    })).to.eql("SELECT a, b, c\n  FROM t1\n WHERE b <> bar\n   AND t1.a = baz");
  });
});

describe('format.pprint', () => {
  const selectFromUsers = partial({ select: ['*'], from: ['users'] });

  it('formats with pretty alignment and logs to console.debug.', () => {
    const consoleDebugSpy = sinon.spy(console, 'debug');

    const result = format.pprint(selectFromUsers({
      where: ['=', 'id', '1']
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

describe('indentation configuration', () => {
  it('format.pretty uses default 2-space indentation.', () => {
    expect(format.pretty({
      select: ['*'],
      from: ['users'],
      where: ['and', ['=', 'active', 'true'], ['=', 'role', 'admin']]
    })).to.eql("SELECT *\n  FROM users\n WHERE active = true\n   AND role = admin");
  });

  it('format.pretty accepts custom indentation string.', () => {
    expect(format.pretty({
      select: ['*'],
      from: ['users'],
      where: ['and', ['=', 'active', 'true'], ['=', 'role', 'admin']]
    }, '    ')).to.eql("SELECT *\n    FROM users\n   WHERE active = true\n     AND role = admin");
  });

  it('format.pretty accepts tab indentation.', () => {
    expect(format.pretty({
      select: ['*'],
      from: ['users']
    }, '\t')).to.eql("SELECT *\n\tFROM users");
  });
});
