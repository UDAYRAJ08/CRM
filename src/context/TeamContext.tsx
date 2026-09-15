import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TeamMember } from '../types/crm';
import { db } from '../lib/supabase';

interface TeamContextValue {
  teamMembers: TeamMember[];
  activeMember: TeamMember | null;
  setActiveMember: (member: TeamMember) => void;
  logout: () => void;
  addTeamMember: (name: string, email?: string, role?: string) => Promise<TeamMember>;
  isPickerOpen: boolean;
  setIsPickerOpen: (open: boolean) => void;
  refreshTeam: () => Promise<void>;
  isLoading: boolean;
}

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

const ACTIVE_MEMBER_KEY = 'crm_active_member_id';

export const TeamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [activeMember, setActiveMemberState] = useState<TeamMember | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshTeam = useCallback(async () => {
    try {
      const members = await db.getTeamMembers();
      setTeamMembers(members);

      const savedId = localStorage.getItem(ACTIVE_MEMBER_KEY);
      if (savedId) {
        const found = members.find((m) => m.id === savedId);
        if (found) {
          setActiveMemberState(found);
          return;
        }
      }

      // If no valid saved session, keep activeMember as null to prompt login
      setActiveMemberState(null);
    } catch (e) {
      console.error('Failed to load team members', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshTeam();
  }, [refreshTeam]);

  const setActiveMember = (member: TeamMember) => {
    setActiveMemberState(member);
    localStorage.setItem(ACTIVE_MEMBER_KEY, member.id);
    setIsPickerOpen(false);
  };

  const logout = () => {
    setActiveMemberState(null);
    localStorage.removeItem(ACTIVE_MEMBER_KEY);
  };

  const addTeamMember = async (name: string, email?: string, role?: string): Promise<TeamMember> => {
    const created = await db.addTeamMember({
      name: name.trim(),
      email: email ? email.trim() : undefined,
      role: role || 'Member',
    });
    setTeamMembers((prev) => [...prev, created]);
    setActiveMember(created);
    return created;
  };

  return (
    <TeamContext.Provider
      value={{
        teamMembers,
        activeMember,
        setActiveMember,
        logout,
        addTeamMember,
        isPickerOpen,
        setIsPickerOpen,
        refreshTeam,
        isLoading,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
};

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
}
