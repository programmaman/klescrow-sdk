/**
 * Patches TypeChain-generated files in generated/typechain to add .js extensions to relative imports,
 * required by NodeNext / Node16 moduleResolution.
 *
 * TypeChain generates:   from './common'
 * NodeNext requires:     from './common.js'
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const typesDir = resolve(__dir, '..', 'generated', 'typechain');

function walk(dir) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts')) patch(full, dir);
    }
}

function patch(file, fileDir) {
    const original = readFileSync(file, 'utf8');
    const patched = original.replace(
        /from\s+(['"])(\.\.?\/[^'"]+?)(\1)/g,
        (_, q, importPath, qEnd) => {
            if (/\.\w+$/.test(importPath)) return `from ${q}${importPath}${qEnd}`; // already has extension
            // Check if it resolves to a directory (index.ts)
            const resolvedDir = resolve(fileDir, importPath);
            if (existsSync(resolvedDir) && statSync(resolvedDir).isDirectory()) {
                return `from ${q}${importPath}/index.js${qEnd}`;
            }
            return `from ${q}${importPath}.js${qEnd}`;
        }
    );
    if (patched !== original) {
        writeFileSync(file, patched);
        stdout.write(`patched ${file.replace(typesDir, 'generated/typechain')}\n`);
    }
}

walk(typesDir);
stdout.write('TypeChain NodeNext patch complete.\n');
