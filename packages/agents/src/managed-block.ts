const BEGIN = '<!-- SETSU:BEGIN scout -->';
const END = '<!-- SETSU:END scout -->';

/** Graph-first guidance installed into agent instruction files (spec s42). */
export const SCOUT_GUIDANCE = `${BEGIN}
For repository-wide questions, use SETSU code intelligence before broad raw-file search.
Call the \`setsu_context\` MCP tool with the task or question; it returns a token-budgeted
evidence pack (symbols, snippets, graph paths). Use \`setsu_symbol\`, \`setsu_path\` and
\`setsu_impact\` for symbol lookups, architecture chains and blast-radius checks.
Read full files only when the returned evidence is insufficient.
${END}`;

/** Idempotently insert or refresh the managed block in an instruction file. */
export function upsertManagedBlock(content: string): string {
  const beginIdx = content.indexOf(BEGIN);
  const endIdx = content.indexOf(END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    return content.slice(0, beginIdx) + SCOUT_GUIDANCE + content.slice(endIdx + END.length);
  }
  const separator = content.length === 0 || content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
  return content + separator + SCOUT_GUIDANCE + '\n';
}

export function hasManagedBlock(content: string): boolean {
  return content.includes(BEGIN) && content.includes(END);
}
