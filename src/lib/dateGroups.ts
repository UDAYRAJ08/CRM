import type { Contact } from '../types/crm';

export interface DateGroup {
  key: string;
  displayLabel: string;
  count: number;
  contacts: Contact[];
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Local-day key (YYYY-MM-DD) of when a contact was added. */
export const dateAddedKey = (c: Contact) => dayKey(new Date(c.created_at || Date.now()));

// Group contacts by Date Added (created_at), newest day first.
export function groupByDateAdded(contacts: Contact[]): DateGroup[] {
  const groups: { [key: string]: { rawDate: Date; contacts: Contact[] } } = {};

  contacts.forEach((contact) => {
    const d = new Date(contact.created_at || Date.now());
    const key = dayKey(d);
    if (!groups[key]) {
      groups[key] = {
        rawDate: d,
        contacts: [],
      };
    }
    groups[key].contacts.push(contact);
  });

  const todayKey = dayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, data]) => {
      const d = data.rawDate;
      let displayLabel = d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      if (key === todayKey) {
        displayLabel = `Today — ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;
      } else if (key === yesterdayKey) {
        displayLabel = `Yesterday — ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;
      }

      return {
        key,
        displayLabel,
        count: data.contacts.length,
        contacts: data.contacts,
      };
    });
}
