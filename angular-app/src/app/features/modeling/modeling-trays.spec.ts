import {it,expect} from 'vitest';
import * as THREE from 'three';
import {CHARCUTERIE_CUTOUTS,createGastronormTrays,gastronormTrayGeometry} from './modeling-trays';
it('creates thirteen open trays with confirmed outside dimensions and depth',()=>{
  for(const [w,d] of [[325,530],[176,162]]){const g=gastronormTrayGeometry(w,d),size=g.boundingBox!.getSize(new THREE.Vector3());expect(size.x).toBeCloseTo(w/1000);expect(size.z).toBeCloseTo(d/1000);expect(size.y).toBeCloseTo(.066);expect(g.boundingBox!.min.y).toBeCloseTo(-.065);}
  const trays=createGastronormTrays(850,null);expect(trays.children.length).toBe(13);expect(trays.children.filter(t=>t.name==='GN 1/6').length).toBe(12);
  for(const [i,tray] of trays.children.entries()){expect(tray.position.x).toBeCloseTo((CHARCUTERIE_CUTOUTS[i].x+CHARCUTERIE_CUTOUTS[i].width/2)/1000);expect(tray.position.y).toBe(.85);}
});
