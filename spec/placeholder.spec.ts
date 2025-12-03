import { expect } from 'chai';
import { $ } from '../src/index.ts';
import { eq } from '../src/vocabulary.ts';

describe('$ placeholder', () => {
  it('is a function with __isPlaceholder marker', () => {
    expect(typeof $).to.equal('function');
    expect($).to.have.property('__isPlaceholder', true);
  });

  it('returns named placeholder object when called with key', () => {
    const result = $('email');
    expect(result).to.have.property('__placeholder', true);
    expect(result).to.have.property('key', 'email');
  });

  it('can be used directly as a value', () => {
    // This tests that $ can be placed in an array/object as a value
    const arr = [eq, 'id', $];
    expect(arr[2]).to.equal($);
  });

  it('returns different named placeholder objects for different keys', () => {
    const email = $('email');
    const status = $('status');

    expect(email.key).to.equal('email');
    expect(status.key).to.equal('status');
    expect(email).to.not.equal(status);
  });

  it('named placeholder has correct structure', () => {
    const placeholder = $('userId');

    expect(Object.keys(placeholder)).to.have.lengthOf(2);
    expect(placeholder.__placeholder).to.be.true;
    expect(placeholder.key).to.equal('userId');
  });
});
