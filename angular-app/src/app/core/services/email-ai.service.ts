import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface EmailAiEvidence { claim: string; source_ids: string[]; }
export interface EmailAiAnalysis {
  needs_reply: boolean;
  intent: string;
  intent_labels?: string[];
  linked_order: string | null;
  confidence: number;
  summary: string;
  draft_reply: string;
  review_required: boolean;
  review_reason: string;
  facts?: (EmailAiEvidence & { kind: string })[];
  conflicts?: string[];
  missing_information?: string[];
  risk_flags?: string[];
  next_step?: string;
  claim_source_map?: EmailAiEvidence[];
}
export interface EmailAiRuntimeStatus {
  connected: boolean;
  mode: 'draft_review';
  model?: string;
  reason?: string;
  knowledge_version?: string;
}

@Injectable({ providedIn: 'root' })
export class EmailAiService {
  constructor(private readonly supabase: SupabaseService) {
    // V1 cached by message ID and could reuse a draft after a new reply or order change.
    try { sessionStorage.removeItem('wc-email-ai-cache-v1'); } catch { /* Storage is optional. */ }
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
    // No result cache: the server refreshes order facts for every analysis.
    const { data, error } = await this.supabase.client.functions.invoke('email-ai', {
      body: { action: 'analyse', message, orders },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    if (!data?.analysis) throw new Error('AI analysis was not returned');
    return data.analysis as EmailAiAnalysis;
  }
}
