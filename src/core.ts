const upperCaseSqlKeywords: Record<string, string> = {
  'check': 'CHECK',
  'create table': 'CREATE TABLE',
  'column': 'COLUMN',
  'decimal': 'DECIMAL',
  'foreign key': 'FOREIGN KEY',
  'primary key': 'PRIMARY KEY',
  'select': 'SELECT',
  'from': 'FROM',
  'where': 'WHERE',
  'order by': 'ORDER BY',
  'if exists': 'IF EXISTS',
  'if not exists': 'IF NOT EXISTS',
  'integer': 'INTEGER',
  'references': 'REFERENCES',
  'and': 'AND',
  'or': 'OR',
  'varchar': 'VARCHAR',
  'unique': 'UNIQUE',
  'default': 'DEFAULT',
  'text': 'TEXT',
  'insert into': 'INSERT INTO',
  'values': 'VALUES',
}

export function upperCaseSqlKeyword(kw: string): string {
  // Normalize to lowercase for lookup
  const result = upperCaseSqlKeywords[kw.toLowerCase()];
  if (!result) {
    console.error("No upper case keyword for", kw);
    return kw;
  }
  return result;
}
