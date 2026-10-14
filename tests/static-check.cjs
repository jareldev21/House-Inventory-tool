const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Structural checks are offline: verify source assets and ES-module imports without Firebase.
const root = path.resolve(__dirname, '../public');
let checked = 0;
function exactPath(file) {
 const relative = path.relative(root,file);
 assert.ok(!relative.startsWith('..'), 'Reference outside public: '+file);
 let current = root;
 for (const segment of relative.split(path.sep)) {
  assert.ok(fs.readdirSync(current).includes(segment), 'Missing or wrong-case path: '+file);
  current = path.join(current,segment);
 }
}
function walk(directory) {
 for(const name of fs.readdirSync(directory)) {
  const file=path.join(directory,name);
  if(fs.statSync(file).isDirectory()){walk(file);continue;}
  if(!/\.(html|css|js)$/.test(name))continue;
  const source=fs.readFileSync(file,'utf8');
  // HTML links/assets, CSS url(...) references, and local ES-module imports.
  const references = name.endsWith('.html')
   ? [...source.matchAll(/(?:href|src)="([^"]+)"/g)].map(match=>match[1])
   : name.endsWith('.css')
    ? [...source.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match=>match[1])
    : [...source.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm)].map(match=>match[1]);
  for(const reference of references){
   if(/^(https?:|#|data:)/.test(reference))continue;
   exactPath(reference.startsWith('/')?path.join(root,reference):path.resolve(path.dirname(file),reference));
   checked++;
  }
  if(name.endsWith('.html')){
   assert.equal((source.match(/<html\b/g)||[]).length,1,file);
   assert.equal((source.match(/<\/html>/g)||[]).length,1,file);
   assert.ok(source.includes('CSS/main.css'),file+' missing main.css');
   const ids=[...source.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
   assert.equal(ids.length,new Set(ids).size,file+' duplicate IDs');
   const stack=[];
   const voidTags=new Set(['meta','link','img','input','br','hr','source','area','base','embed','param','wbr']);
   for(const match of source.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)){
    const tag=match[1].toLowerCase();
    if(voidTags.has(tag))continue;
    if(match[0].startsWith('</'))assert.equal(stack.pop(),tag,file+' mismatched '+tag);
    else stack.push(tag);
   }
   assert.deepEqual(stack,[],file+' unclosed elements');
  }
 }
}
walk(root);
console.log('PASS: '+checked+' exact-case HTML/CSS assets and JS imports; HTML tags balanced, IDs unique, shared CSS present.');
