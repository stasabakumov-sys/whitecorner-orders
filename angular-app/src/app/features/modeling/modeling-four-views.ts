import * as THREE from 'three';

// The Classic asset faces -Z; the MDF assets face +Z. Normalize the view,
// without modifying private source geometry or manufacturing coordinates.
export const frontFacingRotation=(classic:boolean):number=>classic?Math.PI:0;

/** Three fixed orthographic elevations and one interactive perspective view. */
export class ModelingFourViews {
 private readonly perspective=new THREE.PerspectiveCamera();
 private readonly elevations=Array.from({length:3},()=>new THREE.OrthographicCamera());
 render(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,turntable:THREE.Group|undefined,
   width:number,height:number,stageWidth:number,target:THREE.Vector3,span:number,classic:boolean):void {
  const w=Math.floor(stageWidth/2),h=Math.floor(height/2),rotation=turntable?.rotation.y??0;
  const views=[{x:0,y:h,w,h:height-h},{x:w,y:h,w:Math.floor(stageWidth)-w,h:height-h},
   {x:0,y:0,w,h},{x:w,y:0,w:Math.floor(stageWidth)-w,h}];
  this.perspective.copy(camera);this.perspective.clearViewOffset();this.perspective.aspect=views[1].w/views[1].h;this.perspective.updateProjectionMatrix();
  const shadowFloors:{node:THREE.Mesh;visible:boolean}[]=[];
  scene.traverse(node=>{if(node instanceof THREE.Mesh&&(Array.isArray(node.material)?node.material:[node.material]).some(m=>m instanceof THREE.ShadowMaterial))shadowFloors.push({node,visible:node.visible});});
  renderer.setScissorTest(true);
  try {
   for(let i=0;i<views.length;i++){
    const view=views[i];renderer.setViewport(view.x,view.y,view.w,view.h);renderer.setScissor(view.x,view.y,view.w,view.h);
    let active:THREE.Camera=this.perspective;
    if(i!==1){
     const ortho=this.elevations[i===0?0:i-1],aspect=view.w/view.h,extent=span*.62/Math.min(1,aspect);
     ortho.left=-extent*aspect;ortho.right=extent*aspect;ortho.top=extent;ortho.bottom=-extent;ortho.near=.01;ortho.far=30;
     ortho.up.set(0,i===0?0:1,i===0?-1:0);
     ortho.position.copy(target).add(i===0?new THREE.Vector3(0,span*3,0):i===2?new THREE.Vector3(0,0,span*3):new THREE.Vector3(span*3,0,0));
     ortho.lookAt(target);ortho.updateProjectionMatrix();active=ortho;
    }
    for(const floor of shadowFloors)floor.node.visible=i===1&&floor.visible;
    if(turntable)turntable.rotation.y=i===1?rotation:frontFacingRotation(classic);
    scene.updateMatrixWorld(true);renderer.render(scene,active);
   }
  } finally {
   for(const floor of shadowFloors)floor.node.visible=floor.visible;
   if(turntable)turntable.rotation.y=rotation;
   scene.updateMatrixWorld(true);renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);
  }
 }
}
