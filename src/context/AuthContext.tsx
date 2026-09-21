import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ user: User | null; session: Session | null }>;
  signUp: (email: string, password: string, fullName?: string, role?: string) => Promise<{ user: User | null; session: Session | null }>;
  signOut: () => Promise<void>;
  authError: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOCAL_AUTH_USER_KEY = 'crm_local_auth_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setAuthError(null);
  }, []);

  // Initialize session and listen to auth changes
  useEffect(() => {
    let isMounted = true;

    if (!isSupabaseConfigured || !supabase) {
      // Offline / Local development fallback
      const savedLocalUser = localStorage.getItem(LOCAL_AUTH_USER_KEY);
      if (savedLocalUser) {
        try {
          const parsed = JSON.parse(savedLocalUser);
          setUser(parsed);
          setSession({ user: parsed } as unknown as Session);
        } catch {
          // ignore
        }
      }
      setIsLoading(false);
      return;
    }

    // 1. Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session: initSession }, error }) => {
        if (!isMounted) return;
        if (error) {
          console.warn('Error fetching Supabase session:', error.message);
        }
        setSession(initSession);
        setUser(initSession?.user ?? null);
      })
      .catch((err) => {
        if (isMounted) console.error('Supabase getSession failure:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // 2. Listen to auth state transitions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Sign In with Email & Password
  const signIn = async (email: string, password: string) => {
    setAuthError(null);

    if (!isSupabaseConfigured || !supabase) {
      // Local fallback mock user
      const mockId = 'local-user-' + email.replace(/[^a-zA-Z0-9]/g, '-');
      const mockUser = {
        id: mockId,
        email,
        user_metadata: { full_name: email.split('@')[0] },
      } as unknown as User;
      const mockSession = { user: mockUser } as unknown as Session;
      localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(mockUser));
      setUser(mockUser);
      setSession(mockSession);
      return { user: mockUser, session: mockSession };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (error) {
      setAuthError(error.message);
      throw error;
    }

    setUser(data.user);
    setSession(data.session);
    return data;
  };

  // Sign Up with Email & Password
  const signUp = async (email: string, password: string, fullName?: string, role?: string) => {
    setAuthError(null);

    if (!isSupabaseConfigured || !supabase) {
      const mockId = 'local-user-' + email.replace(/[^a-zA-Z0-9]/g, '-');
      const mockUser = {
        id: mockId,
        email,
        user_metadata: { full_name: fullName, role },
      } as unknown as User;
      const mockSession = { user: mockUser } as unknown as Session;
      localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(mockUser));
      setUser(mockUser);
      setSession(mockSession);
      return { user: mockUser, session: mockSession };
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: {
        data: {
          full_name: fullName || '',
          role: role || 'Sales Representative',
        },
      },
    });

    if (error) {
      setAuthError(error.message);
      throw error;
    }

    if (data.session) {
      setUser(data.user);
      setSession(data.session);
    }
    return data;
  };

  // Sign Out
  const signOut = async () => {
    setAuthError(null);
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem(LOCAL_AUTH_USER_KEY);
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        signIn,
        signUp,
        signOut,
        authError,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
