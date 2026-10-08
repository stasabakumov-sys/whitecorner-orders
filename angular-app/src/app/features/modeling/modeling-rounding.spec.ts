import { describe, it, expect } from 'vitest';
import { createRoundedPart, keepTrimJointSquare, keepPartJointsSquare, matingPartJoints, RoundingProfile } from './modeling-rounding';
import * as THREE from 'three';
import { resizePlywoodPosition, resizeRoofCartPosition } from './modeling-geometry';

describe('Wooden part rounding', () => {
  it('keeps equal flat normals on narrow shelves and large tops while retaining smooth bevels',()=>{
    for(const width of [.184,1.162])for(const radius of [1,1.5,2,2.5,3]){
      const geometry=createRoundedPart({axis:'y',origin:.884,thickness:.016,outline:[[0,0],[width,0],[width,.568],[0,.568]],holes:[]},radius);
      const normals=geometry.getAttribute('normal');
      for(const group of geometry.groups.filter(group=>group.materialIndex===0))for(let i=group.start;i<group.start+group.count;i++){
        expect(normals.getX(i)).toBeCloseTo(0,7);expect(Math.abs(normals.getY(i))).toBeCloseTo(1,7);expect(normals.getZ(i)).toBeCloseTo(0,7);
      }
      expect(Array.from({length:normals.count},(_,i)=>Math.abs(normals.getY(i))).some(y=>y>.05&&y<.95)).toBe(true);
      geometry.dispose();
    }
  });
  it('keeps the two 12 mm Shaker sheets glued together and retains a 12 mm recess', () => {
    const back: RoundingProfile = { axis: 'z', origin: .56, thickness: .012,
      outline: [[.016, .239], [1.184, .239], [1.184, .884], [.016, .884]], holes: [] };
    const frame: RoundingProfile = { ...back, origin: .572,
      holes: [[[.086, .309], [.086, .814], [1.114, .814], [1.114, .309]]] };
    const joints = matingPartJoints([
      { name: 'Front_part1', bounds: new THREE.Box3(new THREE.Vector3(.016, .239, .56), new THREE.Vector3(1.184, .884, .572)) },
      { name: 'Front_part2', bounds: new THREE.Box3(new THREE.Vector3(.016, .239, .572), new THREE.Vector3(1.184, .884, .584)) },
    ]);
    for (const radius of [1, 1.5, 2, 2.5, 3]) {
      const geometries = [back, frame].map(profile => createRoundedPart(profile, radius));
      geometries.forEach((geometry, index) => {
        keepPartJointsSquare(geometry, joints.get(`Front_part${index + 1}`)!, radius);
        const positions = geometry.getAttribute('position');
        let seam = 0;
        for (let i = 0; i < positions.count; i++) if (Math.abs(positions.getZ(i) - .572) < radius / 1000 * 2) {
          expect(positions.getZ(i)).toBeCloseTo(.572, 6); seam++;
        }
        expect(seam).toBeGreaterThan(0); geometry.computeBoundingBox();
      });
      expect(geometries[1].boundingBox!.max.z - geometries[0].boundingBox!.max.z).toBeCloseTo(.012, 6);
      geometries.forEach(geometry => geometry.dispose());
    }
  });
  it('keeps a shared roof seam square at every radius while retaining the free top bevel', () => {
    const lid: RoundingProfile = { axis: 'y', origin: 1.918, thickness: .012,
      outline: [[0, 0], [1.2, 0], [1.2, .6], [0, .6]], holes: [] };
    const joints = matingPartJoints([
      { name: 'Roof 1', bounds: new THREE.Box3(new THREE.Vector3(0, 1.918, 0), new THREE.Vector3(1.2, 1.93, .6)) },
      { name: 'Roof 2', bounds: new THREE.Box3(new THREE.Vector3(0, 1.81, .588), new THREE.Vector3(1.2, 1.9180002, .6)) },
      { name: 'Legs 1', bounds: new THREE.Box3(new THREE.Vector3(0, 1.81, 0), new THREE.Vector3(.1, 1.918, .1)) },
    ]);
    expect(joints.get('Roof 1')).toHaveLength(1);
    expect(joints.has('Legs 1')).toBe(false);
    for (const radius of [1, 1.5, 2, 2.5, 3]) {
      const geometry = createRoundedPart(lid, radius);
      keepPartJointsSquare(geometry, joints.get('Roof 1')!, radius);
      const position = geometry.getAttribute('position');
      let seam = 0, freeBevel = 0;
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i), z = position.getZ(i);
        if (z > .588 && y < 1.918 + radius / 1000 * 2) {
          expect(y).toBeCloseTo(1.918, 6); seam++;
        }
        if (z > .597 && y > 1.925 && y < 1.92999) freeBevel++;
      }
      expect(seam).toBeGreaterThan(0);
      expect(freeBevel).toBeGreaterThan(0);
      geometry.dispose();
    }
  });
  const profile: RoundingProfile = { axis: 'y', origin: 0.885, thickness: 0.015,
    outline: [[0, 0], [1.2, 0], [1.2, 0.6], [0, 0.6]], holes: [] };
  it('retains the panel envelope at each supported radius', () => {
    for (const radius of [1, 1.5, 2, 2.5, 3]) {
      const geometry = createRoundedPart(profile, radius);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      expect(box.min.x).toBeCloseTo(0, 5);
      expect(box.max.x).toBeCloseTo(1.2, 5);
      expect(box.min.y).toBeCloseTo(0.885, 5);
      expect(box.max.y).toBeCloseTo(0.9, 5);
      expect(box.max.z).toBeCloseTo(0.6, 5);
      expect(geometry.groups.some(group => group.materialIndex === 1)).toBe(true);
      geometry.dispose();
    }
  });
  it('preserves a three millimetre upright corner at all heights', () => {
    for (const height of [850, 900, 950, 1000]) {
      const bottom = resizePlywoodPosition('Front part1', 0, 0.11, 0, 1500, height);
      const bottomArc = resizePlywoodPosition('Front part1', 0, 0.113, 0, 1500, height);
      const top = resizePlywoodPosition('Front part1', 0, 0.885, 0, 1500, height);
      const topArc = resizePlywoodPosition('Front part1', 0, 0.882, 0, 1500, height);
      expect(bottomArc[1] - bottom[1]).toBeCloseTo(0.003, 8);
      expect(top[1] - topArc[1]).toBeCloseTo(0.003, 8);
    }
  });
  it('keeps the inner pine border flush against its panel', () => {
    const trim = { ...profile, thickness: 0.042, holes: [[[0.019, 0.019], [1.181, 0.019], [1.181, 0.581], [0.019, 0.581]]] };
    const geometry = createRoundedPart(trim, 3);
    keepTrimJointSquare(geometry, trim, 3);
    const positions = geometry.getAttribute('position');
    let jointVertices = 0;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      if (Math.abs(x - 0.019) < 0.006 && z >= 0.0189 && z <= 0.5811) {
        expect(x).toBeCloseTo(0.019, 6); jointVertices++;
      }
    }
    expect(jointVertices).toBeGreaterThan(0);
    geometry.dispose();
  });
});

