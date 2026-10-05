import {jsPDF} from 'jspdf';
import {formatModelingPrice, type ConfigurationPricing} from './modeling-pricing';
export interface ConfigurationDocument {
  product:string; material:string; code:string; produced:string;
  pricing?:ConfigurationPricing; logo?:string; front:string; rear:string; fields:{label:string;value:string}[];
}
export function createConfigurationPdf(configuration:ConfigurationDocument):jsPDF {
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  pdf.setProperties({title:configuration.product+' - Configuration',author:'White Corner',subject:'Selected product configuration'});
  pdf.setTextColor(38,50,65);pdf.setFont('helvetica','normal');pdf.setFontSize(12);
  pdf.text(pdf.splitTextToSize(configuration.product.toUpperCase(),145),14,16,{lineHeightFactor:1.15});
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
  if(configuration.pricing){
    const prices=configuration.pricing;pdf.addPage();
    pdf.setFont('helvetica','normal');pdf.setFontSize(12);pdf.setTextColor(38,50,65);
    pdf.text(pdf.splitTextToSize(configuration.product,145),14,16,{lineHeightFactor:1.15});
    if(configuration.logo)pdf.addImage(configuration.logo,'PNG',169,9,27,27,'white-corner-logo','FAST');
    pdf.setFontSize(11);pdf.text('INDICATIVE PRICING',14,48);
    let priceY=60;
    for(const line of prices.lines){
      const label=pdf.splitTextToSize(line.label,130) as string[];
      pdf.setFontSize(10);pdf.text(label,14,priceY);pdf.text(formatModelingPrice(line.amount),196,priceY,{align:'right'});
      priceY+=Math.max(12,label.length*5+5);pdf.setDrawColor(226,228,230);pdf.line(14,priceY-6,196,priceY-6);
    }
    pdf.setFont('helvetica','bold');pdf.text('Catalog subtotal - AUD incl. GST',14,priceY+5);pdf.text(formatModelingPrice(prices.subtotal),196,priceY+5,{align:'right'});
    pdf.setFont('helvetica','normal');pdf.setFontSize(9);
    pdf.text('Unpriced options require a quote. Not a final quotation.',14,priceY+18);
    pdf.setFontSize(8);pdf.text('Hub catalogue published '+new Date(prices.publishedAt).toISOString().slice(0,10),14,priceY+26);
  }
  const pages=pdf.getNumberOfPages();
  for(let page=1;page<=pages;page++){
  pdf.setPage(page);pdf.setFont('helvetica','normal');
  pdf.setFontSize(8);pdf.setTextColor(104,112,120);pdf.text('Produced '+configuration.produced+'. Configuration snapshot.',14,279);
  pdf.setFontSize(7);pdf.text('White Corner Hub',14,286);pdf.text(`${page} / ${pages}`,196,286,{align:'right'});
  }
  return pdf;
}
