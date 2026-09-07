import { describe, it, expect } from 'vitest';
import { classifyTask, extractSeedTerms } from '@setsu-ai/retrieval';

describe('classifyTask', () => {
  const cases: Array<[string, string]> = [
    ['Explain this repository', 'repository_orientation'],
    ['How does checkout reach the payment gateway?', 'architecture'],
    ['Where is UserService.authenticate called?', 'symbol_lookup'],
    ['What breaks if I change User.id?', 'refactor'],
    ['Rename PaymentAdapter across the repository', 'refactor'],
    ['The login test is failing with a stack trace', 'debugging'],
    ['Add a migration for the orders table', 'database'],
    ['Which endpoint handles login?', 'api'],
    ['zzz nothing matches here qq', 'unknown'],
  ];
  for (const [query, expected] of cases) {
    it(`"${query}" -> ${expected}`, () => {
      expect(classifyTask(query)).toBe(expected);
    });
  }
});

describe('extractSeedTerms', () => {
  it('separates identifiers from words and drops stop words', () => {
    const terms = extractSeedTerms('How does CheckoutService.checkout reach the StripeAdapter?');
    expect(terms.identifiers).toContain('CheckoutService.checkout');
    expect(terms.identifiers).toContain('StripeAdapter');
    expect(terms.words).not.toContain('the');
    expect(terms.words).not.toContain('does');
  });

  it('treats snake_case as identifiers', () => {
    const terms = extractSeedTerms('where is validate_invoice used');
    expect(terms.identifiers).toContain('validate_invoice');
  });
});
