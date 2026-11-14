import { useCallback, useEffect, useState } from "react";
import { AuthContext } from "./auth-context";
import { supabase } from "../services/supabase";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let initialized = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      initialized = true;
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || initialized) return;

      if (error) {
        console.error("Session restoration failed:", error.message);
        setSession(null);
      } else {
        setSession(data.session);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
const signInWithGoogle = useCallback(() => {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
   redirectTo: window.location.origin,
      queryParams: { prompt: "select_account" },
    },
  });
}, []);

  const signInWithEmail = useCallback((email, password) => {
    return supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
  }, []);

  const signUpWithEmail = useCallback((email, password) => {
    return supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
emailRedirectTo: window.location.origin,
      },
    });
  }, []);

  const signOut = useCallback(() => {
    return supabase.auth.signOut({ scope: "local" });
  }, []);

  const resetPassword = useCallback((email) => {
    return supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  }, []);

  const updatePassword = useCallback((password) => {
    return supabase.auth.updateUser({ password });
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
    updatePassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
