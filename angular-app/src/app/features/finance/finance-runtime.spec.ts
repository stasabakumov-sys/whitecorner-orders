// Load test-runner builtins at runtime; the application deliberately has no Node typings.
const builtin = (name: string) => import(/* @vite-ignore */ name);
const { readFileSync } = await builtin('node:fs');
const { resolve } = await builtin('node:path');
const { createContext, runInContext } = await builtin('node:vm');
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Execute the actual shipped iframe scripts, with an isolated DOM and a read-only API fake.
const html = readFileSync(resolve('public/finance/index.html'), 'utf8');
const transaction = (id: string, direction = 'expense', amount = 100, category = 'Other') => ({
  id, direction, amount, transaction_date: '2026-07-01', description: 'Synthetic transaction',
  business_category: category, company_personal: 'Company', tax_attribute: 'Operating Expenses',
  tax_category: 'Review', status: 'Auto',
});

describe('Finance iframe loading and tab cache', () => {
  let context: ReturnType<typeof createContext>;
  let doc: Document;
  let timers: Array<() => void>;
  let requests: string[];
  let responses: Record<string, any[]>;
  let errors: Record<string, string>;
  let hold: Promise<void> | undefined;
  const run = (code: string) => runInContext(code, context);
  const flush = () => { while (timers.length) timers.shift()!(); };

  beforeEach(() => {
    doc = new DOMParser().parseFromString(html, 'text/html');
    timers = [];
    requests = [];
    errors = {};
    hold = undefined;
    responses = { transactions: [transaction('expense'), transaction('income', 'income', 300)] };
    const api = { from(table: string) {
      requests.push(table);
      const query = {
        select: () => query,
        order: () => query,
        then: (resolve: (result: unknown) => void) => Promise.resolve(hold).then(() => resolve({
          data: responses[table] || [], error: errors[table] ? new Error(errors[table]) : null,
        })),
      };
      return query;
    } };
    context = createContext({ document: doc, console: { error: vi.fn() },
      setTimeout: (callback: () => void) => timers.push(callback),
      alert: vi.fn(), localStorage: { getItem: () => null, setItem: vi.fn() },
      location: { origin: 'http://localhost' }, addEventListener: vi.fn(),
      parent: { postMessage: vi.fn() }, api,
    });
    run('window=globalThis');
    for (const script of doc.querySelectorAll('script:not([src])')) run(script.textContent || '');
    timers = []; // Authentication is driven explicitly; no real session or network is used.
    run('supabaseClient=api');
  });

  it('coalesces concurrent loads and caches subsequent session restores', async () => {
    let release!: () => void;
    hold = new Promise<void>(resolve => release = resolve);
    const first = run('loadDatabaseData({force:false})');
    const second = run('loadDatabaseData({force:false})');
    expect(first).toBe(second);
    expect(requests).toEqual(['transactions', 'business_categories', 'classification_rules']);
    run("showMainTab('income')");
    expect(doc.getElementById('incomeMain')!.classList.contains('hidden')).toBe(false);
    release(); await first;
    await run('loadDatabaseData({force:false})');
    expect(requests).toHaveLength(3);
    expect(run('databaseLoaded')).toBe(true);
  });

  it('renders only the selected tab and reuses table nodes on repeat visits', async () => {
    await run('loadDatabaseData()');
    expect(doc.querySelector('#incomeTable tbody')!.children).toHaveLength(0);
    run("showMainTab('income')"); flush();
    const incomeRow = doc.querySelector('#incomeTable tbody tr');
    expect(incomeRow).not.toBeNull();
    run("showMainTab('profit')"); flush();
    const profitTable = doc.getElementById('profitMain')!.innerHTML;
    run("showMainTab('expenses');showMainTab('income');showMainTab('profit')"); flush();
    expect(doc.querySelector('#incomeTable tbody tr')).toBe(incomeRow);
    expect(doc.getElementById('profitMain')!.innerHTML).toBe(profitTable);
    expect(requests).toHaveLength(3);
  });

  it('loads rules lazily once and preserves the selected rules section', async () => {
    await run('loadDatabaseData()');
    run("showMainTab('assets')");
    await run('ensurePersonalRules()'); flush();
    expect(requests.slice(3)).toEqual(['personal_rules', 'personal_rule_transactions']);
    run("switchAssetSection('pc',document.getElementById('assetPersonalTab'));showMainTab('expenses');showMainTab('assets')"); flush();
    expect(doc.getElementById('assetPersonalView')!.classList.contains('hidden')).toBe(false);
    expect(requests).toHaveLength(5);
  });

  it('keeps displayed data while refreshing and retries after a rules failure', async () => {
    await run('loadDatabaseData()');
    const row = doc.querySelector('#tbody tr');
    let release!: () => void;
    hold = new Promise<void>(resolve => release = resolve);
    const refresh = run('refreshDatabase()');
    expect(doc.querySelector('#tbody tr')).toBe(row);
    release(); await refresh;
    expect(requests).toHaveLength(6);
    errors['personal_rules'] = 'offline';
    run("showMainTab('assets')");
    await expect(run('ensurePersonalRules()')).rejects.toThrow('offline');
    run("showMainTab('income')"); flush();
    expect(doc.querySelector('#incomeTable tbody tr')).not.toBeNull();
    delete errors['personal_rules'];
    run("showMainTab('assets')"); await run('ensurePersonalRules()'); flush();
    expect(run('personalRulesLoaded')).toBe(true);
  });

  it('keeps the previous snapshot after a failed refresh and fetches new data on retry', async () => {
    await run('loadDatabaseData()');
    const row = doc.querySelector('#tbody tr');
    errors['transactions'] = 'offline';
    await run('refreshDatabase()');
    expect(doc.querySelector('#tbody tr')).toBe(row);
    expect(run('dbTransactions.length')).toBe(2);
    delete errors['transactions'];
    responses['transactions'] = [transaction('new')];
    await run('refreshDatabase()');
    expect(run('dbTransactions[0].id')).toBe('new');
    expect(requests).toHaveLength(9);
  });

  it('invalidates hidden views on refresh and preserves expense filters', async () => {
    await run('loadDatabaseData()');
    run("setExpenseBusinessFilter('Other');showMainTab('income')"); flush();
    const oldIncome = doc.querySelector('#incomeTable tbody tr');
    run("showMainTab('expenses')"); flush();
    responses['transactions'] = [transaction('expense'), transaction('income', 'income', 450)];
    await run('refreshDatabase()');
    expect(run('expenseBusinessFilter')).toBe('Other');
    run("showMainTab('income')"); flush();
    expect(doc.querySelector('#incomeTable tbody tr')).not.toBe(oldIncome);
    expect(doc.getElementById('incomeBody')!.textContent).toContain('450.00');
    expect(requests).toHaveLength(6);
  });

  it('preserves income transfer classification and totals without write requests', async () => {
    responses['transactions'].push({ ...transaction('transfer', 'income', 500), description: 'Transfer from CommBank app' });
    await run('loadDatabaseData()');
    expect(run("dbTransactions.find(tx=>tx.id==='transfer').business_category")).toBe('Internal Transfer');
    expect(run("dbTransactions.find(tx=>tx.id==='transfer').company_personal")).toBe('Not Applicable');
    run("showMainTab('profit')"); flush();
    const text = doc.getElementById('profitMain')!.textContent!;
    expect(text).toContain('300.00');
    expect(text).toContain('200.00');
    expect(text).not.toContain('800.00');
    expect(requests).toEqual(['transactions', 'business_categories', 'classification_rules']);
  });
});
