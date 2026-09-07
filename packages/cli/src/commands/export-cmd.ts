import { readFile, writeFile } from 'node:fs/promises';
import { openGraphDb, bumpGraphRevision, getGraphRevision } from '@setsu-ai/storage';
import { GraphView, type GraphNode, type GraphEdgeRow } from '@setsu-ai/graph';

interface GraphDump {
  schemaVersion: 1;
  revision: number;
  nodes: GraphNode[];
  edges: GraphEdgeRow[];
}

export async function runExport(opts: { repo: string; out?: string }): Promise<void> {
  const store = openGraphDb(opts.repo);
  try {
    const view = GraphView.load(store);
    const dump: GraphDump = {
      schemaVersion: 1,
      revision: getGraphRevision(store.db),
      nodes: [...view.nodes.values()],
      edges: view.edges,
    };
    const payload = JSON.stringify(dump, null, 2);
    if (opts.out) {
      await writeFile(opts.out, payload, 'utf8');
      console.log(`Exported ${dump.nodes.length} nodes, ${dump.edges.length} edges to ${opts.out}`);
    } else {
      console.log(payload);
    }
  } finally {
    store.db.close();
  }
}

export async function runImport(file: string, opts: { repo: string }): Promise<void> {
  const dump = JSON.parse(await readFile(file, 'utf8')) as GraphDump;
  if (dump.schemaVersion !== 1) {
    console.error(`Unsupported graph dump schemaVersion: ${String(dump.schemaVersion)}`);
    process.exitCode = 1;
    return;
  }
  const store = openGraphDb(opts.repo);
  try {
    store.db.transaction(() => {
      store.db.run(`DELETE FROM symbols WHERE repo_id = ?`, store.repoId);
      store.db.run(`DELETE FROM edges WHERE repo_id = ?`, store.repoId);
      for (const node of dump.nodes) {
        if (node.kind === 'file') continue; // file nodes derive from the files table
        store.db.run(
          `INSERT OR REPLACE INTO symbols
             (id, repo_id, file_path, name, qualified_name, kind, language, start_line, end_line, signature, doc, body_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '')`,
          node.id,
          store.repoId,
          node.path,
          node.name,
          node.qualifiedName,
          node.kind,
          node.language,
          node.startLine,
          node.endLine,
          node.signature,
        );
      }
      for (const edge of dump.edges) {
        store.db.run(
          `INSERT OR REPLACE INTO edges
             (id, repo_id, source_id, target_id, edge_type, provenance, confidence, source_file, start_line, end_line, first_seen_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          edge.id,
          store.repoId,
          edge.source_id,
          edge.target_id,
          edge.edge_type,
          edge.provenance,
          edge.confidence,
          edge.source_file,
          edge.start_line,
          edge.start_line,
          new Date().toISOString(),
          new Date().toISOString(),
        );
      }
      bumpGraphRevision(store.db);
    });
    console.log(`Imported ${dump.nodes.length} nodes, ${dump.edges.length} edges (new revision ${getGraphRevision(store.db)})`);
  } finally {
    store.db.close();
  }
}
