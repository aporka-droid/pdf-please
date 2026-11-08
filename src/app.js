import './style.css';
import { renderShell } from './ui/shell.js';
import { initializeViewer, pdfBytes, commitEditing, configureTools } from './core/viewer.js';
import { validatePDF, download, safeName } from './utils/files.js';
renderShell();
export const app = { instance: null, file: null, dirty: false, mode: 'edit', busy: false, selected: new Set(), revision: 0 };
export const $ = selector => document.querySelector(selector);
export const status = message => { $('#status').textContent = message; };
export function markDirty() { app.dirty = true; app.revision++; $('#save-state').textContent = 'UNSAVED CHANGES'; }
export async function task(label, action) {
  if (app.busy) return;
  app.busy = true; $('#busy-label').textContent = label; $('#busy').hidden = false;
  try { return await action(); }
  catch (error) { status('Something needs attention'); showDialog('Unable to complete this action', '<p id="error-message"></p><button class="primary" id="dismiss-error">Back to workspace</button>'); $('#error-message').textContent = error.message || 'The PDF engine could not complete this operation.'; if(import.meta.env.DEV) console.error(error.stack); $('#dismiss-error').onclick = () => $('#dialog').close(); }
  finally { app.busy = false; $('#busy').hidden = true; }
}
export function showDialog(title, html) { $('#dialog-content').innerHTML = `<div class="eyebrow">PDF PLEASE</div><h2></h2>${html}`; $('#dialog-content h2').textContent = title; if (!$('#dialog').open) $('#dialog').showModal(); }
export async function confirmReplace() {
  if (!app.dirty) return true;
  return new Promise(resolve => {
    showDialog('Leave unsaved changes?', '<p>Download your changes first, or discard them to open another document.</p><div class="button-row"><button id="keep">Keep editing</button><button id="discard" class="primary">Discard & continue</button></div>');
    let answer = false;
    $('#keep').onclick = () => $('#dialog').close();
    $('#discard').onclick = () => { answer = true; $('#dialog').close(); };
    $('#dialog').addEventListener('close', () => resolve(answer), { once: true });
  });
}
export async function engine() {
  if (app.instance) return app.instance;
  app.instance = await initializeViewer($('#viewer'));
  const { documentViewer: dv, annotationManager: am } = app.instance.Core;
  dv.addEventListener('overlayChanged', markDirty);
  dv.addEventListener('documentUnloaded', () => { $('#export').disabled = true; app.file = null; app.dirty = false; app.selected.clear(); $('#filename').textContent = 'Your PDF toolbox'; $('#save-state').textContent = 'NO DOCUMENT OPEN'; $('#page-status').textContent = 'PDF PLEASE / THE PAPER ATELIER'; $('#properties-content').textContent = 'Open a document to begin.'; });
  am.addEventListener('annotationChanged', (annotations, action, info) => { if (!info.imported && annotations.some(annotation => !annotation.isContentEditPlaceholder())) markDirty(); });
  dv.addEventListener('pagesUpdated', () => { markDirty(); updatePageInfo(); });
  dv.addEventListener('pageNumberUpdated', updatePageInfo);
  dv.addEventListener('zoomUpdated', value => { $('#zoom-label').textContent = `${Math.round(value * 100)}%`; });
  const cm = dv.getContentEditManager();
  for (const event of ['textContentUpdated', 'contentBoxDeleted']) cm.addEventListener(event, markDirty);
  am.addEventListener('annotationSelected', updateProperties);
  dv.addEventListener('documentLoaded', () => { app.selected.clear(); app.dirty = false; $('#save-state').textContent = 'READY TO EDIT'; $('#export').disabled = false; updatePageInfo(); status('Document ready'); });
  return app.instance;
}
export async function openPDF(file, mode = app.mode) {
  await validatePDF(file);
  if (!await confirmReplace()) return;
  $('#welcome').hidden = true; $('#workbench').hidden = false; $('#workflow').hidden = true; $('#viewer').hidden = false;
  const instance = await engine();
  await new Promise((resolve, reject) => {
    const dv = instance.Core.documentViewer;
    const loaded = () => { cleanup(); resolve(); };
    const failed = error => { cleanup(); reject(new Error(typeof error === 'string' ? error : 'The document could not be opened. It may be damaged or unsupported.')); };
    const cleanup = () => { dv.removeEventListener('documentLoaded', loaded); instance.UI.removeEventListener(instance.UI.Events.LOAD_ERROR, failed); };
    dv.addEventListener('documentLoaded', loaded); instance.UI.addEventListener(instance.UI.Events.LOAD_ERROR, failed);
    Promise.resolve(instance.UI.loadDocument(file, { filename: file.name, extension: 'pdf' })).catch(failed);
  });
  app.file = file; $('#filename').textContent = file.name; await setMode(mode);
}
export function updatePageInfo() { const dv = app.instance?.Core.documentViewer; if (!dv?.getDocument()) return; $('#page-status').textContent = `PAGE ${dv.getCurrentPage()} OF ${dv.getPageCount()}`; updateProperties(); }
export function updateProperties() {
  const dv = app.instance?.Core.documentViewer;
  if (!dv?.getDocument()) return;
  const annotations = app.instance.Core.annotationManager.getSelectedAnnotations();
  const panel = $('#properties-content');
  if (annotations.length && app.mode !== 'edit') {
    panel.innerHTML = '<div class="eyebrow">ANNOTATION SELECTED</div><h3 id="annotation-type"></h3><p>Use the contextual style popover beside your selection to change color, opacity, and stroke.</p><button id="delete-annotation">Delete selection</button>';
    $('#annotation-type').textContent = annotations.length > 1 ? `${annotations.length} annotations` : annotations[0].Subject || 'Annotation';
    $('#delete-annotation').onclick = () => app.instance.Core.annotationManager.deleteAnnotations(annotations);
  } else {
    const page = dv.getCurrentPage(), info = dv.getDocument().getPageInfo(page);
    panel.innerHTML = `<div class="eyebrow">CURRENT PAGE</div><h3>Page ${page}</h3><dl><dt>Dimensions</dt><dd>${Math.round(info.width)} × ${Math.round(info.height)} pt</dd><dt>Document</dt><dd>${dv.getPageCount()} pages</dd></dl><hr><p>Select an addition on the page to move it or adjust its appearance.</p>`;
  }
}
export async function setMode(mode) {
  app.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  if (mode === 'merge' || mode === 'convert') { $('#welcome').hidden = true; $('#workbench').hidden = false; await engine(); }
  if (!app.instance || (!app.instance.Core.documentViewer.getDocument() && !['merge','convert'].includes(mode))) { $('#file-input').click(); return; }
  await commitEditing(app.instance);
  $('#workflow').hidden = true; $('#viewer').hidden = false; $('#viewer').inert = false; $('#viewer').removeAttribute('aria-hidden');
  const hints = { edit: 'Add text or cover & replace', annotate: 'Leave a mark. Make it clear.', sign: 'Create a visual electronic signature', organize: 'Every page, in its place.', merge: 'Bring your documents together.', split: 'Just the pages you need.', convert: 'A different format. The same ideas.' };
  $('#mode-hint').textContent = hints[mode];
  if (['organize','merge','split','convert'].includes(mode)) { const { showWorkflow } = await import('./tools/workflows.js'); await showWorkflow(mode); }
  else if (app.instance.Core.documentViewer.getDocument()) {
    configureTools(app.instance, mode);
    $('#properties').hidden = true;

    if (mode === 'sign') app.instance.UI.setToolMode('AnnotationCreateSignature');
  }
  updateProperties();
}
$('#open').onclick = $('#drop-zone').onclick = () => $('#file-input').click();
$('.brand').onclick = event => { event.preventDefault(); task('Closing your document…',async()=>{if(!await confirmReplace())return;if(app.instance)await app.instance.UI.closeDocument();$('#welcome').hidden=false;$('#workbench').hidden=true;status('Ready when you are');}); };
$('#file-input').onchange = event => { const file = event.target.files[0]; event.target.value = ''; if (file) task('Opening your document…', () => openPDF(file)); };
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => task('Preparing your tools…', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-quick]').forEach(button => button.onclick = () => task('Preparing your workspace…', () => setMode(button.dataset.quick)));
document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); $('#drop-zone').classList.add('dragging'); } });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('#drop-zone').classList.remove('dragging'); });
document.addEventListener('drop', event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); $('#drop-zone').classList.remove('dragging'); task('Opening your document…', () => openPDF(event.dataTransfer.files[0])); });
$('#export').onclick = () => {
  showDialog('Ready to leave the atelier.', '<p>Your original file stays untouched. Added text, covers, drawings, images, and page changes are included. Covers leave the original text underneath.</p><label>File name<input id="export-name" required></label><div class="export-format">PDF document <span>.pdf</span></div><button class="primary full" id="download-pdf">Download PDF ↗</button>');
  $('#export-name').value = (app.file?.name || 'document.pdf').replace(/\.pdf$/i, '') + '-edited.pdf';
  $('#download-pdf').onclick = () => task('Saving your document…', async () => { let name = safeName($('#export-name').value); if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf'; await commitEditing(app.instance); const revision = app.revision; const bytes = await pdfBytes(app.instance); download(bytes, name); if (app.revision === revision) { app.dirty = false; $('#save-state').textContent = 'EXPORTED'; } $('#dialog').close(); status('PDF generated — download started'); });
};
$('#pages-toggle').onclick = () => { if(!app.instance)return; const {UI}=app.instance; if(UI.isElementOpen('atelier-pages'))UI.closeElements(['atelier-pages']);else UI.openElements(['atelier-pages']); };
$('#properties-toggle').onclick = () => { const panel=app.instance?.editor.panel; if(panel)panel.hidden=!panel.hidden; };
$('#zoom-in').onclick = () => app.instance?.UI.setZoomLevel(Math.min(5, app.instance.Core.documentViewer.getZoomLevel() + .1));
$('#zoom-out').onclick = () => app.instance?.UI.setZoomLevel(Math.max(.1, app.instance.Core.documentViewer.getZoomLevel() - .1));
$('#zoom-label').onclick = () => app.instance?.UI.setFitMode(app.instance.UI.FitMode.FitPage);
$('#fit-width').onclick = () => app.instance?.UI.setFitMode(app.instance.UI.FitMode.FitWidth);
for (const action of ['undo','redo']) $(`#${action}`).onclick = () => task(`${action}…`, async () => { if (!app.instance) return; const dv = app.instance.Core.documentViewer; await (app.mode === 'edit' ? dv.getContentEditManager() : dv.getAnnotationHistoryManager())[action](); });
$('#about').onclick = () => showDialog('Your files. Your workspace.', '<p>PDF Please uses PDF.js and pdf-lib to process documents in your browser. No production key is required, and the app adds no watermarks. No account, document upload service, or document storage is used. Interface fonts load from Google Fonts.</p><p>Text editing adds new text over the page. Cover & replace visually hides an area; the original text remains in the PDF and may be searched or copied. It is not redaction. Original paragraphs are not editable. Password-protected PDFs and OCR are not supported.</p><p>Added text supports the standard Latin font character sets. Signatures are visual marks, not certificate-backed signing. Previously watermarked files keep their existing marks; use the original PDF for clean output.</p>');
window.addEventListener('beforeunload', event => { if (app.dirty) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('keydown', event => { if (!(event.ctrlKey || event.metaKey)) return; if (event.key.toLowerCase() === 'o') { event.preventDefault(); $('#file-input').click(); } if (event.key.toLowerCase() === 's') { event.preventDefault(); if (!$('#export').disabled) $('#export').click(); } });
$('#sample').onclick = () => task('Opening the practice document…', async () => { const response = await fetch(`${import.meta.env.BASE_URL}practice.pdf`); if (!response.ok) throw new Error('The practice document is unavailable.'); await openPDF(new File([await response.blob()], 'atelier-practice.pdf', { type: 'application/pdf' })); });
