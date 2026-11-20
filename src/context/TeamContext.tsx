import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TeamMember } from '../types/crm';
import { db, invalidateCache } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { hashPassword } from '../lib/authCrypto';

interface TeamContextValue {
  teamMembers: TeamMember[];
  activeMember: TeamMember | null;
  setActiveMember: (member: TeamMember) => void;
  logout: () => Promise<void>;
  addTeamMember: (name: string, email?: string, role?: string, authUserId?: string, pin?: string) => Promise<TeamMember>;
  updateMemberRole: (memberId: string, role: string) => Promise<void>;
  updateMemberPin: (memberId: string, pin: string) => Promise<void>;
  verifyMemberPin: (memberId: string, pin: string) => Promise<boolean>;
  isPickerOpen: boolean;
  setIsPickerOpen: (open: boolean) => void;
  refreshTeam: () => Promise<void>;
  isLoading: boolean;
}

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

const ACTIVE_MEMBER_KEY = 'crm_active_member_id';

export const TeamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signOut: authSignOut } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [activeMember, setActiveMemberState] = useState<TeamMember | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Supabase sends several auth events per sign-in, each with a new user object. Re-run only when the
  // login changes, or two runs race and both create a team member row. Primitives keep the deps stable.
  const userId = user?.id;
  const userEmail = user?.email;
  const metadataName = user?.user_metadata?.full_name as string | undefined;

  const refreshTeam = useCallback(async () => {
    if (!userId) {
      setActiveMemberState(null);
      setIsLoading(false);
      return;
    }

    try {
      const members = await db.getTeamMembers();
      setTeamMembers(members);

      // 1. Look for team member already linked by auth_user_id
      let matched = members.find((m) => m.auth_user_id === userId);

      // 2. If not matched, try matching by email and link auth_user_id
      if (!matched && userEmail) {
        matched = members.find(
          (m) => m.email?.toLowerCase().trim() === userEmail.toLowerCase().trim()
        );
        if (matched) {
          await db.linkTeamMemberAuth(matched.id, userId);
          matched = { ...matched, auth_user_id: userId };
        }
      }

      // 3. If user has no team member record, auto-create one
      if (!matched) {
        const fallbackName = userEmail ? userEmail.split('@')[0] : 'Team Member';
        const formattedName =
          metadataName ||
          fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1).replace(/[._]/g, ' ');
        const isFirstUser = members.length === 0;
        // Never from user_metadata: the user picks that at sign-up.
        const role = isFirstUser ? 'Admin' : 'Sales Representative';

        try {
          matched = await db.addTeamMember({
            name: formattedName,
            email: userEmail || '',
            role,
            auth_user_id: userId,
          });
          setTeamMembers((prev) => [...prev, matched!]);
        } catch (e) {
          // Another run created this login's row first (unique on auth_user_id): use that row.
          invalidateCache('team_members');
          const fresh = await db.getTeamMembers();
          setTeamMembers(fresh);
          matched = fresh.find((m) => m.auth_user_id === userId);
          if (!matched) throw e;
        }
      }

      // 4. Preserve currently active persona if selected in localStorage
      const savedMemberId = localStorage.getItem(ACTIVE_MEMBER_KEY);
      const savedMember = savedMemberId
        ? members.find((m) => m.id === savedMemberId) || (matched && matched.id === savedMemberId ? matched : null)
        : null;

      if (savedMember) {
        setActiveMemberState(savedMember);
      } else if (matched) {
        setActiveMemberState(matched);
        localStorage.setItem(ACTIVE_MEMBER_KEY, matched.id);
      }
    } catch (e) {
      console.error('Failed to resolve authenticated team member', e);
    } finally {
      setIsLoading(false);
    }
  }, [userId, userEmail, metadataName]);

  useEffect(() => {
    refreshTeam();
  }, [refreshTeam]);

  const setActiveMember = (member: TeamMember) => {
    setActiveMemberState(member);
    localStorage.setItem(ACTIVE_MEMBER_KEY, member.id);
    setIsPickerOpen(false);
  };

  const logout = async () => {
    setActiveMemberState(null);
    localStorage.removeItem(ACTIVE_MEMBER_KEY);
    await authSignOut();
  };

  const addTeamMember = async (
    name: string,
    email?: string,
    role?: string,
    authUserId?: string,
    pin?: string
  ): Promise<TeamMember> => {
    const hashedPin = pin?.trim() ? await hashPassword(pin.trim()) : undefined;
    const created = await db.addTeamMember({
      name: name.trim(),
      email: email ? email.trim() : undefined,
      role: role || 'Member',
      auth_user_id: authUserId,
      pin: hashedPin,
    });
    setTeamMembers((prev) => [...prev, created]);
    return created;
  };

  const updateMemberRole = async (memberId: string, newRole: string) => {
    await db.updateTeamMember(memberId, { role: newRole });
    setTeamMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );
    if (activeMember?.id === memberId) {
      setActiveMemberState((prev) => (prev ? { ...prev, role: newRole } : null));
    }
  };

  const updateMemberPin = async (memberId: string, newPin: string) => {
    const pinHash = newPin.trim() ? await hashPassword(newPin.trim()) : '';
    await db.updateTeamMember(memberId, { pin: pinHash });
    setTeamMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, pin: pinHash } : m))
    );
    if (activeMember?.id === memberId) {
      setActiveMemberState((prev) => (prev ? { ...prev, pin: pinHash } : null));
    }
  };

  const verifyMemberPin = async (memberId: string, inputPin: string): Promise<boolean> => {
    const target = teamMembers.find((m) => m.id === memberId);
    if (!target) return false;
    // If no PIN is configured, allow passage (persona has no lock)
    if (!target.pin || !target.pin.trim()) return true;
    const inputHash = await hashPassword(inputPin.trim());
    return target.pin === inputHash;
  };

  return (
    <TeamContext.Provider
      value={{
        teamMembers,
        activeMember,
        setActiveMember,
        logout,
        addTeamMember,
        updateMemberRole,
        updateMemberPin,
        verifyMemberPin,
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
