/**
 * Token estimation is heuristic by design (spec section 85 startup budget
 * rules out shipping a real tokenizer). Everything downstream must label
 * outputs as "estimated". Ratios calibrated against cl100k-family tokenizers
 * on mixed TS/Python corpora: code averages ~3.8 chars/token, prose ~4.0.
 */
export type TextKind = 'code' | 'prose';

export interface TokenEstimator {
  estimate(text: string, kind?: TextKind): number;
}

export const heuristicEstimator: TokenEstimator = {
  estimate(text: string, kind: TextKind = 'code'): number {
    const ratio = kind === 'code' ? 3.8 : 4.0;
    return Math.ceil(text.length / ratio);
  },
};

export function estimateTokens(text: string, kind: TextKind = 'code'): number {
  return heuristicEstimator.estimate(text, kind);
}
