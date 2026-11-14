import { useCallback, useEffect, useState } from "react";
import { AuthContext } from "./auth-context";
import { supabase } from "../services/supabase";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;
    let initialized = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      initialized = true;
      setSession(nextSession);

      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      }

      if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
      }

      setLoading(false);
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted || initialized) return;

        if (error) {
          console.error("Session restoration failed:", error.message);
          setSession(null);
        } else {
          setSession(data.session);
        }

        setLoading(false);
      })
      .catch((error) => {
        if (!mounted || initialized) return;

        console.error("Session restoration failed:", error);
        setSession(null);
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
        queryParams: {
          prompt: "select_account",
        },
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

  const updatePassword = useCallback(async (password) => {
    const result = await supabase.auth.updateUser({ password });

    if (!result.error) {
      setIsPasswordRecovery(false);
    }

    return result;
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    isPasswordRecovery,
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