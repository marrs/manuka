# Manuka

A javascript SQL builder based on HoneySQL.

## Examples

```
{
  select: ['a', 'b', 'c'],
  from: ['t1'],
  where: [
    'and',
    ['<>', 'b', 'bar'], ['=', 't1.a', 'baz'],
  ],
}
```
