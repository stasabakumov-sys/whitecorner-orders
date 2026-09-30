import {readFile, appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {freshnessQuery} from './hub-storefront-freshness.mjs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error('SUPABASE_ACCESS_TOKEN is required');
async function sql(query) {
 const response = await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query', {
  method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
  body: JSON.stringify({query, read_only: true}), signal: AbortSignal.timeout(90000)
 });
 if (!response.ok) throw Error(`Read-only catalogue audit failed (${response.status}); provider body omitted`);
 return response.json();
}
const [{audit}] = await sql(freshnessQuery);
const [{available: cronAvailable}] = await sql("select to_regclass('cron.job') is not null as available");
let cron = {available: cronAvailable};
if (cronAvailable) {
 const [counts] = await sql("select count(*)::int as jobs, count(*) filter(where active)::int as active_jobs, count(*) filter(where active and command ilike '%wix-orders-sync%')::int as active_literal_wix_sync_jobs from cron.job");
 cron = {...cron,...counts, scope:'Literal wix-orders-sync endpoint references only; external schedulers are not inspected'};
}
const migrations = [];
for (const name of ['20260928000100_storefront_catalog','20260928000200_catalog_import_access','20260928000300_catalog_media_issues']) {
 const source = (await readFile(`supabase/migrations/${name}.sql`, 'utf8')).replaceAll('\r', '');
 const hash = createHash('md5').update(source).digest('hex');
 const [saved] = await sql(`select cardinality(statements)=1 and md5(replace(statements[1],E'\\r',''))='${hash}' as matches from supabase_migrations.schema_migrations where version='${name.slice(0,14)}'`);
 migrations.push({version: name.slice(0,14), matches: saved?.matches === true});
}
const report = {scope:'Saved Hub visibility, variant identities, prices and stock versus published catalogue. Newer read timestamps do not prove changed content. Media/text completeness and current Wix data require separate verification.',migrations,cron,...audit};
console.log(JSON.stringify(report,null,2));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Catalogue read-only audit\n\n\`\`\`json\n${JSON.stringify(report,null,2)}\n\`\`\`\n`);
if (migrations.some(m => !m.matches)) throw Error('Registered catalogue migrations differ from restored source; stop before release.');
