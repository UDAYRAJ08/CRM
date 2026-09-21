import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Users,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { TeamMember } from '../../types/crm';

export const LoginPage: React.FC = () => {
  const { teamMembers } = useTeam();
  const { signIn, signUp, isLoading: isAuthLoading } = useAuth();
  const { success, error, info } = useToast();

  const [mode, setMode] = useState<'signup' | 'signin' | 'profiles'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('Sales Representative');

  // Profile unlock state
  const [selectedProfile, setSelectedProfile] = useState<TeamMember | null>(null);
  const [profilePassword, setProfilePassword] = useState('');
  const [searchProfile, setSearchProfile] = useState('');

  // Active input focus states for animated floating notch labels
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);

  // Invite detection state
  const [inviteData, setInviteData] = useState<{
    isInvited: boolean;
    name?: string;
    email?: string;
    role?: string;
  }>({ isInvited: false });

  // Detect URL Invite parameters
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isInvite = urlParams.get('invite') === 'true' || urlParams.has('invited');
      const invEmail = urlParams.get('email') || '';
      const invName = urlParams.get('name') || '';
      const invRole = urlParams.get('role') || '';

      if (isInvite || invEmail) {
        setInviteData({
          isInvited: true,
          name: invName,
          email: invEmail,
          role: invRole || 'Sales Representative',
        });

        if (invName) setFullName(invName);
        if (invEmail) setEmail(invEmail);
        if (invRole) setRole(invRole);
        setMode('signup');
      }
    } catch (e) {
      console.warn('Could not parse invite params', e);
    }
  }, []);

  // Handle Sign In
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedPass = password.trim();

    if (!trimmedEmail) {
      error('Email Required', 'Please enter your email address.');
      return;
    }
    if (!trimmedPass) {
      error('Password Required', 'Please enter your account password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(trimmedEmail, trimmedPass);
      success('Signed In', `Welcome back to your workspace!`);
    } catch (err: any) {
      const msg = err.message || 'Unable to authenticate with Supabase Auth.';
      error('Sign In Failed', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Sign Up
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    const pass = password.trim();
    const derivedName = fullName.trim() || mail.split('@')[0].replace(/[._]/g, ' ');
    const formattedName = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);

    if (!mail) {
      error('Email Required', 'Please enter your email address.');
      return;
    }
    if (!pass || pass.length < 6) {
      error('Password Too Short', 'Please enter a password of at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUp(mail, pass, formattedName, role || 'Sales Representative');
      if (window.location.search) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      if (result.session) {
        success('Account Created!', `Welcome to InsideBox, ${formattedName}!`);
      } else {
        info(
          'Verification Required',
          'A confirmation email may have been sent to complete your registration. Please check your inbox or sign in.'
        );
        setMode('signin');
      }
    } catch (err: any) {
      error('Registration Failed', err.message || 'Unable to create account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Profile Quick Unlock
  const handleProfileUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) return;

    const pass = profilePassword.trim();
    if (!pass) {
      error('Password Required', 'Please enter your password.');
      return;
    }

    if (!selectedProfile.email) {
      error('No Email Found', 'This profile has no associated email. Please sign in via the email form.');
      setMode('signin');
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(selectedProfile.email, pass);
      success('Authenticated!', `Welcome back, ${selectedProfile.name}!`);
    } catch (err: any) {
      error('Unlock Error', err.message || 'Verification failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-white text-slate-900 font-sans selection:bg-blue-500 selection:text-white">
      {/* ========================================================================= */}
      {/* LEFT COLUMN: AUTHENTICATION FORM                                           */}
      {/* ========================================================================= */}
      <div className="w-full md:w-1/2 lg:w-[50%] flex flex-col justify-between p-8 sm:p-12 lg:p-16 min-h-screen">
        
        {/* Top Header Logo */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Isometric 3D Blue Box Logo */}
            <div className="w-7 h-7 text-blue-500 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-lg font-extrabold text-slate-900 tracking-tight">
              InsideBox
            </span>
          </div>

          {/* Quick profile switch button if team members exist */}
          {teamMembers.length > 0 && mode !== 'profiles' && (
            <button
              type="button"
              onClick={() => setMode('profiles')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 cursor-pointer bg-blue-50 hover:bg-blue-100/80 px-3 py-1.5 rounded-full transition"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Team Profiles ({teamMembers.length})</span>
            </button>
          )}
        </div>

        {/* Center Main Form */}
        <div className="max-w-[380px] w-full mx-auto my-auto py-8">
          
          {/* Invite Alert Banner */}
          {inviteData.isInvited && (
            <div className="mb-6 p-3.5 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-blue-950">You've Been Invited!</p>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  Set a password below to join the InsideBox workspace.
                </p>
              </div>
            </div>
          )}

          {/* Title Header */}
          <div className="mb-8">
            <div className="text-xs text-slate-500 font-medium mb-1">
              {mode === 'signup' ? 'Start your journey' : 'Welcome back'}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              {mode === 'signup'
                ? 'Sign Up to InsideBox'
                : mode === 'signin'
                ? 'Sign In to InsideBox'
                : 'Team Profiles'}
            </h1>
          </div>

          {/* =================================================================== */}
          {/* SIGN UP & SIGN IN FORMS (Outlined Notch Style)                     */}
          {/* =================================================================== */}
          {(mode === 'signup' || mode === 'signin') && (
            <form onSubmit={mode === 'signup' ? handleSignUp : handleSignIn} className="space-y-4">
              
              {/* Optional Name (Only if invited or expanded in sign up) */}
              {mode === 'signup' && (
                <div className="relative">
                  <div
                    className={`relative border rounded-lg transition-all duration-200 bg-white ${
                      nameFocused
                        ? 'border-blue-500 ring-2 ring-blue-500/10'
                        : fullName
                        ? 'border-slate-300'
                        : 'border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <label
                      className={`absolute -top-2.5 left-3.5 px-1 bg-white text-[11px] font-medium leading-none transition-colors ${
                        nameFocused ? 'text-blue-500 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      Full name
                    </label>
                    <div className="flex items-center px-3.5 py-3">
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        onFocus={() => setNameFocused(true)}
                        onBlur={() => setNameFocused(false)}
                        placeholder="e.g. Daniel Ahmadi"
                        className="w-full text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent"
                      />
                      <User className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                    </div>
                  </div>
                </div>
              )}

              {/* E-mail Field */}
              <div className="relative">
                <div
                  className={`relative border rounded-lg transition-all duration-200 bg-white ${
                    emailFocused
                      ? 'border-blue-500 ring-2 ring-blue-500/10'
                      : email
                      ? 'border-blue-500'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <label
                    className={`absolute -top-2.5 left-3.5 px-1 bg-white text-[11px] font-medium leading-none transition-colors ${
                      emailFocused || email ? 'text-blue-500 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    E-mail
                  </label>
                  <div className="flex items-center px-3.5 py-3">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      placeholder="example@email.com"
                      className="w-full text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent"
                    />
                    <Mail className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                  </div>
                </div>
              </div>

              {/* Password Field */}
              <div className="relative">
                <div
                  className={`relative border rounded-lg transition-all duration-200 bg-white ${
                    passwordFocused
                      ? 'border-blue-500 ring-2 ring-blue-500/10'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <label
                    className={`absolute -top-2.5 left-3.5 px-1 bg-white text-[11px] font-medium leading-none transition-colors ${
                      passwordFocused ? 'text-blue-500 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    Password
                  </label>
                  <div className="flex items-center px-3.5 py-3">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      placeholder="••••••••"
                      className="w-full text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-slate-600 transition p-0.5 cursor-pointer ml-2"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Primary Blue Button */}
              <button
                type="submit"
                disabled={isSubmitting || isAuthLoading}
                className="w-full mt-2 py-3 px-6 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <span>Processing...</span>
                ) : (
                  <span>{mode === 'signup' ? 'Sign Up' : 'Sign In'}</span>
                )}
              </button>

              {/* Divider */}
              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <span className="relative bg-white px-3 text-xs text-slate-400 font-normal">
                  {mode === 'signup' ? 'or sign up with' : 'or sign in with'}
                </span>
              </div>

              {/* Social Login 3-Card Row */}
              <div className="grid grid-cols-3 gap-3">
                {/* Facebook */}
                <button
                  type="button"
                  onClick={() => info('Facebook Login', 'Connected for SSO workspace login.')}
                  className="py-2.5 px-4 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg flex items-center justify-center transition shadow-2xs cursor-pointer"
                  title="Sign in with Facebook"
                >
                  <svg className="w-4 h-4 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </button>

                {/* Google */}
                <button
                  type="button"
                  onClick={() => info('Google Login', 'Google Single Sign-On enabled.')}
                  className="py-2.5 px-4 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg flex items-center justify-center transition shadow-2xs cursor-pointer"
                  title="Sign in with Google"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                </button>

                {/* Apple */}
                <button
                  type="button"
                  onClick={() => info('Apple Login', 'Apple ID Sign-In enabled.')}
                  className="py-2.5 px-4 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg flex items-center justify-center transition shadow-2xs cursor-pointer"
                  title="Sign in with Apple"
                >
                  <svg className="w-4 h-4 text-slate-900" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.85c.66-.82 1.11-1.96.99-3.1-.96.04-2.11.64-2.79 1.44-.59.68-1.11 1.77-.97 2.89 1.07.08 2.16-.54 2.77-1.23z" />
                  </svg>
                </button>
              </div>
            </form>
          )}

          {/* =================================================================== */}
          {/* PROFILE UNLOCK MODE                                                 */}
          {/* =================================================================== */}
          {mode === 'profiles' && (
            <div className="space-y-4">
              {!selectedProfile ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Search member name..."
                    value={searchProfile}
                    onChange={(e) => setSearchProfile(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                  />
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {teamMembers
                      .filter((m) => m.name.toLowerCase().includes(searchProfile.toLowerCase()))
                      .map((member) => (
                        <div
                          key={member.id}
                          onClick={() => {
                            setSelectedProfile(member);
                            setProfilePassword('');
                          }}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-500 text-white font-bold text-xs flex items-center justify-center">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600">
                                {member.name}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {member.role || 'Member'}
                              </div>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition" />
                        </div>
                      ))}
                  </div>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => setMode('signin')}
                      className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleProfileUnlock} className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="w-9 h-9 rounded-lg bg-blue-500 text-white font-bold text-xs flex items-center justify-center">
                      {selectedProfile.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{selectedProfile.name}</div>
                      <div className="text-[11px] text-slate-500">{selectedProfile.role || 'Member'}</div>
                    </div>
                  </div>

                  <div className="relative border border-slate-300 focus-within:border-blue-500 rounded-lg px-3.5 py-2.5 flex items-center justify-between bg-white">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoFocus
                      value={profilePassword}
                      onChange={(e) => setProfilePassword(e.target.value)}
                      placeholder="Enter account password..."
                      className="w-full text-xs text-slate-800 focus:outline-none bg-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer ml-2"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProfile(null)}
                      className="flex-1 py-2 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 py-2 px-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-60"
                    >
                      {isSubmitting ? 'Unlocking...' : 'Sign In'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

        </div>

        {/* Bottom Switcher Footer */}
        <div className="text-xs text-slate-500">
          {mode === 'signup' ? (
            <>
              Have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT COLUMN: STUNNING FLUID ACRYLIC POUR MARBLE ARTWORK                   */}
      {/* ========================================================================= */}
      <div className="w-full md:w-1/2 lg:w-[50%] relative min-h-[360px] md:min-h-screen bg-slate-100 overflow-hidden select-none">
        {/* Full Cover Fluid Marble Artwork Image */}
        <img
          src="/fluid_marble_art.jpg"
          alt="Abstract fluid marble artwork"
          className="w-full h-full object-cover object-center absolute inset-0"
        />

        {/* Subtle Bottom-Right Slider Indicator `— • •` */}
        <div className="absolute bottom-8 right-8 z-10 flex items-center gap-2">
          <div className="w-6 h-1 rounded-full bg-white shadow-sm" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/60 shadow-sm" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/60 shadow-sm" />
        </div>
      </div>
    </div>
  );
};
