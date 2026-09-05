import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { FinanceComponent } from './finance.component';

describe('FinanceComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FinanceComponent],
      providers: [{ provide: AuthService, useValue: { session: signal(null) } }],
    }).compileComponents();
  });

  it('keeps the iframe and navigation available during loading, refresh and errors', () => {
    const fixture = TestBed.createComponent(FinanceComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const frame: HTMLIFrameElement = fixture.nativeElement.querySelector('iframe');
    const child = frame.contentWindow as Window & { showMainTab: ReturnType<typeof vi.fn>; refreshDatabase: ReturnType<typeof vi.fn> };
    child.showMainTab = vi.fn();
    child.refreshDatabase = vi.fn();
    component.selectTab('income');
    expect(component.activeTab).toBe('income');
    expect(child.showMainTab).toHaveBeenCalledWith('income');
    component.onFinanceMessage(new MessageEvent('message', {
      origin: window.location.origin, source: child, data: { type: 'white-corner-finance-ready' },
    }));
    expect(component.loadState()).toBe('ready');
    component.refreshFinance();
    fixture.detectChanges();
    expect(child.refreshDatabase).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('iframe')).toBe(frame);
    component.onFinanceMessage(new MessageEvent('message', {
      origin: window.location.origin, source: child,
      data: { type: 'white-corner-finance-error', message: 'Rules unavailable' },
    }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBe(frame);
    component.selectTab('expenses');
    expect(child.showMainTab).toHaveBeenLastCalledWith('expenses');
  });

  it('ignores status messages from another window or origin', () => {
    const fixture = TestBed.createComponent(FinanceComponent);
    fixture.detectChanges();
    fixture.componentInstance.onFinanceMessage(new MessageEvent('message', {
      origin: 'https://untrusted.invalid', data: { type: 'white-corner-finance-ready' },
    }));
    expect(fixture.componentInstance.loadState()).toBe('loading');
  });
});
