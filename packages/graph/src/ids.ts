import { stableId } from '@setsu-ai/core';

/**
 * Stable node identity, spec section 13:
 * repo-relative POSIX path + language + kind + qualified name.
 * Line moves and body edits do not change the id.
 */
export function symbolId(
  path: string,
  language: string,
  kind: string,
  qualifiedName: string,
): string {
  return stableId('sym', path, language, kind, qualifiedName);
}

export function fileId(path: string): string {
  return stableId('file', path);
}

/** External module placeholder (unresolved import target). */
export function externalId(specifier: string): string {
  return stableId('ext', specifier);
}

export function edgeId(
  sourceId: string,
  targetId: string,
  edgeType: string,
  sourceFile: string,
): string {
  return stableId('edge', sourceId, targetId, edgeType, sourceFile);
}
