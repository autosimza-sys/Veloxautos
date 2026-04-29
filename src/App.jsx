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

  useEffect(() => {
    localStorage.setItem("veloxDB", JSON.stringify(db));
  }, [db]);

  // ---------------- AUTH ----------------
  const register = (name, phone, pass, role) => {
    const newUser = {
      id: Date.now(),
      name,
      phone,
      pass,
      role,
      credits: 10000
    };
    setDb({ ...db, users: [...db.users, newUser] });
    setUser(newUser);
  };

  const login = (phone, pass) => {
    if (phone === "admin" && pass === "v3l0x$2026") {
      setUser({ role: "admin", name: "Admin" });
      return;
    }

    const u = db.users.find(u => u.phone === phone && u.pass === pass);
    if (u) setUser(u);
    else alert("Datos incorrectos");
  };

  // ---------------- PUBLICAR ----------------
  const publish = (title, price, phone) => {
    const vehicle = {
      id: Date.now(),
      ownerId: user.id,
      title,
      price,
      phone,
      unlockedBy: [],
      contactedBy: []
    };

    setDb({ ...db, vehicles: [...db.vehicles, vehicle] });
    alert("Vehículo publicado");
  };

  // ---------------- INTERACCIONES ----------------
  const unlockPrice = (v) => {
    const owner = db.users.find(u => u.id === v.ownerId);

    if (!v.unlockedBy.includes(user.id)) {
      if (owner.credits >= 2) {
        owner.credits -= 2;
        v.unlockedBy.push(user.id);
        setDb({ ...db });
      } else {
        alert("El vendedor no tiene créditos");
      }
    }
  };

  const viewContact = (v) => {
    const owner = db.users.find(u => u.id === v.ownerId);

    if (!v.contactedBy.includes(user.id)) {
      if (owner.credits >= 2) {
        owner.credits -= 2;
        v.contactedBy.push(user.id);
        setDb({ ...db });
      } else {
        alert("El vendedor no tiene créditos");
      }
    }
  };

  return (
    <div style={{ background: "#0b0b0b", color: "#fff", minHeight: "100vh", padding: 20 }}>

      <h1 style={{ textAlign: "center", color: "#00aaff" }}>VELOX</h1>

      {/* NAV */}
      {!user && (
        <>
          <button onClick={() => setView("login")}>Login</button>
          <button onClick={() => setView("register")}>Registro</button>
        </>
      )}

      {user && (
        <>
          <p>
            {user.name} | Créditos: {user.credits || "-"}
          </p>
          <button onClick={() => setView("home")}>Inicio</button>
          <button onClick={() => setView("publish")}>Publicar</button>
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
          }>
            Entrar
          </button>
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
          }>
            Crear cuenta
          </button>
        </div>
      )}

      {/* PUBLICAR */}
      {view === "publish" && user && (
        <div>
          <input placeholder="Título" id="p1" />
          <input placeholder="Precio" id="p2" />
          <input placeholder="Teléfono" id="p3" />

          <button onClick={() =>
            publish(
              document.getElementById("p1").value,
              document.getElementById("p2").value,
              document.getElementById("p3").value
            )
          }>
            Publicar
          </button>
        </div>
      )}

      {/* HOME */}
      {view === "home" && (
        <div style={{ display: "grid", gap: 10 }}>
          {db.vehicles.map(v => {

            const unlocked = v.unlockedBy.includes(user?.id);
            const contacted = v.contactedBy.includes(user?.id);

            return (
              <div key={v.id} style={{ background: "#111", padding: 10 }}>

                <h3>{v.title}</h3>

                {!user && <p>Registrate para ver info</p>}

                {user && !unlocked && (
                  <button onClick={() => unlockPrice(v)}>
                    Ver precio
                  </button>
                )}

                {user && unlocked && (
                  <p>💰 Precio: {v.price}</p>
                )}

                {user && !contacted && (
                  <button onClick={() => viewContact(v)}>
                    Ver contacto
                  </button>
                )}

                {user && contacted && (
                  <p>📞 {v.phone}</p>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
