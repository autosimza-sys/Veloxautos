import { useEffect, useMemo, useState } from "react";

const ADMIN_USER = "admin";
const ADMIN_PASS = "v3l0x$2026";

const emptyDB = {
  users: [],
  vehicles: [],
  activity: []
};

function uid() {
  return Date.now() + Math.floor(Math.random() * 9999);
}

function money(n) {
  if (!n) return "$ --";
  return "$ " + Number(n).toLocaleString("es-AR");
}

export default function App() {
  const [db, setDb] = useState(() => {
    const saved = localStorage.getItem("veloxDB_PRO");
    return saved ? JSON.parse(saved) : emptyDB;
  });

  const [user, setUser] = useState(null);
  const [view, setView] = useState("home");
  const [selected, setSelected] = useState(null);

  const [loginForm, setLoginForm] = useState({ phone: "", pass: "" });

  const [registerForm, setRegisterForm] = useState({
    name: "",
    phone: "",
    pass: "",
    role: "user",
    businessName: ""
  });

  const [vehicleForm, setVehicleForm] = useState({
    type: "auto",
    saleType: "propio",
    title: "",
    brand: "",
    model: "",
    year: "",
    km: "",
    price: "",
    domain: "",
    location: "",
    phone: "",
    fuel: "nafta",
    desc: "",
    images: []
  });

  useEffect(() => {
    localStorage.setItem("veloxDB_PRO", JSON.stringify(db));
  }, [db]);

  const currentUser = useMemo(() => {
    if (!user || user.role === "admin") return user;
    return db.users.find(u => u.id === user.id) || user;
  }, [db.users, user]);

  function saveDB(next) {
    setDb(next);
  }

  function resetVehicleForm() {
    setVehicleForm({
      type: "auto",
      saleType: "propio",
      title: "",
      brand: "",
      model: "",
      year: "",
      km: "",
      price: "",
      domain: "",
      location: "",
      phone: "",
      fuel: "nafta",
      desc: "",
      images: []
    });
  }

  function register() {
    if (!registerForm.name || !registerForm.phone || !registerForm.pass) {
      alert("Completá nombre, teléfono y contraseña");
      return;
    }

    if (db.users.some(u => u.phone === registerForm.phone)) {
      alert("Ese teléfono ya está registrado");
      return;
    }

    const newUser = {
      id: uid(),
      ...registerForm,
      promoCredits: 10000,
      realCredits: 0
    };

    const next = {
      ...db,
      users: [...db.users, newUser],
      activity: [
        { id: uid(), text: `Nuevo registro: ${newUser.name}`, date: new Date().toLocaleString() },
        ...db.activity
      ]
    };

    saveDB(next);
    setUser(newUser);
    setView("home");
  }

  function login() {
    if (loginForm.phone === ADMIN_USER && loginForm.pass === ADMIN_PASS) {
      setUser({ role: "admin", name: "Admin" });
      setView("admin");
      return;
    }

    const found = db.users.find(
      u => u.phone === loginForm.phone && u.pass === loginForm.pass
    );

    if (!found) {
      alert("Datos incorrectos");
      return;
    }

    setUser(found);
    setView("home");
  }

  function logout() {
    setUser(null);
    setView("home");
    setSelected(null);
  }

  function publish() {
    if (!currentUser) {
      alert("Primero tenés que iniciar sesión");
      return;
    }

    if (currentUser.role === "admin") {
      alert("El admin no publica vehículos");
      return;
    }

    if (!vehicleForm.title || !vehicleForm.price || !vehicleForm.phone) {
      alert("Completá título, precio y teléfono");
      return;
    }

    const userPublications = db.vehicles.filter(
      v => v.ownerId === currentUser.id
    ).length;

    let publicationCost = 0;

    if (currentUser.role === "user" && userPublications >= 1) {
      alert("El usuario particular solo puede publicar 1 vehículo gratis.");
      return;
    }

    if (currentUser.role === "seller" && userPublications >= 3) {
      publicationCost = 10;
    }

    const next = structuredClone(db);
    const owner = next.users.find(u => u.id === currentUser.id);

    if (publicationCost > 0) {
      if (!owner || owner.promoCredits < publicationCost) {
        alert("No tenés créditos promocionales suficientes para publicar.");
        return;
      }
      owner.promoCredits -= publicationCost;
    }

    const vehicle = {
      id: uid(),
      ownerId: currentUser.id,
      createdAt: new Date().toLocaleString(),
      ...vehicleForm,
      stats: {
        views: 0,
        photoClicks: 0,
        priceUnlocks: 0,
        contactUnlocks: 0,
        creditsConsumed: publicationCost
      },
      unlockedPriceBy: [],
      unlockedContactBy: []
    };

    next.vehicles = [vehicle, ...next.vehicles];
    next.activity = [
      {
        id: uid(),
        text:
          publicationCost > 0
            ? `Vehículo publicado con costo de 10 créditos: ${vehicle.title}`
            : `Vehículo publicado gratis: ${vehicle.title}`,
        date: new Date().toLocaleString()
      },
      ...next.activity
    ];

    saveDB(next);
    resetVehicleForm();
    setView("home");

    alert(
      publicationCost > 0
        ? "Vehículo publicado. Se descontaron 10 créditos promocionales."
        : "Vehículo publicado gratis."
    );
  }

  function chargeSeller(vehicle, action) {
    if (!currentUser) return;

    const cost = 2;
    const next = structuredClone(db);
    const v = next.vehicles.find(x => x.id === vehicle.id);
    const owner = next.users.find(u => u.id === v.ownerId);

    if (!owner) {
      alert("No se encontró el vendedor");
      return;
    }

    if (currentUser.id === owner.id) {
      alert("Es tu propia publicación. Probalo con otro usuario comprador.");
      return;
    }

    if (owner.promoCredits < cost) {
      alert("El vendedor no tiene créditos promocionales suficientes");
      return;
    }

    if (action === "price") {
      if (v.unlockedPriceBy.includes(currentUser.id)) return;

      owner.promoCredits -= cost;
      v.unlockedPriceBy.push(currentUser.id);
      v.stats.priceUnlocks += 1;
      v.stats.creditsConsumed += cost;

      next.activity = [
        {
          id: uid(),
          text: `Precio desbloqueado: ${v.title}`,
          date: new Date().toLocaleString()
        },
        ...next.activity
      ];
    }

    if (action === "contact") {
      if (v.unlockedContactBy.includes(currentUser.id)) return;

      owner.promoCredits -= cost;
      v.unlockedContactBy.push(currentUser.id);
      v.stats.contactUnlocks += 1;
      v.stats.creditsConsumed += cost;

      next.activity = [
        {
          id: uid(),
          text: `Contacto solicitado: ${v.title}`,
          date: new Date().toLocaleString()
        },
        ...next.activity
      ];
    }

    saveDB(next);

    const updatedSelected = next.vehicles.find(x => x.id === vehicle.id);
    setSelected(updatedSelected);
  }

  function deleteVehicle(id) {
    const next = {
      ...db,
      vehicles: db.vehicles.filter(v => v.id !== id),
      activity: [
        {
          id: uid(),
          text: "Admin eliminó una publicación",
          date: new Date().toLocaleString()
        },
        ...db.activity
      ]
    };

    saveDB(next);
  }

  function handleImages(files) {
    const selectedFiles = Array.from(files).slice(0, 8);

    Promise.all(
      selectedFiles.map(file => {
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.readAsDataURL(file);
        });
      })
    ).then(images => {
      setVehicleForm(prev => ({ ...prev, images }));
    });
  }

  const myVehicles = currentUser?.role === "admin"
    ? db.vehicles
    : db.vehicles.filter(v => v.ownerId === currentUser?.id);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div>
          <div style={styles.logo}>VELOX</div>
          <div style={styles.sublogo}>Marketplace inteligente de vehículos</div>
        </div>

        <nav style={styles.nav}>
          <button style={styles.navBtn} onClick={() => setView("home")}>Inicio</button>

          {currentUser && currentUser.role !== "admin" && (
            <>
              <button style={styles.navBtn} onClick={() => setView("publish")}>Publicar</button>
              <button style={styles.navBtn} onClick={() => setView("panel")}>Mi panel</button>
            </>
          )}

          {currentUser?.role === "admin" && (
            <button style={styles.navBtn} onClick={() => setView("admin")}>Admin</button>
          )}

          {!currentUser ? (
            <>
              <button style={styles.primaryBtn} onClick={() => setView("login")}>Ingresar</button>
              <button style={styles.goldBtn} onClick={() => setView("register")}>Crear cuenta</button>
            </>
          ) : (
            <button style={styles.dangerBtn} onClick={logout}>Salir</button>
          )}
        </nav>
      </header>

      {currentUser && (
        <div style={styles.userBar}>
          <b>{currentUser.name}</b>
          {currentUser.role !== "admin" && (
            <>
              <span>Créditos promo: {currentUser.promoCredits}</span>
              <span>Créditos reales: {currentUser.realCredits}</span>
              <span>Rol: {currentUser.role === "seller" ? "Vendedor" : "Usuario"}</span>
            </>
          )}
        </div>
      )}

      {view === "home" && (
        <>
          <section style={styles.hero}>
            <h1>Comprá y vendé vehículos con interés real.</h1>
            <p>
              El comprador navega gratis. El vendedor paga créditos solo cuando alguien desbloquea precio o contacto.
            </p>
          </section>

          <section style={styles.categories}>
            <div style={styles.category}>🚗 Autos</div>
            <div style={styles.category}>🚙 Camionetas / SUV</div>
            <div style={styles.category}>🛻 Pick-up</div>
            <div style={styles.category}>🏍️ Motos</div>
          </section>

          <section style={styles.grid}>
            {db.vehicles.length === 0 && (
              <div style={styles.empty}>Todavía no hay vehículos publicados.</div>
            )}

            {db.vehicles.map(v => {
              const priceUnlocked = currentUser && v.unlockedPriceBy.includes(currentUser.id);

              return (
                <article key={v.id} style={styles.card}>
                  <div style={styles.photoBox}>
                    {v.images?.[0] ? (
                      <img src={v.images[0]} style={styles.photo} />
                    ) : (
                      <div style={styles.noPhoto}>Sin foto</div>
                    )}
                  </div>

                  <h3>{v.title}</h3>
                  <p style={styles.muted}>{v.brand} {v.model} · {v.year}</p>
                  <p>{v.desc?.slice(0, 90)}</p>

                  <div style={styles.lockedPrice}>
                    {priceUnlocked ? money(v.price) : "Precio bloqueado"}
                  </div>

                  <button
                    style={styles.primaryBtn}
                    onClick={() => {
                      const next = structuredClone(db);
                      const vehicle = next.vehicles.find(x => x.id === v.id);
                      vehicle.stats.views += 1;
                      saveDB(next);
                      setSelected(vehicle);
                      setView("detail");
                    }}
                  >
                    Ver detalle
                  </button>
                </article>
              );
            })}
          </section>
        </>
      )}

      {view === "login" && (
        <section style={styles.formCard}>
          <h2>Ingresar</h2>
          <input style={styles.input} placeholder="Teléfono o admin" value={loginForm.phone} onChange={e => setLoginForm({ ...loginForm, phone: e.target.value })} />
          <input style={styles.input} placeholder="Contraseña" type="password" value={loginForm.pass} onChange={e => setLoginForm({ ...loginForm, pass: e.target.value })} />
          <button style={styles.primaryBtn} onClick={login}>Entrar</button>
          <p style={styles.muted}>Admin: usuario admin / contraseña v3l0x$2026</p>
        </section>
      )}

      {view === "register" && (
        <section style={styles.formCard}>
          <h2>Crear cuenta</h2>
          <input style={styles.input} placeholder="Nombre" value={registerForm.name} onChange={e => setRegisterForm({ ...registerForm, name: e.target.value })} />
          <input style={styles.input} placeholder="Teléfono" value={registerForm.phone} onChange={e => setRegisterForm({ ...registerForm, phone: e.target.value })} />
          <input style={styles.input} placeholder="Contraseña" type="password" value={registerForm.pass} onChange={e => setRegisterForm({ ...registerForm, pass: e.target.value })} />
          <select style={styles.input} value={registerForm.role} onChange={e => setRegisterForm({ ...registerForm, role: e.target.value })}>
            <option value="user">Usuario particular</option>
            <option value="seller">Vendedor de autos</option>
          </select>
          {registerForm.role === "seller" && (
            <input style={styles.input} placeholder="Nombre comercial" value={registerForm.businessName} onChange={e => setRegisterForm({ ...registerForm, businessName: e.target.value })} />
          )}
          <button style={styles.goldBtn} onClick={register}>Crear cuenta con 10.000 créditos</button>
        </section>
      )}

      {view === "publish" && currentUser && (
        <section style={styles.formCard}>
          <h2>Publicar vehículo</h2>

          <select style={styles.input} value={vehicleForm.type} onChange={e => setVehicleForm({ ...vehicleForm, type: e.target.value })}>
            <option value="auto">Auto</option>
            <option value="suv">SUV</option>
            <option value="pickup">Pick-up / con caja</option>
            <option value="moto">Moto</option>
          </select>

          <select style={styles.input} value={vehicleForm.saleType} onChange={e => setVehicleForm({ ...vehicleForm, saleType: e.target.value })}>
            <option value="propio">Propio</option>
            <option value="consignacion">Consignación</option>
          </select>

          <input style={styles.input} placeholder="Título" value={vehicleForm.title} onChange={e => setVehicleForm({ ...vehicleForm, title: e.target.value })} />
          <input style={styles.input} placeholder="Marca" value={vehicleForm.brand} onChange={e => setVehicleForm({ ...vehicleForm, brand: e.target.value })} />
          <input style={styles.input} placeholder="Modelo" value={vehicleForm.model} onChange={e => setVehicleForm({ ...vehicleForm, model: e.target.value })} />
          <input style={styles.input} placeholder="Año" value={vehicleForm.year} onChange={e => setVehicleForm({ ...vehicleForm, year: e.target.value })} />
          <input style={styles.input} placeholder="Kilómetros" value={vehicleForm.km} onChange={e => setVehicleForm({ ...vehicleForm, km: e.target.value })} />
          <input style={styles.input} placeholder="Precio" value={vehicleForm.price} onChange={e => setVehicleForm({ ...vehicleForm, price: e.target.value })} />
          <input style={styles.input} placeholder="Patente / dominio" value={vehicleForm.domain} onChange={e => setVehicleForm({ ...vehicleForm, domain: e.target.value })} />
          <input style={styles.input} placeholder="Ubicación" value={vehicleForm.location} onChange={e => setVehicleForm({ ...vehicleForm, location: e.target.value })} />
          <input style={styles.input} placeholder="Teléfono de contacto" value={vehicleForm.phone} onChange={e => setVehicleForm({ ...vehicleForm, phone: e.target.value })} />
          <textarea style={styles.textarea} placeholder="Descripción" value={vehicleForm.desc} onChange={e => setVehicleForm({ ...vehicleForm, desc: e.target.value })} />

          <label style={styles.upload}>
            Subir hasta 8 fotos
            <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleImages(e.target.files)} />
          </label>

          <div style={styles.previewRow}>
            {vehicleForm.images.map((img, i) => (
              <img key={i} src={img} style={styles.preview} />
            ))}
          </div>

          <button style={styles.goldBtn} onClick={publish}>Publicar ahora</button>
        </section>
      )}

      {view === "detail" && selected && (
        <section style={styles.detail}>
          <button style={styles.navBtn} onClick={() => setView("home")}>← Volver</button>

          <div style={styles.detailGrid}>
            <div>
              <div style={styles.bigPhotoBox}>
                {selected.images?.[0] ? (
                  <img src={selected.images[0]} style={styles.bigPhoto} />
                ) : (
                  <div style={styles.noPhoto}>Sin foto</div>
                )}
              </div>

              <div style={styles.previewRow}>
                {selected.images?.map((img, i) => (
                  <img key={i} src={img} style={styles.preview} />
                ))}
              </div>
            </div>

            <div style={styles.infoBox}>
              <h2>{selected.title}</h2>
              <p style={styles.muted}>{selected.brand} {selected.model} · {selected.year}</p>
              <p>{selected.desc}</p>

              {!currentUser && <p style={styles.alert}>Registrate para desbloquear precio y contacto.</p>}

              {currentUser && currentUser.role !== "admin" && (
                <>
                  <button style={styles.primaryBtn} onClick={() => chargeSeller(selected, "price")}>
                    Desbloquear precio
                  </button>

                  {selected.unlockedPriceBy.includes(currentUser.id) && (
                    <h2 style={styles.price}>{money(selected.price)}</h2>
                  )}

                  <button style={styles.goldBtn} onClick={() => chargeSeller(selected, "contact")}>
                    Pedir contacto
                  </button>

                  {selected.unlockedContactBy.includes(currentUser.id) && (
                    <h3>📞 {selected.phone}</h3>
                  )}
                </>
              )}

              <div style={styles.specs}>
                <div>KM: {currentUser ? selected.km : "bloqueado"}</div>
                <div>Dominio: {currentUser ? selected.domain : "bloqueado"}</div>
                <div>Ubicación: {selected.location}</div>
                <div>Venta: {selected.saleType}</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {view === "panel" && currentUser && (
        <section>
          <h2>Mi panel vendedor</h2>
          <div style={styles.grid}>
            {myVehicles.map(v => (
              <div key={v.id} style={styles.card}>
                <h3>{v.title}</h3>
                <p>Visitas: {v.stats.views}</p>
                <p>Precios desbloqueados: {v.stats.priceUnlocks}</p>
                <p>Contactos pedidos: {v.stats.contactUnlocks}</p>
                <p>Créditos consumidos: {v.stats.creditsConsumed}</p>
                <b>Interés: {v.stats.contactUnlocks >= 3 ? "ALTO" : v.stats.contactUnlocks >= 1 ? "MEDIO" : "BAJO"}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "admin" && currentUser?.role === "admin" && (
        <section>
          <h2>Panel Admin</h2>

          <div style={styles.adminStats}>
            <div>Usuarios: {db.users.length}</div>
            <div>Vehículos: {db.vehicles.length}</div>
            <div>Publicaciones activas: {db.vehicles.length}</div>
            <div>Actividad: {db.activity.length}</div>
          </div>

          <h3>Usuarios</h3>
          {db.users.map(u => (
            <div key={u.id} style={styles.adminRow}>
              <span>{u.name} — {u.role} — Créditos: {u.promoCredits}</span>
            </div>
          ))}

          <h3>Vehículos</h3>
          {db.vehicles.map(v => (
            <div key={v.id} style={styles.adminRow}>
              <span>{v.title}</span>
              <button style={styles.dangerBtn} onClick={() => deleteVehicle(v.id)}>Eliminar</button>
            </div>
          ))}

          <h3>Actividad</h3>
          {db.activity.map(a => (
            <div key={a.id} style={styles.activity}>
              {a.date} — {a.text}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#050505,#0b1220)",
    color: "#fff",
    padding: 22,
    fontFamily: "Arial, sans-serif"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "center",
    borderBottom: "1px solid #1f2a44",
    paddingBottom: 18
  },
  logo: {
    color: "#00aaff",
    fontSize: 34,
    fontWeight: 900,
    letterSpacing: 3
  },
  sublogo: {
    color: "#b7c2d6",
    fontSize: 13
  },
  nav: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap"
  },
  navBtn: {
    background: "#141b2d",
    color: "#fff",
    border: "1px solid #263657",
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer"
  },
  primaryBtn: {
    background: "#007bff",
    color: "#fff",
    border: "none",
    padding: "11px 16px",
    borderRadius: 12,
    cursor: "pointer",
    margin: 4,
    fontWeight: 700
  },
  goldBtn: {
    background: "#d6a84f",
    color: "#111",
    border: "none",
    padding: "11px 16px",
    borderRadius: 12,
    cursor: "pointer",
    margin: 4,
    fontWeight: 800
  },
  dangerBtn: {
    background: "#b91c1c",
    color: "#fff",
    border: "none",
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer"
  },
  userBar: {
    margin: "18px 0",
    padding: 14,
    background: "#101827",
    border: "1px solid #1f2a44",
    borderRadius: 16,
    display: "flex",
    gap: 18,
    flexWrap: "wrap"
  },
  hero: {
    padding: "38px 0",
    maxWidth: 760
  },
  categories: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 14,
    marginBottom: 24
  },
  category: {
    padding: 20,
    background: "#101827",
    border: "1px solid #24334f",
    borderRadius: 18,
    fontWeight: 800
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: 18
  },
  card: {
    background: "#0f172a",
    border: "1px solid #24334f",
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 20px 60px rgba(0,0,0,.25)"
  },
  photoBox: {
    height: 170,
    borderRadius: 16,
    overflow: "hidden",
    background: "#050b16",
    marginBottom: 12
  },
  photo: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  noPhoto: {
    height: "100%",
    display: "grid",
    placeItems: "center",
    color: "#6b7280"
  },
  lockedPrice: {
    color: "#d6a84f",
    fontWeight: 900,
    fontSize: 20,
    margin: "12px 0"
  },
  muted: {
    color: "#93a4bd"
  },
  empty: {
    padding: 30,
    background: "#101827",
    borderRadius: 16
  },
  formCard: {
    maxWidth: 720,
    margin: "25px auto",
    padding: 22,
    background: "#0f172a",
    border: "1px solid #24334f",
    borderRadius: 20,
    display: "grid",
    gap: 10
  },
  input: {
    padding: 13,
    borderRadius: 12,
    border: "1px solid #2f3e5f",
    background: "#060b16",
    color: "#fff"
  },
  textarea: {
    padding: 13,
    minHeight: 90,
    borderRadius: 12,
    border: "1px solid #2f3e5f",
    background: "#060b16",
    color: "#fff"
  },
  upload: {
    padding: 14,
    borderRadius: 12,
    border: "1px dashed #d6a84f",
    color: "#d6a84f",
    cursor: "pointer",
    textAlign: "center"
  },
  previewRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 10
  },
  preview: {
    width: 85,
    height: 65,
    objectFit: "cover",
    borderRadius: 10,
    border: "1px solid #24334f"
  },
  detail: {
    marginTop: 24
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(280px,1.2fr) minmax(280px,.8fr)",
    gap: 20
  },
  bigPhotoBox: {
    height: 420,
    background: "#050b16",
    borderRadius: 22,
    overflow: "hidden"
  },
  bigPhoto: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  infoBox: {
    background: "#0f172a",
    border: "1px solid #24334f",
    borderRadius: 22,
    padding: 22
  },
  price: {
    color: "#d6a84f"
  },
  alert: {
    color: "#d6a84f",
    fontWeight: 800
  },
  specs: {
    marginTop: 18,
    display: "grid",
    gap: 8,
    color: "#cbd5e1"
  },
  adminStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 12,
    marginBottom: 20
  },
  adminRow: {
    padding: 12,
    background: "#101827",
    borderRadius: 12,
    marginBottom: 8,
    display: "flex",
    justifyContent: "space-between",
    gap: 10
  },
  activity: {
    padding: 10,
    borderBottom: "1px solid #24334f",
    color: "#cbd5e1"
  }
};
