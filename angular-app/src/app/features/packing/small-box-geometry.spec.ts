import {smallBoxDrawing,smallBoxNet} from './small-box-geometry';
import {exportBoxSvg} from './box-constructor-geometry';
import {prepareSmallRdRequest,RdSettings} from './box-constructor-rd';

describe('Small box reference geometry',()=>{
  const settings:RdSettings={cut:{speed:120,minPower:70,maxPower:80},fold:{speed:120,minPower:70,maxPower:80},foldMode:'line',dash:null,gap:null,dotTime:.1,dotInterval:2,dotLength:1};
  it('matches the AI reference panels, outside sheet and rounded flap',()=>{
    const net=smallBoxNet(270,140,140,40);
    // Independent measurements: AI points / (72 / 25.4), rounded to 0.01 mm.
    expect(net.sheetWidth).toBe(830);expect(net.sheetHeight).toBe(600);
    expect(net.folds[0]).toEqual({from:[280,320],to:[550,320]});
    expect(net.folds[1]).toEqual({from:[280,460],to:[550,460]});
    expect(net.cutPaths).toHaveLength(3);
    expect(net.cutPaths[2]).toContain('L320 0.5');
    expect(net.folds[11]).toEqual({from:[286,41],to:[544,41]});
    expect(net.cuts.flatMap(l=>[l.from,l.to]).every(p=>p[0]>=0&&p[0]<=830&&p[1]>=0&&p[1]<=600)).toBe(true);
    const svg=exportBoxSvg(smallBoxDrawing(net));
    expect(svg).toContain('width="830mm" height="600mm"');
    expect(svg.match(/<path /g)).toHaveLength(3);
    expect(svg).toContain(' C');
  });
  it('resizes length, base width and depth independently',()=>{
    const net=smallBoxNet(300,200,90,30);
    expect(net.sheetWidth).toBe(660);expect(net.sheetHeight).toBe(610);
    expect(net.folds[0]).toEqual({from:[180,320],to:[480,320]});
    expect(net.folds[1]).toEqual({from:[180,520],to:[480,520]});
    expect(net.folds[4]).toEqual({from:[180,230],to:[480,230]});
  });
  it('exports one RD job and preserves gaps between separate cut paths',()=>{
    const net=smallBoxNet(270,140,140,40),request=prepareSmallRdRequest(net,settings);
    expect(request.jobs).toHaveLength(1);
    const job=request.jobs[0];
    expect(job.filename).toBe('small-box-L270-W140-D140-T40.rd');
    expect(job.layers[0].paths).toHaveLength(12);
    expect(job.layers[1].paths).toHaveLength(3);
    expect(job.layers[1].paths[1][0]).toEqual([286,41]);
    expect(job.layers[1].paths[2][0]).toEqual([549.5,40]);
    expect(job.layers[1].paths.flat().some(p=>!p.every(Number.isFinite))).toBe(false);
  });
  it('rejects impossible flap sizes and invalid dimensions',()=>{
    expect(()=>smallBoxNet(60,30,20,40)).toThrow(/Tuck flap/);
    expect(()=>smallBoxNet(270,0,140,40)).toThrow(/positive/);
    expect(()=>smallBoxNet(270,140,140,.5)).toThrow(/greater than/);
    expect(()=>prepareSmallRdRequest(smallBoxNet(20000,140,140,40),settings)).toThrow(/10000/);
  });
});
