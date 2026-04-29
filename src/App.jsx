import { useState, useEffect } from "react";

export default function App() {

  const [users, setUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [user, setUser] = useState(null);
  const [view, setView] = useState("home");

  const [form, setForm] = useState({
    name: "",
    phone: "",
    pass: "",
    role: "user"
  });

  const [vehicleForm, setVehicleForm] = useState({
    title: "",
    price: "",
    phone: ""
  });

  // ---------------- AUTH ----------------
  const register = () => {
    const newUser = {
      id: Date.now(),
      ...form,
      credits: 10000
    };
    setUsers([...users, newUser]);
    setUser(newUser);
  };

  const login = () => {
    if (form.phone === "admin" && form.pass === "v3l0x$2026") {
      setUser({ name: "Admin", role: "admin" });
      return;
    }

    const u = users.find(u => u.phone === form.phone && u.pass === form.pass);
    if (u) setUser(u);
    else alert("Datos incorrectos");
  };

  // ---------------- PUBLICAR ----------------
  const publish = () => {
    const v = {
      id: Date.now(),
      ownerId: user.id,
      ...vehicleForm,
      unlockedBy: [],
      contactedBy: []
    };

    setVehicles([...vehicles, v]);
    setVehicleForm({ title: "", price: "", phone: "" });
  };

  // ---------------- INTERACCIONES ----------------
  const unlockPrice = (v) => {
    const owner = users.find(u => u.id === v.ownerId);

    if (!v.unlockedBy.includes(user.id)) {
      if (owner.credits >= 2) {
        owner.credits -= 2;
        v.unlockedBy.push(user.id);
        setUsers([...users]);
        setVehicles([...vehicles]);
      }
    }
  };

  const viewContact = (v) => {
    const owner = users.find(u => u.id === v.ownerId);

    if (!v.contactedBy.includes(user.id)) {
      if (owner.credits >= 2) {
        owner.credits -= 2;
        v.contactedBy.push(user.id);
        setUsers([...users]);
        setVehicles([...vehicles]);
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
          <p>{user.name} | Créditos: {user.credits || "-"}</p>
          <button onClick={() => setView("home")}>Inicio</button>
          <button onClick={() => setView("publish")}>Publicar</button>
        </>
      )}

      {/* LOGIN */}
      {view === "login" && (
        <div>
          <input placeholder="Teléfono" onChange={e => setForm({...form, phone: e.target.value})}/>
          <input placeholder="Pass" onChange={e => setForm({...form, pass: e.target.value})}/>
          <button onClick={login}>Entrar</button>
        </div>
      )}

      {/* REGISTER */}
      {view === "register" && (
        <div>
          <input placeholder="Nombre" onChange={e => setForm({...form, name: e.target.value})}/>
          <input placeholder="Teléfono" onChange={e => setForm({...form, phone: e.target.value})}/>
          <input placeholder="Pass" onChange={e => setForm({...form, pass: e.target.value})}/>
          <button onClick={register}>Crear cuenta</button>
        </div>
      )}

      {/* PUBLICAR */}
      {view === "publish" && user && (
        <div>
          <input placeholder="Título" value={vehicleForm.title} onChange={e => setVehicleForm({...vehicleForm, title: e.target.value})}/>
          <input placeholder="Precio" value={vehicleForm.price} onChange={e => setVehicleForm({...vehicleForm, price: e.target.value})}/>
          <input placeholder="Teléfono" value={vehicleForm.phone} onChange={e => setVehicleForm({...vehicleForm, phone: e.target.value})}/>
          <button onClick={publish}>Publicar</button>
        </div>
      )}

      {/* HOME */}
      {view === "home" && (
        <div style={{ display: "grid", gap: 10 }}>
          {vehicles.map(v => {

            const unlocked = v.unlockedBy.includes(user?.id);
            const contacted = v.contactedBy.includes(user?.id);

            return (
              <div key={v.id} style={{ background: "#111", padding: 10 }}>

                <h3>{v.title}</h3>

                {!user && <p>Registrate para ver info</p>}

                {user && !unlocked && (
                  <button onClick={() => unlockPrice(v)}>Ver precio</button>
                )}

                {user && unlocked && <p>💰 {v.price}</p>}

                {user && !contacted && (
                  <button onClick={() => viewContact(v)}>Ver contacto</button>
                )}

                {user && contacted && <p>📞 {v.phone}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
