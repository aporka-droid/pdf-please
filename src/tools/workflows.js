import { app, $, task, status, markDirty, updatePageInfo } from '../app.js';
import { parseRanges, validatePDF, download } from '../utils/files.js';
import { pdfBytes } from '../core/viewer.js';
import JSZip from 'jszip';
const doc = () => app.instance.Core.documentViewer.getDocument();
const selected = () => [...app.selected].sort((a,b)=>a-b);
let thumbnailObserver;
const queue = [];

export async function showWorkflow(mode) {
  thumbnailObserver?.disconnect();
  $('#viewer').hidden = true; $('#viewer').inert = true; $('#viewer').setAttribute('aria-hidden','true'); $('#workflow').hidden = false;
  if (!doc() && ['organize','split'].includes(mode)) { $('#file-input').click(); return; }
  if (mode === 'organize') return organize();
  if (mode === 'merge') return merge();
  if (mode === 'split') return split();
  if (mode === 'convert') { const { convert } = await import('./converter.js'); return convert(); }
}
function heading(title, subtitle, action='') { return `<div class="workflow-heading"><div><div class="eyebrow">THE PAPER ATELIER / ${app.mode.toUpperCase()}</div><h2>${title}</h2><p>${subtitle}</p></div>${action}</div>`; }
export function organize() {
  $('#workflow').innerHTML = heading('Every page, in its place.', 'Select pages. Drag to rearrange, or use Move before. Page changes commit additions and clear their undo history.') + `<div class="tool-settings"><button id="select-all">Select all</button><button id="rotate-left">↶ Rotate left</button><button id="rotate-right">↷ Rotate right</button><button id="delete-pages">Delete</button><button id="duplicate-pages">Duplicate</button><button id="blank-page">＋ Blank page</button><button id="extract-pages">Extract</button><button id="move-pages">Move before…</button></div><p class="helper" id="selection-count">0 pages selected</p><div class="page-grid"></div>`;
  const grid = $('.page-grid'), current = doc();
  thumbnailObserver = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { const button=entry.target; thumbnailObserver.unobserve(button); current.loadThumbnail(Number(button.dataset.page), thumbnail => { if (button.isConnected && doc()===current) button.prepend(thumbnail); }); } }, {root:$('#workflow'),rootMargin:'250px'});
  let dragged;
  for(let page=1;page<=current.getPageCount();page++) {
    const button=document.createElement('button');button.className='page-card';button.dataset.page=page;button.draggable=true;button.setAttribute('aria-label',`Select page ${page}`);button.setAttribute('aria-pressed',String(app.selected.has(page)));button.innerHTML=`<span class="page-label">${String(page).padStart(2,'0')}</span>`;
    button.onclick=()=>{app.selected.has(page)?app.selected.delete(page):app.selected.add(page);button.setAttribute('aria-pressed',String(app.selected.has(page)));selectionCount();};
    button.ondblclick=()=>{app.instance.Core.documentViewer.setCurrentPage(page);document.querySelector('[data-mode="edit"]').click();};
    button.ondragstart=event=>{dragged=page;event.dataTransfer.setData('text/plain',String(page));};
    button.ondragover=event=>{event.preventDefault();button.classList.add('drag-target');};
    button.ondragleave=()=>button.classList.remove('drag-target');
    button.ondrop=event=>{event.preventDefault();event.stopPropagation();button.classList.remove('drag-target');if(dragged && dragged!==page) task('Reordering pages…',async()=>{await current.movePages([dragged],page);app.selected.clear();markDirty();organize();});};
    grid.append(button);thumbnailObserver.observe(button);
  }
  const action=(id,fn)=>$(id).onclick=()=>task('Updating pages…',async()=>{const pages=selected();if(!pages.length)throw new Error('Select one or more pages first.');await fn(pages);app.selected.clear();markDirty();updatePageInfo();organize();});
  $('#select-all').onclick=()=>{app.selected=app.selected.size===current.getPageCount()?new Set():new Set(Array.from({length:current.getPageCount()},(_,i)=>i+1));organize();};
  action('#rotate-left',pages=>current.rotatePages(pages,app.instance.Core.PageRotation.E_270));
  action('#rotate-right',pages=>current.rotatePages(pages,app.instance.Core.PageRotation.E_90));
  action('#delete-pages',async pages=>{if(pages.length===current.getPageCount())throw new Error('Keep at least one page in the document.');await current.removePages(pages);});
  action('#duplicate-pages',async pages=>{const data=await app.instance.UI.extractPagesWithAnnotations(pages);const source=await app.instance.Core.createDocument(data,{extension:'pdf'});try{await current.insertPages(source,Array.from({length:source.getPageCount()},(_,i)=>i+1),pages.at(-1)+1);}finally{await source.unloadResources();}});
  $('#blank-page').onclick=()=>task('Inserting a blank page…',async()=>{await current.insertBlankPages([current.getPageCount()+1],595,842);markDirty();organize();});
  $('#extract-pages').onclick=()=>task('Extracting pages…',async()=>{if(!selected().length)throw new Error('Select one or more pages first.');download(await app.instance.UI.extractPagesWithAnnotations(selected()),'extracted-pages.pdf');status('Extracted PDF generated');});
  $('#move-pages').onclick=async()=>{const {showDialog} = await import('../app.js');showDialog('Move selected pages','<label>Insert before page (page count + 1 moves to end)<input id="move-target" type="number" min="1" value="1"></label><button class="primary" id="confirm-move">Move pages</button>');$('#confirm-move').onclick=()=>task('Moving pages…',async()=>{const target=Number($('#move-target').value);if(!Number.isInteger(target)||target<1||target>current.getPageCount()+1)throw new Error('Choose a valid destination page.');if(!selected().length)throw new Error('Select pages first.');await current.movePages(selected(),target);app.selected.clear();markDirty();$('#dialog').close();organize();});};
  selectionCount();
}
function selectionCount() { $('#selection-count').textContent=`${app.selected.size} of ${doc().getPageCount()} pages selected`; }

