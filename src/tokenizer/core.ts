import type { SqlValue } from '../types.ts';

export function formatSqlValue(value: SqlValue): string {
  if (value === null) return 'NULL';
  if (value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return value;
}
