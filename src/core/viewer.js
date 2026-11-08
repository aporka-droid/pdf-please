import * as pdfjs from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AtelierDocument } from './pdf-document.js';
import { OverlayEditor } from './overlay-editor.js';
pdfjs.GlobalWorkerOptions.workerSrc=workerURL;
const base=import.meta.env.BASE_URL;
const renderer=data=>pdfjs.getDocument({data:new Uint8Array(data),cMapUrl:`${base}lib/pdfjs/cmaps/`,cMapPacked:true,standardFontDataUrl:`${base}lib/pdfjs/standard_fonts/`,wasmUrl:`${base}lib/pdfjs/wasm/`,isEvalSupported:false}).promise;
class Events {
  constructor(){this.events=new Map();}
  addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(fn);}
  removeEventListener(name,fn){this.events.get(name)?.delete(fn);}
  emit(name,...args){this.events.get(name)?.forEach(fn=>fn(...args));}
}
export async function initializeViewer(element){
  const events=new Events(),uiEvents=new Events();
  const editor=new OverlayEditor(element);
  const dv=Object.assign(events,{
    getDocument:()=>editor.doc,getCurrentPage:()=>editor.page,getPageCount:()=>editor.doc?.getPageCount()||0,
    setCurrentPage:n=>editor.go(n),getZoomLevel:()=>editor.zoom,
    getContentEditManager:()=>({addEventListener(){},isInContentEditMode:()=>false,startContentEditMode:async()=>{},endContentEditMode:async()=>{},undo:()=>{editor.doc?.undo();editor.settings();},redo:()=>{editor.doc?.redo();editor.settings();}}),
    getAnnotationHistoryManager:()=>({undo:()=>{editor.doc?.undo();editor.settings();},redo:()=>{editor.doc?.redo();editor.settings();}}),
  });
  const UI=Object.assign(uiEvents,{
    Events:{LOAD_ERROR:'loadError'},FitMode:{FitPage:'page',FitWidth:'width'},
    async loadDocument(file){const doc=await AtelierDocument.open(file,renderer);await editor.doc?.unloadResources();editor.doc=doc;editor.page=1;editor.selected=null;doc.onchange=structural=>{editor.page=Math.min(editor.page,doc.getPageCount());events.emit(structural?'pagesUpdated':'overlayChanged');editor.refresh(structural).catch(editor.fail);};await editor.refresh(true);editor.onZoom();events.emit('documentLoaded');},
    async closeDocument(){await editor.doc?.unloadResources();editor.doc=null;editor.clear();events.emit('documentUnloaded');},
    setZoomLevel:value=>editor.setZoom(value),setFitMode:mode=>editor.fit(mode),setToolMode:()=>{},
    isElementOpen:()=>!editor.sidebar.hidden,openElements:()=>{editor.sidebar.hidden=false;editor.thumbnails();},closeElements:()=>{editor.sidebar.hidden=true;},
    extractPagesWithAnnotations:pages=>editor.doc.extract(pages),
  });
  editor.onPage=()=>events.emit('pageNumberUpdated');editor.onZoom=()=>events.emit('zoomUpdated',editor.zoom);
  return {Core:{documentViewer:dv,annotationManager:{addEventListener(){},getSelectedAnnotations:()=>[]},createDocument:file=>AtelierDocument.open(file,renderer),PageRotation:{E_90:90,E_270:270}},UI,editor};
}
export async function commitEditing(){}
export const pdfBytes=instance=>instance.Core.documentViewer.getDocument().getFileData();
export function configureTools(instance,mode){instance.editor.setMode(mode);}