function merge() {
  $('#workflow').innerHTML=heading('Better together.','Arrange your PDFs in reading order. Your open document stays intact.')+'<div class="workflow-sheet"><button id="add-merge" class="full">＋ Add PDF documents</button><input id="merge-input" type="file" accept="application/pdf,.pdf" multiple hidden><ul class="file-list" id="merge-list"></ul><p class="helper" id="merge-total"></p><button id="merge-now" class="primary full">Merge documents ↗</button></div>';
  $('#add-merge').onclick=()=>$('#merge-input').click();
  $('#merge-input').onchange=event=>{const files=[...event.target.files];event.target.value='';task('Reading documents…',async()=>{for(const file of files){await validatePDF(file);const source=await app.instance.Core.createDocument(file,{extension:'pdf'});try{const thumb=await new Promise(resolve=>source.loadThumbnail(1,resolve));queue.push({file,pages:source.getPageCount(),preview:thumb.toDataURL?thumb.toDataURL():thumb.src});}finally{await source.unloadResources();}}renderMerge();});};
  $('#merge-now').onclick=()=>task('Combining your documents…',async()=>{if(queue.length<2)throw new Error('Add at least two PDF documents.');const output=await app.instance.Core.createDocument(queue[0].file,{extension:'pdf'});try{for(const item of queue.slice(1)){const source=await app.instance.Core.createDocument(item.file,{extension:'pdf'});try{await output.insertPages(source,Array.from({length:item.pages},(_,i)=>i+1),output.getPageCount()+1);}finally{await source.unloadResources();}}download(await output.getFileData({}), 'merged-document.pdf');status(`Merged PDF generated — ${output.getPageCount()} pages`);}finally{await output.unloadResources();}});
  renderMerge();
}
function renderMerge() {
  const list=$('#merge-list');list.replaceChildren();
  queue.forEach((item,index)=>{const row=document.createElement('li');row.className='file-row';row.innerHTML='<img alt="First page preview"><div class="file-details"><strong></strong><small></small></div><button aria-label="Move document up">↑</button><button aria-label="Move document down">↓</button><button aria-label="Remove document">×</button>';row.querySelector('img').src=item.preview;row.querySelector('strong').textContent=item.file.name;row.querySelector('small').textContent=`${item.pages} pages`;const buttons=row.querySelectorAll('button');buttons[0].disabled=index===0;buttons[1].disabled=index===queue.length-1;buttons[0].onclick=()=>{[queue[index-1],queue[index]]=[queue[index],queue[index-1]];renderMerge();};buttons[1].onclick=()=>{[queue[index+1],queue[index]]=[queue[index],queue[index+1]];renderMerge();};buttons[2].onclick=()=>{queue.splice(index,1);renderMerge();};list.append(row);});
  $('#merge-total').textContent=`${queue.length} documents · ${queue.reduce((sum,item)=>sum+item.pages,0)} total pages`;$('#merge-now').disabled=queue.length<2;
}
function split() {
  const count=doc().getPageCount();
  $('#workflow').innerHTML=heading('Only what you need.',`${count} pages. A clean cut, without changing your original.`)+`<div class="workflow-sheet"><label>Split method<select id="split-method"><option value="extract">Extract selected pages into one PDF</option><option value="each">Every page as a separate PDF</option><option value="ranges">Custom ranges into separate PDFs</option><option value="fixed">Fixed number of pages per PDF</option></select></label><label id="ranges-label">Pages or ranges<input id="split-ranges" value="1-${count}" placeholder="1-3, 5, 8-12"></label><label id="fixed-label" hidden>Pages per file<input id="split-fixed" type="number" min="1" value="2"></label><p class="helper" id="split-preview"></p><button id="split-now" class="primary full">Create files ↗</button></div>`;
  const groups=()=>{const method=$('#split-method').value;if(method==='extract')return [parseRanges($('#split-ranges').value,count)];if(method==='ranges')return $('#split-ranges').value.split(',').map(range=>parseRanges(range,count));const size=method==='each'?1:Number($('#split-fixed').value);if(!Number.isInteger(size)||size<1||size>count)throw new Error(`Choose between 1 and ${count} pages per file.`);return Array.from({length:Math.ceil(count/size)},(_,index)=>Array.from({length:Math.min(size,count-index*size)},(_,i)=>index*size+i+1));};
  const preview=()=>{const method=$('#split-method').value;$('#ranges-label').hidden=!['extract','ranges'].includes(method);$('#fixed-label').hidden=method!=='fixed';try{const outputs=groups();$('#split-preview').textContent=`${outputs.length} output file${outputs.length===1?'':'s'} · ${outputs.reduce((sum,pages)=>sum+pages.length,0)} pages${outputs.length>1?' · ZIP download':''}`;$('#split-now').disabled=false;}catch(error){$('#split-preview').textContent=error.message;$('#split-now').disabled=true;}};
  for(const selector of ['#split-method','#split-ranges','#split-fixed'])$(selector).oninput=preview;
  $('#split-now').onclick=()=>task('Preparing your pages…',async()=>{const outputs=groups();const zip=new JSZip();for(let i=0;i<outputs.length;i++){const file=await app.instance.UI.extractPagesWithAnnotations(outputs[i]);if(outputs.length===1)download(file,'extracted-pages.pdf');else zip.file(`pages-${i+1}.pdf`,await file.arrayBuffer());}if(outputs.length>1)download(await zip.generateAsync({type:'blob'}),'split-documents.zip');status('Split files generated');});preview();
}

