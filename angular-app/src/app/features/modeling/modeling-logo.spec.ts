import {describe,it,expect} from 'vitest';
import {centreLogo,fitLogo,logoDrawingSvg,logoHeight} from './modeling-logo';
const png='data:image/png;base64,iVBORw0KGgo=';
const logo={png,name:'logo.png',ratio:2,x:0,y:0,width:600};
describe('front logo production placement',()=>{
 it('fits a logo into the moulding opening without changing its aspect ratio',()=>{
  const p={width:1162,height:775,inset:121};const l=fitLogo(p,{...logo,x:1100,y:700,width:1800});
  expect(l.width).toBe(920);expect(logoHeight(l)).toBe(460);expect(l.x).toBe(121);expect(l.y).toBe(194);
 });
 it('uses the full plain panel and centres a tall logo inside the Shaker opening',()=>{
  expect(fitLogo({width:1168,height:645,inset:0},{...logo,width:1168}).width).toBe(1168);
  const p={width:1168,height:645,inset:73};const l=centreLogo(p,{...logo,ratio:.5,width:800});
  expect(l.width).toBe(249.5);expect(l.y).toBe(73);expect(l.x).toBeCloseTo(459.25);
 });
 it('keeps even very tall PNGs inside the available height',()=>{const p={width:1168,height:645,inset:121};const l=fitLogo(p,{...logo,ratio:1/8192});expect(logoHeight(l)).toBeLessThanOrEqual(403);});
 it('refits placement after changing dimensions and retains PNG in a standalone metric drawing',()=>{
  const p={width:1168,height:595,inset:121};const l=fitLogo(p,{...logo,x:600,y:500,width:400});
  expect(l.x+l.width).toBeLessThanOrEqual(p.width-p.inset);expect(l.y+logoHeight(l)).toBeLessThanOrEqual(p.height-p.inset);
  const svg=logoDrawingSvg(p,l);expect(svg).toContain(`href="${png}"`);expect(svg).toContain('width="1348mm"');expect(svg).toContain('FRONT · mm');expect(svg).toContain('>400</text>');expect(svg).toContain('>200</text>');
 });
});
