import { expect } from 'chai';
import { param } from '../src/index.ts';
import { eq } from '../src/vocabulary.ts';

describe('param placeholder', () => {
  it('is a function', () => {
    expect(typeof param).to.equal('function');
  });

  it('returns named placeholder object when called with string key', () => {
    const result = param('email');
    expect(result).to.have.property('__placeholder', true);
    expect(result).to.have.property('key', 'email');
  });

  it('returns named placeholder object when called with numeric key', () => {
    const result = param(0);
    expect(result).to.have.property('__placeholder', true);
    expect(result).to.have.property('key', 0);
  });

  it('returns different named placeholder objects for different keys', () => {
    const email = param('email');
    const status = param('status');

    expect(email.key).to.equal('email');
    expect(status.key).to.equal('status');
    expect(email).to.not.equal(status);
  });

  it('named placeholder has correct structure', () => {
    const placeholder = param('userId');

    expect(Object.keys(placeholder)).to.have.lengthOf(2);
    expect(placeholder.__placeholder).to.be.true;
    expect(placeholder.key).to.equal('userId');
  });
});
