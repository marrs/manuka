type AST = {
  select?: string[],
  from?: string[],
  where?: string[],
}

export function format(ast: AST) {
  // Validate clause dependencies
  if (ast.from && !ast.select) {
    throw new Error('FROM clause requires SELECT clause');
  }

  let result: string[] = [];
  if (ast.select) {
    result.push(`SELECT ${ast.select.join(', ')}`);
  }

  if (ast.from) {
    result.push(`FROM ${ast.from.join(', ')}`);
  }

  return result.join(' ');
}
