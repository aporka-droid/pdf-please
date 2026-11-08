import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
// Keep all rendering resources local, including fonts and image decoders.
await mkdir('public/lib/pdfjs',{recursive:true});
for(const folder of ['cmaps','standard_fonts','wasm'])await cp(`node_modules/pdfjs-dist/${folder}`,`public/lib/pdfjs/${folder}`,{recursive:true});
const licenses=[['PDF.js','node_modules/pdfjs-dist/LICENSE'],['pdf-lib','node_modules/pdf-lib/LICENSE.md'],['JSZip','node_modules/jszip/LICENSE.markdown']];
const notices=await Promise.all(licenses.map(async([name,path])=>`${name}\n${await readFile(path,'utf8')}\n`));
await writeFile('public/THIRD-PARTY-NOTICES.txt',notices.join('\n'));
console.log('Local PDF.js rendering resources ready.');
