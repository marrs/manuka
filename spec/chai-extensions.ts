import * as chai from 'chai';
import chaiString from 'chai-string';

// Register chai-string plugin
chai.use(chaiString);

declare global {
  namespace Chai {
    interface Assertion {
      leadingSpaces(count: number): Assertion;
    }
  }
}

/**
 * Custom Chai assertion to check the number of leading spaces in a string
 *
 * @example
 * expect('  hello').to.have.leadingSpaces(2);
 * expect('SELECT').to.have.leadingSpaces(0);
 */
chai.Assertion.addMethod('leadingSpaces', function(expected: number) {
  const str = this._obj as string;

  // Count leading spaces
  const match = str.match(/^ */);
  const actual = match ? match[0].length : 0;

  this.assert(
    actual === expected,
    `expected string to have ${expected} leading space${expected === 1 ? '' : 's'}, but had ${actual}`,
    `expected string not to have ${expected} leading space${expected === 1 ? '' : 's'}`,
    expected,
    actual
  );
});

export {};
