export async function validatePDF(file) {
  if (!file || !file.size) throw new Error('Choose a non-empty PDF file.');
  if (file.size > 300 * 1024 * 1024) throw new Error('This file exceeds the 300 MB browser safety limit.');
  const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!header.includes('%PDF-')) throw new Error('This file does not contain a valid PDF header.');
}
export function download(data, name, type = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  if (!blob.size) throw new Error('The exported file is empty.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function parseRanges(input, count) {
  if (!input.trim()) throw new Error('Enter at least one page or range.');
  const result = [];
  for (const part of input.replaceAll('–', '-').split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page ranges such as 1–3, 5, 8–12.');
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > count) throw new Error(`Pages must be between 1 and ${count}, in ascending ranges.`);
    for (let i = start; i <= end; i++) if (!result.includes(i)) result.push(i);
  }
  return result;
}
export const safeName = name => name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim() || 'document.pdf';
