# PDF Please

A browser PDF workshop with the Paper Atelier interface. Built with vanilla JavaScript, Vite, PDF.js, pdf-lib, and JSZip. **No production key is required. The app adds no watermarks.**

## Run

From this project directory:

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

The preparation script copies PDF.js fonts, character maps and image decoders into public/lib/pdfjs. Vite bundles the PDF worker locally. Generated assets and dist are ignored by Git. The old Apryse dependency and generated assets have been removed. Any existing ignored .env.local is left untouched and is no longer used by the app.

## Editing

- **Add text:** select the tool, click the page, and type in the Text panel. Choose Helvetica, Times or Courier, font size and color. Use explicit line breaks for multiple lines.
- **Cover & replace:** drag over the area to hide. A cover and a separate text addition are created. Type the replacement and adjust its position, size and color.
- **Cover area:** drag to place a rectangle; change its color and dimensions in the panel.
- **Move and delete:** select an addition, drag it, change X/Y, or use arrow keys. Shift moves by 10 points. Delete removes the selected addition. Undo/redo applies to additions.
- **Images:** upload PNG, JPEG or WebP, then position and resize it.
- **Annotate:** draw, mark a highlight area, add a rectangle or text note. These are visual page additions, not threaded PDF comments or text-linked highlights.
- **Sign:** type, draw, or upload a signature image. These are visual marks, not certificate signatures.

Covering is **not redaction**: the underlying text remains searchable and extractable. Existing paragraphs are not edited, reflowed, or removed. This simplified approach was chosen instead of general original-text editing.

Added text supports the standard fonts' Latin character sets. Unsupported characters produce an explicit export error rather than silently disappearing. Font substitution, OCR, password-protected PDFs and complex-script text entry are not supported. Use original clean PDFs: marks already embedded in an uploaded PDF are preserved.

Additions remain individually editable during the session. Export flattens them into PDF page content; reopening an export does not reconstruct editable additions. Page organization commits additions and clears their undo history. Text outside page boundaries is clipped in the preview and export. Use shorter text, smaller size or explicit line breaks when needed.

## Other tools

Real page thumbnails, reordering, rotation, deletion, duplication, blank-page insertion, extraction, multi-PDF merge, range/fixed-size/per-page splitting and ZIP downloads are retained. Images convert to A4 or Letter PDF pages with orientation and margin controls. PDF pages export to PNG/JPEG at 72/144/216 DPI, including additions. Multiple image outputs are zipped.

Uploads are held in browser memory; originals are never overwritten. PDF inputs are limited to 300 MB; images to 40 MB and 40 megapixels. Large operations still depend on available memory. Rendering uses local PDF.js resources. The app has no accounts, upload backend or document storage. Interface typography still requests Google Fonts.

## Structure and verification

- src/core/pdf-document.js: PDF page operations, overlay serialization and document lifecycle.
- src/core/overlay-editor.js: page viewer, pointer tools and properties.
- src/core/viewer.js: PDF.js initialization and interface used by existing workflows.
- src/tools/: organization, merge, split and conversion.

Run npm test for upload/range validation. With the dev server running, open /tests/qa.html and press Run integration checks for saved-output tests using synthetic PDFs. Tests are excluded from the production build. See [QA report](docs/QA.md). Earlier Apryse results are historical only: [old report](docs/QA-apryse-legacy.md).

Static hosting configuration remains in vercel.json. Build with npm run build and serve dist including lib/pdfjs and the bundled worker. No environment keys are needed. This change has not been publicly deployed.

References: [PDF.js examples](https://mozilla.github.io/pdf.js/examples/) and [pdf-lib documentation](https://pdf-lib.js.org/). PDF.js is Apache-2.0; pdf-lib and JSZip are MIT (JSZip also offers GPLv3). Retain the included third-party notices when distributing the build.
