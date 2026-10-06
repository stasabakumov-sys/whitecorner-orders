import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { SupabaseService } from '../../core/services/supabase.service';

const TTL = 10 * 60 * 1000;
const FILE_LIMIT = 20 * 1024 * 1024;
interface Entry<T> { value: T; bytes: number; expires: number; }

// Private assets stay in this tab's memory. Each caller obtains a fresh Storage
// access grant before using a cached file; immutable upload paths identify versions.
@Injectable({ providedIn: 'root' })
export class ModelingCacheService {
  private readonly files = new Map<string, Entry<ArrayBuffer>>();
  private readonly pending = new Map<string, Promise<ArrayBuffer>>();
  private readonly geometries = new Map<string, Entry<THREE.BufferGeometry>>();
  private generation = 0;
  constructor(db: SupabaseService) {
    let user: string | undefined;
    db.client.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id;
      if (event === 'SIGNED_OUT' || next !== user) this.clear();
      user = next;
    });
  }

  async readFile(path: string, url: string): Promise<ArrayBuffer> {
    this.prune(this.files, 40 * 1024 * 1024);
    const cached = this.files.get(path);
    if (cached) { this.files.delete(path); this.files.set(path, cached); return cached.value; }
    const pending = this.pending.get(path);
    if (pending) return pending;
    const generation = this.generation;
    const request = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Model download failed (HTTP ${response.status}).`);
      const file = await response.arrayBuffer();
      if (!file.byteLength || file.byteLength > FILE_LIMIT) throw new Error('The model file is empty or exceeds the 20 MB limit.');
      if (generation !== this.generation) throw new Error('Your session changed. Reopen the model.');
      this.files.set(path, { value: file, bytes: file.byteLength, expires: Date.now() + TTL });
      this.prune(this.files, 40 * 1024 * 1024);
      return file;
    })().finally(() => { if (this.pending.get(path) === request) this.pending.delete(path); });
    this.pending.set(path, request);
    return request;
  }

  roundedPart(key: string, create: () => THREE.BufferGeometry): THREE.BufferGeometry {
    this.prune(this.geometries, 32 * 1024 * 1024, value => value.dispose());
    let entry = this.geometries.get(key);
    if (!entry) {
      const value = create();
      const bytes = Object.values(value.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, value.index?.array.byteLength || 0);
      entry = { value, bytes, expires: Date.now() + TTL };
      this.geometries.set(key, entry);
    } else { this.geometries.delete(key); this.geometries.set(key, entry); }
    // Dimensions and UVs mutate the working copy, never the cached CAD geometry.
    const result = entry.value.clone();
    // Three copies userData by reference. Grouping flags belong to the working
    // geometry, otherwise a later clone incorrectly skips its own face grouping.
    result.userData = { ...entry.value.userData };
    this.prune(this.geometries, 32 * 1024 * 1024, value => value.dispose());
    return result;
  }

  invalidateFile(path: string): void { this.files.delete(path); }

  clear(): void {
    this.generation++;
    this.files.clear(); this.pending.clear();
    for (const entry of this.geometries.values()) entry.value.dispose();
    this.geometries.clear();
  }

  private prune<T>(cache: Map<string, Entry<T>>, limit: number, dispose?: (value: T) => void): void {
    let bytes = 0;
    for (const [key, entry] of cache) {
      if (entry.expires <= Date.now()) { dispose?.(entry.value); cache.delete(key); }
      else bytes += entry.bytes;
    }
    for (const [key, entry] of cache) {
      if (bytes <= limit) break;
      dispose?.(entry.value); cache.delete(key); bytes -= entry.bytes;
    }
  }
}
