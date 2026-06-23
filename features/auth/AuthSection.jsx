import { roleLabel } from "../../lib/roles";

export default function AuthSection({
  authForm,
  authMode,
  authStatus,
  onSubmit,
  profile,
  setAuthForm,
  setAuthMode,
}) {
  return (
    <section className="section authSection" id="cuenta">
      <div>
        <p className="eyebrow">Cuenta real</p>
        <h2>Registro y acceso con Supabase</h2>
        <p>
          Tu cuenta conecta publicaciones, conversaciones, agenda y servicios
          sin exponer tus datos personales.
        </p>
      </div>

      <form className="authCard" onSubmit={onSubmit}>
        <div className="authTabs">
          <button
            type="button"
            className={authMode === "login" ? "active" : ""}
            onClick={() => setAuthMode("login")}
          >
            Entrar
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
              Nombre
              <input
                required
                value={authForm.displayName}
                onChange={(event) => setAuthForm({ ...authForm, displayName: event.target.value })}
              />
            </label>
            <label>
              Telefono
              <input
                value={authForm.phone}
                onChange={(event) => setAuthForm({ ...authForm, phone: event.target.value })}
              />
            </label>
            <label>
              Tipo de cuenta
              <select
                value={authForm.role}
                onChange={(event) => setAuthForm({ ...authForm, role: event.target.value })}
              >
                <option value="registered">Registrado</option>
                <option value="particular">Particular</option>
                <option value="reseller">Revendedor</option>
                <option value="agency">Agencia</option>
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
            value={authForm.email}
            onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
          />
        </label>
        <label>
          Contrasena
          <input
            type="password"
            required
            minLength="6"
            value={authForm.password}
            onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
          />
        </label>

        <button className="primary" type="submit">
          {authMode === "login" ? "Entrar" : "Crear cuenta"}
        </button>

        {authStatus && <p className="authStatus">{authStatus}</p>}
        {profile && (
          <div className="signedBox">
            <b>Sesion activa</b>
            <span>{profile.display_name}</span>
            <span>Cuenta: {roleLabel(profile.role)}</span>
          </div>
        )}
      </form>
    </section>
  );
}
