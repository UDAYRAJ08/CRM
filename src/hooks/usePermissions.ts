import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';

export type UserRole = 
  | 'Admin' 
  | 'Owner' 
  | 'Manager' 
  | 'Sales Lead' 
  | 'Sales Representative' 
  | 'Employee' 
  | 'Member';

export interface Permissions {
  role: string;
  roleTitle: string;
  isAdmin: boolean;
  isManager: boolean;
  isEmployee: boolean;
  // Granular Actions
  canDeleteContacts: boolean;
  canBulkDelete: boolean;
  canEditContacts: boolean;
  canCreateContacts: boolean;
  canManageCompanies: boolean;
  canManageTeam: boolean;
  canExportData: boolean;
  canSendEmail: boolean;
  canChangeStatus: boolean;
}

export function usePermissions(): Permissions {
  const { activeMember } = useTeam();
  const { user } = useAuth();

  // Normalize role string from active team member or auth metadata
  const rawRole = (
    activeMember?.role || 
    (user?.user_metadata?.role as string) || 
    'Sales Representative'
  ).trim();

  const lowerRole = rawRole.toLowerCase();

  const isAdmin = 
    lowerRole.includes('admin') || 
    lowerRole.includes('owner') || 
    lowerRole.includes('founder') ||
    lowerRole === 'ceo';

  const isManager = 
    isAdmin || 
    lowerRole.includes('manager') || 
    lowerRole.includes('lead') || 
    lowerRole.includes('director') ||
    lowerRole.includes('head');

  const isEmployee = !isAdmin && !isManager;

  // Title formatting for display
  let roleTitle = 'Sales Representative';
  if (isAdmin) {
    roleTitle = rawRole.toLowerCase().includes('owner') ? 'Workspace Owner' : 'Administrator';
  } else if (isManager) {
    roleTitle = rawRole.toLowerCase().includes('lead') ? 'Sales Lead' : 'Sales Manager';
  } else {
    roleTitle = rawRole || 'Sales Representative';
  }

  return {
    role: rawRole,
    roleTitle,
    isAdmin,
    isManager,
    isEmployee,
    // Deletion is strictly reserved for Admins
    canDeleteContacts: isAdmin,
    canBulkDelete: isAdmin,
    // Editing existing records is allowed for Admins and Managers
    canEditContacts: isAdmin || isManager,
    // Any team member can create new leads/contacts
    canCreateContacts: true,
    // Company management restricted to Admins & Managers
    canManageCompanies: isAdmin || isManager,
    // Team member invitations and role changes are Admin-only
    canManageTeam: isAdmin,
    // Data export restricted to Admins & Managers to prevent list theft
    canExportData: isAdmin || isManager,
    // Any employee can send emails & outreach
    canSendEmail: true,
    // Status transitions: allowed for Admins & Managers, employees can advance workflow
    canChangeStatus: true,
  };
}
