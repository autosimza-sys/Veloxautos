"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase-client";

const emptyAuthForm = {
  email: "", password: "", displayName: "", phone: "", role: "particular", businessName: "",
};
const sellerRoles = ["particular", "reseller", "agency"];
const registrationRoles = ["registered", ...sellerRoles];

export function useAuth(client = supabase) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(emptyAuthForm);
  const [authStatus, setAuthStatus] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const submitting = useRef(false);
  const currentUserId = useRef(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    let version = 0;
    let timer;
    function applySession(nextSession) {
      if (!active) return;
      const request = ++version;
      const userId = nextSession?.user?.id || null;
      currentUserId.current = userId;
      setSession(nextSession);
      setProfile(null);
      window.clearTimeout(timer);
      if (!userId) return;
      // Never await another Supabase request inside its auth state callback.
      timer = window.setTimeout(async () => {
        try {
          const { data, error } = await client.from("profiles").select("*").eq("id", userId).single();
          if (!active || request !== version) return;
          if (error) setAuthStatus("No pudimos cargar tu perfil. Intentá ingresar nuevamente.");
          else setProfile(data);
        } catch {
          if (active && request === version) setAuthStatus("No pudimos cargar tu perfil. Revisá la conexión.");
        }
      }, 0);
    }
    const initialVersion = version;
    client.auth.getSession().then(({ data, error }) => {
      if (!active || version !== initialVersion) return;
      if (error) setAuthStatus("No pudimos recuperar la sesión. Intentá ingresar nuevamente.");
      else applySession(data.session);
    }).catch(() => {
      if (active) setAuthStatus("No pudimos recuperar la sesión. Revisá la conexión.");
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });
    return () => {
      active = false;
      version += 1;
      window.clearTimeout(timer);
      listener.subscription.unsubscribe();
    };
  }, [client]);

  async function ensureProfile(user = session?.user) {
    if (!user || !client) return null;
    if (profile?.id === user.id) return profile;
    const { data: existing } = await client.from("profiles").select("*").eq("id", user.id).single();
    if (existing) {
      if (currentUserId.current === user.id) setProfile(existing);
      return existing;
    }
    const metadata = user.user_metadata || {};
    const fallbackProfile = {
      id: user.id,
      display_name: metadata.display_name || user.email,
      phone: metadata.phone || "",
      role: sellerRoles.includes(metadata.role) ? metadata.role : "registered",
      business_name: metadata.business_name || "",
    };
    const { data, error } = await client.from("profiles").insert(fallbackProfile).select().single();
    if (error) return null;
    if (currentUserId.current === user.id) setProfile(data);
    return data;
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (!client) { setAuthStatus("Falta configurar la conexión de cuentas."); return; }
    submitting.current = true;
    setAuthBusy(true);
    setAuthStatus("Procesando...");
    try {
      if (authMode === "login") {
        const { error } = await client.auth.signInWithPassword({ email: authForm.email.trim(), password: authForm.password });
        setAuthStatus(error ? error.message : "Sesión iniciada.");
        if (!error) setAuthForm(current => ({ ...current, password: "" }));
        return;
      }
      const { data, error } = await client.auth.signUp({
        email: authForm.email.trim(), password: authForm.password,
        options: { data: {
          display_name: authForm.displayName || authForm.email,
          phone: authForm.phone,
          role: registrationRoles.includes(authForm.role) ? authForm.role : "registered",
          business_name: authForm.businessName,
        } },
      });
      if (error) { setAuthStatus(error.message); return; }
      setAuthForm(current => ({ ...current, password: "" }));
      if (data.session) {
        await ensureProfile(data.user);
        setAuthStatus("Cuenta creada. ¡Ya podés publicar!");
      } else {
        setAuthStatus("Revisá tu email para confirmar la cuenta y luego ingresá.");
      }
    } catch {
      setAuthStatus("No pudimos completar la operación. Revisá la conexión e intentá de nuevo.");
    } finally {
      submitting.current = false;
      setAuthBusy(false);
    }
  }

  async function logout() {
    if (!client) return;
    try {
      const { error } = await client.auth.signOut();
      if (error) { setAuthStatus("No se pudo cerrar la sesión. Intentá de nuevo."); return; }
      currentUserId.current = null;
      setSession(null);
      setProfile(null);
      setAuthForm(emptyAuthForm);
      setAuthStatus("Sesión cerrada.");
    } catch { setAuthStatus("No se pudo cerrar la sesión. Revisá la conexión."); }
  }

  return { authBusy, authForm, authMode, authStatus, ensureProfile, logout, profile, session, setAuthForm, setAuthMode, submitAuth };
}
