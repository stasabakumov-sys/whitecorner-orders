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

@Injectable({ providedIn: 'root' })
export class EmailAiService {
  constructor(private readonly supabase: SupabaseService) {}

  async analyse(message: Record<string, unknown>, orders: unknown[]): Promise<EmailAiAnalysis> {
    const { data, error } = await this.supabase.client.functions.invoke('email-ai', {
      body: { message, orders },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    if (!data?.analysis) throw new Error('AI analysis was not returned');
    return data.analysis as EmailAiAnalysis;
  }
}
