import { queryContactsPage } from './contacts.ts';

function savedContact(contact: any) {
  return {
    id: contact.id,
    createdDate: contact.createdDate,
    updatedDate: contact.updatedDate,
    primaryInfo: { email: contact.primaryInfo?.email, phone: contact.primaryInfo?.phone },
    primaryEmail: { email: contact.primaryEmail?.email, subscriptionStatus: contact.primaryEmail?.subscriptionStatus },
    primaryPhone: { phone: contact.primaryPhone?.phone, formattedPhone: contact.primaryPhone?.formattedPhone, subscriptionStatus: contact.primaryPhone?.subscriptionStatus },
    lastActivity: { activityDate: contact.lastActivity?.activityDate, activityType: contact.lastActivity?.activityType },
    info: {
      name: { first: contact.info?.name?.first, last: contact.info?.name?.last },
      company: contact.info?.company,
      labelKeys: { items: contact.info?.labelKeys?.items },
      extendedFields: { items: {
        'members.membershipStatus': contact.info?.extendedFields?.items?.['members.membershipStatus'],
        'emailSubscriptions.subscriptionStatus': contact.info?.extendedFields?.items?.['emailSubscriptions.subscriptionStatus'],
      } },
    },
  };
}

export async function syncContacts(db: any, headers: Record<string,string>, site: string, call: typeof fetch = fetch) {
  const contacts = new Map<string, unknown>();
  let offset = 0;
  let expected: number | null = null;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await queryContactsPage({ offset }, headers, call);
    if (page.total === null || expected !== null && page.total !== expected) {
      throw new Error('Wix contact count changed during synchronization. Saved contacts were kept.');
    }
    expected = page.total;
    for (const contact of page.contacts) {
      if (contacts.has(contact.id)) throw new Error('Duplicate Wix contact. Saved contacts were kept.');
      contacts.set(contact.id, savedContact(contact));
    }
    if (page.nextOffset === null) {
      if (contacts.size !== expected) throw new Error('Incomplete Wix contact list. Saved contacts were kept.');
      const { data, error } = await db.rpc('wc_replace_wix_contacts', {
        p_site: site, p_expected: expected, p_contacts: [...contacts.values()],
      });
      if (error) throw new Error('Could not save contacts. The previous list was kept.');
      return { ok: true, total: data.total, syncedAt: data.synced_at };
    }
    if (page.nextOffset <= offset || page.nextOffset !== offset + page.contacts.length) {
      throw new Error('Wix contact pagination stopped. Saved contacts were kept.');
    }
    offset = page.nextOffset;
  }
  throw new Error('Wix contact page limit reached. Saved contacts were kept.');
}
