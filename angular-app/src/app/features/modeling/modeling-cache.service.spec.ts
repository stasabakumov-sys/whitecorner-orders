import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ModelingCacheService } from './modeling-cache.service';
import { SupabaseService } from '../../core/services/supabase.service';
function setup() {
  let auth!: (event: string, session: { user: { id: string } } | null) => void;
  const cache = new ModelingCacheService({ client: { auth: { onAuthStateChange: (callback: typeof auth) => { auth = callback; } } } } as unknown as SupabaseService);
  auth('INITIAL_SESSION', { user: { id: 'user-a' } });
  return { cache, auth };
}
const response = (size = 16) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(size) });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('Private Modeling memory cache', () => {
  it('deduplicates downloads across fresh signed links and invalidates a replacement path', async () => {
    const { cache } = setup(); const fetch = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetch);
    const [a, b] = await Promise.all([cache.readFile('version-a', 'link-a'), cache.readFile('version-a', 'link-b')]);
    expect(a).toBe(b); expect(fetch).toHaveBeenCalledOnce();
    expect(await cache.readFile('version-a', 'link-c')).toBe(a);
    await cache.readFile('version-b', 'link-d'); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('retries failed downloads and rejects empty or oversized files', async () => {
    const { cache } = setup(); const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValueOnce(response(0)).mockResolvedValueOnce(response(20 * 1024 * 1024 + 1)).mockResolvedValue(response()); vi.stubGlobal('fetch', fetch);
    await expect(cache.readFile('a', 'url')).rejects.toThrow('403');
    await expect(cache.readFile('a', 'url')).rejects.toThrow('empty');
    await expect(cache.readFile('a', 'url')).rejects.toThrow('20 MB');
    await expect(cache.readFile('a', 'url')).resolves.toBeInstanceOf(ArrayBuffer); expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('expires files and bounds retained downloads to 40 MB', async () => {
    const { cache } = setup(); let now = 1000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetch = vi.fn().mockResolvedValue(response(15 * 1024 * 1024)); vi.stubGlobal('fetch', fetch);
    for (const path of ['a', 'b', 'c', 'a']) await cache.readFile(path, 'url'); expect(fetch).toHaveBeenCalledTimes(4);
    now += 10 * 60 * 1000; await cache.readFile('a', 'url'); expect(fetch).toHaveBeenCalledTimes(5);
  });
  it('clears files on logout or account change, but keeps them on token refresh', async () => {
    const { cache, auth } = setup(); const fetch = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetch);
    await cache.readFile('a', 'url'); auth('TOKEN_REFRESHED', { user: { id: 'user-a' } });
    await cache.readFile('a', 'url'); expect(fetch).toHaveBeenCalledOnce();
    auth('SIGNED_OUT', null); await cache.readFile('a', 'url');
    auth('SIGNED_IN', { user: { id: 'user-b' } }); await cache.readFile('a', 'url'); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('discards an old session download that completes after logout', async () => {
    const { cache, auth } = setup(); let finish!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue(response()));
    const old = cache.readFile('a', 'url'); auth('SIGNED_OUT', null); finish(response());
    await expect(old).rejects.toThrow('session changed'); await expect(cache.readFile('a', 'url')).resolves.toBeInstanceOf(ArrayBuffer);
  });
  it('reuses rounded geometry without sharing mutable dimensions, and disposes expired templates', () => {
    const { cache } = setup(); let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const template = new THREE.BoxGeometry(); const dispose = vi.spyOn(template, 'dispose'); const create = vi.fn(() => template);
    const first = cache.roundedPart('profile+radius+joints', create); first.translate(2, 0, 0); first.userData['topFinishGroups'] = true;
    const second = cache.roundedPart('profile+radius+joints', create); expect(create).toHaveBeenCalledOnce();
    expect(second.userData['topFinishGroups']).toBeUndefined(); expect(template.userData['topFinishGroups']).toBeUndefined();
    expect(second.getAttribute('position').getX(0)).toBe(template.getAttribute('position').getX(0));
    expect(first.getAttribute('position').getX(0)).not.toBe(second.getAttribute('position').getX(0));
    now += 10 * 60 * 1000; cache.roundedPart('another-profile', () => new THREE.BoxGeometry());
    expect(dispose).toHaveBeenCalledOnce(); cache.clear(); first.dispose(); second.dispose();
  });
});
