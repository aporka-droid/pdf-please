# PDF Please verification record

Environment: installed Apryse WebViewer 12.2.1; Windows; local Vite development server and built static preview; automated browser using Chromium. Synthetic documents only. Evaluation marks were present.

## Passed

### Core implementation checks

- `npm run build`: successful; complete SDK assets copied into `dist/lib/webviewer`.
- `npm test`: 4 passed, 0 failed (range parsing/order/deduplication, invalid ranges, upload header checks, filename sanitation).
- `.env.local` is ignored by Git. Its contents were neither printed nor committed.
- No second project, backend, deployment, or extra dependencies created.

### SDK browser suite — 11 passed, 0 failed

1. SDK initialization.
2. Input validation and range errors.
3. Three-page fixture renders/extracts selectable original text.
4. Manual content-edit export reopened; replacement text extracted; original sentence absent; surrounding text and three pages preserved.
5. Reorder page 3 to front, rotate, delete, serialize, reopen: order, count and rotation correct.
6. Merge pages from two PDF objects, serialize and reopen: five pages in expected order.
7. Extract pages 2–3, reopen: two pages in expected order.
8. Duplicate a page and insert blank page, serialize and reopen: correct count/content.
9. Highlight, comment and visual signature stamp survive serialization and re-extraction as PDF annotations.
10. PNG and JPEG raster output decode with expected dimensions.
11. The same image-to-PDF function used by the UI creates a one-page PDF that reopens and renders.

### Manual browser checks

- Welcome and production preview load successfully.
- Practice PDF renders and content editing starts in the built production preview.
- Original sentence changed from “A little order makes room for good ideas.” to “Thoughtful edits make room for better ideas.” with Apryse's content editor.
- Downloaded `atelier-practice-edited.pdf`, reopened it, visually inspected and entered its replacement text for editing again. The longer sentence wrapped onto two lines; neighboring text remained visible.
- Independently extracted the replacement from the PDF via `loadPageText` in the SDK suite.
- Organizer's Duplicate action changed the actual active PDF from three to four pages.
- Images-to-PDF UI accepted a synthetic PNG and generated an output.
- All-pages PNG conversion generated a downloaded ZIP with four valid PNGs, each 1190 × 1684 pixels; ZIP signatures and dimensions checked from the actual file.
- Signature dialog exposed Draw, Type and Upload; a typed “Atelier QA” signature was created and placed on a PDF page.
- Final production preview: Pages opens and closes the thumbnail panel; clicking page 2 changes the rendered document and page counter to page 2. No browser console errors were recorded during this check.
- Corrected the WebViewer host's focus scrolling so its top toolbar stays fully visible. Final editor screenshot: `docs/editor.jpg`.
- A 390 × 844 browser viewport was inspected for the welcome screen and loaded editor; physical touch testing remains outstanding.

## Network observation

The SDK test page recorded resource origins `http://127.0.0.1:5173` and `https://pws-collect.pdftron.com`. App typography additionally uses Google Fonts. This is a limited origin observation, not a full traffic/payload or privacy audit. No application analytics or document-upload backend was added.

## Not claimed as passed

- Clipboard-copy verification: browser automation returned no clipboard text. Selectability, original-content mutation, absence of the original sentence, and persistence were verified through SDK extraction and re-editing instead.
- Full physical-mobile/touch, Safari and Firefox testing.
- Full password-protected, corrupt, scanned, huge-file and unusual-font matrix.
- Every formatting variant, existing-image replacement, drawn/uploaded signature input and all annotation shapes independently exported and reopened.
- A real hosted Vercel deployment and production license/allowed-domain verification.
- Complete SDK network-payload audit.

Some browser file chooser/download operations took unexpectedly long in the automation environment. Their completion was checked, but this is not a reliable measure of the app's processing performance.