it('closes MDF front-to-side mating faces for Shaker and 16 mm Plain without moving the outside face',()=>{
 const front:RoundingProfile={axis:'z',origin:.5600004,thickness:.012,outline:[[.016,.239],[1.184,.239],[1.184,.884],[.016,.884]],holes:[]};
 const side:RoundingProfile={axis:'x',origin:.016,thickness:.012,outline:[[.0160004,.239],[.5600004,.239],[.5600004,.884],[.0160004,.884]],holes:[]};
 const joints=matingPartJoints([
  {name:'Front_part1',bounds:new THREE.Box3(new THREE.Vector3(.016,.239,.5600004),new THREE.Vector3(1.184,.884,.5720004))},
  {name:'Right_side1',bounds:new THREE.Box3(new THREE.Vector3(.016,.239,.0160004),new THREE.Vector3(.028,.884,.5600004))},
  {name:'Legs 1',bounds:new THREE.Box3(new THREE.Vector3(.016,.089,.0160004),new THREE.Vector3(.028,.239,.5600004))},
 ]);
 expect(joints.get('Front_part1')).toHaveLength(1);expect(joints.has('Legs 1')).toBe(false);
 for(const radius of [1,1.5,2,2.5,3])for(const plain of [false,true]){
  const geometries=[front,side].map(p=>createRoundedPart(p,radius));
  geometries.forEach((g,index)=>{
   const name=index?'Right_side1':'Front_part1';keepPartJointsSquare(g,joints.get(name)!,radius);
   const p=g.getAttribute('position');let seam=0,outerBevel=0;
   for(let i=0;i<p.count;i++)if(p.getX(i)<=.028&&Math.abs(p.getZ(i)-.5600004)<radius/1000*2){
    const z=resizeRoofCartPosition(name,p.getX(i),p.getY(i),p.getZ(i),1200,900,plain)[2];
    if(index&&p.getX(i)<.016+radius/1000+1e-6&&Math.abs(z-(plain?.5680004:.5600004))>1e-6){outerBevel++;continue;}
    expect(z).toBeCloseTo(plain?.5680004:.5600004,6);seam++;
   }
   expect(seam).toBeGreaterThan(0);if(index)expect(outerBevel).toBeGreaterThan(0);g.dispose();
  });
 }
});

