import React, { useEffect, useState } from 'react';
import { listsDb } from '../../lib/contactLists';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import type { ContactList } from '../../types/crm';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface AddToListModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactIds: string[];
  onDone: () => void;
}

const NEW = '__new__';

export const AddToListModal: React.FC<AddToListModalProps> = ({ isOpen, onClose, contactIds, onDone }) => {
  const { activeMember } = useTeam();
  const { success, error } = useToast();
  const [lists, setLists] = useState<ContactList[]>([]);
  const [choice, setChoice] = useState(NEW);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setChoice(NEW);
    setNewName('');
    listsDb
      .getLists()
      .then((all) => setLists(all.filter((l) => !l.archived)))
      .catch((e) => error('Could not load lists', e.message));
  }, [isOpen, error]);

  const save = async () => {
    setSaving(true);
    try {
      if (choice === NEW) {
        await listsDb.createList(newName, contactIds, { actorId: activeMember?.id });
        success('List created', `Saved ${contactIds.length} contacts as "${newName.trim()}".`);
      } else {
        const n = await listsDb.addToList(choice, contactIds, activeMember?.id);
        const name = lists.find((l) => l.id === choice)?.name;
        success('Added to list', n === 0 ? `All selected contacts were already in "${name}".` : `Added ${n} contacts to "${name}".`);
      }
      onDone();
      onClose();
    } catch (e: any) {
      error('Could not save list', e.message);
    } finally {
      setSaving(false);
    }
  };

  const canSave = choice !== NEW || newName.trim().length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add to list" description={`${contactIds.length} contacts selected`} maxWidth="md">
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="text-slate-700 font-medium">List</span>
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value={NEW}>+ New list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.total})
              </option>
            ))}
          </select>
        </label>
        {choice === NEW && (
          <label className="block text-sm">
            <span className="text-slate-700 font-medium">New list name</span>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Dubai Real Estate Nov"
              className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" isLoading={saving} disabled={!canSave} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
};
