/** Parser output model, spec section 17. */

export type SymbolKind =
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'function'
  | 'method'
  | 'property'
  | 'variable';

export interface ParsedSymbol {
  name: string;
  /** Dotted path within the file, e.g. "CheckoutService.checkout". */
  qualifiedName: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  signature: string;
  doc?: string;
  bodyHash: string;
  exported: boolean;
}

export type RelationType =
  | 'imports'
  | 'exports'
  | 'extends'
  | 'implements'
  | 'calls'
  | 'references';

export interface ParsedRelation {
  type: RelationType;
  /** Qualified name of the enclosing symbol, or '' for file scope. */
  fromSymbol: string;
  /** Referenced name: imported module specifier, callee name, base class... */
  toName: string;
  line: number;
}

export interface ParseArtifact {
  language: string;
  parserVersion: string;
  symbols: ParsedSymbol[];
  relations: ParsedRelation[];
  /** True when tree-sitter reported syntax errors; extraction is best-effort. */
  hadErrors: boolean;
}
