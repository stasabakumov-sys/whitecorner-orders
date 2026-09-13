import {availablePaint,PAINT_OPERATIONS,BACKDROP_PAINT_OPERATIONS,paintOperations,paintLabel,rangeBounds,intervalSeconds,brisbaneDate,localInput,fromLocalInput,csvCell,ShopInterval,projectCommands,ShopData} from './shop-floor.models';
describe('Shop Floor timing rules',()=>{
 it('unlocks Painting in order but permits optional Repaint',()=>{
  expect(availablePaint('Second primer',[])).toBe(false);
  expect(availablePaint('Repaint',[])).toBe(true);
  expect(availablePaint('First sanding',['Painting:First primer'])).toBe(true);
  expect(availablePaint('First primer',['Painting:First primer'])).toBe(false);
  expect(availablePaint('Finish coat',PAINT_OPERATIONS.slice(0,4).map(x=>'Painting:'+x))).toBe(true);
 });
 it('uses Brisbane dates and Monday-based weeks, including year boundaries',()=>{
  expect(brisbaneDate('2026-09-12T15:00:00Z')).toBe('2026-09-13');
  expect(rangeBounds('2026-09-14','week')).toEqual([Date.parse('2026-09-14T00:00:00+10:00'),Date.parse('2026-09-21T00:00:00+10:00')]);
  expect(rangeBounds('2027-01-01','week')[0]).toBe(Date.parse('2026-12-28T00:00:00+10:00'));
  expect(rangeBounds('2026-12-15','month')).toEqual([Date.parse('2026-12-01T00:00:00+10:00'),Date.parse('2027-01-01T00:00:00+10:00')]);
 });
 it('clips overnight work at report boundaries and stops counting a closed interval',()=>{
  const row={started_at:'2026-09-12T13:30:00Z',ended_at:'2026-09-12T14:30:00Z'} as ShopInterval;
  expect(intervalSeconds(row,Date.now(),rangeBounds('2026-09-12','day'))).toBe(1800);
  expect(intervalSeconds(row,Date.now(),rangeBounds('2026-09-13','day'))).toBe(1800);
  expect(intervalSeconds(row,Date.now())).toBe(3600);
 });
 it('round trips mobile edit fields in Brisbane and neutralizes spreadsheet formulas',()=>{
  expect(fromLocalInput(localInput('2026-09-12T08:15:00Z'))).toBe('2026-09-12T08:15:00.000Z');
  expect(csvCell('=1+1')).toBe('"\'=1+1"');
 });
 it('restores a durable offline pause/task sequence without counting waiting products',()=>{
  const base:ShopData={templates:[],units:[],shifts:[],intervals:[]};
  const actions=[['shift-start',{}],['start',{stage:'CNC',operation:'CNC',unitId:'u'}],['pause',{}],['start',{stage:'Other',operation:'Design'}],['shift-end',{}]] as const;
  const queue=actions.map(([action,payload],index)=>({id:String(index),action,payload:{...payload,at:`2026-09-12T08:0${index}:00Z`}}));
  const state=projectCommands(base,queue,'worker');
  expect(base.intervals).toHaveLength(0);
  expect(state.intervals.filter(r=>!r.ended_at)).toHaveLength(0);
  expect(state.intervals.filter(r=>r.stage==='Pause').every(r=>r.unit_id===null)).toBe(true);
  expect(state.intervals.filter(r=>r.stage==='CNC').reduce((s,r)=>s+intervalSeconds(r,Date.now()),0)).toBe(60);
  expect(state.intervals.filter(r=>r.stage==='Pause').reduce((s,r)=>s+intervalSeconds(r,Date.now()),0)).toBe(120);
 });
});

describe('Backdrop painting route',()=>{
 it('uses Primer, Sanding and Finish coat for backdrops and retains the standard route elsewhere',()=>{
  expect(paintOperations('Arch Backdrop')).toEqual(BACKDROP_PAINT_OPERATIONS);
  expect(BACKDROP_PAINT_OPERATIONS.map(op=>paintLabel(op,BACKDROP_PAINT_OPERATIONS))).toEqual(['Primer','Sanding','Finish coat']);
  expect(paintOperations('Cart')).toEqual(PAINT_OPERATIONS);
  expect(availablePaint('Finish coat',['Painting:First primer','Painting:First sanding'],BACKDROP_PAINT_OPERATIONS)).toBe(true);
  expect(availablePaint('Finish coat',['Painting:First primer'],BACKDROP_PAINT_OPERATIONS)).toBe(false);
  expect(availablePaint('Second primer',[],BACKDROP_PAINT_OPERATIONS)).toBe(false);
 });
});
