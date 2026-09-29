// Authentication is verified by GoTrue; membership is read afresh on every action.
export class HubAccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}

export async function requireHubMember(db: any, userId: string, manager = false) {
  const {data, error} = await db.from('wc_hub_members').select('role,active').eq('user_id', userId).maybeSingle();
  if (error) throw new HubAccessError('Hub access could not be verified. Retry.', 503);
  if (!data?.active || !['worker', 'manager'].includes(data.role)) throw new HubAccessError('Active Hub membership required.');
  if (manager && data.role !== 'manager') throw new HubAccessError('Manager access required.');
  return data;
}

export async function requireHubSession(req: Request, db: any, manager = false) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') || '');
  if (!match) throw new HubAccessError('Authentication required.', 401);
  const {data, error} = await db.auth.getUser(match[1]);
  if (error || !data?.user) throw new HubAccessError('Authentication required.', 401);
  await requireHubMember(db, data.user.id, manager);
  return data.user;
}

// Only explicitly listed jobs accept the exact runtime service credential.
// A JWT's decoded role claim or an apikey header is never authorization.
export async function requireHubJobOrSession(req: Request, db: any, serviceKey: string, allowJob: boolean, manager = false) {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') || '')?.[1];
  if (allowJob && serviceKey && token === serviceKey) return null;
  return await requireHubSession(req, db, manager);
}
