const NS='http://www.w3.org/2000/svg';
const families={sans:'Arial, Helvetica, sans-serif',serif:'Times New Roman, serif',mono:'Courier New, monospace'};
function svg(tag,attrs={},text){const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el;}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export class OverlayEditor {
  constructor(element){
    this.root=element;this.doc=null;this.page=1;this.zoom=.85;this.mode='edit';this.tool='select';this.selected=null;this.ticket=0;
    this.onPage=()=>{};this.onZoom=()=>{};
    element.innerHTML=`<div class="atelier-editor"><div class="overlay-toolbar" role="toolbar" aria-label="PDF editing tools"></div><div class="overlay-body"><aside class="overlay-pages" aria-label="Page thumbnails" hidden></aside><div class="paper-scroll"><div class="paper-stage"><canvas class="pdf-canvas"></canvas><svg class="overlay-layer" tabindex="0" aria-label="PDF page editing canvas"></svg></div></div><aside class="overlay-settings" aria-label="Overlay properties"></aside></div><div class="overlay-navigation"><button data-nav="previous" aria-label="Previous page">←</button><label>Page <input class="overlay-page-number" type="number" min="1" aria-label="Page number"></label><span class="overlay-page-total"></span><button data-nav="next" aria-label="Next page">→</button><span class="overlay-message" role="status"></span></div><input class="overlay-image-picker" type="file" accept="image/png,image/jpeg,image/webp" hidden></div>`;
    this.toolbar=element.querySelector('.overlay-toolbar');this.sidebar=element.querySelector('.overlay-pages');this.scroll=element.querySelector('.paper-scroll');this.stage=element.querySelector('.paper-stage');this.layer=element.querySelector('.overlay-layer');this.panel=element.querySelector('.overlay-settings');this.message=element.querySelector('.overlay-message');
    this.fail=error=>{this.message.textContent=error.message||'Unable to render this page.';};
    element.querySelector('[data-nav="previous"]').onclick=()=>this.go(this.page-1);
    element.querySelector('[data-nav="next"]').onclick=()=>this.go(this.page+1);
    element.querySelector('.overlay-page-number').onchange=e=>this.go(Number(e.target.value));
    element.querySelector('.overlay-image-picker').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)this.uploadImage(file).catch(this.fail);};
    this.layer.addEventListener('pointerdown',e=>this.pointerDown(e));
    this.layer.addEventListener('pointermove',e=>this.pointerMove(e));
    this.layer.addEventListener('pointerup',e=>this.pointerUp(e));
    this.layer.addEventListener('pointercancel',()=>{this.gesture=null;this.renderItems();});
    this.layer.addEventListener('keydown',e=>{
      const item=this.item();if(!item)return;
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();this.remove();}
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
      if(delta){e.preventDefault();this.doc.edit(()=>{const amount=e.shiftKey?10:1;item.x=clamp(item.x+delta[0]*amount,0,this.info().width-item.w);item.y=clamp(item.y+delta[1]*amount,0,this.info().height-item.h);});this.settings();}
    });
    this.setMode('edit');
  }
  info(){return this.doc.getPageInfo(this.page);}
  item(){return this.doc?.overlays[this.page-1]?.find(x=>x.id===this.selected);}
  clear(){this.ticket++;this.stage.hidden=true;this.sidebar.replaceChildren();this.panel.replaceChildren();}
  async go(n){if(!this.doc||!Number.isInteger(n)||n<1||n>this.doc.getPageCount())return;this.page=n;this.selected=null;await this.refresh(true).catch(this.fail);this.onPage();}
  async setZoom(n){this.zoom=clamp(n,.1,5);this.onZoom();await this.refresh(true).catch(this.fail);}
  fit(mode){if(!this.doc)return;const info=this.info(),w=this.scroll.clientWidth-48,h=this.scroll.clientHeight-48;this.setZoom(mode==='width'?w/info.width:Math.min(w/info.width,h/info.height));}
  async refresh(renderPage=false){
    if(!this.doc)return;
    this.page=clamp(this.page,1,this.doc.getPageCount());this.stage.hidden=false;
    if(renderPage){
      const ticket=++this.ticket,current=this.doc,page=this.page,scale=this.zoom;
      this.message.textContent='Rendering page…';
      const info=this.info();this.stage.style.width=`${info.width*scale}px`;this.stage.style.height=`${info.height*scale}px`;this.layer.setAttribute('viewBox',`0 0 ${info.width} ${info.height}`);
      const canvas=await current.canvas(page,Math.min(scale*(window.devicePixelRatio||1),Math.sqrt(20_000_000/(info.width*info.height))));
      if(ticket!==this.ticket||this.doc!==current)return;
      canvas.className='pdf-canvas';this.stage.querySelector('canvas').replaceWith(canvas);
      this.message.textContent='';this.settings();if(!this.sidebar.hidden)this.thumbnails();
    }
    this.renderItems();
    this.root.querySelector('.overlay-page-number').value=this.page;
    this.root.querySelector('.overlay-page-total').textContent=`of ${this.doc.getPageCount()}`;
    this.root.querySelector('[data-nav="previous"]').disabled=this.page===1;
    this.root.querySelector('[data-nav="next"]').disabled=this.page===this.doc.getPageCount();
  }
  thumbnails(){
    if(!this.doc)return;this.thumbObserver?.disconnect();this.sidebar.replaceChildren();const doc=this.doc;
    this.thumbObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){this.thumbObserver.unobserve(entry.target);doc.loadThumbnail(Number(entry.target.dataset.page),canvas=>{if(entry.target.isConnected)entry.target.prepend(canvas);});}},{root:this.sidebar,rootMargin:'150px'});
    for(let n=1;n<=doc.getPageCount();n++){const button=document.createElement('button');button.dataset.page=n;button.textContent=`Page ${n}`;button.setAttribute('aria-pressed',String(n===this.page));button.onclick=()=>this.go(n);this.sidebar.append(button);this.thumbObserver.observe(button);}
  }
  setMode(mode){
    this.mode=mode;this.tool='select';
    const options=mode==='annotate'?[['select','Select'],['highlight','Highlight area'],['rectangle','Rectangle'],['draw','Draw'],['text','Text note']]:mode==='sign'?[['select','Select'],['text','Type signature'],['draw','Draw signature'],['image','Upload signature']]:[['select','Select / move'],['text','Add text'],['replace','Cover & replace'],['cover','Cover area'],['image','Add image']];
    this.toolbar.replaceChildren();
    for(const [tool,label] of options){const button=document.createElement('button');button.textContent=label;button.dataset.tool=tool;button.setAttribute('aria-pressed',String(tool==='select'));button.onclick=()=>{if(tool==='image'){this.root.querySelector('.overlay-image-picker').click();return;}this.choose(tool);};this.toolbar.append(button);}
    this.settings();
  }
  choose(tool){this.tool=tool;for(const button of this.toolbar.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.tool===tool));this.layer.style.cursor=tool==='select'?'default':'crosshair';this.message.textContent=tool==='text'?'Click on the page to add text.':tool==='select'?'Select an addition to move or edit it.':'Drag on the page to mark an area.';}
  point(event){const r=this.layer.getBoundingClientRect(),info=this.info();return {x:clamp((event.clientX-r.left)*info.width/r.width,0,info.width),y:clamp((event.clientY-r.top)*info.height/r.height,0,info.height)};}
  pointerDown(event){
    if(!this.doc||event.button!==0)return;event.preventDefault();const p=this.point(event);this.layer.focus({preventScroll:true});
    const id=event.target.closest('[data-overlay-id]')?.getAttribute('data-overlay-id');
    if(this.tool==='select'){
      this.selected=id||null;this.renderItems();this.settings();
      const item=this.item();if(item)this.gesture={type:'move',start:p,original:structuredClone(item),preview:structuredClone(item)};
    }else if(this.tool==='text'){
      this.add([{kind:'text',text:this.mode==='sign'?'Your name':'Your text',font:this.mode==='sign'?'serif':'sans',size:this.mode==='sign'?28:16,color:'#232120',x:p.x,y:p.y,w:180,h:32}]);this.choose('select');this.panel.querySelector('textarea')?.focus();
    }else this.gesture={type:this.tool,start:p,end:p,points:[[0,0]]};
    this.layer.setPointerCapture(event.pointerId);
  }
  pointerMove(event){
    if(!this.gesture)return;const p=this.point(event),g=this.gesture;g.end=p;
    if(g.type==='move'){g.preview.x=clamp(g.original.x+p.x-g.start.x,0,this.info().width-g.original.w);g.preview.y=clamp(g.original.y+p.y-g.start.y,0,this.info().height-g.original.h);}
    if(g.type==='draw')g.points.push([p.x-g.start.x,p.y-g.start.y]);
    this.renderItems();
  }
  pointerUp(){
    const g=this.gesture;if(!g)return;this.gesture=null;
    if(g.type==='move'){if(g.preview.x!==g.original.x||g.preview.y!==g.original.y)this.doc.edit(()=>Object.assign(this.item(),g.preview));this.renderItems();this.settings();return;}
    const end=g.end||g.start,x=Math.min(g.start.x,end.x),y=Math.min(g.start.y,end.y),w=Math.abs(end.x-g.start.x),h=Math.abs(end.y-g.start.y);
    if(g.type==='draw'){
      if(g.points.length<2)return;const xs=g.points.map(p=>p[0]),ys=g.points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys);
      this.add([{kind:'draw',x:g.start.x+minX,y:g.start.y+minY,w:Math.max(...xs)-minX||2,h:Math.max(...ys)-minY||2,points:g.points.map(p=>[p[0]-minX,p[1]-minY]),color:'#232120'}]);
    }else if(w>3&&h>3){const item={kind:g.type==='replace'?'cover':g.type,x,y,w,h,color:g.type==='highlight'?'#f0c84b':'#ffffff'};if(item.kind==='rectangle')item.color='#7c2838';const additions=[item];if(g.type==='replace')additions.push({kind:'text',x:x+2,y:y+2,w:Math.max(10,w-4),h:Math.max(10,h-4),text:'Replacement text',font:'sans',size:Math.min(16,Math.max(6,h-4)),color:'#232120'});this.add(additions);}
    this.choose('select');if(g.type==='replace')this.panel.querySelector('textarea')?.focus();
  }
  add(items){
    for(const item of items){item.id=crypto.randomUUID();item.w=Math.min(item.w,this.info().width);item.h=Math.min(item.h,this.info().height);item.x=clamp(item.x,0,this.info().width-item.w);item.y=clamp(item.y,0,this.info().height-item.h);}
    this.selected=items.at(-1).id;this.doc.edit(all=>all[this.page-1].push(...items));this.settings();
  }
  remove(){const id=this.selected;this.selected=null;this.doc.edit(all=>{all[this.page-1]=all[this.page-1].filter(x=>x.id!==id);});this.settings();}
  renderItems(){
    this.layer.replaceChildren();if(!this.doc)return;
    for(const source of this.doc.overlays[this.page-1]||[]){const item=this.gesture?.type==='move'&&source.id===this.selected?this.gesture.preview:source;this.paint(item,true);}
    const g=this.gesture;if(g&&g.type!=='move'){const e=g.end||g.start;if(g.type==='draw')this.paint({kind:'draw',x:g.start.x,y:g.start.y,points:g.points,color:'#232120'},false);else this.layer.append(svg('rect',{x:Math.min(g.start.x,e.x),y:Math.min(g.start.y,e.y),width:Math.abs(e.x-g.start.x),height:Math.abs(e.y-g.start.y),fill:'#7c2838','fill-opacity':.15,stroke:'#7c2838','stroke-dasharray':'4 3'}));}
  }
  paint(item,interactive){
    const group=svg('g',{'data-overlay-id':item.id||'',transform:`translate(${item.x} ${item.y})`});
    if(item.kind==='text'){
      const ascent={sans:.718,serif:.683,mono:.629}[item.font||'sans']*item.size;
      const text=svg('text',{'font-family':families[item.font||'sans'],'font-size':item.size,fill:item.color,'xml:space':'preserve'});
      item.text.split('\n').forEach((line,index)=>text.append(svg('tspan',{x:0,y:ascent+index*item.size*1.25},line||' ')));group.append(text);
    }else if(item.kind==='draw')group.append(svg('polyline',{points:item.points.map(p=>p.join(',')).join(' '),fill:'none',stroke:item.color,'stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round'}));
    else if(item.kind==='image')group.append(svg('image',{href:item.data,width:item.w,height:item.h}));
    else group.append(svg('rect',{width:item.w,height:item.h,fill:item.kind==='rectangle'?'none':item.color,'fill-opacity':item.kind==='highlight'?.3:1,stroke:item.kind==='rectangle'?item.color:'none','stroke-width':2}));
    if(interactive){group.append(svg('rect',{width:Math.max(item.w,8),height:Math.max(item.h,8),fill:'transparent',stroke:item.id===this.selected?'#7c2838':'none','stroke-width':1/this.zoom,'stroke-dasharray':`${4/this.zoom} ${3/this.zoom}`}));group.style.cursor='move';}
    this.layer.append(group);
  }
  settings(){
    const item=this.item();
    if(!item){this.panel.innerHTML='<div class="eyebrow">SIMPLE PDF EDITING</div><h3>A finishing touch.</h3><p>Add text, cover an area, or place an image. Select your additions to edit or move them.</p><p class="helper">Cover & replace hides the original visually. Underlying text remains searchable and extractable. This is not redaction.</p><p class="helper">Additions are flattened into the exported PDF. Page organization also commits them. Undo applies to additions in the current editing session.</p>';return;}
    this.panel.innerHTML=`<div class="eyebrow">${item.kind==='text'?'TEXT':item.kind.toUpperCase()} SELECTED</div>${item.kind==='text'?'<label>Text<textarea id="overlay-text" rows="4" spellcheck="false"></textarea></label><label>Font<select id="overlay-font"><option value="sans">Helvetica</option><option value="serif">Times</option><option value="mono">Courier</option></select></label><label>Size (pt)<input id="overlay-size" type="number" min="6" max="144"></label>':''}${item.kind!=='image'?'<label>Color<input id="overlay-color" type="color"></label>':''}<div class="inline-fields"><label>X<input id="overlay-x" type="number" min="0" step="1"></label><label>Y<input id="overlay-y" type="number" min="0" step="1"></label></div>${['cover','highlight','rectangle','image'].includes(item.kind)?'<div class="inline-fields"><label>Width<input id="overlay-w" type="number" min="1"></label><label>Height<input id="overlay-h" type="number" min="1"></label></div>':''}<button id="overlay-delete" class="full">Delete addition</button><p class="helper">Drag to move. Arrow keys nudge the selection; Shift moves 10 points. Text uses explicit line breaks.</p>${item.kind==='cover'?'<p class="helper">This cover does not remove the text underneath.</p>':''}`;
    for(const key of ['text','font','size','color','x','y','w','h']){
      const input=this.panel.querySelector(`#overlay-${key}`);if(!input)continue;input.value=item[key];
      input.oninput=()=>{const numeric=['size','x','y','w','h'].includes(key);let value=numeric?Number(input.value):input.value;if(numeric&&(!Number.isFinite(value)||input.value===''))return;if(key==='size')value=clamp(value,6,144);if(key==='x')value=clamp(value,0,this.info().width-item.w);if(key==='y')value=clamp(value,0,this.info().height-item.h);if(key==='w')value=clamp(value,1,this.info().width-item.x);if(key==='h')value=clamp(value,1,this.info().height-item.y);
        this.doc.edit(()=>{item[key]=value;if(item.kind==='text'){const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=`${item.size}px ${families[item.font]}`;item.w=Math.max(12,...item.text.split('\n').map(t=>ctx.measureText(t).width));item.h=Math.max(item.size,item.text.split('\n').length*item.size*1.25);}});
      };
    }
    this.panel.querySelector('#overlay-delete').onclick=()=>this.remove();
  }
  async uploadImage(file){
    if(!this.doc)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>40*1024*1024)throw new Error('Choose a PNG, JPEG or WebP image under 40 MB.');
    const bitmap=await createImageBitmap(file);
    try{if(bitmap.width*bitmap.height>40_000_000)throw new Error('Choose an image under 40 megapixels.');const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);const scale=Math.min(1,240/bitmap.width,180/bitmap.height);this.add([{kind:'image',data:canvas.toDataURL('image/png'),x:36,y:36,w:bitmap.width*scale,h:bitmap.height*scale}]);this.choose('select');}finally{bitmap.close();}
  }
}
