"use client";

export default function AuthModal({
  authForm,
  authMode,
  authStatus,
  onClose,
  onSubmit,
  profile,
  setAuthForm,
  setAuthMode,
}) {
  // Si el usuario acaba de autenticarse, mostrar estado de éxito
  const isSuccess = profile || (authStatus && authStatus.includes("podés publicar"));

  return (
    <div
      className="chatModal"
      role="dialog"
      aria-modal="true"
      aria-label="Crear cuenta o ingresar"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="authModal">
        <header className="authModalHeader">
          <div>
            <p className="eyebrow">Para publicar en VELOX</p>
            <h3>{authMode === "login" ? "Ingresá a tu cuenta" : "Creá tu cuenta gratis"}</h3>
          </div>
          <button className="close" type="button" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        {isSuccess ? (
          <div className="authModalBody">
            <div className="signedBox">
              <b>✓ Sesión activa</b>
              <span>{profile?.display_name || authForm.email}</span>
              <span>Continuando a publicar tu vehículo...</span>
            </div>
          </div>
        ) : (
          <form className="authModalBody" onSubmit={onSubmit}>
            <div className="authTabs">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                Ya tengo cuenta
              </button>
              <button
                type="button"
                className={authMode === "register" ? "active" : ""}
                onClick={() => setAuthMode("register")}
              >
                Crear cuenta
              </button>
            </div>

            {authMode === "register" && (
              <>
                <label>
                  Nombre completo
                  <input
                    required
                    placeholder="Tu nombre"
                    value={authForm.displayName}
                    onChange={(event) => setAuthForm({ ...authForm, displayName: event.target.value })}
                  />
                </label>
                <label>
                  Teléfono
                  <input
                    placeholder="Opcional"
                    value={authForm.phone}
                    onChange={(event) => setAuthForm({ ...authForm, phone: event.target.value })}
                  />
                </label>
                <label>
                  Tipo de vendedor
                  <select
                    value={authForm.role}
                    onChange={(event) => setAuthForm({ ...authForm, role: event.target.value })}
                  >
                    <option value="particular">Particular — quiero vender mi auto</option>
                    <option value="reseller">Revendedor — vendo varios autos</option>
                    <option value="agency">Agencia — soy una concesionaria</option>
                  </select>
                </label>
                {["reseller", "agency"].includes(authForm.role) && (
                  <label>
                    Nombre comercial
                    <input
                      value={authForm.businessName}
                      onChange={(event) => setAuthForm({ ...authForm, businessName: event.target.value })}
                    />
                  </label>
                )}
              </>
            )}

            <label>
              Email
              <input
                type="email"
                required
                placeholder="tu@email.com"
                value={authForm.email}
                onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                required
                minLength="6"
                placeholder="Mínimo 6 caracteres"
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
              />
            </label>

            <button className="primary" type="submit">
              {authMode === "login" ? "Ingresar" : "Crear cuenta y publicar"}
            </button>

            {authStatus && (
              <p className={
                authStatus.toLowerCase().includes("error") ||
                authStatus.toLowerCase().includes("invalid") ||
                authStatus.toLowerCase().includes("incorrecto") ||
                authStatus.toLowerCase().includes("incorr")
                  ? "authError"
                  : "authStatus"
              }>
                {authStatus}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
