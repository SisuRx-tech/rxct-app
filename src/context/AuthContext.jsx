import { useCallback, useEffect, useState } from "react";
import { AuthContext } from "./auth-context";
import { supabase } from "../services/supabase";
import { setActiveAccount } from "../services/accountStorage";
import { mergeUserProfileMetadata } from "../services/userProfile";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;
    let initialized = false;

    const applySession = (nextSession) => {
      setActiveAccount(nextSession?.user?.id ?? null);
      setSession(nextSession);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;
        initialized = true;
        applySession(nextSession);
        if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
        if (event === "SIGNED_OUT") setIsPasswordRecovery(false);
        setLoading(false);
      },
    );

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted || initialized) return;
        if (error) {
          console.error("Session restoration failed:", error.message);
          applySession(null);
        } else {
          applySession(data.session);
        }
        setLoading(false);
      })
      .catch((error) => {
        if (!mounted || initialized) return;
        console.error("Session restoration failed:", error);
        applySession(null);
        setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(() => supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: "select_account" },
    },
  }), []);

  const signInWithEmail = useCallback((email, password) =>
    supabase.auth.signInWithPassword({ email: email.trim(), password }), []);

  const signUpWithEmail = useCallback((email, password) =>
    supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    }), []);

  const resendSignupEmail = useCallback((email) => supabase.auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin },
  }), []);

  const signOut = useCallback(() =>
    supabase.auth.signOut({ scope: "local" }), []);

  const resetPassword = useCallback((email) =>
    supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    }), []);

  const updatePassword = useCallback(async (password) => {
    if (!isPasswordRecovery) {
      return { error: new Error("A valid password recovery link is required.") };
    }
    return supabase.auth.updateUser({ password });
  }, [isPasswordRecovery]);

  const updateProfile = useCallback(async (updates) => {
    if (!session?.user) {
      return { error: new Error("You must be signed in to update your profile.") };
    }

    const metadata = mergeUserProfileMetadata(
      session.user.user_metadata || {},
      updates,
    );
    const result = await supabase.auth.updateUser({ data: metadata });

    if (!result.error && result.data?.user) {
      setSession((current) => current ? {
        ...current,
        user: result.data.user,
      } : current);
    }

    return result;
  }, [session]);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    isPasswordRecovery,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendSignupEmail,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
