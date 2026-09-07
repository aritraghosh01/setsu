/** Context retrieval contract, spec section 8. */

export type RetrievalStrategy = 'graph' | 'lsp' | 'lexical' | 'semantic' | 'repo_map' | 'hybrid';

export type EvidenceKind =
  | 'symbol_signature'
  | 'source_snippet'
  | 'graph_path'
  | 'file_summary'
  | 'diagnostic'
  | 'instruction'
  | 'test'
  | 'schema'
  | 'route';

export type EvidenceProvenance = 'ast' | 'lsp' | 'config' | 'lexical' | 'semantic' | 'inferred';

export interface ContextEvidence {
  id: string;
  kind: EvidenceKind;
  file?: string;
  startLine?: number;
  endLine?: number;
  text: string;
  estimatedTokens: number;
  relevance: number;
  confidence: number;
  provenance: EvidenceProvenance;
}

export interface GraphPathSummary {
  nodeIds: string[];
  labels: string[];
}

export interface ContextPack {
  id: string;
  query: string;
  repoId: string;
  taskClass: string;
  budget: {
    maxEstimatedTokens: number;
    usedEstimatedTokens: number;
  };
  strategy: RetrievalStrategy;
  evidence: ContextEvidence[];
  graph?: {
    seedNodeIds: string[];
    paths: GraphPathSummary[];
    omittedNeighborCount: number;
  };
  quality: {
    confidence: number;
    completeness: 'low' | 'medium' | 'high';
  };
  graphRevision: number;
  schemaVersion: 1;
}
