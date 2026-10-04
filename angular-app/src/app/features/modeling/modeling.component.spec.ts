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

  it('limits length to 120–150 cm and height to 900–1000 mm', () => {
    const { component } = setup();
    component.setDimension('width', '2000');
    component.setDimension('height', '1300');
    expect(component.width()).toBe(1500);
    expect(component.height()).toBe(1000);
    component.setDimension('width', '800');
    component.setDimension('height', '650');
    expect(component.width()).toBe(1200);
    expect(component.height()).toBe(900);
    component.setDimension('width', '1340');
    expect(component.width()).toBe(1300);
    expect(component.depth()).toBe(600);
  });
});

describe('Plywood finishes', () => {
  it('uses the embedded birch texture for RAW and varnished plywood and restores it after painting', () => {
    const { component } = setup();
    const editor = component as any;
    const birch = new THREE.Texture();
    editor.modelPlywoodTexture = birch;
    editor.rawTexture = new THREE.Texture();
    editor.oakTexture = new THREE.Texture();
    editor.plywoodTexture = new THREE.Texture();
    editor.body = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    const top = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    front.name = 'Front_part1';
    top.name = 'Top_part1';
    editor.body.add(front, top);
    component.setRawBody();
    expect(front.material.map).toBe(birch);
    expect(top.material.map).toBe(birch);
    expect(top.material.roughness).toBeLessThan(front.material.roughness);
    component.setBodyColor('#33383e');
    expect(front.material.map).toBeNull();
    expect(top.material.map).toBe(birch);
    component.setRawBody();
    expect(front.material.map).toBe(birch);
    component.setTopFinish('oak');
    expect(top.material.map).toBe(editor.oakTexture);
    expect(front.material.map).toBe(birch);
  });
});
