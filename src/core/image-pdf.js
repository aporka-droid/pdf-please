import { PDFDocument } from 'pdf-lib';
export async function createImagePDF(_engine, images, {width,height,margin}){
  if(!images.length)throw new Error('Add at least one image.');
  if(!Number.isFinite(margin)||margin<0||margin>144)throw new Error('Margins must be between 0 and 144 points.');
  const pdf=await PDFDocument.create();
  for(const item of images){
    const bitmap=await createImageBitmap(item.file);
    try{
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));if(!blob)throw new Error('Unable to decode image.');
      const image=await pdf.embedJpg(await blob.arrayBuffer()),scale=Math.min((width-2*margin)/image.width,(height-2*margin)/image.height),w=image.width*scale,h=image.height*scale;
      pdf.addPage([width,height]).drawImage(image,{x:(width-w)/2,y:(height-h)/2,width:w,height:h});canvas.width=canvas.height=0;
    }finally{bitmap.close();}
  }
  return pdf.save();
}
