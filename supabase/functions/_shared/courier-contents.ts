// Use reference-data strings verbatim; display labels and package names are not API values.
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
const generalAliases = new Set(['general', 'generalothers', 'generalother', 'other', 'others', 'generalgoods']);

export function resolveCourierContents(request: any, response: any) {
  const values = response?.body?.data;
  if (response?.http_status !== 200 || response.body?.status !== true || !Array.isArray(values)
      || !values.length || values.some((v: unknown) => typeof v !== 'string' || !v.trim())) {
    throw Error('Fast Courier package content types are unavailable. No quote requested.');
  }
  const allowed: string[] = [...new Set<string>(values)];
  return {...request, items: request.items.map((item: any) => {
    const saved = typeof item.contents === 'string' ? item.contents : '';
    if (allowed.includes(saved)) return {...item, contents: saved};
    const matches = allowed.filter(v => key(v) === key(saved));
    // Older HUB requests stored General/Others, General, Other or a box description.
    const candidates = matches.length ? matches : allowed.filter(v => generalAliases.has(key(v)));
    if (candidates.length !== 1) {
      throw Error('Fast Courier has no unambiguous general package content type. Review /package-contents-list. No quote requested.');
    }
    return {...item, contents: candidates[0]};
  })};
}
