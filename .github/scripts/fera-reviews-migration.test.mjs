import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw Error('Pass the PGlite package path');
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema storage;
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    create function public.wc_is_hub_manager() returns boolean language sql stable as $$select true$$;
    create function public.wc_is_active_hub_member() returns boolean language sql stable as $$select true$$;
    create table public.wc_shipping_products(id uuid primary key);
    create table storage.buckets(
      id text primary key, name text not null, public boolean not null,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects(id uuid primary key, bucket_id text);
  `);
  await db.exec(await readFile('supabase/migrations/20261008000200_fera_reviews.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261009000100_fera_media_parts.sql', 'utf8'));
  const tables = await db.query(`
    select relname, relrowsecurity from pg_class
    where oid in ('public.wc_fera_reviews'::regclass, 'public.wc_fera_review_media'::regclass)
    order by relname
  `);
  assert.deepEqual(tables.rows.map(row => [row.relname, row.relrowsecurity]), [
    ['wc_fera_review_media', true], ['wc_fera_reviews', true],
  ]);
  const bucket = (await db.query("select public from storage.buckets where id='fera-review-media'")).rows[0];
  assert.equal(bucket.public, false);
  const productId = 'ef80258f-f7b4-4dc1-9a13-dbe624c8c315';
  await db.query('insert into public.wc_shipping_products(id) values($1)', [productId]);
  await db.query(`
    insert into public.wc_fera_reviews
      (fera_review_id, subject, wix_product_id, shipping_product_id, rating, source_state, source_data)
    values ('frev_one', 'product', 'wix-one', $1, 5, 'approved', '{"id":"frev_one"}')
  `, [productId]);
  await assert.rejects(db.query(`
    insert into public.wc_fera_reviews(fera_review_id, subject, rating, source_data)
    values ('frev_one', 'product', 5, '{}')
  `), /duplicate key/);
  await assert.rejects(db.query(`
    insert into public.wc_fera_reviews(fera_review_id, subject, wix_product_id, source_data)
    values ('frev_store', 'store', 'wix-one', '{}')
  `), /check constraint/);
  const reviewId = (await db.query("select id from public.wc_fera_reviews where fera_review_id='frev_one'")).rows[0].id;
  await db.query(`
    insert into public.wc_fera_review_media(review_id, fera_media_id, source_url)
    values ($1, 'fm_one', 'https://example.invalid/photo.jpg')
  `, [reviewId]);
  const parts = (await db.query("select storage_parts from public.wc_fera_review_media where fera_media_id='fm_one'")).rows[0];
  assert.deepEqual(parts.storage_parts, []);
  await assert.rejects(db.query(`
    insert into public.wc_fera_review_media(review_id, fera_media_id, source_url)
    values ($1, 'fm_one', 'https://example.invalid/another.jpg')
  `, [reviewId]), /duplicate key/);
  const policies = await db.query(`
    select tablename, policyname from pg_policies
    where schemaname='public' and tablename in ('wc_fera_reviews','wc_fera_review_media')
    order by tablename, policyname
  `);
  assert.equal(policies.rows.length, 4);
  await db.exec(await readFile('supabase/migrations/20261009000200_fera_review_publication.sql', 'utf8'));
  const published = (await db.query("select is_published, public_author_name from public.wc_fera_reviews where fera_review_id='frev_one'")).rows[0];
  assert.equal(published.is_published, true);
  assert.equal(published.public_author_name, null);
  assert.equal((await db.query("select has_table_privilege('anon','public.wc_fera_reviews','SELECT') allowed")).rows[0].allowed, false);
  assert.equal((await db.query("select count(*)::int count from pg_policies where tablename='wc_fera_reviews' and policyname='fera_reviews_manager_update'")).rows[0].count, 1);
  await db.exec(await readFile('supabase/migrations/20261009000300_fera_review_product_override.sql', 'utf8'));
  const overrides = (await db.query(`select
    has_column_privilege('authenticated','public.wc_fera_reviews','product_override_id','UPDATE') override_allowed,
    has_column_privilege('authenticated','public.wc_fera_reviews','shipping_product_id','UPDATE') source_link_editable`)).rows[0];
  assert.equal(overrides.override_allowed, true);
  assert.equal(overrides.source_link_editable, false);
  console.log('Fera review migration rehearsal passed');
} finally {
  await db.close();
}
