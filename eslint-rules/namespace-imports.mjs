/**
 * ESLint rule: namespace-imports
 *
 * Some modules are always imported as a namespace instead of as a list of
 * named imports, so a file needs one short import line per module no matter
 * how much of it it uses:
 *
 *   import * as schema from '@/db/schema';        // schema.events, schema.teams
 *   import * as Rsvp from '@/lib/rsvp/server';    // Rsvp.sendRsvpWave(...)
 *
 * - `@/db/schema` is imported as `schema`.
 * - Every folder under `src/lib/` that has a `server.ts` barrel is a domain
 *   module. Code outside the folder imports it as a PascalCase namespace named
 *   after the folder (`rsvp` -> `Rsvp`, `campaigns` -> `Campaigns`), from
 *   `@/lib/<domain>` (the client-safe `index.ts`) or `@/lib/<domain>/server`
 *   (everything, `server-only`). Deep imports like `@/lib/rsvp/waitlist` are
 *   not allowed from outside the folder, and files inside the folder use
 *   relative imports, never their own barrel.
 *
 * Inside a domain folder, exports don't repeat the module name, since callers
 * already write it as the namespace: `Display.Feed`, not `Display.DisplayFeed`
 * (also `displayFeed`, `DISPLAY_FEED`, and the singular, `Campaigns.Status`).
 *
 * On the barrels themselves it checks that every file in the folder is exported
 * from one of them, and that index.ts doesn't value-export a file that
 * directly imports `server-only`, `next/headers`, Node APIs, the DB or auth.
 *
 * The autofix rewrites the import and every reference to it (`events` ->
 * `schema.events`). It bails out when that can't be done safely: the alias is
 * already used for something else in the file, a binding is re-exported, or a
 * `'use client'` file would need the server barrel.
 */

import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_SOURCE = '@/db/schema';
const SCHEMA_ALIAS = 'schema';
const LIB_DIR = 'src/lib';

/** @type {Map<string, { mtimeMs: number, files: Set<string> | null }>} */
const indexCache = new Map();

function toPascalCase(name) {
  return name.replace(/(^|[-_])([a-z0-9])/g, (_, __, c) => c.toUpperCase());
}

function isDomain(cwd, domain) {
  return fs.existsSync(path.join(cwd, LIB_DIR, domain, 'server.ts'));
}

/**
 * The name without its module prefix, or null if it has none:
 * ('display', 'DisplayFeed') -> 'Feed', ('campaigns', 'CAMPAIGN_TYPES') -> 'TYPES', ('rsvp', 'rsvpFoo') -> 'foo'.
 */
function withoutModulePrefix(domain, name) {
  const words = [domain, domain.replace(/s$/, '')];
  for (const word of new Set(words)) {
    const pascal = toPascalCase(word);
    const camel = pascal[0].toLowerCase() + pascal.slice(1);
    const upper = `${word.replace(/-/g, '_').toUpperCase()}_`;
    if (name.startsWith(upper) && name.length > upper.length) return name.slice(upper.length);
    for (const prefix of [pascal, camel]) {
      const rest = name.slice(prefix.length);
      if (name.startsWith(prefix) && /^[A-Z]/.test(rest))
        return prefix === camel ? rest[0].toLowerCase() + rest.slice(1) : rest;
    }
  }
  return null;
}

/** Names exported by a top-level `export` statement. */
function exportedIdentifiers(node) {
  if (node.type !== 'ExportNamedDeclaration') return [];
  if (!node.declaration) return node.source ? [] : node.specifiers.map((spec) => spec.exported);
  const decl = node.declaration;
  if (decl.type === 'VariableDeclaration')
    return decl.declarations.map((d) => d.id).filter((id) => id.type === 'Identifier');
  return decl.id ? [decl.id] : [];
}

