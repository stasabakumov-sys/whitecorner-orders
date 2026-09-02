import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface EmailAiAnalysis {
  needs_reply: boolean;
  intent: string;
  linked_order: string | null;
  confidence: number;
  summary: string;
  draft_reply: string;
  review_required: boolean;
  review_reason: string;
}

export interface EmailAiRuntimeStatus {
  connected: boolean;
  mode: 'draft_review';
  model?: string;
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class EmailAiService {
  private readonly analysisCache = new Map<string, EmailAiAnalysis>();

  constructor(private readonly supabase: SupabaseService) { this.restoreCache(); }

  private restoreCache(): void {
    try {
      const values = JSON.parse(sessionStorage.getItem('wc-email-ai-cache-v1') || '[]') as Array<[string, EmailAiAnalysis]>;
      for (const [key, value] of values) if (key && value?.intent) this.analysisCache.set(key, value);
    } catch { /* AI cache is optional. */ }
  }

  private persistCache(): void {
    try { sessionStorage.setItem('wc-email-ai-cache-v1', JSON.stringify([...this.analysisCache].slice(-200))); } catch { /* AI cache is optional. */ }
  }

  async runtimeStatus(): Promise<EmailAiRuntimeStatus> {
    const { data, error } = await this.supabase.client.functions.invoke('email-ai', {
      body: { action: 'status' },
    });
    if (error) throw error;
    if (!data || typeof data.connected !== 'boolean') throw new Error('AI runtime status was not returned');
    return data as EmailAiRuntimeStatus;
  }

  async analyse(message: Record<string, unknown>, orders: unknown[]): Promise<EmailAiAnalysis> {
    const cacheKey = `${String(message['mailbox'] || '')}:${String(message['id'] || '')}`;
    const cached = cacheKey !== ':' ? this.analysisCache.get(cacheKey) : undefined;
    if (cached) return { ...cached };
    const { data, error } = await this.supabase.client.functions.invoke('email-ai', {
      body: { message, orders },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    if (!data?.analysis) throw new Error('AI analysis was not returned');
    const analysis = data.analysis as EmailAiAnalysis;
    if (cacheKey !== ':') { this.analysisCache.set(cacheKey, analysis);this.persistCache(); }
    return { ...analysis };
  }
}
