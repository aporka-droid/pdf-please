import { writeFile } from 'node:fs/promises';
const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>'];
for (let i=0;i<3;i++) {
  const content = `BT /F1 26 Tf 65 740 Td (The Paper Atelier - ${i+1}) Tj 0 -65 Td /F1 14 Tf (${['A little order makes room for good ideas.','Every page has its place.','Good work deserves a thoughtful finish.'][i]}) Tj 0 -45 Td /F1 11 Tf (Try Cover & replace above, or add your own text below.) Tj 0 -30 Td (Surrounding content should remain intact after export.) Tj ET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents ${4+i*2} 0 R >>`);
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
}
objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
let pdf='%PDF-1.4\n'; const offsets=[0];
objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
const start=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
await writeFile(new URL('../public/practice.pdf',import.meta.url),pdf);
