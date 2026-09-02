import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type GmailMailboxKey = 'info' | 'support';
export type GmailView = 'Inbox' | 'Needs reply' | 'Sent';
export type GmailModifyAction = 'markRead' | 'markUnread' | 'archive' | 'trash' | 'star' | 'unstar';

export interface GmailMailboxStatus {
  mailbox_key?: GmailMailboxKey;
  mailbox?: GmailMailboxKey;
  email: string;
  connected?: boolean;
  connected_at?: string | null;
  connectedAt?: string | null;
  last_sync_at?: string | null;
  lastSyncAt?: string | null;
  scopes?: string[];
  granted_scopes?: string[];
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
  starred?: boolean;
  needs_reply?: boolean;
}

export interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  inline?: boolean;
}

export interface GmailMessageDetail {
  body: string;
  html?: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  unread?: boolean;
  starred?: boolean;
  imagesBlocked?: boolean;
  attachments?: GmailAttachment[];
}

@Injectable({ providedIn: 'root' })
export class EmailService {
  readonly status = signal<Record<GmailMailboxKey, boolean>>({ info: false, support: false });
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly messageLoads = new Map<string, Promise<GmailMessageDetail>>();
  private readonly messageMutations = new Map<string, Promise<void>>();
  private readonly listCache = new Map<string, { messages: GmailMessageRow[]; loadedAt: number }>();

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

  private listKey(mailbox: GmailMailboxKey, view: GmailView): string {
    return `${mailbox}:${view === 'Needs reply' ? 'Inbox' : view}`;
  }

  peekList(mailbox: GmailMailboxKey, view: GmailView): GmailMessageRow[] | null {
    const cached = this.listCache.get(this.listKey(mailbox, view));
    return cached ? cached.messages.map(message => ({ ...message })) : null;
  }

  isListStale(mailbox: GmailMailboxKey, view: GmailView, maxAgeMs = 30_000): boolean {
    const cached = this.listCache.get(this.listKey(mailbox, view));
    return !cached || Date.now() - cached.loadedAt > maxAgeMs;
  }

  async list(mailbox: GmailMailboxKey, view: GmailView, refresh = false): Promise<GmailMessageRow[]> {
    const apiView = view === 'Needs reply' ? 'Inbox' : view;
    const key = this.listKey(mailbox, apiView);
    const cached = this.listCache.get(key);
    if (cached && !refresh) return cached.messages.map(message => ({ ...message }));
    const { data, error } = await this.supabase.client.functions.invoke('gmail-api', { body: { action: 'list', mailbox, view: apiView } });
    if (error) throw error;
    const messages = ((data?.messages || []) as GmailMessageRow[]).map(message => ({ ...message }));
    this.listCache.set(key, { messages, loadedAt: Date.now() });
    return messages.map(message => ({ ...message }));
  }

  getMessage(mailbox: GmailMailboxKey, messageId: string, loadExternalImages = false): Promise<GmailMessageDetail> {
    const key = `${mailbox}:${messageId}:${loadExternalImages ? 'images' : 'safe'}`;
    const pending = this.messageLoads.get(key);
    if (pending) return pending;
    const request = this.loadMessage(mailbox, messageId, loadExternalImages).finally(() => this.messageLoads.delete(key));
    this.messageLoads.set(key, request);
    return request;
  }

  private async loadMessage(mailbox: GmailMailboxKey, messageId: string, loadExternalImages: boolean): Promise<GmailMessageDetail> {
    const { data, error } = await this.supabase.client.functions.invoke('gmail-api', { body: { action: 'get', mailbox, messageId, loadExternalImages } });
    if (error) throw error;
    return data;
  }

  async downloadAttachment(mailbox: GmailMailboxKey, messageId: string, attachment: GmailAttachment): Promise<Blob> {
    const { data, error } = await this.supabase.client.functions.invoke('gmail-api', { body: { action: 'attachment', mailbox, messageId, attachmentId: attachment.attachmentId } });
    if (error) throw error;
    const base64 = String(data?.data || '').replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new Blob([bytes], { type: attachment.mimeType || 'application/octet-stream' });
  }

  async modify(mailbox: GmailMailboxKey, messageId: string, action: GmailModifyAction): Promise<void> {
    const mutationKey = `${mailbox}:${messageId}`;
    const previous = this.messageMutations.get(mutationKey) || Promise.resolve();
    const request = previous.catch(() => undefined).then(async () => {
      const { error } = await this.supabase.client.functions.invoke('gmail-api', { body: { action, mailbox, messageId } });
      if (error) throw error;
      for (const [key, cached] of this.listCache) {
        if (!key.startsWith(`${mailbox}:`)) continue;
        if (action === 'archive' || action === 'trash') {
          cached.messages = cached.messages.filter(message => message.id !== messageId);
        } else {
          cached.messages = cached.messages.map(message => message.id === messageId ? {
            ...message,
            unread: action === 'markRead' ? false : action === 'markUnread' ? true : message.unread,
            starred: action === 'star' ? true : action === 'unstar' ? false : message.starred
          } : message);
        }
      }
    });
    this.messageMutations.set(mutationKey, request);
    try {
      await request;
    } finally {
      if (this.messageMutations.get(mutationKey) === request) this.messageMutations.delete(mutationKey);
    }
  }

  async send(mailbox: GmailMailboxKey, to: string, subject: string, text: string, files: File[] = []): Promise<void> {
    const attachments = await Promise.all(files.map(async file => ({ filename: file.name, mimeType: file.type || 'application/octet-stream', data: await this.fileBase64(file) })));
    const { error } = await this.supabase.client.functions.invoke('gmail-api', { body: { action: 'send', mailbox, to, subject, text, attachments } });
    if (error) throw error;
    this.listCache.delete(this.listKey(mailbox, 'Sent'));
  }

  private async fileBase64(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
  }
}
