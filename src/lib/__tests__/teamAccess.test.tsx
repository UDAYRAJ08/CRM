import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { TeamProvider, useTeam } from '../../context/TeamContext';
import { db } from '../supabase';

vi.mock('../supabase', () => ({
  db: { getTeamMembers: vi.fn(), addTeamMember: vi.fn(), linkTeamMemberAuth: vi.fn() },
}));

let authUser: any = null;
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: authUser, signOut: vi.fn() }),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function resolveTeam() {
  let value: ReturnType<typeof useTeam> | undefined;
  const Probe = () => ((value = useTeam()), null);
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(<TeamProvider><Probe /></TeamProvider>);
    await new Promise((r) => setTimeout(r, 0)); // let refreshTeam's awaits settle inside act
  });
  act(() => root.unmount());
  return value!;
}

describe('team access gate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    authUser = { id: 'u-new', email: 'stranger@example.com', user_metadata: { role: 'Admin' } };
  });

  it('denies a login that is not on the team list and creates no member', async () => {
    (db.getTeamMembers as any).mockResolvedValue([{ id: 'tm1', name: 'Uday', email: 'uday@x.com', auth_user_id: 'u1' }]);
    const team = await resolveTeam();
    expect(team.accessDenied).toBe(true);
    expect(team.activeMember).toBeNull();
    expect(db.addTeamMember).not.toHaveBeenCalled();
  });

  it('links an invited member by email', async () => {
    (db.getTeamMembers as any).mockResolvedValue([{ id: 'tm2', name: 'Rahul', email: 'Stranger@Example.com' }]);
    const team = await resolveTeam();
    expect(team.accessDenied).toBe(false);
    expect(team.activeMember?.id).toBe('tm2');
    expect(db.linkTeamMemberAuth).toHaveBeenCalledWith('tm2', 'u-new');
  });

  it('makes the first login on an empty CRM the Admin', async () => {
    (db.getTeamMembers as any).mockResolvedValue([]);
    (db.addTeamMember as any).mockImplementation(async (m: any) => ({ id: 'tm-first', ...m }));
    const team = await resolveTeam();
    expect(team.accessDenied).toBe(false);
    expect(db.addTeamMember).toHaveBeenCalledWith(expect.objectContaining({ role: 'Admin', auth_user_id: 'u-new' }));
  });
});
