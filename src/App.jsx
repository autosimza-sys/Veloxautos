import { useState, useEffect } from "react";

const initialDB = {
  users: [],
  vehicles: []
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
      creditsPromo: 10000
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
  };

  // PUBLICAR
  const publish = (data) => {
    const v = {
      id: Date.now(),
      ownerId: user.id,
      ...data,
      stats: { unlocks: 0, contacts: 0 }
    };
    setDb({ ...db, vehicles: [...db.vehicles, v] });
  };

  // INTERACCIONES
  const interact = (id, type) => {
    const v = db.vehicles.find(x => x.id === id);
    const owner = db.users.find(u => u.id === v.ownerId);

    if (owner && owner.creditsPromo >= 2) {
      owner.creditsPromo -= 2;
      if (type === "unlock") v.stats.unlocks++;
      if (type === "contact") v.stats.contacts++;
    }

    setDb({ ...db });
  };

  return (
    <div style={{ background: "#0b0b0b", color: "#fff", minHeight: "100vh", padding: 20 }}>

      <h1 style={{ color: "#00aaff", textAlign: "center" }}>VELOX</h1>

      {!user && (
        <>
          <button onClick={() => setView("login")}>Login</button>
          <button onClick={() => setView("register")}>Registro</button>
        </>
      )}

      {user && (
        <>
          <p>{user.name || "Admin"} | Créditos: {user.creditsPromo}</p>
          <button onClick={() => setView("home")}>Inicio</button>
          <button onClick={() => setView("publish")}>Publicar</button>
        </>
      )}

      {/* LOGIN */}
      {view === "login" && (
        <div>
          <input placeholder="Teléfono" id="l1" />
          <input placeholder="Pass" id="l2" />
          <button onClick={() => login(
            document.getElementById("l1").value,
            document.getElementById("l2").value
          )}>Entrar</button>
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
          <button onClick={() => register(
            document.getElementById("r1").value,
            document.getElementById("r2").value,
            document.getElementById("r3").value,
            document.getElementById("r4").value
          )}>Crear</button>
        </div>
      )}

      {/* PUBLICAR */}
      {view === "publish" && user && (
        <div>
          <input placeholder="Título" id="p1" />
          <input placeholder="Precio" id="p2" />
          <input placeholder="Teléfono" id="p3" />
          <button onClick={() => publish({
            title: document.getElementById("p1").value,
            price: document.getElementById("p2").value,
            phone: document.getElementById("p3").value
          })}>Publicar</button>
        </div>
      )}

      {/* HOME */}
      {view === "home" && (
        <div style={{ display: "grid", gap: 10 }}>
          {db.vehicles.map(v => (
            <div key={v.id} style={{ background: "#111", padding: 10 }}>
              <h3>{v.title}</h3>

              {!user && <p>Registrate para ver precio</p>}

              {user && <button onClick={() => interact(v.id, "unlock")}>
                Ver precio
              </button>}

              {user && <button onClick={() => interact(v.id, "contact")}>
                Ver contacto
              </button>}

              {user && <p>{v.price}</p>}
              {user && <p>{v.phone}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
