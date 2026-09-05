import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { targets, shouldRun, snapshot, jobCondition } from './production-changes.mjs';

for (const [key, target] of Object.entries(targets)) {
  const workflowPath = `.github/workflows/${target.workflow}`;
  const current = readFileSync(workflowPath, 'utf8');
  const state = (timestamp, blob = '100644 blob sql', source = current, code = '100644 blob code') => ({
    files: new Map([[`supabase/migrations/${timestamp}_${target.suffix}`, blob],
      ['supabase/functions/fast-courier-api/index.ts', code]]),
    read: () => source,
  });
  test(`${key}: identical SQL with a different timestamp skips production`, () => {
    assert.equal(shouldRun(state('20260903'), state('20260903000100'), key), false);
  });
  test(`${key}: installing guard and updating timestamp references skips production`, () => {
    const legacy = parse(current);
    delete legacy.jobs.changes;
    delete legacy.jobs[target.job].needs;
    delete legacy.jobs[target.job].if;
    delete legacy.on.pull_request;
    legacy.on.push.paths = legacy.on.push.paths.filter(p => p !== '.github/scripts/**');
    const source = stringify(legacy).replace(/(?:20260903000[12]00|\*)_(add_package_contents|add_fast_courier_quotes)/g, '20260903_$1');
    assert.equal(shouldRun(state('20260903', undefined, source), state('20260903000100'), key), false);
  });
  test(`${key}: SQL edit, including rename plus edit, enables production`, () => {
    for (const timestamp of ['20260903', '20260903000100']) {
      assert.equal(shouldRun(state('20260903'), state(timestamp, '100644 blob changed'), key), true);
    }
  });
  test(`${key}: real deployment job edit enables production`, () => {
    const modified = parse(current);
    modified.jobs[target.job].steps.push({ run: 'echo changed deployment configuration' });
    assert.equal(shouldRun(state('20260903'), state('20260903', undefined, stringify(modified)), key), true);
  });
  test(`${key}: operational workflow settings still count`, () => {
    const modified = parse(current);
    modified.permissions.contents = 'write';
    assert.equal(shouldRun(state('20260903'), state('20260903', undefined, stringify(modified)), key), true);
  });
  test(`${key}: courier code edits affect only courier deployment`, () => {
    assert.equal(shouldRun(state('20260903'), state('20260903', undefined, current, '100644 blob changed'), key), key === 'courier');
  });
  test(`${key}: missing or ambiguous migrations fail closed`, () => {
    const missing = state('20260903');
    missing.files.clear();
    assert.throws(() => shouldRun(state('20260903'), missing, key), /exactly one migration/);
    const duplicate = state('20260903');
    duplicate.files.set(`supabase/migrations/20260903000100_${target.suffix}`, '100644 blob sql');
    assert.throws(() => shouldRun(state('20260903'), duplicate, key), /exactly one migration/);
  });
  test(`${key}: production requires successful changes job and rejects PR events`, () => {
    const workflow = parse(current);
    assert.equal(workflow.jobs[target.job].needs, 'changes');
    assert.equal(workflow.jobs[target.job].if, jobCondition);
    assert.deepEqual(workflow.on.push.branches, ['main']);
    assert.ok(workflow.on.push.paths.includes(`supabase/migrations/*_${target.suffix}`));
    assert.equal(workflow.permissions.contents, 'read');
    assert.doesNotMatch(stringify(workflow.jobs.changes), /secrets\.|supabase\s|curl\s/);
    assert.equal(workflow.jobs.changes.steps[0].with['fetch-depth'], 0);
  });
}

test('all repository workflows parse as YAML with unique keys', () => {
  for (const name of readdirSync('.github/workflows').filter(n => /\.ya?ml$/.test(n))) {
    const workflow = parse(readFileSync(`.github/workflows/${name}`, 'utf8'), { uniqueKeys: true });
    assert.ok(workflow.on && workflow.jobs, name);
  }
});
test('missing/zero commit bases never enable production', () => {
  assert.throws(() => snapshot(''), /commit SHA/);
  assert.throws(() => snapshot('0'.repeat(40)), /commit SHA/);
});
test('manual dispatch remains explicit and PR event cannot enable production', () => {
  const run = event => execFileSync(process.execPath, ['.github/scripts/production-changes.mjs', 'package'], {
    encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(run('workflow_dispatch'), 'run=true\n');
  assert.throws(() => run('pull_request')); // Missing comparison inputs must fail, never permit a job.
});
