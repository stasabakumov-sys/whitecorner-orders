import {applySql, candidateSql, targetSize, validateCandidate} from './historical-backdrop-size.sql.mjs';

const mode = process.argv[2];
if (!['--verify', '--apply'].includes(mode)) throw Error('Use --verify or --apply');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error('Supabase access token required');

async function query(sql, read_only = true) {
  const response = await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query', {
    method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: sql, read_only}),
  });
  if (!response.ok) throw Error(`Production database query failed (HTTP ${response.status})`);
  return response.json();
}

const before = await query(candidateSql);
const alreadySaved = validateCandidate(before);
console.log(JSON.stringify({preflight: 'passed', order: '10846', targetSize, alreadySaved}));
if (mode === '--verify') process.exit(0);
if (!alreadySaved) await query(applySql, false);
validateCandidate(await query(candidateSql), true);
console.log(JSON.stringify({release: 'verified', order: '10846', size: targetSize}));