it('keeps top and bottom border joints square against their panels',()=>{
 const joints=matingPartJoints([
  {name:'Top_part1',bounds:new THREE.Box3(new THREE.Vector3(0,.834,0),new THREE.Vector3(1.5,.85,.6))},
  {name:'Top_part2',bounds:new THREE.Box3(new THREE.Vector3(0,.814,0),new THREE.Vector3(1.5,.834,.02))},
  {name:'Buttom_part1',bounds:new THREE.Box3(new THREE.Vector3(0,.095,0),new THREE.Vector3(1.5,.111,.6))},
  {name:'Buttom_part2',bounds:new THREE.Box3(new THREE.Vector3(0,.111,0),new THREE.Vector3(1.5,.131,.02))},
 ]);
 expect(joints.get('Top_part2')?.[0].plane).toBeCloseTo(.834);expect(joints.get('Buttom_part2')?.[0].plane).toBeCloseTo(.111);
});


it('keeps diagonal front frame mitres square',()=>{
 const profile=(outline:number[][])=>({axis:'z' as const,origin:.568,thickness:.012,outline,holes:[]});
 const a=profile([[.02,.834],[.09,.764],[1.41,.764],[1.48,.834]]),b=profile([[.02,.111],[.09,.181],[.09,.764],[.02,.834]]);
 const bounds=new THREE.Box3(new THREE.Vector3(.02,.111,.568),new THREE.Vector3(1.48,.834,.58));const joints=matingPartJoints([{name:'Front part2',bounds,profile:a},{name:'Front part3',bounds,profile:b}]);
 const joint=joints.get('Front part2')![0];expect(joint.normal).toBeDefined();const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([.056,.800,.57,.055,.799,.57,.055,.799,.58],3));geometry.computeVertexNormals();keepPartJointsSquare(geometry,[joint],1.5);
 const point=new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('position'),0);expect(point.dot(new THREE.Vector3(...joint.normal!))).toBeCloseTo(joint.plane,6);
});


it.each([1,1.5,2,2.5,3])('removes the face bevel along a complete front mitre at %s mm',radius=>{
 const top:RoundingProfile={axis:'z',origin:.568,thickness:.012,outline:[[.02,.834],[.09,.764],[1.41,.764],[1.48,.834]],holes:[]};
 const left:RoundingProfile={...top,outline:[[.02,.111],[.09,.181],[.09,.764],[.02,.834]]};
 const parts=[top,left].map((profile,index)=>{const geometry=createRoundedPart(profile,radius);geometry.computeBoundingBox();return {name:'Front part'+(index+2),profile,geometry,bounds:geometry.boundingBox!.clone()};});
 const joints=matingPartJoints(parts);
 for(const part of parts){keepPartJointsSquare(part.geometry,joints.get(part.name)!,radius);const p=part.geometry.getAttribute('position');let seam=0,freeBevel=0;const joint=joints.get(part.name)!.find(j=>j.cap)!;const n=new THREE.Vector3(...joint.normal!);
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i);if(Math.abs(v.dot(n)-joint.plane)<1e-6&&v.y>.763&&v.y<.835){expect(Math.min(Math.abs(v.z-.568),Math.abs(v.z-.58))).toBeLessThan(1e-6);seam++;}else if(v.z>.56801&&v.z<.57999)freeBevel++;}
  expect(seam).toBeGreaterThan(0);expect(freeBevel).toBeGreaterThan(0);part.geometry.dispose();
 }
});


