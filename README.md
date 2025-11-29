# Manuka

A javascript SQL builder based on HoneySQL.

Similar to HoneySQL, Manuka allows the user to represent an SQL query as data,
which you can provide to Manuka for operations such as formatting.

The main advantage of using an AST to represent SQL is that it makes it
trivially easy to compose a more complicated SQL query from simpler parts.

A secondary advantage of using an AST is that different formatters can be used
to render the SQL string depending on use.  For example, Manuka includes a
formatter for pretty printing SQL to the console.

## Examples

### Basic queries

A simple query:
```javascript
import { format } from 'manuka';
format({
  select: ['a', 'b', 'c'],
  from: ['t1'],
  where: [
    'and',
    ['<>', 'b', 'bar'], ['=', 't1.a', 'baz'],
  ],
})
```

### Prepared statements

A simple prepared statement:
```javascript
import { format, $ } from 'manuka';
format({
  select: ['a', 'b', 'c'],
  from: ['t1'],
  where: [
    'and',
    ['<>', 'b', $], ['=', 't1.a', $],
  ],
}, ['bar', 'baz'])
```

A prepared statement using an object to represent the data:
```javascript
import { format, $ } from 'manuka';
format({
  select: ['a', 'b', 'c'],
  from: ['t1'],
  where: [
    'and',
    ['<>', 'b', $('bar')], ['=', 't1.a', $('baz')],
  ],
}, {bar: 'bar', baz: 'baz'})
```

A prepared statement using a nested object to represent the data:
```javascript
import { format, $ } from 'manuka';
format({
  select: ['a', 'b', 'c'],
  from: ['t1'],
  where: [
    'and',
    ['<>', 'b', $('foo.bar')], ['=', 't1.a', $('foo.baz')],
  ],
}, {
  foo: {
    bar: 'bar',
    baz: 'baz',
  }
})
```

In case the `.` character is used within property names already,
a different delimiter can be used to delimit nested properties:
```javascript
import { format } from 'manuka';
format($ => {
  $.delimiter('#');
  return {
    select: ['a', 'b', 'c'],
    from: ['t1'],
    where: [
      'and',
      ['<>', 'b', $('foo#bar')], ['=', 't1.a', $('foo#baz')],
    ],
  };
}), {
  foo: {
    bar: 'bar',
    baz: 'baz',
  }
})
```

When `format` receives a function as its first argument, it passes a
version of `$` to it that is scoped only to the function, and which
has an additional method for controlling its behaviour.

## Inspired by HoneySQL

Manuka's AST design is inspired by [HoneySQL](https://github.com/seancorfield/honeysql),
a Clojure SQL builder.  Its name is a nod to that project.
