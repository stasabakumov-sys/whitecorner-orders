import {boxNet, drawingForBox, drawingWithLid, exportBoxSvg} from './box-constructor-geometry';

describe('Box constructor from finished dimensions', () => {
  it('recreates the dimensions measured in d1.ai for a 1215 × 615 × 90 box', () => {
    const net = boxNet(1215, 615, 90);
    expect(net.panelLength).toBe(607.5);
    expect(net.panelLength * 2).toBe(1215);
    expect(net.sheetWidth).toBe(697.5);
    expect(net.sheetHeight).toBe(795);
    expect(net.folds.some(line => line.from[0] === 90 && line.to[0] === 90)).toBe(true);
  });

  it('rejects missing or invalid finished dimensions', () => {
    expect(() => boxNet(NaN, 615, 90)).toThrow();
    expect(() => boxNet(1215, 0, 90)).toThrow();
  });

  it('exports the requested 1515 × 615 × 70 box at physical millimetre scale', () => {
    const net = boxNet(1515, 615, 70);
    expect(net.sheetWidth).toBe(827.5);
    expect(net.sheetHeight).toBe(755);
    const pair = drawingForBox(net, 'pair');
    expect(pair.width).toBe(1665);
    expect(pair.folds[3].from[0]).toBe(pair.width - pair.folds[0].from[0]);
    const svg = new DOMParser().parseFromString(exportBoxSvg(pair), 'image/svg+xml');
    expect(svg.querySelector('parsererror')).toBeNull();
    expect(svg.documentElement.getAttribute('width')).toBe('1665mm');
    expect(svg.documentElement.getAttribute('height')).toBe('755mm');
    expect(svg.querySelector('#Cut')?.getAttribute('stroke')).toBe('#ff0000');
    expect(svg.querySelector('#Fold')?.getAttribute('stroke')).toBe('#45d6ff');
    // The two straight centre edges have a gap, so no cut is duplicated.
    const centres = pair.cuts.filter(line => line.from[0] === line.to[0] && line.from[1] === 0 && line.to[1] === pair.height);
    expect(centres).toHaveLength(2);
    expect(Math.abs(centres[0].from[0] - centres[1].from[0])).toBe(10);
  });

  it('creates the supplied 1225 × 625 × 90 lid from a 1215 × 615 × 90 bottom', () => {
    const drawing = drawingWithLid(boxNet(1215, 615, 90), 'pair');
    const lid = drawing.parts![1];
    expect(lid.net.length).toBe(1225);
    expect(lid.net.width).toBe(625);
    expect(lid.net.depth).toBe(90);
    expect(lid.net.sheetWidth).toBe(702.5);
    expect(lid.net.sheetHeight).toBe(805);
    expect(drawing.pieces).toBe(4);
    // The lid starts below all bottom geometry; no contours overlap.
    expect(lid.y).toBeGreaterThan(drawing.parts![0].drawing.height);
    const svg = new DOMParser().parseFromString(exportBoxSvg(drawing), 'image/svg+xml');
    expect(svg.querySelector('#Bottom-Cut')).not.toBeNull();
    expect(svg.querySelector('#Lid-Fold')).not.toBeNull();
    expect(svg.querySelectorAll('line')).toHaveLength(60);
  });

  it('keeps both bottom and lid when exporting one half of each to cut twice', () => {
    const drawing = drawingWithLid(boxNet(1515, 615, 70), 'single');
    expect(drawing.pieces).toBe(2);
    expect(drawing.parts).toHaveLength(2);
    expect(drawing.width).toBe(832.5);
    expect(drawing.height).toBe(1530);
  });
});
