"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import AuthModal from "../features/auth/AuthModal";
import AuthSection from "../features/auth/AuthSection";
import { useAuth } from "../features/auth/use-auth";
import { useAuthDialog } from "../features/auth/use-auth-dialog";
import ChatPreview from "../features/chat/ChatPreview";
import CreditsSection from "../features/credits/CreditsSection";
import { useCredits } from "../features/credits/use-credits";
import { useLaunchPromotion } from "../features/credits/use-launch-promotion";
import { publicationCreditAccess, publicationQuote } from "../features/credits/promotion-model";
import HomeHero from "../features/home/HomeHero";
import PublicationAssistant from "../features/publication/PublicationAssistant";
import QualitySection from "../features/quality/QualitySection";
import SalesAssistantSection from "../features/sales-assistant/SalesAssistantSection";
import CatalogSection from "../features/vehicles/CatalogSection";
import VehicleDetail from "../features/vehicles/VehicleDetail";
import { useVehicleCatalog } from "../features/vehicles/use-vehicle-catalog";
import { isSellerRole } from "../lib/roles";

const ChatInbox = dynamic(() => import("../features/chat/ChatInbox"), {
  loading: () => <p role="status">Cargando conversaciones...</p>,
});
const InspectionSection = dynamic(() => import("../features/inspections/InspectionSection"), {
  loading: () => <p role="status">Cargando revisiones...</p>,
});
const OwnerListings = dynamic(() => import("../features/vehicles/OwnerListings"), {
  loading: () => <p role="status">Cargando tus publicaciones...</p>,
});

