import { useState, useEffect } from "react";

const initialDB = {
  users: [],
  vehicles: [],
  orders: []
};

export default function App() {
  const [db, setDb] = useState(() => {
    const saved = localStorage.getItem("veloxDB");
    return saved ? JSON.parse(saved) : initialDB;
  });

  const [user, setUser] = useState(null);
  const [view, setView] = useState("home");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    localStorage.setItem("veloxDB", JSON.stringify(db));
  }, [db]);

  // AUTH
  const register = (name, phone, pass, role) => {
    const newUser = {
      id: Date.now(),
      name,
      phone,
      pass,
      role,
      creditsPromo: 10000,
      creditsReal: 0
    };
    setDb({ ...db, users: [...db.users, newUser] });
    setUser(newUser);
  };

  const login = (phone, pass) => {
    if (phone === "admin" && pass === "v3l0x$2026") {
      setUser({ role: "admin" });
      return;
    }
    const u = db.users.find(u => u.phone === phone && u.pass === pass);
    if (u) setUser(u);
    else alert("Datos incorrectos");
  };

  // PUBLICAR
  const publish = (data) => {
    const v = {
      id: Date.now(),
      ownerId: user.id,
      ...data,
      stats: {
        unlocks: 0,
        contacts: 0,
        creditsUsed: 0
      }
    };
    setDb({ ...db, vehicles: [...db.vehicles, v] });
    alert("Publicado!");
  };

  // INTERACCIONES
  const interact = (vehicleId, type) => {
    const v = db.vehicles.find(x => x.id === vehicleId);
    const owner = db.users.find(u => u.id === v.ownerId);

    let cost = type === "unlock" ? 2 : 2;

    if (owner && owner.creditsPromo >= cost) {
      owner.creditsPromo -= cost;
      v.stats.creditsUsed += cost;
    }

    if (type === "unlock") v.stats.unlocks++;
    if (type === "contact") v.stats.contacts++;

    setDb({ ...db });
  };

  // CRÉDITOS
  const buyCredits = (amount) => {
    const order = {
      id: Date.now(),
      userId: user.id,
      amount,
      status: "pending"
    };
    setDb({ ...db, orders: [...db.orders, order] });
    window.open("https://mpago.la/2yLmEsX", "_blank");
  };

  const approve = (id) => {
    const order = db.orders.find(o => o.id === id);
    const u = db.users.find(u => u.id === order.userId);
    u.creditsReal += order.amount;
    order.status = "approved";
    setDb({ ...db });
  };

  return (
    <div style={{ background: "#0b0b0b", color: "#fff", minHeight: "100vh", padding: 20 }}>
      
      <h1 style={{ color: "#00aaff" }}>VELOX</h1>

      {!user && (
        <>
          <button onClick={() => setView("login")}>Login</button>
          <button onClick={() => setView("register")}>Registro</button>
        </>
      )}

      {user && (
        <>
          <p>
            {user.name || "Admin"} | Promo: {user.creditsPromo || "-"} | Real: {user.creditsReal || "-"}
          </p>
          <button onClick={() => setView("home")}>Inicio</button>
          <button onClick={() => setView("publish")}>Publicar</button>
          <button onClick={() => setView("panel")}>Panel</button>
          {user.role === "admin" && (
            <button onClick={() => setView("admin")}>Admin</button>
          )}
        </>
      )}

      {/* LOGIN */}
      {view === "login" && (
        <div>
          <input placeholder="Teléfono" id="l1" />
          <input placeholder="Pass" id="l2" />
          <button onClick={() =>
            login(
              document.getElementById("l1").value,
              document.getElementById("l2").value
            )
          }>Entrar</button>
        </div>
      )}

      {/* REGISTER */}
      {view === "register" && (
        <div>
          <input placeholder="Nombre" id="r1" />
          <input placeholder="Teléfono" id="r2" />
          <input placeholder="Pass" id="r3" />
          <select id="r4">
            <option value="user">Usuario</option>
            <option value="seller">Vendedor</option>
          </select>
          <button onClick={() =>
            register(
              document.getElementById("r1").value,
              document.getElementById("r2").value,
              document.getElementById("r3").value,
              document.getElementById("r4").value
            )
          }>Crear</button>
        </div>
      )}

      {/* PUBLICAR */}
      {view === "publish" && user && (
        <div>
          <input placeholder="Título" id="p1" />
          <input placeholder="Marca" id="p2" />
          <input placeholder="Modelo" id="p3" />
          <input placeholder="Año" id="p4" />
          <input placeholder="Precio" id="p5" />
          <input placeholder="KM" id="p6" />
          <textarea placeholder="Descripción" id="p7" />

          <button onClick={() =>
            publish({
              title: document.getElementById("p1").value,
              brand: document.getElementById("p2").value,
              model: document.getElementById("p3").value,
              year: document.getElementById("p4").value,
              price: document.getElementById("p5").value,
              km: document.getElementById("p6").value,
              desc: document.getElementById("p7").value
            })
          }>Publicar</button>
        </div>
      )}

      {/* HOME */}
      {view === "home" && (
        <div>
          {db.vehicles.map(v => (
            <div key={v.id} style={{ border: "1px solid #333", padding: 10, margin: 10 }}>
              <h3>{v.title}</h3>
              <p>{v.year}</p>

              {!user && <p>Registrate para ver más info</p>}

              {user && (
                <>
                  <p>Precio: {v.price}</p>
                  <p>KM: {v.km}</p>
                </>
              )}

              <button onClick={() => {
                setSelected(v);
                setView("detail");
              }}>Ver</button>
            </div>
          ))}
        </div>
      )}

      {/* DETALLE */}
      {view === "detail" && selected && (
        <div>
          <h2>{selected.title}</h2>
          <p>{selected.desc}</p>

          {!user && <p>Registrate para ver precio</p>}

          {user && (
            <>
              <button onClick={() => interact(selected.id, "unlock")}>
                Desbloquear precio
              </button>
              <button onClick={() => interact(selected.id, "contact")}>
                Pedir contacto
              </button>
            </>
          )}
        </div>
      )}

      {/* PANEL */}
      {view === "panel" && user && (
        <div>
          <h2>Mis publicaciones</h2>

          {db.vehicles
            .filter(v => v.ownerId === user.id)
            .map(v => (
              <div key={v.id}>
                <p>{v.title}</p>
                <p>Contactos: {v.stats.contacts}</p>
                <p>Créditos usados: {v.stats.creditsUsed}</p>
              </div>
            ))}

          <button onClick={() => buyCredits(10000)}>
            Comprar 10.000 créditos
          </button>
        </div>
      )}

      {/* ADMIN */}
      {view === "admin" && user.role === "admin" && (
        <div>
          <h2>ADMIN</h2>

          {db.orders.map(o => (
            <div key={o.id}>
              <p>{o.amount} - {o.status}</p>
              {o.status === "pending" && (
                <button onClick={() => approve(o.id)}>Aprobar</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
