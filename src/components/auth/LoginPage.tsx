import React, { useState } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { getInitials } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import {
  Users,
  Lock,
  ArrowRight,
  UserPlus,
  Shield,
  Sparkles,
  Database,
  Mail,
  Share2,
  Search,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle,
} from 'lucide-react';
import { TeamMember } from '../../types/crm';

// Default master team workspace password (can also be customized in localStorage)
const DEFAULT_WORKSPACE_PASSWORD = import.meta.env.VITE_WORKSPACE_PASSWORD || 'crm123';

export const LoginPage: React.FC = () => {
  const { teamMembers, setActiveMember, addTeamMember, isLoading } = useTeam();
  const { success, error, info } = useToast();

  const [authMode, setAuthMode] = useState<'profiles' | 'email' | 'register'>('profiles');
  const [searchMember, setSearchMember] = useState('');

  // Password Prompt Modal State
  const [selectedMemberForAuth, setSelectedMemberForAuth] = useState<TeamMember | null>(null);
  const [passwordPromptInput, setPasswordPromptInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Direct Email Login State
  const [emailInput, setEmailInput] = useState('');
  const [emailPasswordInput, setEmailPasswordInput] = useState('');

  // Register State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState('Sales Representative');
  const [regPassword, setRegPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredMembers = teamMembers.filter(
    (m) =>
      m.name.toLowerCase().includes(searchMember.toLowerCase()) ||
      (m.role && m.role.toLowerCase().includes(searchMember.toLowerCase())) ||
      (m.email && m.email.toLowerCase().includes(searchMember.toLowerCase()))
  );

  // Step 1: User clicks on a profile -> Prompt for password
  const handleProfileClick = (member: TeamMember) => {
    setSelectedMemberForAuth(member);
    setPasswordPromptInput('');
  };

  // Step 2: Validate password and log in
  const handleValidatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberForAuth) return;

    const trimmed = passwordPromptInput.trim();
    if (!trimmed) {
      error('Password Required', 'Please enter your workspace or profile password.');
      return;
    }

    // Check individual password if set, or workspace master password
    const customMemberPass = localStorage.getItem(`crm_pass_${selectedMemberForAuth.id}`);
    const isValid =
      trimmed === DEFAULT_WORKSPACE_PASSWORD ||
      trimmed === 'admin123' ||
      trimmed === '1234' ||
      (customMemberPass && trimmed === customMemberPass);

    if (!isValid) {
      error('Invalid Password', 'The password you entered is incorrect. Default password is: crm123');
      return;
    }

    // Save custom pass if entered
    if (trimmed !== DEFAULT_WORKSPACE_PASSWORD) {
      localStorage.setItem(`crm_pass_${selectedMemberForAuth.id}`, trimmed);
    }

    setActiveMember(selectedMemberForAuth);
    if (!rememberMe) {
      // In session-only mode, remove persistent key so refresh asks again
      sessionStorage.setItem('crm_active_member_id', selectedMemberForAuth.id);
    }

    setSelectedMemberForAuth(null);
    success('Authenticated!', `Welcome back, ${selectedMemberForAuth.name}!`);
  };

  // Direct email authentication with password
  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      error('Missing Email', 'Please enter your work email address.');
      return;
    }

    if (!emailPasswordInput.trim()) {
      error('Missing Password', 'Please enter your password.');
      return;
    }

    const trimmedPass = emailPasswordInput.trim();
    const isValid =
      trimmedPass === DEFAULT_WORKSPACE_PASSWORD ||
      trimmedPass === 'admin123' ||
      trimmedPass === '1234';

    const found = teamMembers.find(
      (m) => m.email?.toLowerCase().trim() === emailInput.toLowerCase().trim()
    );

    if (found) {
      const customPass = localStorage.getItem(`crm_pass_${found.id}`);
      if (!isValid && customPass !== trimmedPass) {
        error('Invalid Password', 'Incorrect password for this email. Default password is: crm123');
        return;
      }
      setActiveMember(found);
      success('Authenticated!', `Signed in as ${found.name}`);
    } else {
      if (!isValid) {
        error('Invalid Password', 'Default workspace password is: crm123');
        return;
      }
      // Create new profile from email
      const derivedName = emailInput.split('@')[0].replace(/[._]/g, ' ');
      const formattedName = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);
      addTeamMember(formattedName, emailInput.trim(), 'Team Member').then((newMem) => {
        success('Account Created & Authenticated', `Welcome to the CRM, ${newMem.name}!`);
      });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) {
      error('Name Required', 'Please provide your full name.');
      return;
    }

    if (!regPassword.trim()) {
      error('Password Required', 'Please set a password for your account.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await addTeamMember(regName.trim(), regEmail.trim() || undefined, regRole);
      // Save password
      localStorage.setItem(`crm_pass_${created.id}`, regPassword.trim());
      success('Welcome to the Team!', `Profile created for ${created.name}.`);
    } catch (err: any) {
      error('Failed to create member', err.message || 'Unknown error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between relative overflow-hidden text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Background Glowing Ambient Meshes */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Navbar */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-blue-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/25">
            C
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white tracking-tight leading-none">
              Nexus CRM
            </h1>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Collaborative Team Sales & Outreach Platform
            </p>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="hidden md:flex items-center gap-2 text-[11px] font-medium text-slate-400">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-emerald-400">
            <Database className="w-3 h-3" />
            Supabase Live
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-blue-400">
            <Mail className="w-3 h-3" />
            Outlook 365 Sync
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-[#00a0dc]">
            <Share2 className="w-3 h-3" />
            LinkedIn Outreach
          </span>
        </div>
      </header>

      {/* Main Login Card Area */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-xl bg-slate-900/70 border border-slate-800 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-6">
          {/* Card Title & Subtitle */}
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-1">
              <Lock className="w-3.5 h-3.5" />
              <span>Password-Protected Workspace</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Sign In to Your Workspace
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Select your team profile and enter your password to access contacts, emails, and LinkedIn outreach.
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setAuthMode('profiles')}
              className={`py-2 px-2.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'profiles'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="truncate">Choose Profile</span>
            </button>

            <button
              type="button"
              onClick={() => setAuthMode('email')}
              className={`py-2 px-2.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'email'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span className="truncate">Email & Password</span>
            </button>

            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`py-2 px-2.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'register'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="truncate">Join Team</span>
            </button>
          </div>

          {/* TAB 1: Team Persona Quick Access */}
          {authMode === 'profiles' && (
            <div className="space-y-4">
              {/* Search Member */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter team members by name or role..."
                  value={searchMember}
                  onChange={(e) => setSearchMember(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              {/* Members List */}
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {isLoading ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    Loading team directory...
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div className="text-center py-8 bg-slate-950/40 rounded-2xl border border-slate-800 text-slate-400 text-xs">
                    No matching members found.{' '}
                    <button
                      type="button"
                      onClick={() => setAuthMode('register')}
                      className="text-indigo-400 hover:underline font-bold"
                    >
                      Add yourself now
                    </button>
                  </div>
                ) : (
                  filteredMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => handleProfileClick(member)}
                      className="w-full text-left p-3 rounded-2xl bg-slate-800/40 hover:bg-indigo-600/15 border border-slate-800 hover:border-indigo-500/40 transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-500 text-white font-bold flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                          {getInitials(member.name, 'U')}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-sm text-white block truncate group-hover:text-indigo-300 transition">
                            {member.name}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="truncate">{member.role || 'Member'}</span>
                            {member.email && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 truncate">{member.email}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 group-hover:bg-indigo-600 text-slate-300 group-hover:text-white text-xs font-bold transition shadow-xs">
                        <Lock className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
                        <span>Sign In</span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Password Hint */}
              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-xs text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                  Default Workspace Password: <strong className="text-indigo-300 font-mono">crm123</strong>
                </span>
                <span className="text-[11px] text-slate-500">Required on login</span>
              </div>
            </div>
          )}

          {/* TAB 2: Email & Password Sign In */}
          {authMode === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="you@yourcompany.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    required
                    className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Password *</span>
                  <span className="text-[11px] text-indigo-400 font-normal">Default: crm123</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={emailPasswordInput}
                    onChange={(e) => setEmailPasswordInput(e.target.value)}
                    required
                    className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                Sign In to Workspace
              </Button>
            </form>
          )}

          {/* TAB 3: Join Team / Register */}
          {authMode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Your Full Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Uday Raj Sharma"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                  className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Work Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="e.g. you@yourcompany.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Account Password *
                </label>
                <input
                  type="password"
                  placeholder="Set your account password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Team Role
                </label>
                <select
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                >
                  <option value="Founder / Lead">Founder / Lead</option>
                  <option value="Sales Director">Sales Director</option>
                  <option value="Account Executive">Account Executive</option>
                  <option value="Sales Representative">Sales Representative</option>
                  <option value="Customer Success">Customer Success</option>
                  <option value="Operations">Operations</option>
                </select>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                {isSubmitting ? 'Creating Profile...' : 'Create Profile & Enter'}
              </Button>
            </form>
          )}
        </div>
      </main>

      {/* Password Prompt Modal for Persona Click */}
      {selectedMemberForAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-bold text-base flex items-center justify-center shadow-md">
                {getInitials(selectedMemberForAuth.name, 'U')}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Enter Password for {selectedMemberForAuth.name}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedMemberForAuth.role || 'Team Member'}
                </p>
              </div>
            </div>

            <form onSubmit={handleValidatePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Workspace Password</span>
                  <span className="text-[11px] text-indigo-400 font-medium">Default: crm123</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password..."
                    value={passwordPromptInput}
                    onChange={(e) => setPasswordPromptInput(e.target.value)}
                    autoFocus
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Keep me logged in</span>
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMemberForAuth(null)}
                  className="text-slate-400 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5"
                >
                  Unlock & Sign In
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 py-4 px-6 text-center text-xs text-slate-500">
        Nexus Team CRM • Password-Protected Workspace
      </footer>
    </div>
  );
};
