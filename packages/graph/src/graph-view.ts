import type { GraphStore } from '@setsu-ai/storage';
import { fileId } from './ids.js';

export interface GraphNode {
  id: string;
  name: string;
  qualifiedName: string;
  kind: string;
  language: string;
  path: string;
  startLine: number;
  endLine: number;
  signature: string | null;
}

export interface GraphEdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  provenance: string;
  confidence: number;
  source_file: string | null;
  start_line: number | null;
}

/** In-memory adjacency view over the persisted graph. */
export class GraphView {
  readonly nodes = new Map<string, GraphNode>();
  readonly out = new Map<string, GraphEdgeRow[]>();
  readonly in = new Map<string, GraphEdgeRow[]>();
  readonly edges: GraphEdgeRow[] = [];

  static load(store: GraphStore): GraphView {
    const view = new GraphView();
    for (const row of store.db.all<{
      id: string;
      name: string;
      qualified_name: string;
      kind: string;
      language: string;
      file_path: string;
      start_line: number;
      end_line: number;
      signature: string | null;
    }>(`SELECT id, name, qualified_name, kind, language, file_path, start_line, end_line, signature FROM symbols WHERE repo_id = ?`, store.repoId)) {
      view.nodes.set(row.id, {
        id: row.id,
        name: row.name,
        qualifiedName: row.qualified_name,
        kind: row.kind,
        language: row.language,
        path: row.file_path,
        startLine: row.start_line,
        endLine: row.end_line,
        signature: row.signature,
      });
    }
    for (const row of store.db.all<{ path: string; language: string | null }>(
      `SELECT path, language FROM files WHERE repo_id = ?`,
      store.repoId,
    )) {
      const id = fileId(row.path);
      view.nodes.set(id, {
        id,
        name: row.path.split('/').pop() ?? row.path,
        qualifiedName: row.path,
        kind: 'file',
        language: row.language ?? 'other',
        path: row.path,
        startLine: 1,
        endLine: 1,
        signature: null,
      });
    }
    for (const edge of store.db.all<GraphEdgeRow>(
      `SELECT id, source_id, target_id, edge_type, provenance, confidence, source_file, start_line FROM edges WHERE repo_id = ?`,
      store.repoId,
    )) {
      view.edges.push(edge);
      const outList = view.out.get(edge.source_id);
      if (outList) outList.push(edge);
      else view.out.set(edge.source_id, [edge]);
      const inList = view.in.get(edge.target_id);
      if (inList) inList.push(edge);
      else view.in.set(edge.target_id, [edge]);
    }
    return view;
  }

  nodeIds(): string[] {
    const ids = new Set<string>(this.nodes.keys());
    for (const edge of this.edges) {
      ids.add(edge.source_id);
      ids.add(edge.target_id);
    }
    return [...ids];
  }
}
