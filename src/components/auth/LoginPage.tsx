import React, { useState } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { getInitials } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
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
  CheckCircle2,
  Search,
  KeyRound,
  Building,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { teamMembers, setActiveMember, addTeamMember, isLoading } = useTeam();
  const { success, error } = useToast();

  const [authMode, setAuthMode] = useState<'profiles' | 'email' | 'register'>('profiles');
  const [searchMember, setSearchMember] = useState('');

  // Email login state
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState('Sales Representative');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredMembers = teamMembers.filter(
    (m) =>
      m.name.toLowerCase().includes(searchMember.toLowerCase()) ||
      (m.role && m.role.toLowerCase().includes(searchMember.toLowerCase())) ||
      (m.email && m.email.toLowerCase().includes(searchMember.toLowerCase()))
  );

  const handleSelectMember = (member: any) => {
    setActiveMember(member);
    success('Welcome back!', `Signed in as ${member.name} (${member.role || 'Team Member'})`);
  };

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      error('Missing Email', 'Please enter your email address.');
      return;
    }

    // Match by email in team members or create if not found
    const found = teamMembers.find(
      (m) => m.email?.toLowerCase().trim() === emailInput.toLowerCase().trim()
    );

    if (found) {
      setActiveMember(found);
      success('Authenticated!', `Signed in as ${found.name}`);
    } else {
      // Auto-fallback: extract name from email or log in
      const derivedName = emailInput.split('@')[0].replace(/[._]/g, ' ');
      const formattedName = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);
      
      addTeamMember(formattedName, emailInput.trim(), 'Team Member').then((newMem) => {
        success('Account Created & Logged In', `Welcome to the CRM, ${newMem.name}!`);
      });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) {
      error('Name Required', 'Please provide your full name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await addTeamMember(regName.trim(), regEmail.trim() || undefined, regRole);
      success('Welcome to the Team!', `Your workspace profile for ${created.name} is ready.`);
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
              <Sparkles className="w-3.5 h-3.5" />
              <span>Workspace Access Portal</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Sign In to Your Workspace
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Select your team profile or sign in with your credentials to manage contacts and outreach.
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
              <span className="truncate">Team Persona</span>
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
              <span className="truncate">Email & Passcode</span>
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
                      onClick={() => handleSelectMember(member)}
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
                        <span>Enter</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Not listed? Join as a new team member</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Email & Passcode Sign In */}
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
                    placeholder="udaysharma@ingversionsdigital.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    required
                    className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Workspace Passcode (Optional)</span>
                  <span className="text-[11px] text-slate-500 font-normal">Team Access Mode</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30"
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
                  placeholder="e.g. uday@company.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
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
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30"
              >
                {isSubmitting ? 'Creating Profile...' : 'Create Profile & Enter'}
              </Button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 py-4 px-6 text-center text-xs text-slate-500">
        Nexus Team CRM • Powered by Supabase Cloud, Composio Outlook Sync & LinkedIn Outreach Engine
      </footer>
    </div>
  );
};
