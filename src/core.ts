const upperCaseSqlKeywords = {
  'check': 'CHECK',
  'create table': 'CREATE TABLE',
  'column': 'COLUMN',
  'decimal': 'DECIMAL',
  'foreign key': 'FOREIGN KEY',
  'primary key': 'PRIMARY KEY',
  'select': 'SELECT',
  'from': 'FROM',
  'where': 'WHERE',
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

export function upperCaseSqlKeyword(kw: string) {
  const result = upperCaseSqlKeywords[kw];
  if (!result) {
    console.error("No upper case keyword for", kw);
    return kw;
  }
  return result;
}
