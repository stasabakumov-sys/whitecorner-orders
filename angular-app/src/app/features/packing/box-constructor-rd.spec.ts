import {boxNet} from './box-constructor-geometry';
import {RdSettings, prepareRdRequest, rdSettingsError} from './box-constructor-rd';

const settings = (): RdSettings => ({cut: {speed: 120, minPower: 70, maxPower: 80}, fold: {speed: 120, minPower: 70, maxPower: 80}, foldMode: 'dot', dotTime: 0.1, dotInterval: 2, dotLength: 1, dash: null, gap: null});
describe('RD box jobs', () => {
  it('produces exactly two single-half jobs with the correct dimensions, closed outline and fold-first order', () => {
    const jobs = prepareRdRequest(boxNet(715, 415, 49.3), settings()).jobs;
    expect(jobs.map(job => job.filename)).toEqual([expect.stringMatching(/^B[A-Z0-9]{5}\.rd$/i), expect.stringMatching(/^L[A-Z0-9]{5}\.rd$/i)]);
    expect(prepareRdRequest(boxNet(715, 415, 49.3), settings()).jobs.map(job => job.filename)).toEqual(jobs.map(job => job.filename));
    for (const [index, job] of jobs.entries()) {
      expect(job.layers[0].color).toEqual([69, 214, 255]);
      expect(job.layers[1].color).toEqual([255, 0, 0]);
      expect(job.layers[1].paths[0][0]).toEqual(job.layers[1].paths[0].at(-1));
      const outline = job.layers[1].paths[0];
      expect(Math.max(...outline.map(point => point[0]))).toBeCloseTo(index ? 411.8 : 406.8);
      expect(Math.max(...outline.map(point => point[1]))).toBeCloseTo(index ? 523.6 : 513.6);
      expect(job.layers.every(layer => layer.speed === 120 && layer.minPower === 70 && layer.maxPower === 80)).toBe(true);
    }
  });
  it('uses distinct six-character names when dimensions or RD settings change', () => {
    const original = prepareRdRequest(boxNet(715, 415, 49.3), settings()).jobs[0].filename;
    const resized = prepareRdRequest(boxNet(716, 415, 49.3), settings()).jobs[0].filename;
    const changed = settings(); changed.cut.speed = 121;
    const retuned = prepareRdRequest(boxNet(715, 415, 49.3), changed).jobs[0].filename;
    expect(new Set([original, resized, retuned]).size).toBe(3);
  });
  it('uses moving Laser Dot length 1 and start-to-start interval 2 without connecting the gaps', () => {
    const paths = prepareRdRequest(boxNet(715, 415, 49.3), settings()).jobs[0].layers[0].paths;
    expect(paths[0]).toEqual([[49.3, 0], [49.3, 1]]);
    expect(paths[1]).toEqual([[49.3, 2], [49.3, 3]]);
    expect(paths.every(path => Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) <= 1.000001)).toBe(true);
    expect(paths.some(path => path[1][0] > 406.8 || path[1][1] > 513.6)).toBe(false);
  });
  it('rejects missing values, inverted powers, invalid intervals and unsupported stationary dots', () => {
    for (const mutate of [
      (s: RdSettings) => s.cut.speed = null,
      (s: RdSettings) => s.fold.minPower = 81,
      (s: RdSettings) => s.dotInterval = 1,
      (s: RdSettings) => s.dotLength = 0,
      (s: RdSettings) => s.dotTime = NaN,
    ]) {const value = settings(); mutate(value); expect(rdSettingsError(value)).not.toBe(''); expect(() => prepareRdRequest(boxNet(715, 415, 49.3), value)).toThrow();}
  });
});
