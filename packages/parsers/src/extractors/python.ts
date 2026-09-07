import type { Node } from 'web-tree-sitter';
import { sha256Hex } from '@setsu-ai/core';
import type { ParseArtifact, ParsedRelation, ParsedSymbol, SymbolKind } from '../types.js';

export const PY_PARSER_VERSION = 'py-v1';

interface Ctx {
  symbols: ParsedSymbol[];
  relations: ParsedRelation[];
  scope: string[];
  /** nesting depth of function bodies; locals are not symbols */
  fnDepth: number;
}

function qualify(ctx: Ctx, name: string): string {
  return [...ctx.scope, name].join('.');
}

function firstLine(node: Node): string {
  const text = node.text;
  const nl = text.indexOf('\n');
  const line = nl === -1 ? text : text.slice(0, nl);
  return line.length > 200 ? line.slice(0, 200) : line;
}

/** Python docstring: first statement in body is a string literal. */
function docstringFor(body: Node | null): string | undefined {
  const first = body?.namedChildren[0];
  if (first?.type === 'expression_statement' && first.namedChildren[0]?.type === 'string') {
    const raw = first.namedChildren[0].text;
    const doc = raw.replace(/^[rbu]*['"]{1,3}|['"]{1,3}$/gi, '').trim();
    return doc.length > 0 ? doc.slice(0, 500) : undefined;
  }
  return undefined;
}

function addSymbol(ctx: Ctx, node: Node, name: string, kind: SymbolKind, body: Node | null): void {
  const sym: ParsedSymbol = {
    name,
    qualifiedName: qualify(ctx, name),
    kind,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    signature: firstLine(node),
    bodyHash: sha256Hex(node.text).slice(0, 16),
    // Python has no export keyword; module-level names are importable.
    exported: ctx.scope.length === 0 || !name.startsWith('_'),
  };
  const doc = docstringFor(body);
  if (doc !== undefined) sym.doc = doc;
  ctx.symbols.push(sym);
}

function addRelation(
  ctx: Ctx,
  type: ParsedRelation['type'],
  toName: string,
  node: Node,
  fromSymbol?: string,
): void {
  if (!toName) return;
  ctx.relations.push({
    type,
    fromSymbol: fromSymbol ?? ctx.scope.join('.'),
    toName,
    line: node.startPosition.row + 1,
  });
}

function calleeName(fn: Node): string {
  if (fn.type === 'identifier') return fn.text;
  if (fn.type === 'attribute') {
    const attr = fn.childForFieldName('attribute');
    const object = fn.childForFieldName('object');
    if (attr) {
      if (object && object.type === 'identifier' && object.text !== 'self' && object.text !== 'cls') {
        return `${object.text}.${attr.text}`;
      }
      return attr.text;
    }
  }
  return '';
}

function walk(ctx: Ctx, node: Node): void {
  switch (node.type) {
    case 'import_statement': {
      // import a.b, c as d
      for (const child of node.namedChildren) {
        if (!child) continue;
        if (child.type === 'dotted_name') addRelation(ctx, 'imports', child.text, node, '');
        if (child.type === 'aliased_import') {
          const name = child.childForFieldName('name');
          if (name) addRelation(ctx, 'imports', name.text, node, '');
        }
      }
      return;
    }

    case 'import_from_statement': {
      const moduleName = node.childForFieldName('module_name');
      if (moduleName) addRelation(ctx, 'imports', moduleName.text, node, '');
      return;
    }

    case 'decorated_definition': {
      for (const child of node.namedChildren) {
        if (!child) continue;
        if (child.type === 'decorator') {
          const inner = child.namedChildren[0];
          if (inner) {
            const name = inner.type === 'call' ? calleeName(inner.childForFieldName('function') ?? inner) : inner.text;
            addRelation(ctx, 'references', name, child);
          }
        } else {
          walk(ctx, child);
        }
      }
      return;
    }

    case 'class_definition': {
      const name = node.childForFieldName('name')?.text ?? '';
      if (!name) break;
      const body = node.childForFieldName('body');
      addSymbol(ctx, node, name, 'class', body);
      const qualified = qualify(ctx, name);
      const superclasses = node.childForFieldName('superclasses');
      if (superclasses) {
        for (const sup of superclasses.namedChildren) {
          if (sup && (sup.type === 'identifier' || sup.type === 'attribute')) {
            addRelation(ctx, 'extends', sup.text, superclasses, qualified);
          }
        }
      }
      ctx.scope.push(name);
      if (body) for (const child of body.namedChildren) if (child) walk(ctx, child);
      ctx.scope.pop();
      return;
    }

    case 'function_definition': {
      const name = node.childForFieldName('name')?.text ?? '';
      if (!name) break;
      const body = node.childForFieldName('body');
      const insideClass = ctx.fnDepth === 0 && ctx.scope.length > 0;
      addSymbol(ctx, node, name, insideClass ? 'method' : 'function', body);
      ctx.scope.push(name);
      ctx.fnDepth += 1;
      if (body) walk(ctx, body);
      ctx.fnDepth -= 1;
      ctx.scope.pop();
      return;
    }

    case 'assignment': {
      // Module-level or class-level simple assignments become symbols;
      // function locals never do.
      if (ctx.fnDepth === 0 && ctx.scope.length <= 1) {
        const left = node.childForFieldName('left');
        if (left?.type === 'identifier') {
          const insideClass = ctx.scope.length === 1;
          addSymbol(ctx, node, left.text, insideClass ? 'property' : 'variable', null);
        }
      }
      const right = node.childForFieldName('right');
      if (right) walk(ctx, right);
      return;
    }

    case 'call': {
      const fn = node.childForFieldName('function');
      if (fn) {
        const name = calleeName(fn);
        if (name) addRelation(ctx, 'calls', name, node);
      }
      break;
    }

    default:
      break;
  }

  for (const child of node.namedChildren) if (child) walk(ctx, child);
}

export function extractPython(root: Node): ParseArtifact {
  const ctx: Ctx = { symbols: [], relations: [], scope: [], fnDepth: 0 };
  walk(ctx, root);
  return {
    language: 'python',
    parserVersion: PY_PARSER_VERSION,
    symbols: ctx.symbols,
    relations: ctx.relations,
    hadErrors: root.hasError,
  };
}
