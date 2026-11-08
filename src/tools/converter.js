import { createImagePDF } from '../core/image-pdf.js';
import { app, $, task, status } from '../app.js';
import { parseRanges, download } from '../utils/files.js';
import { pdfBytes } from '../core/viewer.js';
import JSZip from 'jszip';
const images=[];
export function convert() {
  $('#workflow').innerHTML=`<div class="workflow-heading"><div><div class="eyebrow">THE PAPER ATELIER / CONVERT</div><h2>A fresh format.</h2><p>Turn images into pages, or take your pages out as images.</p></div></div><div class="workflow-sheet"><label>Conversion<select id="conversion"><option value="to-pdf">Images to PDF</option><option value="to-images" ${app.instance.Core.documentViewer.getDocument()?'':'disabled'}>PDF to images</option></select></label><div id="image-inputs"><button class="full" id="add-images">＋ Add JPEG, PNG or WebP images</button><input id="images-picker" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><ul class="file-list" id="images-list"></ul><div class="inline-fields"><label>Page size<select id="page-size"><option value="a4">A4</option><option value="letter">US Letter</option></select></label><label>Orientation<select id="orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label></div><label>Margin (points)<input id="margin" type="number" min="0" max="144" value="36"></label></div><div id="pdf-inputs" hidden><label>Pages<select id="image-pages"><option value="current">Current page</option><option value="all">All pages</option><option value="selected">Page ranges</option></select></label><label id="image-range-label" hidden>Page ranges<input id="image-ranges" placeholder="1-3, 5" value="1"></label><div class="inline-fields"><label>Format<select id="image-format"><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label><label>Resolution<select id="image-scale"><option value="1">72 DPI</option><option value="2" selected>144 DPI</option><option value="3">216 DPI</option></select></label></div><p class="helper">Annotations and signatures are included. Multiple pages are packaged in a ZIP.</p></div><button class="primary full" id="convert-now">Create PDF ↗</button></div>`;
  $('#conversion').onchange=()=>{const pdf=$('#conversion').value==='to-pdf';$('#image-inputs').hidden=!pdf;$('#pdf-inputs').hidden=pdf;$('#convert-now').textContent=pdf?'Create PDF ↗':'Export images ↗';};
  $('#image-pages').onchange=()=>$('#image-range-label').hidden=$('#image-pages').value!=='selected';
  $('#add-images').onclick=()=>$('#images-picker').click();
  $('#images-picker').onchange=event=>{const files=[...event.target.files];event.target.value='';task('Reading images…',async()=>{for(const file of files){if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose JPEG, PNG, or WebP images.');if(file.size>40*1024*1024)throw new Error('Each image must be smaller than 40 MB.');const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>40_000_000)throw new Error('Image exceeds the 40 megapixel limit.');images.push({file,width:bitmap.width,height:bitmap.height,url:URL.createObjectURL(file)});}finally{bitmap.close();}}renderImages();});};
  $('#convert-now').onclick=()=>task('Converting your files…',async()=>{if($('#conversion').value==='to-pdf')await imagesToPDF();else await pdfToImages();});
  renderImages();
}
function renderImages() {
  const list=$('#images-list');list.replaceChildren();
  images.forEach((item,index)=>{const row=document.createElement('li');row.className='file-row';row.innerHTML='<img alt="Image preview"><div class="file-details"><strong></strong><small></small></div><button aria-label="Move image up">↑</button><button aria-label="Move image down">↓</button><button aria-label="Remove image">×</button>';row.querySelector('img').src=item.url;row.querySelector('strong').textContent=item.file.name;row.querySelector('small').textContent=`${item.width} × ${item.height}`;const buttons=row.querySelectorAll('button');buttons[0].disabled=index===0;buttons[1].disabled=index===images.length-1;buttons[0].onclick=()=>{[images[index-1],images[index]]=[images[index],images[index-1]];renderImages();};buttons[1].onclick=()=>{[images[index+1],images[index]]=[images[index],images[index+1]];renderImages();};buttons[2].onclick=()=>{URL.revokeObjectURL(item.url);images.splice(index,1);renderImages();};list.append(row);});
}
async function imagesToPDF() {
  if(!images.length)throw new Error('Add at least one image.');
  const margin=Number($('#margin').value);if(!Number.isFinite(margin)||margin<0||margin>144)throw new Error('Margins must be between 0 and 144 points.');
  let [width,height]=$('#page-size').value==='a4'?[595.28,841.89]:[612,792];
  if($('#orientation').value==='landscape')[width,height]=[height,width];
  const bytes = await createImagePDF(app.instance.Core, images, { width, height, margin });
  download(bytes,'images-document.pdf');status(`PDF generated — ${images.length} image pages`);
}
async function pdfToImages() {
  const dv=app.instance.Core.documentViewer;if(!dv.getDocument())throw new Error('Open a PDF first.');
  const scope=$('#image-pages').value,count=dv.getPageCount();
  const pages=scope==='current'?[dv.getCurrentPage()]:scope==='all'?Array.from({length:count},(_,i)=>i+1):parseRanges($('#image-ranges').value,count);
  const format=$('#image-format').value,scale=Number($('#image-scale').value),zip=new JSZip();
  // Reload serialized data so all content edits and annotations are represented in the raster output.
  const source=await app.instance.Core.createDocument(new Blob([await pdfBytes(app.instance)],{type:'application/pdf'}),{extension:'pdf'});
  try {
    for(const page of pages){
      const info=source.getPageInfo(page);if(info.width*info.height*scale*scale>40_000_000)throw new Error('This page is too large at that resolution. Choose a lower DPI.');
      let requestId;
      const canvas=await new Promise((resolve,reject)=>{requestId=source.loadCanvas({pageNumber:page,zoom:scale,drawComplete:resolve,drawError:reject});});
      const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const ctx=output.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(canvas,0,0);
      const blob=await new Promise(resolve=>output.toBlob(resolve,`image/${format}`,.94));if(!blob)throw new Error('The browser could not create the image.');
      const name=`page-${String(page).padStart(3,'0')}.${format==='jpeg'?'jpg':'png'}`;
      if(pages.length===1)download(blob,name);else zip.file(name,await blob.arrayBuffer());
      source.unloadCanvasResources(requestId);output.width=output.height=0;
    }
    if(pages.length>1)download(await zip.generateAsync({type:'blob'}),'pdf-images.zip');
    status(`${pages.length} page image${pages.length===1?'':'s'} generated`);
  } finally {await source.unloadResources();}
}
window.addEventListener('pagehide',()=>{for(const image of images)URL.revokeObjectURL(image.url);});
