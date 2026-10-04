import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ModelingComponent, casterGroupKey, isTopPanelName } from './modeling.component';
import { HubMembersService } from '../../core/services/hub-members.service';
import { SupabaseService } from '../../core/services/supabase.service';

function setup(uploadError: Error | null = null) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const query: any = { eq: () => query, select: () => query, single: async () => ({ error: null }) };
  const client: any = {
    storage: { from: () => ({ upload, remove }) },
    from: () => ({ update: () => query }),
  };
  const component = new ModelingComponent(
    { manager: () => true } as unknown as HubMembersService,
    { client } as SupabaseService,
  );
  const original = new File(['test'], 'classic.glb', { type: 'application/octet-stream' });
  component.selectedFile.set(original);
  return { component, upload, remove, original };
}

describe('Modeling GLB upload', () => {
  it('sends a parsed GLB with its supported MIME type', async () => {
    const { component, upload } = setup();
    await component.saveModel();
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][1]).toBeInstanceOf(File);
    expect(upload.mock.calls[0][1].type).toBe('model/gltf-binary');
    expect(component.selectedFile()).toBeNull();
  });

  it('keeps the selected file available after an upload failure', async () => {
    const { component, original, remove } = setup(new Error('network failed'));
    await component.saveModel();
    expect(component.selectedFile()).toBe(original);
    expect(component.error()).toContain('network failed');
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('STEP part names after GLTF loading', () => {
  it('keeps each caster separate from the scalable body', () => {
    expect(casterGroupKey('Caster_L_front_rubber_tire')).toBe('L-front');
    expect(casterGroupKey('Caster R rear plate')).toBe('R-rear');
    expect(casterGroupKey('Buttom_part1')).toBeNull();
  });

  it('identifies top panels for their independent finish', () => {
    expect(isTopPanelName('Top_part2')).toBe(true);
    expect(isTopPanelName('Top part1')).toBe(true);
    expect(isTopPanelName('Front_part1')).toBe(false);
  });
});

describe('Modeling dimensions', () => {
  it('moves the camera back as the cart grows', () => {
    const { component } = setup();
    const editor = component as any;
    editor.body = new THREE.Group();
    editor.controls = { target: new THREE.Vector3(0.6, 0.45, 0.3), update: vi.fn() };
    editor.camera.position.set(1.92, 1.05, 1.8);
    const before = editor.camera.position.distanceTo(editor.controls.target);
    component.setDimension('width', '1500');
    const after = editor.camera.position.distanceTo(editor.controls.target);
    expect(after / before).toBeCloseTo(1500 / 1200);
  });

  it('limits length to 120–150 cm and height to 85–100 cm in 5 cm steps', () => {
    const { component } = setup();
    component.setDimension('width', '2000');
    component.setDimension('height', '1300');
    expect(component.width()).toBe(1500);
    expect(component.height()).toBe(1000);
    component.setDimension('width', '800');
    component.setDimension('height', '650');
    expect(component.width()).toBe(1200);
    expect(component.height()).toBe(850);
    component.setDimension('height', '942');
    expect(component.height()).toBe(950);
    component.setDimension('width', '1340');
    expect(component.width()).toBe(1300);
    expect(component.depth()).toBe(600);
  });
});

describe('Plywood finishes', () => {
  it('runs pine grain along rails and plywood layers along vertical edges', () => {
    const { component } = setup();
    const editor = component as any;
    editor.modelPineTexture = new THREE.Texture();
    editor.modelPlywoodEdgeTexture = new THREE.Texture();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0.1, 0.1, 0.02, 1.1, 0.1, 0.02], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, -1, 0, 0, -1], 3));
    editor.addWoodUvs(geometry, 'Buttom part2', false, true);
    let uv = geometry.getAttribute('uv');
    expect(uv.getX(0)).toBeCloseTo(uv.getX(1));
    expect(uv.getY(1)).toBeGreaterThan(uv.getY(0));
    for (const name of ['Front part1', 'Left side part1', 'Right side part2', 'Front part2']) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0.03, 0.11, 0.02, 0.03, 0.885, 0.02], 3));
      editor.addWoodUvs(geometry, name, true);
      uv = geometry.getAttribute('uv');
      expect(uv.getY(0)).toBeCloseTo(uv.getY(1));
      expect(uv.getX(1)).toBeGreaterThan(uv.getX(0));
    }
    geometry.dispose();
  });
  it('uses the embedded birch texture for RAW and varnished plywood and restores it after painting', () => {
    const { component } = setup();
    const editor = component as any;
    const birch = new THREE.Texture();
    const layers = new THREE.Texture();
    const pine = new THREE.Texture();
    editor.modelPlywoodTexture = birch;
    editor.modelPlywoodEdgeTexture = layers;
    editor.modelPineTexture = pine;
    const paintBump = new THREE.Texture();
    editor.modelPaintBumpTexture = paintBump;
    editor.rawTexture = new THREE.Texture();
    editor.oakTexture = new THREE.Texture();
    editor.plywoodTexture = new THREE.Texture();
    editor.body = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    const top = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    const topEdge = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    const trim = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    front.name = 'Front_part1';
    top.name = 'Top_part1';
    edge.name = 'Front_part1_1';
    edge.material.name = 'Front part1 plywood edge';
    topEdge.name = 'Top_part1_1';
    topEdge.material.name = 'Top part1 plywood edge';
    trim.name = 'Top_part2';
    trim.material.name = 'Top part2 pine trim';
    editor.body.add(front, top, edge, topEdge, trim);
    component.setRawBody();
    expect(front.material.map).toBe(birch);
    expect(top.material.map).toBe(birch);
    expect(edge.material.map).toBe(layers);
    expect(front.material.color.r).toBeCloseTo(1.05);
    expect(edge.material.color.r).toBeCloseTo(1.30);
    expect(topEdge.material.map).toBe(layers);
    expect(trim.material.map).toBe(pine);
    expect(trim.material.color.r).toBeCloseTo(1.15 * 1.05);
    expect(trim.material.color.b).toBeCloseTo(2.4 * 1.05);
    expect(top.material.roughness).toBe(front.material.roughness);
    expect(top.material.color.equals(front.material.color)).toBe(true);
    expect(topEdge.material.color.equals(edge.material.color)).toBe(true);
    expect(front.material.bumpMap).toBeNull();
    component.setBodyColor('#33383e');
    expect(front.material.map).toBeNull();
    expect(edge.material.map).toBeNull();
    expect(trim.material.map).toBe(pine);
    expect(front.material.bumpMap).toBe(paintBump);
    expect(trim.material.bumpMap).toBeNull();
    expect(top.material.bumpMap).toBeNull();
    expect(top.material.map).toBe(birch);
    component.setTopFinish('body');
    expect(trim.material.map).toBeNull();
    expect(trim.material.bumpMap).toBe(paintBump);
    expect(front.material.roughness).toBe(0.78);
    component.setPaintFinish('semi-gloss');
    for (const colour of ['#f6f6f3', '#33383e', '#708471', '#aa6553', '#123456']) {
      component.setBodyColor(colour);
      for (const panel of [front, top, trim]) {
        expect(panel.material.bumpMap).toBeNull();
        expect(panel.material.roughness).toBe(0.3);
        expect(panel.material.color.getHexString()).toBe(colour.slice(1));
      }
    }
    component.setPaintFinish('matte');
    expect(front.material.bumpMap).toBe(paintBump);
    expect(front.material.roughness).toBe(0.78);
    component.setTopFinish('plywood');
    component.setRawBody();
    expect(front.material.map).toBe(birch);
    expect(edge.material.map).toBe(layers);
    expect(trim.material.map).toBe(pine);
    expect(front.material.bumpMap).toBeNull();
    component.setTopFinish('oak');
    expect(top.material.map).toBe(editor.oakTexture);
    expect(topEdge.material.map).toBe(editor.oakTexture);
    expect(trim.material.map).toBe(editor.oakTexture);
    expect(trim.material.color.equals(top.material.color)).toBe(true);
    expect(front.material.map).toBe(birch);
  });
});
