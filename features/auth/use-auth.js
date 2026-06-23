"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase-client";

const emptyAuthForm = {
  email: "",
  password: "",
  displayName: "",
  phone: "",
  role: "registered",
  businessName: "",
};

export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(emptyAuthForm);
  const [authStatus, setAuthStatus] = useState("");

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        await loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!error && data) setProfile(data);
    return data || null;
  }

  async function ensureProfile(user = session?.user) {
    if (!user) return profile;
    if (profile?.id === user.id) return profile;

    const metadata = user.user_metadata || {};
    const fallbackProfile = {
      id: user.id,
      display_name: metadata.display_name || user.email,
      phone: metadata.phone || "",
      role: metadata.role || "registered",
      business_name: metadata.business_name || "",
    };

    const { data } = await supabase
      .from("profiles")
      .insert(fallbackProfile)
      .select()
      .single();

    if (data) {
      setProfile(data);
      return data;
    }

    return loadProfile(user.id);
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthStatus("Procesando...");

    if (!supabase) {
      setAuthStatus("Falta conectar Supabase.");
      return;
    }

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: authForm.email,
        password: authForm.password,
      });
      setAuthStatus(error ? error.message : "Sesion iniciada.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: authForm.email,
      password: authForm.password,
      options: {
        data: {
          display_name: authForm.displayName || authForm.email,
          phone: authForm.phone,
          role: authForm.role,
          business_name: authForm.businessName,
        },
      },
    });

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    if (!data.user) {
      setAuthStatus("Revisa tu email para confirmar la cuenta.");
      return;
    }

    if (data.session) {
      await ensureProfile(data.user);
      await loadProfile(data.user.id);
      setAuthStatus("Cuenta creada. Ya podes usar VELOX.");
    } else {
      setAuthStatus("Cuenta creada. Revisa tu email para confirmar el acceso.");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setAuthStatus("Sesion cerrada.");
  }

  return {
    authForm,
    authMode,
    authStatus,
    ensureProfile,
    logout,
    profile,
    session,
    setAuthForm,
    setAuthMode,
    submitAuth,
  };
}
