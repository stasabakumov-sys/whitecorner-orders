// Read Git objects only. No database or deployment access is needed.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';

export const targets = {
  package: { workflow: 'apply-package-contents.yml', job: 'migrate', suffix: 'add_package_contents.sql' },
  courier: { workflow: 'deploy-fast-courier.yml', job: 'deploy', suffix: 'add_fast_courier_quotes.sql', directory: 'supabase/functions/fast-courier-api/' },
};
export const jobCondition = "${{ github.event_name != 'pull_request' && needs.changes.outputs.run == 'true' }}";
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

export function snapshot(ref) {
  // Reject missing/zero/ambiguous push bases instead of enabling production.
  if (!/^[0-9a-f]{40}$/.test(ref) || /^0+$/.test(ref)) throw new Error('A full, nonzero commit SHA is required');
  git('cat-file', '-e', `${ref}^{commit}`);
  const files = new Map(git('ls-tree', '-r', '-z', ref).split('\0').filter(Boolean).map(record => {
    const [metadata, name] = record.split('\t');
    return [name, metadata]; // includes mode and blob: executable/mode changes also count
  }));
  return { files, read: name => git('show', `${ref}:${name}`) };
}

function migration(state, suffix) {
  const matches = [...state.files].filter(([name]) => name.startsWith('supabase/migrations/') &&
    new RegExp(`^\\d+_${suffix.replaceAll('.', '\\.')}$`).test(name.split('/').at(-1)));
  if (matches.length !== 1) throw new Error(`Expected exactly one migration for ${suffix}`);
  return matches[0][1];
}

export function operationalWorkflow(source, target) {
  // Timestamp-only references and the read-only guard's wiring are not deployment changes.
  const normalized = source.replace(/(?:\d+|\*)_(add_package_contents|add_fast_courier_quotes)\.sql/g, '$1.sql');
  const workflow = parse(normalized, { uniqueKeys: true });
  if (!workflow?.jobs?.[target.job]) throw new Error('Missing production job');
  delete workflow.jobs.changes;
  const job = workflow.jobs[target.job];
  if (job.needs === 'changes') delete job.needs;
  if (job.if === jobCondition) delete job.if;
  // PR events and helper paths only run validation; production is push/manual only.
  delete workflow.on.pull_request;
  if (workflow.on.push?.paths) workflow.on.push.paths = workflow.on.push.paths.filter(p => p !== '.github/scripts/**');
  return workflow;
}

export function shouldRun(before, after, key) {
  const target = targets[key];
  if (!target) throw new Error('Unknown target');
  const sqlChanged = migration(before, target.suffix) !== migration(after, target.suffix);
  const workflowPath = `.github/workflows/${target.workflow}`;
  const workflowChanged = !isDeepStrictEqual(operationalWorkflow(before.read(workflowPath), target), operationalWorkflow(after.read(workflowPath), target));
  const subtree = state => [...state.files].filter(([name]) => target.directory && name.startsWith(target.directory)).sort();
  return sqlChanged || workflowChanged || !isDeepStrictEqual(subtree(before), subtree(after));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [key, before, after] = process.argv.slice(2);
  const event = process.env.GITHUB_EVENT_NAME;
  if (!['push', 'pull_request', 'workflow_dispatch', undefined].includes(event)) throw new Error('Unsupported event');
  // Retain explicit manual operation, but never permit PR jobs to access production.
  const run = event === 'workflow_dispatch' ? true : shouldRun(snapshot(before), snapshot(after), key);
  const output = `run=${event === 'pull_request' ? false : run}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  process.stdout.write(output);
}
