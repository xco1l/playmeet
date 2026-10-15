import fs from 'node:fs';
import path from 'node:path';

const workspace = fs.realpathSync(new URL('../', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
const destination = path.join(workspace, 'validation', 'releases', `play-meet-source-${pkg.version}-${Date.now()}`);
const files = ['.gitattributes', '.gitignore', 'AGENTS.md', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'index.html', 'package.json', 'pnpm-lock.yaml', 'start.ps1'];
function collect(directory) {
  for (const entry of fs.readdirSync(path.join(workspace, directory), {withFileTypes: true})) {
    const relative = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected linked source: ${relative}`);
    if (entry.isDirectory()) collect(relative);
    else files.push(relative);
  }
}
for (const directory of ['src', 'scripts', 'tests', 'docs', 'public', '.github']) collect(directory);
// An explicit source set avoids publishing ignored local research or repository history.
for (const file of files) {
  if (/(^|[\\/])(reference|validation|node_modules|dist|\.git)([\\/]|$)|\.(dll|exe|pdb|assets|unitypackage|cs|zip|log|jsonl|pem|key)$|(^|[\\/])\.env/i.test(file)) throw new Error(`Non-source file: ${file}`);
}
fs.mkdirSync(destination, {recursive: true});
for (const file of files) {
  const target = path.join(destination, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(path.join(workspace, file), target);
}
const manifest = {directory: destination, files: files.map(file => file.replaceAll('\\', '/')).sort(), version: pkg.version, license: pkg.license, characterDataIncluded: true};
fs.writeFileSync(path.join(workspace, 'validation', 'source-export.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Exported ${files.length} source files and the parametric character configuration without Git history to ${destination}`);
