import { expect } from 'chai';
import { format, merge } from '../src/builder.ts'

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
    const baseQuery = { select: ['*'], from: ['users'] };

    it('formats a simple equality condition.', () => {
      expect(format(merge({
        where: ['=', 'id', '1']
      }, baseQuery))).to.eql("SELECT * FROM users WHERE id = 1");
    });

    it('formats a not-equal condition.', () => {
      expect(format(merge({
        where: ['<>', 'status', 'inactive']
      }, baseQuery))).to.eql("SELECT * FROM users WHERE status <> inactive");
    });

    it('formats an AND condition with multiple predicates.', () => {
      expect(format(merge({
        where: ['and', ['=', 'active', 'true'], ['>', 'age', '18']]
      }, baseQuery))).to.eql("SELECT * FROM users WHERE active = true AND age > 18");
    });

    it('formats an OR condition with multiple predicates.', () => {
      expect(format(merge({
        where: ['or', ['=', 'role', 'admin'], ['=', 'role', 'moderator']]
      }, baseQuery))).to.eql("SELECT * FROM users WHERE role = admin OR role = moderator");
    });

    it('formats nested logical operators.', () => {
      expect(format(merge({
        where: ['and', ['=', 'active', 'true'], ['or', ['=', 'role', 'admin'], ['=', 'role', 'mod']]]
      }, baseQuery))).to.eql("SELECT * FROM users WHERE active = true AND (role = admin OR role = mod)");
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
