import {jsPDF} from 'jspdf';
export interface ConfigurationDocument {
  product:string; material:string; code:string; produced:string;
  logo?:string; front:string; rear:string; fields:{label:string;value:string}[];
}
export function createConfigurationPdf(configuration:ConfigurationDocument):jsPDF {
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  pdf.setProperties({title:configuration.product+' - Configuration',author:'White Corner',subject:'Selected product configuration'});
  pdf.setTextColor(38,50,65);pdf.setFont('helvetica','normal');pdf.setFontSize(16);
  pdf.text(configuration.product.toUpperCase(),14,20,{maxWidth:156});
  pdf.setFontSize(8);pdf.text(configuration.material.toUpperCase(),14,29);pdf.setFontSize(7);pdf.text(configuration.code,14,34);
  if(configuration.logo)pdf.addImage(configuration.logo,'PNG',169,9,27,27,'white-corner-logo','FAST');
  else {pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.text('WHITE CORNER',196,20,{align:'right'});}
  pdf.setDrawColor(220,223,226);pdf.line(14,38,196,38);
  for(const [index,source] of [configuration.front,configuration.rear].entries()) {
    const x=14+index*94;pdf.setFillColor(236,234,232);pdf.rect(x,44,88,72,'F');
    pdf.addImage(source,'PNG',x,47,88,66,undefined,'FAST');
    pdf.setFont('helvetica','normal');pdf.setFontSize(7);pdf.text(index?'REAR':'FRONT',x+44,122,{align:'center'});
  }
  pdf.setFont('helvetica','bold');pdf.setFontSize(8);pdf.text('SPECIFICATION',14,134);
  let y=140;
  for(let row=0;row<configuration.fields.length;row+=3) {
    const cells=configuration.fields.slice(row,row+3);
    pdf.setFontSize(9);
    const wrapped=cells.map(cell=>pdf.splitTextToSize(cell.value,55) as string[]);
    const height=Math.max(22,...wrapped.map(lines=>12+lines.length*4));
    cells.forEach((cell,index)=>{
      const x=14+index*62;pdf.setFont('helvetica','normal');pdf.setFontSize(7);pdf.setTextColor(104,112,120);pdf.text(cell.label.toUpperCase(),x,y+5);
      pdf.setFontSize(9);pdf.setTextColor(38,50,65);pdf.text(wrapped[index],x,y+11);
      pdf.setDrawColor(226,228,230);pdf.line(x,y+height,x+57,y+height);
    });y+=height+2;
  }
  pdf.setFontSize(8);pdf.setTextColor(104,112,120);pdf.text('Produced '+configuration.produced+'. Configuration snapshot.',14,279);
  pdf.setFontSize(7);pdf.text('White Corner Hub',14,286);pdf.text('1 / 1',196,286,{align:'right'});
  return pdf;
}