export default function HomePage() {
  const [chatOpen, setChatOpen] = useState(false);
  const assistantRef = useRef(null);
  const { intent: authIntent, open: openAuth, close: closeAuth } = useAuthDialog();

  const auth = useAuth();
  const draftUserId = auth.session?.user?.id || null;
  const [draftScope, setDraftScope] = useState({ userId: null, version: 0 });
  if (draftScope.userId !== draftUserId) {
    // A visitor may finish signing in after starting a draft. Leaving an
    // authenticated account must always discard its private fields and files.
    setDraftScope({ userId: draftUserId, version: draftScope.version + (draftScope.userId ? 1 : 0) });
  }
  const credits = useCredits(auth.session);
  const launch = useLaunchPromotion();
  const creditAccess = publicationCreditAccess(credits.balance, launch.promotion, auth.profile?.role);
  const catalog = useVehicleCatalog({
    onPublished: credits.refresh,
    profile: auth.profile,
    session: auth.session,
  });

  const canSeePrice = Boolean(auth.session);
  const canChat = Boolean(auth.session);
  const canPublish = isSellerRole(auth.profile?.role)
    && !auth.profile?.is_blocked && !launch.isLoading && !launch.error && creditAccess.canPublish;
  const publishAccessMessage = auth.profile?.is_blocked ? "Tu cuenta está bloqueada. Contactá a soporte."
    : !isSellerRole(auth.profile?.role) ? "Tu cuenta no tiene permiso para publicar vehículos."
    : credits.isLoading || launch.isLoading ? "Consultando tus créditos de publicación..."
    : credits.status || launch.error || (creditAccess.phase === 'scheduled' ? "La promoción todavía no comenzó."
      : creditAccess.phase === 'review' ? "El período gratuito terminó. Administración debe definir la continuidad; no se genera ningún cargo."
      : credits.balance?.expired ? "Tus créditos vencieron. Contactá a soporte para renovarlos."
      : `Necesitás ${creditAccess.cost} créditos para publicar. Contactá a soporte.`);

  useEffect(() => {
    if (!auth.session || !auth.profile || !authIntent) return;
    const timer = window.setTimeout(() => {
      closeAuth();
      if (authIntent === "chat") setChatOpen(true);
      else assistantRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [auth.session, auth.profile, authIntent, closeAuth]);

  function handlePublishClick() {
    if (auth.session) {
      assistantRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      auth.startRegistration("publish");
      openAuth("publish");
    }
  }

  return (
    <main>
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={() => catalog.setSelectedVehicle(catalog.catalogVehicles[0])}
        >
          <span className="mark">VX</span>
          <span>VELOX</span>
        </button>

        <nav>
          <a href="#como-funciona">Como funciona</a>
          <a href="#catalogo">Buscar</a>
          <a href="#cuenta">Cuenta</a>
          <Link href="/preguntas">Preguntas frecuentes</Link>
          <Link href="/demo">Probar demo</Link>
          {auth.session && <a href="#conversaciones">Mensajes</a>}
          {isSellerRole(auth.profile?.role) && <a href="#mis-publicaciones">Mis publicaciones</a>}
        </nav>

        {auth.profile ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {auth.profile.role === "admin" && (
              <Link href="/velox-admin" className="adminPill">⚙ Admin</Link>
            )}
            <button className="accountPill" type="button" onClick={auth.logout}>
              {auth.profile.display_name} | salir
            </button>
          </div>
        ) : (
          <button className="primary headerCta" type="button" onClick={handlePublishClick}>
            Vender mi vehiculo
          </button>
        )}
      </header>

      <HomeHero onPublishClick={handlePublishClick} />

      <CatalogSection
        canSeePrice={canSeePrice}
        catalogStatus={catalog.catalogStatus}
        isLoading={catalog.isLoading}
        onRetry={catalog.refresh}
        onSelect={catalog.setSelectedVehicle}
        selectedVehicle={catalog.selectedVehicle}
        vehicles={catalog.catalogVehicles}
      />

      {catalog.selectedVehicle && <VehicleDetail
        key={catalog.selectedVehicle.id}
        canChat={canChat}
        canSeePrice={canSeePrice}
        onOpenChat={() => {
          if (auth.session) setChatOpen(true);
          else { auth.startRegistration("chat"); openAuth("chat"); }
        }}
        vehicle={catalog.selectedVehicle}
      />}

      <AuthSection
        authBusy={auth.authBusy}
        authForm={auth.authForm}
        authMode={auth.authMode}
        authStatus={auth.authStatus}
        onSubmit={auth.submitAuth}
        profile={auth.profile}
        setAuthForm={auth.setAuthForm}
        setAuthMode={auth.setAuthMode}
      />

      {auth.session && <ChatInbox key={`inbox:${auth.session.user.id}`} session={auth.session} />}
      {auth.session && isSellerRole(auth.profile?.role) && <OwnerListings
        key={`listings:${auth.session.user.id}`}
        session={auth.session}
        profile={auth.profile}
        onChanged={catalog.refresh}
      />}

      <div ref={assistantRef} style={{ scrollMarginTop: "92px" }}>
        <PublicationAssistant
          key={`publication:${draftScope.version}`}
          creditCost={creditAccess.cost}
          publicationQuote={publicationQuote(launch.promotion, auth.profile?.role)}
          freeRefill={creditAccess.autoRefill}
          canPublish={canPublish}
          onNeedAuth={handlePublishClick}
          onPublish={catalog.publishVehicle}
          profile={auth.profile}
          publishStatus={catalog.publishStatus}
          publishAccessMessage={publishAccessMessage}
        />
      </div>

      {catalog.selectedVehicle && <>
      <QualitySection vehicle={catalog.selectedVehicle} />
      <SalesAssistantSection key={catalog.selectedVehicle.id} vehicle={catalog.selectedVehicle} />
      </>}
      {(catalog.selectedVehicle || ["mechanic", "admin"].includes(auth.profile?.role)) &&
      <InspectionSection
        key={`${auth.session?.user?.id}:${auth.profile?.role}:${catalog.selectedVehicle?.id}`}
        profile={auth.profile}
        session={auth.session}
        vehicle={catalog.selectedVehicle}
      />}

      <CreditsSection
        launch={launch}
        balance={credits.balance}
        profile={auth.profile}
        status={credits.status}
      />

      {chatOpen && auth.session && catalog.selectedVehicle && (
        <ChatPreview
          onClose={() => setChatOpen(false)}
          session={auth.session}
          vehicle={catalog.selectedVehicle}
        />
      )}

      {authIntent && (
        <AuthModal
          authBusy={auth.authBusy}
          authForm={auth.authForm}
          authMode={auth.authMode}
          authStatus={auth.authStatus}
          intent={authIntent}
          onClose={closeAuth}
          onSubmit={auth.submitAuth}
          profile={auth.profile}
          setAuthForm={auth.setAuthForm}
          setAuthMode={auth.setAuthMode}
        />
      )}
    </main>
  );
}
