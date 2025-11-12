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

describe('format.pretty', () => {
  it('formats clauses with newlines.', () => {
    expect(format.pretty({
      select: ['*'],
      from: ['users']
    })).to.eql("SELECT *\nFROM users");
  });

  it('formats a complete query with newlines.', () => {
    expect(format.pretty({
      select: ['a', 'b', 'c'],
      from: ['t1'],
      where: ['and', ['<>', 'b', 'bar'], ['=', 't1.a', 'baz']]
    })).to.eql("SELECT a, b, c\nFROM t1\nWHERE b <> bar AND t1.a = baz");
  });
});

describe('format.pprint', () => {
  const selectFromUsers = partial({ select: ['*'], from: ['users'] });

  it('formats clauses with newlines and logs to console.debug.', () => {
    const consoleDebugSpy = sinon.spy(console, 'debug');

    const result = format.pprint(selectFromUsers({
      where: ['=', 'id', '1']
    }));

    expect(result).to.eql("SELECT *\nFROM users\nWHERE id = 1");
    expect(consoleDebugSpy.calledOnce).to.be.true;
    expect(consoleDebugSpy.calledWith("SELECT *\nFROM users\nWHERE id = 1")).to.be.true;

    consoleDebugSpy.restore();
  });

  it('returns the formatted output.', () => {
    const consoleDebugStub = sinon.stub(console, 'debug');

    const result = format.pprint({
      select: ['a', 'b'],
      from: ['t1']
    });

    expect(result).to.eql("SELECT a, b\nFROM t1");

    consoleDebugStub.restore();
  });
});
