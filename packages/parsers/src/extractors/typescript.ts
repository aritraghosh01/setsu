import type { Node } from 'web-tree-sitter';
import { sha256Hex } from '@setsu-ai/core';
import type { ParseArtifact, ParsedRelation, ParsedSymbol, SymbolKind } from '../types.js';

export const TS_PARSER_VERSION = 'ts-v1';

interface Ctx {
  symbols: ParsedSymbol[];
  relations: ParsedRelation[];
  /** qualified-name scope stack (class names, etc.) */
  scope: string[];
  /** whether the current subtree sits under an export statement */
  exported: boolean;
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

function docFor(node: Node): string | undefined {
  // Doc comments for exported declarations sit before the export statement.
  const anchor = node.parent?.type === 'export_statement' ? node.parent : node;
  const prev = anchor.previousNamedSibling;
  if (prev?.type === 'comment' && prev.text.startsWith('/**')) {
    const doc = prev.text.replace(/^\/\*\*|\*\/$/g, '').replace(/^\s*\*\s?/gm, '').trim();
    return doc.length > 0 ? doc.slice(0, 500) : undefined;
  }
  return undefined;
}

function addSymbol(ctx: Ctx, node: Node, name: string, kind: SymbolKind): ParsedSymbol {
  const sym: ParsedSymbol = {
    name,
    qualifiedName: qualify(ctx, name),
    kind,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    signature: firstLine(node),
    bodyHash: sha256Hex(node.text).slice(0, 16),
    exported: ctx.exported,
  };
  const doc = docFor(node);
  if (doc !== undefined) sym.doc = doc;
  ctx.symbols.push(sym);
  return sym;
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

/** Callee name from a call target: identifier, obj.method, this.method. */
function calleeName(fn: Node): string {
  if (fn.type === 'identifier') return fn.text;
  if (fn.type === 'member_expression') {
    const property = fn.childForFieldName('property');
    const object = fn.childForFieldName('object');
    if (property) {
      if (object && object.type === 'identifier') return `${object.text}.${property.text}`;
      return property.text;
    }
  }
  return '';
}

function heritageRelations(ctx: Ctx, classNode: Node, className: string): void {
  for (const child of classNode.namedChildren) {
    if (!child) continue;
    if (child.type === 'class_heritage') {
      for (const clause of child.namedChildren) {
        if (!clause) continue;
        if (clause.type === 'extends_clause') {
          for (const value of clause.namedChildren) {
            if (value && (value.type === 'identifier' || value.type === 'type_identifier')) {
              addRelation(ctx, 'extends', value.text, clause, className);
            }
          }
        } else if (clause.type === 'implements_clause') {
          for (const value of clause.namedChildren) {
            if (value && value.type === 'type_identifier') {
              addRelation(ctx, 'implements', value.text, clause, className);
            }
          }
        }
      }
    }
    // interface extends
    if (child.type === 'extends_type_clause') {
      for (const value of child.namedChildren) {
        if (value && value.type === 'type_identifier') {
          addRelation(ctx, 'extends', value.text, child, className);
        }
      }
    }
  }
}

function importRelations(ctx: Ctx, node: Node): void {
  const source = node.childForFieldName('source');
  if (source) {
    addRelation(ctx, 'imports', source.text.replace(/^['"]|['"]$/g, ''), node, '');
  }
  // Named imports are file-level references to the imported symbols; impact
  // analysis needs them (enum/type usages produce no call relations).
  const collect = (n: Node): void => {
    if (n.type === 'import_specifier') {
      const name = n.childForFieldName('name');
      if (name) addRelation(ctx, 'references', name.text, n, '');
      return;
    }
    for (const child of n.namedChildren) if (child) collect(child);
  };
  collect(node);
}

function isFunctionValue(value: Node | null): boolean {
  return value?.type === 'arrow_function' || value?.type === 'function_expression';
}

function walk(ctx: Ctx, node: Node): void {
  switch (node.type) {
    case 'import_statement':
      importRelations(ctx, node);
      return;

    case 'export_statement': {
      const wasExported = ctx.exported;
      ctx.exported = true;
      for (const child of node.namedChildren) if (child) walk(ctx, child);
      ctx.exported = wasExported;
      return;
    }

    case 'class_declaration':
    case 'abstract_class_declaration': {
      const name = node.childForFieldName('name')?.text ?? '';
      if (!name) break;
      const sym = addSymbol(ctx, node, name, 'class');
      heritageRelations(ctx, node, sym.qualifiedName);
      ctx.scope.push(name);
      const wasExported = ctx.exported;
      ctx.exported = false;
      const body = node.childForFieldName('body');
      if (body) for (const child of body.namedChildren) if (child) walk(ctx, child);
      ctx.exported = wasExported;
      ctx.scope.pop();
      return;
    }

    case 'interface_declaration': {
      const name = node.childForFieldName('name')?.text ?? '';
      if (!name) break;
      const sym = addSymbol(ctx, node, name, 'interface');
      heritageRelations(ctx, node, sym.qualifiedName);
      return;
    }

    case 'type_alias_declaration': {
      const name = node.childForFieldName('name')?.text ?? '';
      if (name) addSymbol(ctx, node, name, 'type');
      return;
    }

    case 'enum_declaration': {
      const name = node.childForFieldName('name')?.text ?? '';
      if (name) addSymbol(ctx, node, name, 'enum');
      return;
    }

    case 'function_declaration': {
      const name = node.childForFieldName('name')?.text ?? '';
      if (!name) break;
      addSymbol(ctx, node, name, 'function');
      ctx.scope.push(name);
      const body = node.childForFieldName('body');
      if (body) walk(ctx, body);
      ctx.scope.pop();
      return;
    }

    case 'method_definition': {
      const name = node.childForFieldName('name')?.text ?? '';
      if (!name) break;
      addSymbol(ctx, node, name, 'method');
      ctx.scope.push(name);
      const body = node.childForFieldName('body');
      if (body) walk(ctx, body);
      ctx.scope.pop();
      return;
    }

    case 'public_field_definition': {
      const name = node.childForFieldName('name')?.text ?? '';
      if (!name) break;
      addSymbol(ctx, node, name, 'property');
      const value = node.childForFieldName('value');
      if (value) walk(ctx, value);
      return;
    }

    case 'lexical_declaration':
    case 'variable_declaration': {
      for (const declarator of node.namedChildren) {
        if (declarator?.type !== 'variable_declarator') continue;
        const name = declarator.childForFieldName('name')?.text ?? '';
        const value = declarator.childForFieldName('value');
        if (!name) continue;
        // Only surface file/class scope declarations as symbols; locals stay out.
        const topLevel = ctx.scope.length === 0;
        if (isFunctionValue(value)) {
          if (topLevel) addSymbol(ctx, declarator, name, 'function');
          ctx.scope.push(name);
          if (value) walk(ctx, value);
          ctx.scope.pop();
        } else {
          if (topLevel) addSymbol(ctx, declarator, name, 'variable');
          if (value) walk(ctx, value);
        }
      }
      return;
    }

    case 'call_expression': {
      const fn = node.childForFieldName('function');
      if (fn) {
        const name = calleeName(fn);
        if (name) addRelation(ctx, 'calls', name, node);
      }
      break; // keep walking: arguments may contain nested calls/functions
    }

    case 'new_expression': {
      const ctor = node.childForFieldName('constructor');
      if (ctor && (ctor.type === 'identifier' || ctor.type === 'type_identifier')) {
        addRelation(ctx, 'references', ctor.text, node);
      }
      break;
    }

    default:
      break;
  }

  for (const child of node.namedChildren) if (child) walk(ctx, child);
}

export function extractTypeScript(root: Node, language: string): ParseArtifact {
  const ctx: Ctx = { symbols: [], relations: [], scope: [], exported: false };
  walk(ctx, root);
  return {
    language,
    parserVersion: TS_PARSER_VERSION,
    symbols: ctx.symbols,
    relations: ctx.relations,
    hadErrors: root.hasError,
  };
}
