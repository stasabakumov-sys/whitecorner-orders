import {describe,expect,it} from 'vitest';
import {backdropBox,BACKDROP_CARD,BACKDROP_LASER} from './backdrop-box-geometry';
import {exportBoxSvg} from './box-constructor-geometry';
import {prepareBackdropRdRequest,RdSettings} from './box-constructor-rd';

const settings:RdSettings={cut:{speed:120,minPower:70,maxPower:80},fold:{speed:120,minPower:70,maxPower:80},foldMode:'line',dash:null,gap:null,dotTime:null,dotInterval:null,dotLength:null};

describe('Backdrop box layout',()=>{
  it('keeps the pictured 830 × 780 × 80 box whole on one cut for each of bottom and lid',()=>{
    const box=backdropBox(830,780,80);
    expect(box.bottom).toHaveLength(1);expect(box.lid).toHaveLength(1);
    expect(box.bottom[0]).toMatchObject({length:815,width:765,depth:80,sheetWidth:925,sheetHeight:975});
    expect(box.lid[0]).toMatchObject({length:825,width:775,depth:80,sheetWidth:935,sheetHeight:985});
    expect(box.drawing.pieces).toBe(2);
    expect(prepareBackdropRdRequest(box,settings).jobs).toHaveLength(2);
    expect(exportBoxSvg(box.drawing)).toContain('id="Bottom"');
    for(const net of [...box.bottom,...box.lid]){
      const rim=box.rim, end=net.sheetHeight;
      // The end flap includes both outer corner wings from the supplied CDR.
      expect(net.cuts).toContainEqual({from:[rim,end],to:[0,end-1.5]});
      expect(net.cuts).toContainEqual({from:[net.sheetWidth,end-1.5],to:[rim+net.width,end]});
      expect(net.folds).toContainEqual({from:[rim,0],to:[rim,end]});
      expect(net.folds).toContainEqual({from:[rim+net.width,0],to:[rim+net.width,end]});
      expect(net.cuts.at(-1)?.to).toEqual(net.cuts[0].from);
    }
  });

  it('lowers only the border when a whole lid almost exceeds the laser field',()=>{
    const box=backdropBox(930,930,80);
    expect(box.rim).toBe(32.5);
    expect(box.bottom).toHaveLength(1);expect(box.lid).toHaveLength(1);
    expect(box.bottom[0].length).toBe(915);expect(box.lid[0].length).toBe(925);
    expect(box.lid[0].sheetHeight).toBe(BACKDROP_LASER.height);
  });

  it('turns a whole blank when that keeps the main field in a single cut',()=>{
    const box=backdropBox(1150,400,80);
    expect(box.bottom).toHaveLength(1);expect(box.lid).toHaveLength(1);
    expect(box.rim).toBe(12.5);
    expect(box.lid[0]).toMatchObject({length:1145,width:395,sheetWidth:1170,sheetHeight:420});
    expect(prepareBackdropRdRequest(box,settings).jobs).toHaveLength(2);
  });

  it('uses the original unequal main and short panels when the main field cannot fit whole',()=>{
    const box=backdropBox(1500,930,80);
    expect(box.bottom.map(part=>part.panelLength)).toEqual([910,575]);
    expect(box.lid.map(part=>part.panelLength)).toEqual([910,585]);
    expect(box.bottom[0].length).toBe(1485);expect(box.lid[0].length).toBe(1495);
    expect(box.drawing.pieces).toBe(4);
    const jobs=prepareBackdropRdRequest(box,settings).jobs;
    expect(jobs).toHaveLength(4);
    expect(jobs.map(job=>job.filename[0])).toEqual(['A','B','C','D']);
    for(const part of [...box.bottom,...box.lid]){
      expect(part.sheetWidth).toBeLessThanOrEqual(BACKDROP_CARD.width);
      expect(part.sheetHeight).toBeLessThanOrEqual(BACKDROP_LASER.height);
    }
  });

  it('rejects fields that cannot fit in two panels',()=>{
    expect(()=>backdropBox(2000,930,80)).toThrow('two parts');
    expect(()=>backdropBox(930,1175,80)).toThrow('main box field');
  });
});
