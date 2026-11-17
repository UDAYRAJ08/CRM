import { describe, it, expect } from 'vitest';
import { isListAdminRole } from '../usePermissions';

// Must match is_crm_admin() in supabase/contact_lists.sql.
describe('isListAdminRole', () => {
  it('accepts only the exact Admin role', () => {
    expect(isListAdminRole('Admin')).toBe(true);
    expect(isListAdminRole(' Admin ')).toBe(false);
    expect(isListAdminRole('admin')).toBe(false);
    expect(isListAdminRole('Owner')).toBe(false);
    expect(isListAdminRole('CEO')).toBe(false);
    expect(isListAdminRole(undefined)).toBe(false);
  });
});
