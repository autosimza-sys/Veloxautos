"use client";

import { useEffect, useRef, useState } from "react";
import Info from "../components/Info";
import AuthModal from "../features/auth/AuthModal";
import AuthSection from "../features/auth/AuthSection";
import { useAuth } from "../features/auth/use-auth";
import ChatPreview from "../features/chat/ChatPreview";
import CreditsSection from "../features/credits/CreditsSection";
import { useCredits } from "../features/credits/use-credits";
import HomeHero from "../features/home/HomeHero";
import InspectionSection from "../features/inspections/InspectionSection";
import PublicationAssistant from "../features/publication/PublicationAssistant";
import QualitySection from "../features/quality/QualitySection";
import SalesAssistantSection from "../features/sales-assistant/SalesAssistantSection";
import CatalogSection from "../features/vehicles/CatalogSection";
import VehicleDetail from "../features/vehicles/VehicleDetail";
import { useVehicleCatalog } from "../features/vehicles/use-vehicle-catalog";
import { isSellerRole } from "../lib/roles";

export default function HomePage() {
  const [chatOpen, setChatOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [publishIntent, setPublishIntent] = useState(false);
  const assistantRef = useRef(null);

  const auth = useAuth();
  const credits = useCredits(auth.session);
  const catalog = useVehicleCatalog({
    onPublished: credits.refresh,
    profile: auth.profile,
    session: auth.session,
  });

  const canSeePrice = Boolean(auth.session);
  const canChat = Boolean(auth.session);
  const canPublish = isSellerRole(auth.profile?.role)
    && (credits.balance === null || credits.balance.remaining > 0);

  // Cuando el usuario se autentica con intención de publicar → cerrar modal y scrollear
  useEffect(() => {
    if (auth.session && publishIntent) {
      setPublishIntent(false);
      // Pequeño delay para que el perfil se cargue y el DOM se actualice
      setTimeout(() => {
        setAuthModalOpen(false);
        assistantRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
    }
  }, [auth.session, publishIntent]);

  function handlePublishClick() {
    if (auth.session) {
      assistantRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      auth.setAuthMode("register");
      setPublishIntent(true);
      setAuthModalOpen(true);
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
        </nav>

        {auth.profile ? (
          <button className="accountPill" type="button" onClick={auth.logout}>
            {auth.profile.display_name} | salir
          </button>
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
        onSelect={catalog.setSelectedVehicle}
        selectedVehicle={catalog.selectedVehicle}
        vehicles={catalog.catalogVehicles}
      />

      <VehicleDetail
        canChat={canChat}
        canSeePrice={canSeePrice}
        isSeller={canPublish}
        onOpenChat={() => setChatOpen(true)}
        vehicle={catalog.selectedVehicle}
      />

      <AuthSection
        authForm={auth.authForm}
        authMode={auth.authMode}
        authStatus={auth.authStatus}
        onSubmit={auth.submitAuth}
        profile={auth.profile}
        setAuthForm={auth.setAuthForm}
        setAuthMode={auth.setAuthMode}
      />

      <div ref={assistantRef} style={{ scrollMarginTop: "92px" }}>
        <PublicationAssistant
          canPublish={canPublish}
          onNeedAuth={handlePublishClick}
          onPublish={catalog.publishVehicle}
          profile={auth.profile}
          publishStatus={catalog.publishStatus}
        />
      </div>

      <QualitySection vehicle={catalog.selectedVehicle} />
      <SalesAssistantSection vehicle={catalog.selectedVehicle} />
      <InspectionSection
        profile={auth.profile}
        session={auth.session}
        vehicle={catalog.selectedVehicle}
      />

      <CreditsSection
        balance={credits.balance}
        profile={auth.profile}
        status={credits.status}
      />

      <section className="section adminPreview" id="admin">
        <div>
          <p className="eyebrow">Panel admin</p>
          <h2>Administracion segura en preparacion</h2>
        </div>
        <div className="adminStats">
          <Info label="Usuarios" value="Datos reales proximamente" />
          <Info label="Publicaciones" value={catalog.catalogVehicles.length} />
          <Info label="Pagos pendientes" value="Modulo pendiente" />
          <Info label="Denuncias" value="Modulo pendiente" />
        </div>
      </section>

      {chatOpen && (
        <ChatPreview
          onClose={() => setChatOpen(false)}
          session={auth.session}
          vehicle={catalog.selectedVehicle}
        />
      )}

      {authModalOpen && (
        <AuthModal
          authForm={auth.authForm}
          authMode={auth.authMode}
          authStatus={auth.authStatus}
          onClose={() => { setAuthModalOpen(false); setPublishIntent(false); }}
          onSubmit={auth.submitAuth}
          profile={auth.profile}
          setAuthForm={auth.setAuthForm}
          setAuthMode={auth.setAuthMode}
        />
      )}
    </main>
  );
}
