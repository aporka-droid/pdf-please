import { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from 'pdf-lib';

export const fontNames = { sans: StandardFonts.Helvetica, serif: StandardFonts.TimesRoman, mono: StandardFonts.Courier };
export function color(value) {
  const n = Number.parseInt(value.replace('#', ''), 16);
  return rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255);
}
export function pageGeometry(page) {
  const crop = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  return { ...crop, rotation, width: rotation % 180 ? crop.height : crop.width, height: rotation % 180 ? crop.width : crop.height };
}
// Overlay coordinates use the visible, rotated crop box, with an origin at top left.
export async function drawOverlays(pdf, overlays) {
  const fonts = {};
  for (const [key, name] of Object.entries(fontNames)) fonts[key] = await pdf.embedFont(name);
  for (let i = 0; i < overlays.length; i++) {
    const page = pdf.getPage(i), box = page.getCropBox(), { height, rotation } = pageGeometry(page);
    const transforms = { 0: [1,0,0,1,box.x,box.y], 90: [0,1,-1,0,box.x+box.width,box.y], 180: [-1,0,0,-1,box.x+box.width,box.y+box.height], 270: [0,-1,1,0,box.x,box.y+box.height] };
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...transforms[rotation]));
    for (const item of overlays[i] || []) {
      const paint = color(item.color || '#232120');
      if (item.kind === 'cover' || item.kind === 'highlight' || item.kind === 'rectangle') {
        page.drawRectangle({ x: item.x, y: height-item.y-item.h, width:item.w, height:item.h,
          ...(item.kind === 'rectangle' ? {borderColor:paint,borderWidth:2} : {color:paint,opacity:item.kind==='highlight'?.3:1}) });
      } else if (item.kind === 'draw') {
        for (let p=1;p<item.points.length;p++) page.drawLine({start:{x:item.x+item.points[p-1][0],y:height-item.y-item.points[p-1][1]},end:{x:item.x+item.points[p][0],y:height-item.y-item.points[p][1]},color:paint,thickness:2});
      } else if (item.kind === 'image') {
        const image = await pdf.embedPng(item.data);
        page.drawImage(image,{x:item.x,y:height-item.y-item.h,width:item.w,height:item.h});
      } else {
        const font = fonts[item.font || 'sans'];
        try { for(const line of item.text.split(/\r?\n/))font.encodeText(line); } catch { throw new Error('This font cannot export some of these characters. Use supported Latin characters or upload a signature image.'); }
        const size=item.size || 16;
        const ascent=font.heightAtSize(size,{descender:false});
        page.drawText(item.text,{x:item.x,y:height-item.y-ascent,size,font,color:paint,lineHeight:size*1.25});
      }
    }
    page.pushOperators(popGraphicsState());
  }
}

export class AtelierDocument {
  static async open(input, renderer) {
    const bytes = input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : new Uint8Array(input);
    let pdf;
    try { pdf = await PDFDocument.load(bytes); }
    catch(error) { throw new Error(/encrypt/i.test(error.message) ? 'Password-protected PDFs are not supported. Open an unlocked copy.' : 'This PDF could not be opened. It may be damaged or unsupported.'); }
    if (!pdf.getPageCount()) throw new Error('This PDF has no pages.');
    return new AtelierDocument(pdf, renderer);
  }
  constructor(pdf, renderer) { this.pdf=pdf;this.renderer=renderer;this.overlays=pdf.getPages().map(()=>[]);this.history=[];this.future=[];this.onchange=()=>{};this.raster=null; }
  getPageCount(){ return this.pdf.getPageCount(); }
  getPageInfo(n){return pageGeometry(this.pdf.getPage(n-1));}
  remember(){this.history.push(structuredClone(this.overlays));if(this.history.length>50)this.history.shift();this.future=[];}
  edit(action){this.remember();action(this.overlays);this.onchange(false);}
  undo(){if(!this.history.length)return;this.future.push(structuredClone(this.overlays));this.overlays=this.history.pop();this.onchange(false);}
  redo(){if(!this.future.length)return;this.history.push(structuredClone(this.overlays));this.overlays=this.future.pop();this.onchange(false);}
  async getFileData(){const copy=await PDFDocument.load(await this.pdf.save());await drawOverlays(copy,this.overlays);return copy.save();}
  async extract(pages){const source=await PDFDocument.load(await this.getFileData()),out=await PDFDocument.create();for(const p of await out.copyPages(source,pages.map(n=>n-1)))out.addPage(p);return new Blob([await out.save()],{type:'application/pdf'});}
  async flatten(){this.pdf=await PDFDocument.load(await this.getFileData());this.overlays=this.pdf.getPages().map(()=>[]);this.history=[];this.future=[];await this.invalidate();}
  async invalidate(){const pending=this.rasterPromise;this.rasterPromise=null;this.raster=null;if(pending){const doc=await pending;await doc.loadingTask.destroy();}}
  async rasterPDF(){if(!this.rasterPromise)this.rasterPromise=this.pdf.save().then(data=>this.renderer(data));return this.rasterPromise;}
  async changed(){this.pdf=await PDFDocument.load(await this.pdf.save());this.overlays=Array.from({length:this.pdf.getPageCount()},()=>[]);await this.invalidate();this.onchange(true);}
  async rotatePages(pages,angle){await this.flatten();for(const n of pages){const p=this.pdf.getPage(n-1);p.setRotation(degrees((p.getRotation().angle+angle)%360));}await this.changed();}
  async removePages(pages){if(pages.length>=this.getPageCount())throw new Error('Keep at least one page.');await this.flatten();for(const n of [...pages].sort((a,b)=>b-a))this.pdf.removePage(n-1);this.overlays=this.pdf.getPages().map(()=>[]);await this.changed();}
  async movePages(pages,target){await this.flatten();const moving=new Set(pages),order=Array.from({length:this.getPageCount()},(_,i)=>i+1),remaining=order.filter(n=>!moving.has(n));const position=remaining.filter(n=>n<target).length;remaining.splice(position,0,...pages);const out=await PDFDocument.create();for(const p of await out.copyPages(this.pdf,remaining.map(n=>n-1)))out.addPage(p);this.pdf=out;this.overlays=out.getPages().map(()=>[]);await this.changed();}
  async insertPages(source,pages,target){await this.flatten();const sourcePdf=await PDFDocument.load(await source.getFileData());const copied=await this.pdf.copyPages(sourcePdf,pages.map(n=>n-1));copied.forEach((p,i)=>this.pdf.insertPage(target-1+i,p));this.overlays=this.pdf.getPages().map(()=>[]);await this.changed();}
  async insertBlankPages(pages,w,h){await this.flatten();for(const n of pages)this.pdf.insertPage(n-1,[w,h]);this.overlays=this.pdf.getPages().map(()=>[]);await this.changed();}
  async canvas(n,scale=1){const pdf=await this.rasterPDF(),page=await pdf.getPage(n),viewport=page.getViewport({scale});if(viewport.width*viewport.height>40_000_000)throw new Error('Page too large to render at this zoom.');const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;return canvas;}
  loadThumbnail(n,done){this.canvas(n,Math.min(.3,150/this.getPageInfo(n).width)).then(done).catch(()=>{const placeholder=document.createElement('span');placeholder.textContent='Preview unavailable';done(placeholder);});}
  loadCanvas({pageNumber,zoom,drawComplete,drawError}){this.canvas(pageNumber,zoom).then(drawComplete).catch(drawError||console.error);}
  unloadCanvasResources(){}
  unloadResources(){return this.invalidate();}
}
