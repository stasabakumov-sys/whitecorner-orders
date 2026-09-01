import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type GmailMailboxKey = 'info' | 'support';
export type GmailView = 'Inbox' | 'Needs reply' | 'Sent';

export interface GmailMailboxStatus {
  mailbox_key?: GmailMailboxKey;
  mailbox?: GmailMailboxKey;
  email: string;
  connected?: boolean;
  connected_at?: string | null;
  connectedAt?: string | null;
  last_sync_at?: string | null;
  lastSyncAt?: string | null;
}

export interface GmailMessageRow {
  id: string;
  threadId?: string;
  mailbox: GmailMailboxKey;
  correspondent: string;
  email: string;
  initials: string;
  subject: string;
  preview: string;
  received_at: string;
  time: string;
  direction: 'Incoming' | 'Outgoing';
  status: 'Inbox' | 'Sent';
  unread?: boolean;
  needs_reply?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EmailService {
  readonly status = signal<Record<GmailMailboxKey, boolean>>({ info: false, support: false });
  readonly loading = signal(false);
  readonly error = signal('');

  constructor(private readonly supabase: SupabaseService) {}

  async refreshStatus(): Promise<void> {
    this.error.set('');
    const { data, error } = await this.supabase.client.functions.invoke('gmail-api', { body: { action: 'status' } });
    if (error) {
      this.error.set(error.message || String(error));
      return;
    }
    const next: Record<GmailMailboxKey, boolean> = { info: false, support: false };
    for (const row of (data?.mailboxes || []) as GmailMailboxStatus[]) {
      const key = row.mailbox_key || row.mailbox;
      if (key === 'info' || key === 'support') next[key] = true;
    }
    this.status.set(next);
  }

  isConnected(mailbox: GmailMailboxKey): boolean { return this.status()[mailbox]; }
  connectedCount(): number { return Number(this.status().info) + Number(this.status().support); }

  async connect(mailbox: GmailMailboxKey): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const { data, error } = await this.supabase.client.functions.invoke('gmail-oauth', { body: { mailbox } });
      if (error) throw error;
      if (!data?.authUrl) throw new Error('OAuth URL was not returned');
      window.location.assign(data.authUrl);
    } catch (e) {
      this.error.set(String((e as Error)?.message || e));
    } finally {
      this.loading.set(false);
    }
  }

  async list(mailbox: GmailMailboxKey, view: GmailView): Promise<GmailMessageRow[]> {
    const apiView = view === 'Needs reply' ? 'Inbox' : view;
    const { data, error } = await this.supabase.client.functions.invoke('gmail-api', { body: { action: 'list', mailbox, view: apiView } });
    if (error) throw error;
    return (data?.messages || []) as GmailMessageRow[];
  }

  async getMessage(mailbox: GmailMailboxKey, messageId: string): Promise<{ body: string; subject: string; from: string; to: string; date: string }> {
    const { data, error } = await this.supabase.client.functions.invoke('gmail-api', { body: { action: 'get', mailbox, messageId } });
    if (error) throw error;
    return data;
  }

  async send(mailbox: GmailMailboxKey, to: string, subject: string, text: string): Promise<void> {
    const { error } = await this.supabase.client.functions.invoke('gmail-api', { body: { action: 'send', mailbox, to, subject, text } });
    if (error) throw error;
  }
}