/** Modules re-exported by a domain's client-safe index.ts, as './file' paths, or null if it has none. */
function indexExports(cwd, domain) {
  const file = path.join(cwd, LIB_DIR, domain, 'index.ts');
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
  const cached = indexCache.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached.files;
  const text = fs.readFileSync(file, 'utf8');
  const files = new Set([...text.matchAll(/export \* from '(\.\/[^']+)'/g)].map((m) => m[1]));
  indexCache.set(file, { mtimeMs, files });
  return files;
}

/** '@/lib/rsvp/waitlist' -> { domain: 'rsvp', subpath: 'waitlist' } */
function parseLibSource(source) {
  const match = /^@\/lib\/([^/]+)(?:\/(.+))?$/.exec(source);
  if (!match) return null;
  const subpath = match[2] ?? '';
  return { domain: match[1], subpath: subpath === 'index' ? '' : subpath };
}

/** Every module file in a domain folder (recursively), as './file' paths, minus the barrels and tests. */
function domainFiles(dir, prefix = '.') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return domainFiles(path.join(dir, entry.name), `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || /\.(test|d)\.tsx?$/.test(entry.name)) return [];
    const file = `${prefix}/${entry.name.replace(/\.tsx?$/, '')}`;
    return file === './index' || file === './server' ? [] : [file];
  });
}

/** Cheap check for files that obviously can't go in a client bundle. Not transitive. */
function looksServerOnly(file) {
  const text = fs.readFileSync(file, 'utf8');
  return /^import '(server-only|next\/headers)';?$|from '(@\/utils\/(db|auth)|server-only|next\/headers|node:[^']+)'/m.test(
    text,
  );
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'Import @/db/schema and src/lib domain modules as namespaces, through their barrels.',
    },
    messages: {
      useNamespace: "Import {{source}} as a namespace: `import * as {{alias}} from '{{target}}'`.",
      serverInClient:
        "'{{name}}' is server-only, so a 'use client' file can't import it. Only the client-safe '@/lib/{{domain}}' is available here.",
      ownBarrel:
        "Files inside src/lib/{{domain}} import each other relatively; importing the module's own barrel risks import cycles.",
      deepReexport: "Re-export from '@/lib/{{domain}}' or '@/lib/{{domain}}/server', not from inside the module.",
      missingFromBarrel:
        "'{{file}}' isn't exported from either barrel. Add it to index.ts if it's client-safe, otherwise to server.ts (and `export type *` it from index.ts).",
      redundantPrefix:
        "'{{name}}' repeats the module name; callers already write it as {{alias}}.{{name}}. Call it '{{suggested}}'.",
      serverInIndex:
        "'{{file}}' is server-only, so index.ts (the client-safe barrel) may only `export type *` it. Export its values from server.ts.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const cwd = context.cwd;
    const relFile = path.relative(cwd, context.filename).split(path.sep).join('/');
    const ownDomain = relFile.startsWith(`${LIB_DIR}/`) ? relFile.split('/')[2] : null;
    const isBarrelFile = ownDomain !== null && /^src\/lib\/[^/]+\/(index|server)\.ts$/.test(relFile);
    const isClientFile = sourceCode.ast.body.some(
      (s) => s.type === 'ExpressionStatement' && s.directive === 'use client',
    );

    /** @type {Map<string, { alias: string, domain: string | null, decls: any[], needsServer: boolean }>} */
    const groups = new Map();

    /** Resolve an import source to a src-relative path, for own-barrel detection on relative imports. */
    function resolveRelative(source) {
      if (!source.startsWith('.')) return null;
      return path.posix.normalize(path.posix.join(path.posix.dirname(relFile), source));
    }

    function checkOwnBarrel(node, source) {
      if (!ownDomain || isBarrelFile || !isDomain(cwd, ownDomain)) return false;
      const base = `${LIB_DIR}/${ownDomain}`;
      const target = source.startsWith('@/') ? `src/${source.slice(2)}` : resolveRelative(source);
      if (target === base || target === `${base}/index` || target === `${base}/server`) {
        context.report({ node, messageId: 'ownBarrel', data: { domain: ownDomain } });
        return true;
      }
      return false;
    }

    function collect(node) {
      const source = node.source.value;
      if (typeof source !== 'string' || node.specifiers.length === 0) return;
      if (checkOwnBarrel(node, source)) return;

      if (source === SCHEMA_SOURCE) {
        const group = groups.get(SCHEMA_SOURCE) ?? { alias: SCHEMA_ALIAS, domain: null, decls: [], needsServer: false };
        group.decls.push(node);
        groups.set(SCHEMA_SOURCE, group);
        return;
      }

      const lib = parseLibSource(source);
      if (!lib || lib.domain === ownDomain || !isDomain(cwd, lib.domain)) return;
      const index = indexExports(cwd, lib.domain);
      const inIndex = lib.subpath === '' ? index !== null : (index?.has(`./${lib.subpath}`) ?? false);
      const group = groups.get(lib.domain) ?? {
        alias: toPascalCase(lib.domain),
        domain: lib.domain,
        decls: [],
        needsServer: false,
      };
      group.decls.push(node);
      // index.ts re-exports the server-only files' types, so type-only imports never need the server barrel.
      const typeOnly = node.importKind === 'type' || node.specifiers.every((spec) => spec.importKind === 'type');
      if (!typeOnly && (lib.subpath === 'server' || !inIndex)) group.needsServer = true;
      groups.set(lib.domain, group);
    }

    function isCompliant(group) {
      if (group.decls.length !== 1) return false;
      const [decl] = group.decls;
      const [spec] = decl.specifiers;
      if (decl.specifiers.length !== 1 || spec.type !== 'ImportNamespaceSpecifier' || spec.local.name !== group.alias) {
        return false;
      }
      if (group.domain === null) return true;
      const { subpath } = parseLibSource(decl.source.value);
      return subpath === '' || subpath === 'server';
    }

    /** True if `name` is declared anywhere in the file other than by the given import declarations. */
    function isNameTaken(name, decls) {
      for (const scope of sourceCode.scopeManager.scopes) {
        for (const variable of scope.variables) {
          if (variable.name !== name) continue;
          if (variable.defs.every((def) => def.type === 'ImportBinding' && decls.includes(def.parent))) continue;
          return true;
        }
      }
      return false;
    }

    function buildFix(group, target) {
      const { alias, decls } = group;
      if (isNameTaken(alias, decls)) return null;

      const replacements = new Map(); // "start:end" -> { range, text }
      const replace = (range, text) => replacements.set(`${range[0]}:${range[1]}`, { range, text });

      for (const decl of decls) {
        for (const spec of decl.specifiers) {
          if (spec.type === 'ImportDefaultSpecifier') return null;
          const member =
            spec.type === 'ImportNamespaceSpecifier'
              ? null
              : spec.imported.type === 'Identifier'
                ? spec.imported.name
                : spec.imported.value;
          const replacement = member === null ? alias : `${alias}.${member}`;
          const [variable] = sourceCode.getDeclaredVariables(spec);
          if (!variable) return null;

          for (const ref of variable.references) {
            const id = ref.identifier;
            const parent = id.parent;
            if (parent.type === 'ExportSpecifier') return null;
            if (parent.type === 'Property' && parent.shorthand && parent.value === id) {
              replace(parent.range, `${id.name}: ${replacement}`);
              continue;
            }
            replace(id.range, replacement);
            // `<Foo>...</Foo>`: make sure the closing tag follows the opening one.
            const element = parent.type === 'JSXOpeningElement' ? parent.parent : null;
            if (element?.closingElement) replace(element.closingElement.name.range, replacement);
          }
        }
      }

      const typeOnly = decls.every(
        (decl) => decl.importKind === 'type' || decl.specifiers.every((spec) => spec.importKind === 'type'),
      );
      const importText = `import ${typeOnly ? 'type ' : ''}* as ${alias} from '${target}';`;

      return (fixer) => {
        const fixes = [fixer.replaceText(decls[0], importText)];
        for (const decl of decls.slice(1)) {
          const end = sourceCode.text[decl.range[1]] === '\n' ? decl.range[1] + 1 : decl.range[1];
          fixes.push(fixer.removeRange([decl.range[0], end]));
        }
        for (const { range, text } of replacements.values()) fixes.push(fixer.replaceTextRange(range, text));
        return fixes;
      };
    }

    function checkReexport(node) {
      const source = node.source?.value;
      if (typeof source !== 'string') return;
      if (checkOwnBarrel(node, source)) return;
      const lib = parseLibSource(source);
      if (!lib || lib.domain === ownDomain || !isDomain(cwd, lib.domain)) return;
      if (lib.subpath !== '' && lib.subpath !== 'server') {
        context.report({ node, messageId: 'deepReexport', data: { domain: lib.domain } });
      }
    }

    function checkBarrel(program) {
      const domainDir = path.join(cwd, LIB_DIR, ownDomain);
      if (relFile.endsWith('/index.ts')) {
        for (const node of program.body) {
          if (node.type !== 'ExportAllDeclaration' || node.exportKind === 'type') continue;
          const target = path.join(domainDir, `${node.source.value}.ts`);
          if (fs.existsSync(target) && looksServerOnly(target)) {
            context.report({ node, messageId: 'serverInIndex', data: { file: node.source.value } });
          }
        }
        return;
      }
      // server.ts: every file in the folder must be reachable from one of the barrels.
      const exported = new Set(
        [...sourceCode.text.matchAll(/export \* from '(\.\/[^']+)'/g)]
          .map((m) => m[1])
          .concat([...(indexExports(cwd, ownDomain) ?? [])]),
      );
      for (const file of domainFiles(domainDir)) {
        if (!exported.has(file)) context.report({ node: program, messageId: 'missingFromBarrel', data: { file } });
      }
    }

    return {
      Program(node) {
        if (!ownDomain || !isDomain(cwd, ownDomain)) return;
        if (isBarrelFile) {
          checkBarrel(node);
          return;
        }
        for (const id of node.body.flatMap(exportedIdentifiers)) {
          const suggested = withoutModulePrefix(ownDomain, id.name);
          if (suggested) {
            context.report({
              node: id,
              messageId: 'redundantPrefix',
              data: { name: id.name, alias: toPascalCase(ownDomain), suggested },
            });
          }
        }
      },
      ImportDeclaration: collect,
      ExportNamedDeclaration: checkReexport,
      ExportAllDeclaration: checkReexport,
      'Program:exit'() {
        for (const [source, group] of groups) {
          if (isCompliant(group)) continue;

          const target =
            group.domain === null
              ? source
              : group.needsServer
                ? `@/lib/${group.domain}/server`
                : `@/lib/${group.domain}`;

          if (isClientFile && group.needsServer) {
            const firstServerName = group.decls
              .flatMap((decl) => decl.specifiers)
              .map((spec) => spec.local.name)
              .find(Boolean);
            context.report({
              node: group.decls[0],
              messageId: 'serverInClient',
              data: { name: firstServerName ?? group.decls[0].source.value, domain: group.domain },
            });
            continue;
          }

          const fix = buildFix(group, target);
          group.decls.forEach((decl, i) => {
            context.report({
              node: decl,
              messageId: 'useNamespace',
              data: { source: decl.source.value, alias: group.alias, target },
              fix: i === 0 && fix ? fix : null,
            });
          });
        }
      },
    };
  },
};

export default rule;
