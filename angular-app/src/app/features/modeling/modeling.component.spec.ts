import { describe, expect, it, vi } from 'vitest';
import { ModelingComponent } from './modeling.component';
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