it.each([1,1.5,3])('removes the outline bevel between bonded front layers at %s mm',radius=>{
 const base:RoundingProfile={axis:'z',origin:.556,thickness:.012,outline:[[.02,.111],[1.48,.111],[1.48,.834],[.02,.834]],holes:[]};
 const frame:RoundingProfile={axis:'z',origin:.568,thickness:.012,outline:[[.02,.834],[.09,.764],[1.41,.764],[1.48,.834]],holes:[]};
 const parts=[base,frame].map((profile,i)=>{const geometry=createRoundedPart(profile,radius);geometry.computeBoundingBox();return {name:'Front part'+(i+1),profile,geometry,bounds:geometry.boundingBox!.clone()};});
 const joints=matingPartJoints(parts);
 for(const part of parts){const layerJoints=joints.get(part.name)!;expect(layerJoints.some(j=>j.squareCapOutline)).toBe(true);keepPartJointsSquare(part.geometry,layerJoints,radius);const p=part.geometry.getAttribute('position');let seam=0;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)-.568)<1e-6&&p.getY(i)>.834-radius/1000*2-1e-6){expect(p.getY(i)).toBeCloseTo(.834,6);seam++;}
  expect(seam).toBeGreaterThan(0);part.geometry.dispose();
 }
});


it.each(['left','right'])('keeps the %s side-shelf top and trim square at their joints',side=>{
 const x=side==='left'?-.2:1.5;
 const profile=(x0:number,x1:number,z0:number,z1:number,y:number):RoundingProfile=>({axis:'y',origin:y,thickness:.016,outline:[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],holes:[]});
 const parts=[profile(x,x+.2,0,.6,.834),profile(x,x+.02,0,.6,.818),profile(x+.02,x+.2,0,.02,.818)].map((profile,i)=>{const geometry=createRoundedPart(profile,1.5);geometry.computeBoundingBox();return {name:'Side shelf '+side+' '+(i+1),profile,geometry,bounds:geometry.boundingBox!.clone()};});
 const joints=matingPartJoints(parts);expect(joints.get(parts[1].name)?.some(j=>j.cap)).toBe(true);
 for(const part of parts){keepPartJointsSquare(part.geometry,joints.get(part.name)!,1.5);const p=part.geometry.getAttribute('position');let seam=0;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-.834)<1e-6&&p.getX(i)<x+.003){expect(p.getX(i)).toBeCloseTo(x,6);seam++;}
  if(part!==parts[2])expect(seam).toBeGreaterThan(0);part.geometry.dispose();
 }
});


it.each([1,1.5,3])('closes the outline endpoints of tabletop trim seams at %s mm',radius=>{
 const profile=(x0:number,x1:number,z0:number,z1:number):RoundingProfile=>({axis:'y',origin:.818,thickness:.016,outline:[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],holes:[]});
 const parts=[profile(0,.02,0,.6),profile(.02,1.48,.58,.6)].map((profile,i)=>{const geometry=createRoundedPart(profile,radius);geometry.computeBoundingBox();return {name:'Top part'+(i+3),profile,geometry,bounds:geometry.boundingBox!.clone()};});
 const joints=matingPartJoints(parts);
 for(const part of parts){keepPartJointsSquare(part.geometry,joints.get(part.name)!,radius);const p=part.geometry.getAttribute('position');let corners=0;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)-.02)<1e-6&&p.getZ(i)>.6-radius/1000*2-1e-6){expect(p.getZ(i)).toBeCloseTo(.6,6);expect(Math.min(Math.abs(p.getY(i)-.818),Math.abs(p.getY(i)-.834))).toBeLessThan(1e-6);corners++;}
  expect(corners).toBeGreaterThan(0);part.geometry.dispose();
 }
});

it.each(['left','right'])('keeps the %s side-shelf join to the main tabletop square',side=>{
 const x=side==='left'?-.2:1.5;
 const profile=(lo:number,hi:number):RoundingProfile=>({axis:'y',origin:.834,thickness:.016,outline:[[lo,0],[hi,0],[hi,.6],[lo,.6]],holes:[]});
 const parts=[profile(0,1.5),profile(x,x+.2)].map((profile,i)=>{const geometry=createRoundedPart(profile,1.5);geometry.computeBoundingBox();return {name:i?'Side shelf '+side+' 1':'Top part1',profile,geometry,bounds:geometry.boundingBox!.clone()};});
 const joints=matingPartJoints(parts),seamX=side==='left'?0:1.5;
 const shelf=parts[1];keepPartJointsSquare(shelf.geometry,joints.get(shelf.name)!,1.5);const p=shelf.geometry.getAttribute('position');let seam=0;
 for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)-seamX)<.003){expect(p.getX(i)).toBeCloseTo(seamX,6);expect(Math.min(Math.abs(p.getY(i)-.834),Math.abs(p.getY(i)-.85))).toBeLessThan(1e-6);seam++;}
 expect(seam).toBeGreaterThan(0);parts.forEach(p=>p.geometry.dispose());
});
