# Watermark-free editor verification — 2026-11-08

This report supersedes the old Apryse build. Current implementation uses PDF.js 6.4.299 and pdf-lib 1.17.1. Tests use synthetic documents only.

## Checks

- Four range, filename and upload-validation tests pass.
- Production build succeeds. PDF.js worker and rendering assets are bundled locally.
- Browser integration suite: **11 passed, 0 failed**. Real saved PDFs are reopened and rendered using PDF.js.
- Covered: original rendering; cover and text persistence; original text retention; undo/redo and repeated exports; multiline text and unsupported-character errors; all four rotations with nonzero crop origins; page reorder/rotate/delete/duplicate/blank; merge/split; image signature, drawing and highlight pixels; image-to-PDF and PNG/JPEG output; viewer save path; renderer cleanup.
- Fixed a stale page-list issue after deletion and updated resource cleanup for PDF.js 6.
- Production UI manually checked: practice document opens without a watermark; cover-and-replace hides the selected line; text and size controls work; thumbnails navigate to page 2 and back; export reaches the generated state; browser error log is empty.
- Browser download delivery was not independently confirmed on disk. Saved byte generation and reopen verification passed through the integration suite.
- Original placement bug caused focus to scroll the canvas while starting a drag; corrected with focus scroll prevention and verified in the production build.

## Scope and limitations

Covers intentionally retain the original searchable text. Text addition is limited to standard Latin font character sets; unsupported characters are rejected on export. Changes are flattened in exports and on page organization. Password-protected PDFs, OCR, complex-script entry, editable comment threads and general original-text editing are not supported.

No hosted deployment, exhaustive PDF compatibility matrix, or physical mobile testing is claimed. Existing watermarks in input documents are not removed. Previous Apryse QA results and screenshots are historical, not evidence for this build.
