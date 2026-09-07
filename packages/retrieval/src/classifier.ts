/** Rule-based task classifier, spec section 33. */

export type TaskClass =
  | 'repository_orientation'
  | 'architecture'
  | 'debugging'
  | 'testing'
  | 'refactor'
  | 'database'
  | 'api'
  | 'frontend'
  | 'backend'
  | 'documentation'
  | 'security'
  | 'dependency'
  | 'performance'
  | 'symbol_lookup'
  | 'unknown';

const RULES: Array<{ pattern: RegExp; taskClass: TaskClass }> = [
  { pattern: /\b(explain|describe|overview|orient|tour)\b.*\b(repo|repository|codebase|project)\b/i, taskClass: 'repository_orientation' },
  { pattern: /\bwhat (does|is) this (repo|repository|codebase|project)\b/i, taskClass: 'repository_orientation' },
  { pattern: /\b(what breaks|blast radius|impact|affected|breaks? if|rename|refactor|change .* without)\b/i, taskClass: 'refactor' },
  { pattern: /\b(bug|error|exception|crash|fail(s|ing|ure)?|broken|stack ?trace|regression)\b/i, taskClass: 'debugging' },
  { pattern: /\b(test|spec|coverage|fixture|mock)s?\b/i, taskClass: 'testing' },
  { pattern: /\b(how does .+ (reach|talk to|connect|flow|call)|architecture|data ?flow|request flow|end.to.end|pipeline)\b/i, taskClass: 'architecture' },
  { pattern: /\b(schema|migration|database|table|sql|query|orm)\b/i, taskClass: 'database' },
  { pattern: /\b(endpoint|route|api|rest|graphql|handler)\b/i, taskClass: 'api' },
  { pattern: /\b(component|render|css|ui|frontend|browser)\b/i, taskClass: 'frontend' },
  { pattern: /\b(auth|token|security|vulnerab|injection|secret)\b/i, taskClass: 'security' },
  { pattern: /\b(dependenc|package|version|upgrade|install)\b/i, taskClass: 'dependency' },
  { pattern: /\b(slow|performance|latency|optimi[sz]e|memory)\b/i, taskClass: 'performance' },
  { pattern: /\b(where is|who calls|callers? of|defined|definition of|usages? of|references? to)\b/i, taskClass: 'symbol_lookup' },
  { pattern: /\b(doc|readme|comment|documentation)\b/i, taskClass: 'documentation' },
];

export function classifyTask(query: string): TaskClass {
  for (const rule of RULES) {
    if (rule.pattern.test(query)) return rule.taskClass;
  }
  return 'unknown';
}

/**
 * Candidate seed terms: identifier-looking tokens (CamelCase, snake_case,
 * dotted) rank above plain words; stop-words are dropped.
 */
export interface SeedTerms {
  identifiers: string[];
  words: string[];
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'how', 'what', 'where',
  'when', 'why', 'who', 'which', 'this', 'that', 'it', 'in', 'on', 'of', 'to', 'for', 'and',
  'or', 'if', 'i', 'we', 'you', 'my', 'our', 'change', 'changes', 'changed', 'will', 'would',
  'can', 'could', 'should', 'reach', 'reaches', 'work', 'works', 'handled', 'handle', 'called',
  'calls', 'call', 'break', 'breaks', 'repo', 'repository', 'codebase', 'project', 'explain',
  'file', 'files', 'code', 'implemented', 'implement', 'happens',
]);

export function extractSeedTerms(query: string): SeedTerms {
  const tokens = query.match(/[A-Za-z_][A-Za-z0-9_.]*/g) ?? [];
  const identifiers: string[] = [];
  const words: string[] = [];
  for (const token of tokens) {
    if (STOP_WORDS.has(token.toLowerCase())) continue;
    const isIdentifier =
      /[a-z][A-Z]/.test(token) || token.includes('_') || token.includes('.') ||
      /^[A-Z][a-z]+[A-Z]/.test(token);
    if (isIdentifier) identifiers.push(token);
    else words.push(token);
  }
  return { identifiers: [...new Set(identifiers)], words: [...new Set(words)] };
}
