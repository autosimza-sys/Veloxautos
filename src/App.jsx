import React, { useMemo, useState } from "react";

const MP_LINK = "https://mpago.la/2yLmEsX";
const ADMIN_USER = "admin";
const ADMIN_PASS = "v3l0x$2026";
const STORE_KEY = "velox_mvp_v1";

// MVP only: admin/password and all permissions are simulated in frontend.
// Production should move auth, roles, payments and moderation to Supabase Auth or a real backend.

const realCreditPacks = [
  { id: "pack-5000", name: "Pack 5.000 creditos", credits: 5000, price: 5000 },
  { id: "pack-10000", name: "Pack 10.000 creditos", credits: 10000, price: 10000 },
  { id: "pack-30000", name: "Pack 30.000 creditos", credits: 30000, price: 30000 },
  { id: "pack-55000", name: "Pack Compra Velox", credits: 55000, price: 55000 },
];

const paidServices = [
  { key: "tech", name: "Informe tecnico completo", cost: 5000 },
  { key: "domain", name: "Informe de dominio", cost: 8000 },
  { key: "debt", name: "Deuda de patente", cost: 5000 },
  { key: "tickets", name: "Informe de multas", cost: 10000 },
  { key: "mechanic", name: "Revision mecanica", cost: 30000 },
  { key: "compra", name: "Compra Velox", cost: 55000, premium: true },
];

const initialChecklist = {
  docs: true,
  greenCard: true,
  rto: "vigente",
  debts: false,
  tickets: false,
  scores: {
    motor: 8,
    caja: 8,
    tren: 8,
    frenos: 8,
    direccion: 8,
    suspension: 8,
    aire: 8,
    luces: 8,
    bateria: 8,
    pintura: 8,
    interior: 8,
    tapizados: 8,
    vidrios: 8,
  },
  tires: { di: 80, dd: 80, ti: 80, td: 80, aux: 70 },
  observations: {
    detalles: "",
    rayones: "",
    abollones: "",
    ruidos: "",
    perdidas: "",
    gaseo: "",
    comentarios: "",
  },
};

const seedImages = [
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=80",
];

const demoUsers = [
  {
    id: "u-demo",
    role: "seller",
    name: "Tomas Rivera",
    phone: "1130000000",
    password: "1234",
    businessName: "Rivera Select",
    promoCredits: 10000,
    realCredits: 60000,
    freePostsUsed: 3,
    promoBonusCycles: 0,
    createdAt: Date.now(),
  },
  {
    id: "u-particular-demo",
    role: "buyer",
    name: "Martina Lopez",
    phone: "1122223333",
    password: "1234",
    businessName: "",
    promoCredits: 10000,
    realCredits: 15000,
    freePostsUsed: 1,
    promoBonusCycles: 0,
    createdAt: Date.now(),
  },
];

const demoVehicles = [
  {
    id: "v-1",
    ownerId: "u-demo",
    type: "auto",
    subtype: "auto",
    saleType: "propio",
    brand: "Audi",
    model: "A4 2.0 TFSI",
    title: "Audi A4 impecable con historial completo",
    year: 2021,
    km: 41000,
    price: 45800000,
    plate: "AF123CD",
    location: "Palermo, CABA",
    phone: "1130000000",
    fuel: "Nafta",
    description:
      "Unidad cuidada, service oficial, interior premium y cubiertas nuevas. Ideal para quien busca confort sin resignar respuesta.",
    photos: seedImages,
    video: "",
    checklist: initialChecklist,
    sellerScore: 8.4,
    mechanicScore: null,
    mechanicReview: null,
    assignedMechanicId: "",
    active: true,
    createdAt: Date.now() - 86400000,
    stats: { visits: 42, photoClicks: 17, videoViews: 5, priceUnlocks: 9, contacts: 4, creditsConsumed: 47 },
  },
  {
    id: "v-demo-seller-2",
    ownerId: "u-demo",
    type: "camioneta",
    subtype: "SUV",
    saleType: "consignacion",
    brand: "Toyota",
    model: "Corolla Cross XEI",
    title: "Toyota Corolla Cross XEI en consignacion",
    year: 2022,
    km: 36000,
    price: 39500000,
    plate: "AG456EF",
    location: "Vicente Lopez, Buenos Aires",
    phone: "1130000000",
    fuel: "Nafta",
    description: "SUV familiar con excelente estado general, service al dia y muy buen nivel de equipamiento.",
    photos: [
      "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1200&q=80",
      ...seedImages.slice(1),
    ],
    video: "",
    checklist: initialChecklist,
    sellerScore: 8.1,
    mechanicScore: null,
    mechanicReview: null,
    assignedMechanicId: "",
    active: true,
    createdAt: Date.now() - 7200000,
    stats: { visits: 18, photoClicks: 6, videoViews: 0, priceUnlocks: 3, contacts: 1, creditsConsumed: 14 },
  },
  {
    id: "v-demo-seller-3",
    ownerId: "u-demo",
    type: "camioneta",
    subtype: "pick-up",
    saleType: "propio",
    brand: "Ford",
    model: "Ranger Limited",
    title: "Ford Ranger Limited 4x4 lista para transferir",
    year: 2020,
    km: 78000,
    price: 36500000,
    plate: "AE789GH",
    location: "San Isidro, Buenos Aires",
    phone: "1130000000",
    fuel: "Diesel",
    description: "Pick-up con caja, doble cabina, muy cuidada y con cubiertas en buen estado.",
    photos: [
      "https://images.unsplash.com/photo-1551830820-330a71b99659?auto=format&fit=crop&w=1200&q=80",
      ...seedImages.slice(0, 2),
    ],
    video: "",
    checklist: initialChecklist,
    sellerScore: 7.8,
    mechanicScore: null,
    mechanicReview: null,
    assignedMechanicId: "",
    active: true,
    createdAt: Date.now() - 3600000,
    stats: { visits: 25, photoClicks: 9, videoViews: 1, priceUnlocks: 4, contacts: 2, creditsConsumed: 22 },
  },
  {
    id: "v-demo-particular-1",
    ownerId: "u-particular-demo",
    type: "moto",
    subtype: "moto",
    saleType: "propio",
    brand: "Honda",
    model: "CB 500F",
    title: "Honda CB 500F particular, muy cuidada",
    year: 2019,
    km: 22000,
    price: 7800000,
    plate: "A123BCD",
    location: "Caballito, CABA",
    phone: "1122223333",
    fuel: "Nafta",
    description: "Moto de uso particular, duerme bajo techo, con mantenimiento reciente y papeles al dia.",
    photos: [
      "https://images.unsplash.com/photo-1558981285-6f0c94958bb6?auto=format&fit=crop&w=1200&q=80",
      ...seedImages.slice(0, 2),
    ],
    video: "",
    checklist: initialChecklist,
    sellerScore: 8.7,
    mechanicScore: null,
    mechanicReview: null,
    assignedMechanicId: "",
    active: true,
    createdAt: Date.now() - 5400000,
    stats: { visits: 11, photoClicks: 3, videoViews: 0, priceUnlocks: 2, contacts: 1, creditsConsumed: 9 },
  },
];

const seedState = {
  users: demoUsers,
  mechanics: [
    { id: "m-1", name: "Lucia Ferrer", phone: "1144556677", password: "lucia2026" },
    { id: "m-2", name: "Mateo Silva", phone: "1166778899", password: "mateo2026" },
  ],
  vehicles: demoVehicles,
  orders: [],
  activity: [
    { id: "a-1", type: "publicacion", text: "Rivera Select publico Audi A4", at: Date.now() - 86400000 },
  ],
};

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORE_KEY)) || seedState);
  } catch {
    return normalizeState(seedState);
  }
}

function normalizeState(state) {
  const next = structuredClone(state);
  const now = Date.now();
  let changed = false;
  next.users = next.users || [];
  next.vehicles = next.vehicles || [];
  next.mechanics = next.mechanics || [];
  next.orders = next.orders || [];
  next.activity = next.activity || [];
  demoUsers.forEach((demoUser) => {
    if (!next.users.some((user) => user.id === demoUser.id)) {
      next.users.push(structuredClone(demoUser));
      changed = true;
    }
  });
  demoVehicles.forEach((demoVehicle) => {
    if (!next.vehicles.some((vehicle) => vehicle.id === demoVehicle.id)) {
      next.vehicles.push(structuredClone(demoVehicle));
      changed = true;
    }
  });
  next.mechanics = (next.mechanics || []).map((mechanic, index) => ({
    ...mechanic,
    password: mechanic.password || (index === 0 ? "lucia2026" : "mateo2026"),
  }));
  next.users = next.users.map((user) => {
    const days = Math.floor((now - user.createdAt) / 86400000);
    const eligibleCycles = Math.min(3, Math.floor(days / 30));
    const grantedCycles = user.promoBonusCycles || 0;
    if (eligibleCycles > grantedCycles) {
      changed = true;
      return {
        ...user,
        promoCredits: user.promoCredits + (eligibleCycles - grantedCycles) * 5000,
        promoBonusCycles: eligibleCycles,
      };
    }
    return { ...user, promoBonusCycles: grantedCycles };
  });
  if (changed) {
    next.activity = [
      { id: uid("a"), type: "creditos_promocionales", text: "VELOX aplico bonificacion mensual del periodo MVP", at: now },
      ...next.activity,
    ].slice(0, 80);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }
  return next;
}

function money(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function average(values) {
  const nums = values.map(Number).filter((n) => !Number.isNaN(n));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function calculateSellerScore(checklist) {
  const doc = checklist.docs ? 10 : 4;
  const rto = checklist.rto === "vigente" ? 10 : checklist.rto === "vencida" ? 6 : 4;
  const debtPenalty = checklist.debts ? 1.2 : 0;
  const ticketPenalty = checklist.tickets ? 1.2 : 0;
  const general = average(Object.values(checklist.scores));
  const tires = average(Object.values(checklist.tires)) / 10;
  return Math.max(1, Math.min(10, doc * 0.18 + rto * 0.14 + general * 0.43 + tires * 0.2 - debtPenalty - ticketPenalty));
}

function calculateMechanicScore(review) {
  if (review?.checklist) return calculateSellerScore(review.checklist);
  return average(["motor", "caja", "estructura", "frenos", "electronica", "interior"].map((k) => review?.[k] || 0));
}

function normalizeMechanicReview(review, vehicle) {
  if (review?.checklist) {
    return {
      ...review,
      photos: review.photos || [],
      video: review.video || "",
      observaciones: review.observaciones || "",
      estado: review.estado || "aprobado",
    };
  }
  return {
    checklist: structuredClone(vehicle.checklist || initialChecklist),
    photos: [],
    video: "",
    observaciones: review?.observaciones || "",
    estado: review?.estado || "aprobado",
    at: review?.at,
  };
}

function compareChecklists(sellerChecklist, mechanicChecklist) {
  if (!mechanicChecklist) return { total: 0, matches: 0, differences: [] };
  const differences = [];
  let total = 0;
  let matches = 0;
  const compareExact = (label, seller, mechanic) => {
    total += 1;
    if (seller === mechanic) matches += 1;
    else differences.push(`${label}: vendedor ${seller ? "si" : "no"} / mecanico ${mechanic ? "si" : "no"}`);
  };
  compareExact("Documentacion", sellerChecklist.docs, mechanicChecklist.docs);
  compareExact("Cedula verde", sellerChecklist.greenCard, mechanicChecklist.greenCard);
  total += 1;
  if (sellerChecklist.rto === mechanicChecklist.rto) matches += 1;
  else differences.push(`RTO/VTV: vendedor ${sellerChecklist.rto} / mecanico ${mechanicChecklist.rto}`);
  compareExact("Deudas", sellerChecklist.debts, mechanicChecklist.debts);
  compareExact("Multas", sellerChecklist.tickets, mechanicChecklist.tickets);
  Object.keys(sellerChecklist.scores).forEach((key) => {
    total += 1;
    const diff = Math.abs(Number(sellerChecklist.scores[key]) - Number(mechanicChecklist.scores[key]));
    if (diff <= 1) matches += 1;
    else differences.push(`${key}: vendedor ${sellerChecklist.scores[key]}/10 / mecanico ${mechanicChecklist.scores[key]}/10`);
  });
  Object.keys(sellerChecklist.tires).forEach((key) => {
    total += 1;
    const diff = Math.abs(Number(sellerChecklist.tires[key]) - Number(mechanicChecklist.tires[key]));
    if (diff <= 20) matches += 1;
    else differences.push(`Cubierta ${key}: vendedor ${sellerChecklist.tires[key]}% / mecanico ${mechanicChecklist.tires[key]}%`);
  });
  return { total, matches, differences };
}

function finalScore(vehicle) {
  if (!vehicle.mechanicScore) return vehicle.sellerScore || calculateSellerScore(vehicle.checklist);
  return (vehicle.sellerScore || 0) * 0.4 + vehicle.mechanicScore * 0.6;
}

function scoreLabel(score) {
  if (score >= 8) return "Excelente";
  if (score >= 7) return "Bueno";
  if (score >= 6) return "Con observaciones";
  return "Riesgo alto";
}

function interestLevel(stats) {
  const score = stats.visits * 0.2 + stats.photoClicks + stats.videoViews + stats.priceUnlocks * 2 + stats.contacts * 3;
  if (score > 35) return "alto";
  if (score > 14) return "medio";
  return "bajo";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [db, setDb] = useState(loadState);
  const [screen, setScreen] = useState("home");
  const [category, setCategory] = useState("all");
  const [currentUserId, setCurrentUserId] = useState("");
  const [admin, setAdmin] = useState(false);
  const [mechanicSessionId, setMechanicSessionId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("v-1");
  const [modalPhoto, setModalPhoto] = useState("");
  const [toast, setToast] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [tempPass, setTempPass] = useState("");

  const currentUser = db.users.find((u) => u.id === currentUserId) || null;
  const selectedVehicle = db.vehicles.find((v) => v.id === selectedVehicleId) || db.vehicles[0];
  const activeVehicles = db.vehicles.filter((v) => v.active);

  function commit(next) {
    setDb(next);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  function notify(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3200);
  }

  function log(next, type, text) {
    next.activity = [{ id: uid("a"), type, text, at: Date.now() }, ...next.activity].slice(0, 80);
  }

  function mutateVehicle(vehicleId, updater) {
    const next = structuredClone(db);
    const vehicle = next.vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    updater(vehicle, next);
    commit(next);
  }

  function chargeSeller(vehicle, action, amount) {
    const anonymousAllowed = action === "foto" || action === "video";
    if (!currentUser && !anonymousAllowed) {
      setScreen("auth");
      notify("Registrate gratis para desbloquear datos del vehiculo.");
      return false;
    }
    const next = structuredClone(db);
    const target = next.vehicles.find((v) => v.id === vehicle.id);
    const seller = next.users.find((u) => u.id === target.ownerId);
    if (!seller || seller.promoCredits < amount) {
      notify("El vendedor no tiene creditos promocionales suficientes.");
      return false;
    }
    seller.promoCredits -= amount;
    target.stats.creditsConsumed += amount;
    if (action === "foto") target.stats.photoClicks += 1;
    if (action === "video") target.stats.videoViews += 1;
    if (action === "precio") target.stats.priceUnlocks += 1;
    if (action === "contacto") target.stats.contacts += 1;
    log(next, action, `${currentUser?.name || "Visitante"} genero interes real en ${target.title}: ${action}`);
    commit(next);
    notify(`Interes registrado. Se descontaron ${amount} creditos promocionales al vendedor.`);
    return true;
  }

  function visitVehicle(vehicle) {
    mutateVehicle(vehicle.id, (v) => {
      v.stats.visits += 1;
    });
    setSelectedVehicleId(vehicle.id);
    setScreen("detail");
  }

  function register(form) {
    const next = structuredClone(db);
    if (next.users.some((u) => u.phone === form.phone)) {
      notify("Ese telefono ya esta registrado.");
      return;
    }
    const user = {
      id: uid("u"),
      role: form.role,
      name: form.name,
      phone: form.phone,
      password: form.password,
      businessName: form.businessName || "",
      promoCredits: 10000,
      realCredits: 0,
      freePostsUsed: 0,
      promoBonusCycles: 0,
      createdAt: Date.now(),
    };
    next.users.push(user);
    log(next, "registro", `${user.name} se registro como ${user.role === "seller" ? "vendedor" : "particular"}`);
    commit(next);
    setCurrentUserId(user.id);
    setAdmin(false);
    setScreen("dashboard");
  }

  function login(phone, password) {
    if (phone === ADMIN_USER && password === ADMIN_PASS) {
      setAdmin(true);
      setCurrentUserId("");
      setScreen("admin");
      notify("Admin VELOX activo.");
      return;
    }
    const user = db.users.find((u) => u.phone === phone && u.password === password);
    if (!user) {
      notify("Telefono o contrasena incorrectos.");
      return;
    }
    setAdmin(false);
    setCurrentUserId(user.id);
    setScreen("dashboard");
  }

  function recoverPassword(phone) {
    const next = structuredClone(db);
    const user = next.users.find((u) => u.phone === phone);
    if (!user) {
      notify("No encontramos ese telefono.");
      return;
    }
    const pass = `VX${Math.floor(100000 + Math.random() * 899999)}`;
    user.password = pass;
    log(next, "recuperacion", `${user.name} genero contrasena temporal`);
    commit(next);
    setTempPass(pass);
  }

  function buyPack(pack) {
    if (!currentUser) {
      setScreen("auth");
      notify("Inicia sesion para generar una orden de creditos.");
      return;
    }
    const next = structuredClone(db);
    next.orders.unshift({
      id: uid("o"),
      userId: currentUser.id,
      packId: pack.id,
      credits: pack.credits,
      price: pack.price,
      status: "pendiente",
      createdAt: Date.now(),
    });
    log(next, "compra_creditos", `${currentUser.name} genero orden por ${pack.credits} creditos reales`);
    commit(next);
    window.open(MP_LINK, "_blank");
    notify("Orden pendiente creada. El admin carga los creditos al confirmar el pago.");
  }

  function requestService(service, vehicle) {
    if (!currentUser) {
      setScreen("auth");
      notify("Registrate para solicitar servicios VELOX.");
      return;
    }
    if (currentUser.realCredits < service.cost) {
      notify("Este servicio requiere creditos reales pagos. Los creditos promocionales no aplican.");
      setScreen("credits");
      return;
    }
    const next = structuredClone(db);
    const user = next.users.find((u) => u.id === currentUser.id);
    user.realCredits -= service.cost;
    log(next, "servicio", `${user.name} solicito ${service.name} para ${vehicle.title}`);
    commit(next);
    notify(`${service.name} solicitado. Se descontaron ${service.cost} creditos reales.`);
  }

  function approveOrder(orderId) {
    const next = structuredClone(db);
    const order = next.orders.find((o) => o.id === orderId);
    const user = next.users.find((u) => u.id === order.userId);
    if (!order || !user || order.status === "aprobada") return;
    order.status = "aprobada";
    user.realCredits += order.credits;
    log(next, "admin", `Admin aprobo ${order.credits} creditos reales para ${user.name}`);
    commit(next);
  }

  function deleteVehicle(vehicleId) {
    mutateVehicle(vehicleId, (v, next) => {
      v.active = false;
      log(next, "moderacion", `Admin elimino ${v.title}`);
    });
  }

  function assignMechanic(vehicleId, mechanicId) {
    mutateVehicle(vehicleId, (v, next) => {
      v.assignedMechanicId = mechanicId;
      log(next, "mecanico", `Admin asigno mecanico a ${v.title}`);
    });
  }

  function saveMechanicReview(vehicleId, review) {
    mutateVehicle(vehicleId, (v, next) => {
      const normalizedReview = normalizeMechanicReview(review, v);
      const score = calculateMechanicScore(normalizedReview);
      v.mechanicScore = score;
      v.mechanicReview = { ...normalizedReview, at: Date.now() };
      log(next, "revision", `Mecanico cargo revision para ${v.title}`);
    });
    notify("Revision mecanica guardada y score final recalculado.");
  }

  function publishVehicle(form) {
    if (!currentUser) {
      setScreen("auth");
      notify("Necesitas una cuenta para publicar.");
      return false;
    }
    const next = structuredClone(db);
    const user = next.users.find((u) => u.id === currentUser.id);
    const freeLimit = user.role === "seller" ? 3 : 1;
    if (user.freePostsUsed >= freeLimit) {
      if (user.promoCredits < 10) {
        notify("Necesitas 10 creditos promocionales para publicar otra unidad.");
        return false;
      }
      user.promoCredits -= 10;
    } else {
      user.freePostsUsed += 1;
    }
    const checklist = form.checklist;
    const vehicle = {
      id: uid("v"),
      ownerId: user.id,
      ...form,
      year: Number(form.year),
      km: Number(form.km),
      price: Number(form.price),
      checklist,
      sellerScore: calculateSellerScore(checklist),
      mechanicScore: null,
      mechanicReview: null,
      assignedMechanicId: "",
      active: true,
      createdAt: Date.now(),
      stats: { visits: 0, photoClicks: 0, videoViews: 0, priceUnlocks: 0, contacts: 0, creditsConsumed: 0 },
    };
    next.vehicles.unshift(vehicle);
    log(next, "publicacion", `${user.name} publico ${vehicle.title}`);
    commit(next);
    setSelectedVehicleId(vehicle.id);
    setScreen("detail");
    notify("Publicacion confirmada y activa.");
    return true;
  }

  const filteredVehicles = useMemo(() => {
    if (category === "all") return activeVehicles;
    if (category === "suv") return activeVehicles.filter((v) => v.subtype === "SUV");
    if (category === "pickup") return activeVehicles.filter((v) => v.subtype === "pick-up");
    return activeVehicles.filter((v) => v.type === category);
  }, [activeVehicles, category]);

  return (
    <div className="app">
      <style>{css}</style>
      {toast && <div className="toast">{toast}</div>}
      {modalPhoto && (
        <div className="photoModal" onClick={() => setModalPhoto("")}>
          <img src={modalPhoto} alt="Vehiculo ampliado" />
        </div>
      )}

      <Header
        currentUser={currentUser}
        admin={admin}
        setScreen={setScreen}
        logout={() => {
          setCurrentUserId("");
          setAdmin(false);
          setMechanicSessionId("");
          setScreen("home");
        }}
      />

      {screen === "home" && (
        <Home
          vehicles={filteredVehicles}
          category={category}
          setCategory={setCategory}
          onOpen={visitVehicle}
          currentUser={currentUser}
          chargeSeller={chargeSeller}
          openPhoto={(url, vehicle) => {
            if (chargeSeller(vehicle, "foto", 1)) setModalPhoto(url);
          }}
        />
      )}

      {screen === "detail" && selectedVehicle && (
        <VehicleDetail
          vehicle={selectedVehicle}
          seller={db.users.find((u) => u.id === selectedVehicle.ownerId)}
          currentUser={currentUser}
          chargeSeller={chargeSeller}
          openPhoto={(url) => {
            if (chargeSeller(selectedVehicle, "foto", 1)) setModalPhoto(url);
          }}
          requestService={requestService}
          setScreen={setScreen}
        />
      )}

      {screen === "auth" && (
        <Auth
          mode={authMode}
          setMode={setAuthMode}
          login={login}
          register={register}
          recoverPassword={recoverPassword}
          tempPass={tempPass}
        />
      )}

      {screen === "publish" && <Publish currentUser={currentUser} publishVehicle={publishVehicle} setScreen={setScreen} />}
      {screen === "dashboard" && currentUser && <Dashboard user={currentUser} vehicles={db.vehicles.filter((v) => v.ownerId === currentUser.id)} setScreen={setScreen} />}
      {screen === "credits" && <Credits currentUser={currentUser} buyPack={buyPack} setScreen={setScreen} />}
      {screen === "admin" && admin && (
        <AdminPanel
          db={db}
          approveOrder={approveOrder}
          deleteVehicle={deleteVehicle}
          assignMechanic={assignMechanic}
        />
      )}
      {screen === "mechanic" && (
        <MechanicPanel
          db={db}
          mechanicSessionId={mechanicSessionId}
          setMechanicSessionId={setMechanicSessionId}
          saveMechanicReview={saveMechanicReview}
          notify={notify}
        />
      )}
    </div>
  );
}

function Header({ currentUser, admin, setScreen, logout }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => setScreen("home")}>
        <span className="logoMark">VX</span>
        <span>VELOX</span>
      </button>
      <nav>
        <button onClick={() => setScreen("home")}>Explorar</button>
        <button onClick={() => setScreen("credits")}>Creditos</button>
        {currentUser && <button onClick={() => setScreen("publish")}>Publicar</button>}
        {currentUser && <button onClick={() => setScreen("dashboard")}>Panel</button>}
        {admin && <button onClick={() => setScreen("admin")}>Admin</button>}
        <button onClick={() => setScreen("mechanic")}>Mecanicos</button>
      </nav>
      <div className="session">
        {currentUser ? (
          <>
            <span>{currentUser.businessName || currentUser.name}</span>
            <button className="ghost" onClick={logout}>Salir</button>
          </>
        ) : admin ? (
          <>
            <span>Admin</span>
            <button className="ghost" onClick={logout}>Salir</button>
          </>
        ) : (
          <button className="primary small" onClick={() => setScreen("auth")}>Ingresar</button>
        )}
      </div>
    </header>
  );
}

function Home({ vehicles, category, setCategory, onOpen, currentUser, chargeSeller, openPhoto }) {
  const cats = [
    ["all", "Todos", "Mercado activo"],
    ["auto", "Autos", "Sedanes, hatchbacks y premium"],
    ["suv", "SUV", "Camionetas familiares"],
    ["pickup", "Pick-up", "Con caja y trabajo"],
    ["moto", "Motos", "Urbanas y ruta"],
  ];
  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Marketplace inteligente de vehiculos</p>
          <h1>VELOX</h1>
          <p className="heroText">
            Compradores navegan gratis. Vendedores pagan solo cuando aparece interes real medido por interacciones.
          </p>
          <div className="heroActions">
            <button className="primary" onClick={() => document.getElementById("grid")?.scrollIntoView({ behavior: "smooth" })}>Ver vehiculos</button>
            <button className="secondary">Validacion 90 dias</button>
          </div>
        </div>
        <div className="heroCar">
          <div className="carShape"><span /></div>
          <div className="metricGlass">
            <b>Score VELOX</b>
            <strong>8.7</strong>
            <small>Excelente</small>
          </div>
        </div>
      </section>

      <section className="categoryBar">
        {cats.map(([id, name, sub]) => (
          <button className={category === id ? "cat active" : "cat"} key={id} onClick={() => setCategory(id)}>
            <span>{name}</span>
            <small>{sub}</small>
          </button>
        ))}
      </section>

      <section id="grid" className="vehicleGrid">
        {vehicles.map((vehicle) => (
          <VehicleCard key={vehicle.id} vehicle={vehicle} currentUser={currentUser} onOpen={onOpen} chargeSeller={chargeSeller} openPhoto={openPhoto} />
        ))}
      </section>
    </main>
  );
}

function VehicleCard({ vehicle, currentUser, onOpen, chargeSeller, openPhoto }) {
  const score = finalScore(vehicle);
  return (
    <article className="vehicleCard">
      <button className="imageButton" onClick={() => openPhoto(vehicle.photos[0], vehicle)}>
        <img src={vehicle.photos[0]} alt={vehicle.title} />
        <span className="badge">{score.toFixed(1)} · {scoreLabel(score)}</span>
      </button>
      <div className="cardBody">
        <div className="cardTop">
          <h3>{vehicle.title}</h3>
          <span>{vehicle.year}</span>
        </div>
        <p>{vehicle.description}</p>
        <div className="lockedRow">
          <span>{currentUser ? `${vehicle.km.toLocaleString("es-AR")} km` : "Km ocultos"}</span>
          <span>{currentUser ? money(vehicle.price) : "Precio bloqueado"}</span>
        </div>
        <div className="cardActions">
          <button className="secondary" onClick={() => onOpen(vehicle)}>Ver detalle</button>
          <button className="ghost" onClick={() => chargeSeller(vehicle, "precio", 2)}>Desbloquear precio</button>
        </div>
      </div>
    </article>
  );
}

function VehicleDetail({ vehicle, seller, currentUser, chargeSeller, openPhoto, requestService, setScreen }) {
  const [showPrice, setShowPrice] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const score = finalScore(vehicle);
  return (
    <main className="detailLayout">
      <section className="gallery">
        <img className="mainPhoto" src={vehicle.photos[0]} alt={vehicle.title} onClick={() => openPhoto(vehicle.photos[0])} />
        <div className="thumbs">
          {vehicle.photos.slice(0, 8).map((p) => (
            <button key={p} onClick={() => openPhoto(p)}><img src={p} alt="Foto vehiculo" /></button>
          ))}
        </div>
        {vehicle.video ? (
          <video className="videoPreview" src={vehicle.video} controls onPlay={() => chargeSeller(vehicle, "video", 1)} />
        ) : (
          <button className="videoBox" onClick={() => chargeSeller(vehicle, "video", 1)}>Video no cargado</button>
        )}
      </section>

      <section className="detailInfo">
        <p className="eyebrow">{vehicle.brand} · {vehicle.model} · {vehicle.location}</p>
        <h2>{vehicle.title}</h2>
        <p>{vehicle.description}</p>
        <div className="specGrid">
          <Info label="Año" value={vehicle.year} />
          <Info label="Km" value={currentUser ? `${vehicle.km.toLocaleString("es-AR")} km` : "Oculto"} />
          <Info label="Dominio" value={currentUser ? vehicle.plate : "Oculto"} />
          <Info label="Combustible" value={vehicle.fuel} />
        </div>
        <div className="pricePanel">
          <div>
            <small>Precio</small>
            <strong>{showPrice && currentUser ? money(vehicle.price) : "Bloqueado"}</strong>
          </div>
          <button className="primary" onClick={() => chargeSeller(vehicle, "precio", 2) && setShowPrice(true)}>Desbloquear precio</button>
        </div>
        <div className="contactPanel">
          <span>Vendedor: {seller?.businessName || seller?.name || "Particular"}</span>
          <button className="secondary" onClick={() => chargeSeller(vehicle, "contacto", 2) && setShowContact(true)}>Pedir contacto</button>
          {showContact && currentUser && <b>{vehicle.phone}</b>}
        </div>
      </section>

      <section className="widePanel">
        <ScoreBlock vehicle={vehicle} />
        <div className="reviewStack">
          <Croquis checklist={vehicle.checklist} />
          <MechanicReviewSummary vehicle={vehicle} />
        </div>
      </section>

      <section className="widePanel two">
        <ChecklistSummary checklist={vehicle.checklist} />
        <div className="servicePanel">
          <h3>Servicios VELOX</h3>
          <p>Los servicios pagos usan creditos reales. Los promocionales no aplican.</p>
          <div className="serviceGrid">
            {paidServices.map((s) => (
              <button className={s.premium ? "service premium" : "service"} key={s.key} onClick={() => requestService(s, vehicle)}>
                <span>{s.name}</span>
                <b>{s.cost.toLocaleString("es-AR")} cr</b>
              </button>
            ))}
          </div>
          <button className="ghost" onClick={() => setScreen("credits")}>Comprar creditos reales</button>
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }) {
  return <div className="info"><small>{label}</small><b>{value}</b></div>;
}

function ScoreBlock({ vehicle }) {
  const seller = vehicle.sellerScore || calculateSellerScore(vehicle.checklist);
  const score = finalScore(vehicle);
  return (
    <div className="scoreBox">
      <small>{vehicle.mechanicScore ? "Score final VELOX" : "Score preliminar del vendedor"}</small>
      <strong>{score.toFixed(1)}</strong>
      <span>{scoreLabel(score)}</span>
      <div className="scoreBars">
        <i style={{ width: `${seller * 10}%` }} />
        {vehicle.mechanicScore && <i className="gold" style={{ width: `${vehicle.mechanicScore * 10}%` }} />}
      </div>
      <p>{vehicle.mechanicScore ? "40% vendedor + 60% mecanico." : "Aun no tiene revision mecanica asignada."}</p>
    </div>
  );
}

function MechanicReviewSummary({ vehicle }) {
  if (!vehicle.mechanicReview) {
    return (
      <div className="checkSummary">
        <h3>Revision mecanica</h3>
        <p>Aun no hay novedades cargadas por el mecanico asignado.</p>
      </div>
    );
  }
  const review = normalizeMechanicReview(vehicle.mechanicReview, vehicle);
  const comparison = compareChecklists(vehicle.checklist, review.checklist);
  return (
    <div className="checkSummary">
      <h3>Revision mecanica</h3>
      <div className="chips">
        <span>Estado: {review.estado}</span>
        <span>Coincidencias: {comparison.matches}/{comparison.total}</span>
        <span>Motor: {review.checklist.scores.motor}/10</span>
        <span>Caja: {review.checklist.scores.caja}/10</span>
        <span>Frenos: {review.checklist.scores.frenos}/10</span>
        <span>Pintura: {review.checklist.scores.pintura}/10</span>
      </div>
      <p>{review.observaciones || "Sin observaciones cargadas."}</p>
      {comparison.differences.length > 0 && (
        <div className="diffBox">
          <b>No coincide con el vendedor:</b>
          {comparison.differences.slice(0, 8).map((item) => <span key={item}>{item}</span>)}
        </div>
      )}
      {review.photos?.length > 0 && (
        <div className="previewStrip">{review.photos.map((p) => <img key={p} src={p} alt="Detalle mecanico" />)}</div>
      )}
      {review.video && <video className="videoPreview" src={review.video} controls />}
    </div>
  );
}

function Croquis({ checklist }) {
  const parts = [
    ["motor", checklist.scores.motor],
    ["caja", checklist.scores.caja],
    ["frenos", checklist.scores.frenos],
    ["pintura", checklist.scores.pintura],
    ["interior", checklist.scores.interior],
    ["cubiertas", average(Object.values(checklist.tires)) / 10],
  ];
  return (
    <div className="croquis">
      <h3>Croquis VELOX</h3>
      <div className="miniCar">
        {parts.map(([name, value]) => (
          <span className={value >= 8 ? "ok" : value >= 6 ? "warn" : "bad"} key={name}>{name}</span>
        ))}
      </div>
    </div>
  );
}

function ChecklistSummary({ checklist }) {
  return (
    <div className="checkSummary">
      <h3>Checklist resumido</h3>
      <div className="chips">
        <span>Documentacion: {checklist.docs ? "si" : "no"}</span>
        <span>Cedula verde: {checklist.greenCard ? "si" : "no"}</span>
        <span>RTO/VTV: {checklist.rto}</span>
        <span>Deudas: {checklist.debts ? "declaradas" : "sin declarar"}</span>
        <span>Multas: {checklist.tickets ? "declaradas" : "sin declarar"}</span>
      </div>
      <p>{Object.values(checklist.observations).filter(Boolean).join(" · ") || "Sin observaciones relevantes declaradas por el vendedor."}</p>
    </div>
  );
}

function Auth({ mode, setMode, login, register, recoverPassword, tempPass }) {
  const [form, setForm] = useState({ role: "buyer", name: "", phone: "", password: "", businessName: "" });
  return (
    <main className="authPanel">
      <div className="authBox">
        <h2>{mode === "register" ? "Crear cuenta VELOX" : mode === "recover" ? "Recuperar contrasena" : "Ingresar"}</h2>
        {mode === "register" && (
          <>
            <div className="segmented">
              <button className={form.role === "buyer" ? "active" : ""} onClick={() => setForm({ ...form, role: "buyer" })}>Particular</button>
              <button className={form.role === "seller" ? "active" : ""} onClick={() => setForm({ ...form, role: "seller" })}>Vendedor de autos</button>
            </div>
            <input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {form.role === "seller" && <input placeholder="Nombre comercial" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />}
          </>
        )}
        <input placeholder={mode === "login" ? "Telefono o admin" : "Telefono"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        {mode !== "recover" && <input placeholder="Contrasena" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        {mode === "login" && <button className="primary" onClick={() => login(form.phone, form.password)}>Ingresar</button>}
        {mode === "register" && <button className="primary" onClick={() => register(form)}>Registrarme y recibir 10.000 creditos</button>}
        {mode === "recover" && <button className="primary" onClick={() => recoverPassword(form.phone)}>Generar temporal</button>}
        {tempPass && <div className="notice">Contrasena temporal: <b>{tempPass}</b>. En produccion se enviara por WhatsApp.</div>}
        <div className="authLinks">
          <button onClick={() => setMode("login")}>Ya tengo cuenta</button>
          <button onClick={() => setMode("register")}>Crear cuenta</button>
          <button onClick={() => setMode("recover")}>Olvide contrasena</button>
        </div>
      </div>
    </main>
  );
}

function Publish({ currentUser, publishVehicle, setScreen }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [form, setForm] = useState({
    type: "auto",
    subtype: "auto",
    saleType: "propio",
    brand: "",
    model: "",
    title: "",
    year: "",
    km: "",
    price: "",
    plate: "",
    location: "",
    phone: currentUser?.phone || "",
    fuel: "Nafta",
    description: "",
    photos: [],
    video: "",
    checklist: structuredClone(initialChecklist),
  });
  async function handlePhotos(files) {
    const valid = [...files].slice(0, 8).filter((f) => f.size <= 3 * 1024 * 1024);
    const urls = await Promise.all(valid.map(fileToDataUrl));
    setForm({ ...form, photos: urls });
  }
  async function handleVideo(file) {
    if (!file || file.size > 25 * 1024 * 1024) return;
    setForm({ ...form, video: await fileToDataUrl(file) });
  }
  function updateChecklist(path, value) {
    const next = structuredClone(form.checklist);
    const [group, key] = path.split(".");
    if (key) next[group][key] = value;
    else next[group] = value;
    setForm({ ...form, checklist: next });
  }
  function readyToPublish() {
    const required = [form.brand, form.model, form.title, form.year, form.km, form.price, form.location, form.phone, form.description];
    return required.every((value) => String(value || "").trim());
  }
  function confirmPublish() {
    if (publishing) return;
    if (!readyToPublish()) {
      alert("Completá marca, modelo, titulo, año, km, precio, ubicacion, telefono y descripcion antes de publicar.");
      return;
    }
    setPublishing(true);
    const ok = publishVehicle({ ...form, photos: form.photos.length ? form.photos : seedImages.slice(0, 1) });
    if (!ok) setPublishing(false);
  }
  const scoreKeys = Object.keys(form.checklist.scores);
  const tireKeys = Object.keys(form.checklist.tires);
  return (
    <main className="publish">
      {confirmOpen && (
        <div className="confirmModal">
          <div className="confirmBox">
            <p className="eyebrow">Confirmar publicacion</p>
            <h3>{form.title || "Vehiculo sin titulo"}</h3>
            <p>
              Revisá bien los datos. Al confirmar, la publicación queda activa automáticamente y se muestra en VELOX.
            </p>
            <div className="specGrid">
              <Info label="Vehiculo" value={`${form.brand || "-"} ${form.model || "-"}`} />
              <Info label="Año" value={form.year || "-"} />
              <Info label="Precio" value={form.price ? money(form.price) : "-"} />
            </div>
            <div className="cardActions">
              <button className="secondary" disabled={publishing} onClick={() => setConfirmOpen(false)}>Volver a editar</button>
              <button className="primary" disabled={publishing} onClick={confirmPublish}>
                {publishing ? "Publicando..." : "Confirmar y publicar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <h2>Publicar vehiculo</h2>
      {!currentUser && <div className="notice">Necesitas registrarte para publicar.</div>}
      <div className="formGrid">
        <Select label="Tipo" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={["auto", "camioneta", "moto"]} />
        <Select label="Subtipo" value={form.subtype} onChange={(v) => setForm({ ...form, subtype: v })} options={["auto", "SUV", "pick-up", "moto"]} />
        <Select label="Venta" value={form.saleType} onChange={(v) => setForm({ ...form, saleType: v })} options={["propio", "consignacion"]} />
        {["brand", "model", "title", "year", "km", "price", "plate", "location", "phone", "fuel"].map((k) => (
          <label key={k}>{k}<input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
        ))}
        <label className="full">Descripcion<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label>Fotos maximo 8<input type="file" accept="image/*" multiple onChange={(e) => handlePhotos(e.target.files)} /></label>
        <label>Video corto<input type="file" accept="video/*" onChange={(e) => handleVideo(e.target.files[0])} /></label>
      </div>
      <div className="previewStrip">{form.photos.map((p) => <img key={p} src={p} alt="Preview" />)}</div>
      {form.video && <video className="videoPreview" src={form.video} controls />}

      <section className="checkEditor">
        <h3>Checklist del vendedor</h3>
        <div className="formGrid">
          <label><input type="checkbox" checked={form.checklist.docs} onChange={(e) => updateChecklist("docs", e.target.checked)} /> Tiene documentacion/titulo</label>
          <label><input type="checkbox" checked={form.checklist.greenCard} onChange={(e) => updateChecklist("greenCard", e.target.checked)} /> Tiene cedula verde</label>
          <Select label="RTO/VTV" value={form.checklist.rto} onChange={(v) => updateChecklist("rto", v)} options={["vigente", "vencida", "no tiene"]} />
          <label><input type="checkbox" checked={form.checklist.debts} onChange={(e) => updateChecklist("debts", e.target.checked)} /> Informa deudas conocidas</label>
          <label><input type="checkbox" checked={form.checklist.tickets} onChange={(e) => updateChecklist("tickets", e.target.checked)} /> Informa multas conocidas</label>
        </div>
        <h4>Estado general 1 a 10</h4>
        <div className="sliderGrid">
          {scoreKeys.map((k) => <Slider key={k} label={k} value={form.checklist.scores[k]} onChange={(v) => updateChecklist(`scores.${k}`, Number(v))} min="1" max="10" />)}
        </div>
        <h4>Cubiertas 10% a 100%</h4>
        <div className="sliderGrid">
          {tireKeys.map((k) => <Slider key={k} label={k} value={form.checklist.tires[k]} onChange={(v) => updateChecklist(`tires.${k}`, Number(v))} min="10" max="100" step="10" />)}
        </div>
        <h4>Observaciones</h4>
        <div className="formGrid">
          {Object.keys(form.checklist.observations).map((k) => (
            <label key={k}>{k}<input value={form.checklist.observations[k]} onChange={(e) => updateChecklist(`observations.${k}`, e.target.value)} /></label>
          ))}
        </div>
      </section>

      <div className="stickyActions">
        <button className="secondary" onClick={() => setScreen("home")}>Cancelar</button>
        <button className="primary" disabled={publishing} onClick={() => {
          if (!readyToPublish()) {
            alert("Completá los campos principales antes de publicar.");
            return;
          }
          setConfirmOpen(true);
        }}>
          Revisar publicacion
        </button>
      </div>
    </main>
  );
}

function Select({ label, value, onChange, options }) {
  return <label>{label}<select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select></label>;
}

function Slider({ label, value, onChange, min, max, step = "1" }) {
  return <label className="slider"><span>{label} <b>{value}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Dashboard({ user, vehicles, setScreen }) {
  return (
    <main className="dashboard">
      <section className="panelHeader">
        <div><p className="eyebrow">Panel del vendedor</p><h2>{user.businessName || user.name}</h2></div>
        <button className="primary" onClick={() => setScreen("publish")}>Publicar vehiculo</button>
      </section>
      <div className="statGrid">
        <Info label="Creditos promocionales" value={user.promoCredits.toLocaleString("es-AR")} />
        <Info label="Creditos reales" value={user.realCredits.toLocaleString("es-AR")} />
        <Info label="Publicaciones" value={vehicles.filter((v) => v.active).length} />
      </div>
      <section className="table">
        {vehicles.map((v) => (
          <div className="row" key={v.id}>
            <b>{v.title}</b>
            <span>{v.stats.visits} visitas</span>
            <span>{v.stats.photoClicks} fotos</span>
            <span>{v.stats.videoViews} videos</span>
            <span>{v.stats.priceUnlocks} precios</span>
            <span>{v.stats.contacts} contactos</span>
            <span>{v.stats.creditsConsumed} cr usados</span>
            <strong className={`interest ${interestLevel(v.stats)}`}>Interes {interestLevel(v.stats)}</strong>
          </div>
        ))}
      </section>
    </main>
  );
}

function Credits({ currentUser, buyPack, setScreen }) {
  return (
    <main className="credits">
      <section className="panelHeader">
        <div>
          <p className="eyebrow">Creditos reales</p>
          <h2>Comprar creditos para servicios pagos</h2>
          <p>1 credito real = $1. Se genera una orden pendiente y el admin la confirma manualmente.</p>
        </div>
        {!currentUser && <button className="primary" onClick={() => setScreen("auth")}>Ingresar</button>}
      </section>
      <div className="packGrid">
        {realCreditPacks.map((pack) => (
          <article className="pack" key={pack.id}>
            <h3>{pack.name}</h3>
            <strong>{money(pack.price)}</strong>
            <p>{pack.credits.toLocaleString("es-AR")} creditos reales</p>
            <button className="primary" onClick={() => buyPack(pack)}>Comprar con Mercado Pago</button>
          </article>
        ))}
      </div>
    </main>
  );
}

function AdminPanel({ db, approveOrder, deleteVehicle, assignMechanic }) {
  const sellers = db.users.filter((u) => u.role === "seller").length;
  const pendingMechanic = db.vehicles.filter((v) => v.active && v.assignedMechanicId && !v.mechanicReview).length;
  const pendingOrders = db.orders.filter((o) => o.status === "pendiente").length;
  return (
    <main className="admin">
      <section className="panelHeader"><div><p className="eyebrow">Admin oculto</p><h2>Centro de control VELOX</h2></div></section>
      <div className="statGrid">
        <Info label="Usuarios" value={db.users.length} />
        <Info label="Vendedores" value={sellers} />
        <Info label="Vehiculos" value={db.vehicles.length} />
        <Info label="Activas" value={db.vehicles.filter((v) => v.active).length} />
        <Info label="Pendientes mecanico" value={pendingMechanic} />
        <Info label="Pagos pendientes" value={pendingOrders} />
      </div>

      <h3>Vehiculos</h3>
      <section className="table">
        {db.vehicles.map((v) => (
          <div className="row" key={v.id}>
            <b>{v.title}</b>
            <span>{v.active ? "activa" : "eliminada"}</span>
            <select value={v.assignedMechanicId} onChange={(e) => assignMechanic(v.id, e.target.value)}>
              <option value="">Sin mecanico</option>
              {db.mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className="danger" onClick={() => deleteVehicle(v.id)}>Eliminar</button>
          </div>
        ))}
      </section>

      <h3>Creditos</h3>
      <section className="table">
        {db.orders.map((o) => {
          const user = db.users.find((u) => u.id === o.userId);
          return (
            <div className="row" key={o.id}>
              <b>{user?.name}</b>
              <span>{o.credits.toLocaleString("es-AR")} creditos</span>
              <span>{money(o.price)}</span>
              <span>{o.status}</span>
              {o.status === "pendiente" && <button className="primary small" onClick={() => approveOrder(o.id)}>Aprobar</button>}
            </div>
          );
        })}
      </section>

      <h3>Mecanicos</h3>
      <section className="table">
        {db.mechanics.map((m) => (
          <div className="row" key={m.id}>
            <b>{m.name}</b>
            <span>Telefono: {m.phone}</span>
            <span>Clave MVP: {m.password}</span>
            <span>{db.vehicles.filter((v) => v.assignedMechanicId === m.id && v.active).length} asignados</span>
          </div>
        ))}
      </section>

      <h3>Actividad</h3>
      <section className="activity">
        {db.activity.map((a) => <p key={a.id}><b>{a.type}</b> {a.text} <small>{new Date(a.at).toLocaleString("es-AR")}</small></p>)}
      </section>
    </main>
  );
}

function MechanicPanel({ db, mechanicSessionId, setMechanicSessionId, saveMechanicReview, notify }) {
  const [login, setLogin] = useState({ phone: "", password: "" });
  const activeMechanic = db.mechanics.find((m) => m.id === mechanicSessionId);
  const mechanicId = activeMechanic?.id || "";
  const assigned = db.vehicles.filter((v) => v.active && v.assignedMechanicId === mechanicId);

  function enterMechanic() {
    const mechanic = db.mechanics.find((m) => m.phone === login.phone && m.password === login.password);
    if (!mechanic) {
      notify("Telefono o clave de mecanico incorrectos.");
      return;
    }
    setMechanicSessionId(mechanic.id);
    notify(`Panel mecanico activo: ${mechanic.name}`);
  }

  if (!activeMechanic) {
    return (
      <main className="mechanic authPanel">
        <div className="authBox">
          <p className="eyebrow">Acceso mecanico</p>
          <h2>Ingresar al panel de revision</h2>
          <p className="notice">El mecanico no se registra solo. El admin lo asigna y le entrega su clave MVP.</p>
          <input placeholder="Telefono del mecanico" value={login.phone} onChange={(e) => setLogin({ ...login, phone: e.target.value })} />
          <input placeholder="Clave de mecanico" type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
          <button className="primary" onClick={enterMechanic}>Entrar como mecanico</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mechanic">
      <section className="panelHeader">
        <div><p className="eyebrow">Panel mecanico</p><h2>{activeMechanic.name}</h2></div>
        <button className="ghost" onClick={() => setMechanicSessionId("")}>Salir</button>
      </section>
      {assigned.length === 0 && <div className="notice">Este mecanico no tiene vehiculos asignados.</div>}
      {assigned.map((v) => <MechanicReviewFull key={v.id} vehicle={v} saveMechanicReview={saveMechanicReview} />)}
    </main>
  );
}

function MechanicReviewFull({ vehicle, saveMechanicReview }) {
  const [review, setReview] = useState(normalizeMechanicReview(vehicle.mechanicReview, vehicle));
  const scoreKeys = Object.keys(review.checklist.scores);
  const tireKeys = Object.keys(review.checklist.tires);
  const observationKeys = Object.keys(review.checklist.observations);
  const comparison = compareChecklists(vehicle.checklist, review.checklist);

  function updateChecklist(path, value) {
    const next = structuredClone(review.checklist);
    const [group, key] = path.split(".");
    if (key) next[group][key] = value;
    else next[group] = value;
    setReview({ ...review, checklist: next });
  }

  async function handleMechanicPhotos(files) {
    const valid = [...files].slice(0, 8).filter((f) => f.size <= 3 * 1024 * 1024);
    const urls = await Promise.all(valid.map(fileToDataUrl));
    setReview({ ...review, photos: urls });
  }

  async function handleMechanicVideo(file) {
    if (!file || file.size > 25 * 1024 * 1024) return;
    setReview({ ...review, video: await fileToDataUrl(file) });
  }

  return (
    <section className="reviewCard">
      <h3>{vehicle.title}</h3>
      {vehicle.mechanicReview && (
        <div className="notice">
          Ultima revision: <b>{vehicle.mechanicReview.estado}</b> - Score mecanico {vehicle.mechanicScore?.toFixed(1)}
          {vehicle.mechanicReview.observaciones && <p>{vehicle.mechanicReview.observaciones}</p>}
        </div>
      )}
      <div className="notice">
        Comparacion con vendedor: <b>{comparison.matches}/{comparison.total} coincidencias</b>
        {comparison.differences.length > 0 && <p>{comparison.differences.slice(0, 4).join(" | ")}</p>}
      </div>

      <h4>Documentacion revisada</h4>
      <div className="formGrid">
        <label><input type="checkbox" checked={review.checklist.docs} onChange={(e) => updateChecklist("docs", e.target.checked)} /> Tiene documentacion/titulo</label>
        <label><input type="checkbox" checked={review.checklist.greenCard} onChange={(e) => updateChecklist("greenCard", e.target.checked)} /> Tiene cedula verde</label>
        <Select label="RTO/VTV" value={review.checklist.rto} onChange={(v) => updateChecklist("rto", v)} options={["vigente", "vencida", "no tiene"]} />
        <label><input type="checkbox" checked={review.checklist.debts} onChange={(e) => updateChecklist("debts", e.target.checked)} /> Detecta deudas conocidas</label>
        <label><input type="checkbox" checked={review.checklist.tickets} onChange={(e) => updateChecklist("tickets", e.target.checked)} /> Detecta multas conocidas</label>
      </div>

      <h4>Estado mecanico y estetico 1 a 10</h4>
      <div className="sliderGrid">
        {scoreKeys.map((k) => (
          <Slider key={k} label={k} value={review.checklist.scores[k]} min="1" max="10" onChange={(v) => updateChecklist(`scores.${k}`, Number(v))} />
        ))}
      </div>

      <h4>Cubiertas 10% a 100%</h4>
      <div className="sliderGrid">
        {tireKeys.map((k) => (
          <Slider key={k} label={k} value={review.checklist.tires[k]} min="10" max="100" step="10" onChange={(v) => updateChecklist(`tires.${k}`, Number(v))} />
        ))}
      </div>

      <h4>Detalles observados</h4>
      <div className="formGrid">
        {observationKeys.map((k) => (
          <label key={k}>{k}<input value={review.checklist.observations[k]} onChange={(e) => updateChecklist(`observations.${k}`, e.target.value)} /></label>
        ))}
      </div>

      <textarea placeholder="Observaciones generales del mecanico" value={review.observaciones} onChange={(e) => setReview({ ...review, observaciones: e.target.value })} />
      <div className="formGrid">
        <label>Fotos de detalles maximo 8<input type="file" accept="image/*" multiple onChange={(e) => handleMechanicPhotos(e.target.files)} /></label>
        <label>Video de revision<input type="file" accept="video/*" onChange={(e) => handleMechanicVideo(e.target.files[0])} /></label>
      </div>
      {review.photos?.length > 0 && <div className="previewStrip">{review.photos.map((p) => <img key={p} src={p} alt="Detalle mecanico" />)}</div>}
      {review.video && <video className="videoPreview" src={review.video} controls />}
      <div className="cardActions">
        <button className="secondary" onClick={() => saveMechanicReview(vehicle.id, { ...review, estado: "observado" })}>Observar</button>
        <button className="primary" onClick={() => saveMechanicReview(vehicle.id, { ...review, estado: "aprobado" })}>Aprobar</button>
      </div>
    </section>
  );
}

function MechanicReview({ vehicle, saveMechanicReview }) {
  const [review, setReview] = useState(vehicle.mechanicReview || { motor: 8, caja: 8, estructura: 8, frenos: 8, electronica: 8, interior: 8, observaciones: "", estado: "aprobado" });
  return (
    <section className="reviewCard">
      <h3>{vehicle.title}</h3>
      {vehicle.mechanicReview && (
        <div className="notice">
          Ultima revision: <b>{vehicle.mechanicReview.estado}</b> · Score mecanico {vehicle.mechanicScore?.toFixed(1)}
          {vehicle.mechanicReview.observaciones && <p>{vehicle.mechanicReview.observaciones}</p>}
        </div>
      )}
      <div className="sliderGrid">
        {["motor", "caja", "estructura", "frenos", "electronica", "interior"].map((k) => (
          <Slider key={k} label={k} value={review[k]} min="1" max="10" onChange={(v) => setReview({ ...review, [k]: Number(v) })} />
        ))}
      </div>
      <textarea placeholder="Observaciones" value={review.observaciones} onChange={(e) => setReview({ ...review, observaciones: e.target.value })} />
      <div className="cardActions">
        <button className="secondary" onClick={() => saveMechanicReview(vehicle.id, { ...review, estado: "observado" })}>Observar</button>
        <button className="primary" onClick={() => saveMechanicReview(vehicle.id, { ...review, estado: "aprobado" })}>Aprobar</button>
      </div>
    </section>
  );
}

const css = `
:root{color-scheme:dark;--bg:#05070d;--panel:#0b1020;--panel2:#11182a;--line:#243047;--text:#f5f7fb;--muted:#aab4ca;--blue:#1167ff;--blue2:#00a3ff;--gold:#d8ad54;--danger:#ff5266;--green:#36d17f;--yellow:#f5c84c;--red:#ff5d5d}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 70% 0%,#10275d 0,#05070d 36%);font-family:Inter,ui-sans-serif,system-ui,Segoe UI,Arial,sans-serif;color:var(--text)}button,input,select,textarea{font:inherit}button{cursor:pointer}main{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:28px 0 56px}.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 28px;background:rgba(5,7,13,.78);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,.08)}.brand{display:flex;align-items:center;gap:10px;color:white;background:none;border:0;font-weight:900;font-size:22px;letter-spacing:2px}.logoMark{display:grid;place-items:center;width:38px;height:28px;border:1px solid var(--gold);border-radius:999px;color:var(--blue2);font-size:28px;line-height:1}.topbar nav{display:flex;gap:8px;flex-wrap:wrap}.topbar nav button,.ghost{background:transparent;color:var(--muted);border:1px solid transparent;border-radius:8px;padding:9px 11px}.topbar nav button:hover,.ghost:hover{border-color:var(--line);color:white}.session{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:14px}.primary,.secondary,.danger{border:0;border-radius:8px;padding:11px 15px;font-weight:800;color:white}.primary{background:linear-gradient(135deg,var(--blue),var(--blue2));box-shadow:0 12px 32px rgba(17,103,255,.28)}.secondary{background:#151e33;border:1px solid var(--line);color:#eef4ff}.danger{background:rgba(255,82,102,.14);border:1px solid rgba(255,82,102,.4);color:#ffb7c0}.small{padding:8px 11px;font-size:13px}.hero{min-height:560px;display:grid;grid-template-columns:1.05fr .95fr;align-items:center;gap:36px}.eyebrow{margin:0 0 10px;color:var(--gold);font-size:13px;text-transform:uppercase;letter-spacing:1.6px}.hero h1{font-size:clamp(64px,11vw,138px);line-height:.85;margin:0 0 22px;letter-spacing:0}.heroText{max-width:640px;font-size:21px;line-height:1.55;color:#d5def3}.heroActions,.cardActions{display:flex;gap:12px;flex-wrap:wrap}.heroCar{position:relative;min-height:340px;border:1px solid rgba(216,173,84,.28);background:linear-gradient(145deg,rgba(17,103,255,.22),rgba(255,255,255,.03));border-radius:8px;overflow:hidden}.carShape{position:absolute;inset:30px;display:grid;place-items:center}.carShape:before{content:"";width:80%;height:100px;border:3px solid var(--blue2);border-bottom:12px solid var(--blue2);border-radius:80px 110px 24px 24px;box-shadow:0 0 55px rgba(0,163,255,.4)}.carShape span:before,.carShape span:after{content:"";position:absolute;bottom:94px;width:62px;height:62px;border-radius:50%;background:#070b14;border:8px solid var(--gold)}.carShape span:before{left:23%}.carShape span:after{right:23%}.metricGlass{position:absolute;right:24px;bottom:24px;width:170px;padding:18px;border:1px solid rgba(255,255,255,.16);background:rgba(10,15,28,.7);backdrop-filter:blur(14px);border-radius:8px}.metricGlass strong{display:block;font-size:46px;color:white}.metricGlass small{color:var(--gold)}.categoryBar{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:26px}.cat{min-height:88px;text-align:left;border:1px solid var(--line);background:rgba(17,24,42,.78);border-radius:8px;padding:16px;color:white}.cat span{display:block;font-weight:900;font-size:18px}.cat small{color:var(--muted)}.cat.active{border-color:var(--blue2);box-shadow:inset 0 0 0 1px rgba(0,163,255,.35)}.vehicleGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.vehicleCard,.authBox,.pack,.reviewCard{border:1px solid var(--line);background:linear-gradient(180deg,rgba(17,24,42,.92),rgba(8,12,23,.94));border-radius:8px;overflow:hidden}.imageButton{position:relative;width:100%;border:0;background:#0b1020;padding:0}.imageButton img{width:100%;aspect-ratio:1.55;object-fit:cover;display:block}.badge{position:absolute;left:12px;bottom:12px;padding:7px 10px;background:rgba(5,7,13,.72);border:1px solid rgba(216,173,84,.45);border-radius:999px;color:white;font-size:13px}.cardBody{padding:16px}.cardTop{display:flex;justify-content:space-between;gap:12px}.cardTop h3,.detailInfo h2{margin:0;font-size:20px}.cardBody p,.detailInfo p,.servicePanel p,.credits p{color:var(--muted);line-height:1.55}.lockedRow{display:flex;justify-content:space-between;gap:12px;margin:14px 0;color:#dce7ff;font-weight:800}.detailLayout{display:grid;grid-template-columns:1fr 1fr;gap:22px}.gallery,.detailInfo,.widePanel,.publish,.dashboard,.credits,.admin,.mechanic{border:1px solid rgba(255,255,255,.08);background:rgba(8,12,23,.62);border-radius:8px;padding:18px}.mainPhoto{width:100%;aspect-ratio:1.45;object-fit:cover;border-radius:8px}.thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}.thumbs button{border:1px solid var(--line);background:#0b1020;padding:0;border-radius:8px;overflow:hidden}.thumbs img{width:100%;height:72px;object-fit:cover;display:block}.videoBox{width:100%;margin-top:10px;border:1px dashed var(--blue2);background:rgba(17,103,255,.1);color:white;border-radius:8px;padding:18px}.specGrid,.statGrid,.packGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.info{padding:14px;background:#0c1324;border:1px solid var(--line);border-radius:8px}.info small{display:block;color:var(--muted);margin-bottom:6px}.pricePanel,.contactPanel,.panelHeader{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;padding:16px;background:#0c1324;border:1px solid var(--line);border-radius:8px}.pricePanel strong{display:block;font-size:30px}.widePanel{grid-column:1/-1;display:grid;grid-template-columns:.85fr 1.15fr;gap:18px}.widePanel.two{grid-template-columns:1fr 1fr}.scoreBox,.croquis,.checkSummary,.servicePanel{background:#0c1324;border:1px solid var(--line);border-radius:8px;padding:18px}.scoreBox strong{display:block;font-size:58px}.scoreBox span{color:var(--gold);font-weight:900}.scoreBars{height:10px;background:#1a2337;border-radius:999px;overflow:hidden;margin:14px 0}.scoreBars i{display:block;height:100%;background:var(--blue2)}.scoreBars .gold{background:var(--gold);margin-top:-10px;opacity:.75}.miniCar{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;min-height:180px;padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:80px 80px 22px 22px}.miniCar span,.chips span{display:grid;place-items:center;border-radius:8px;padding:12px;text-transform:capitalize;font-weight:800}.ok{background:rgba(54,209,127,.18);border:1px solid rgba(54,209,127,.38);color:#bfffd9}.warn{background:rgba(245,200,76,.16);border:1px solid rgba(245,200,76,.38);color:#ffe39a}.bad{background:rgba(255,93,93,.16);border:1px solid rgba(255,93,93,.38);color:#ffb7b7}.chips{display:flex;flex-wrap:wrap;gap:8px}.chips span{display:block;background:#121b30;color:#dbe7ff}.serviceGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.service{display:flex;justify-content:space-between;gap:10px;border:1px solid var(--line);background:#121b30;color:white;border-radius:8px;padding:14px;text-align:left}.service.premium{border-color:rgba(216,173,84,.62);background:linear-gradient(135deg,rgba(216,173,84,.2),rgba(17,103,255,.12))}.authPanel{display:grid;place-items:center;min-height:70vh}.authBox{width:min(460px,100%);padding:24px}.authBox h2{margin-top:0}.authBox input,.authBox select,.authBox textarea,.formGrid input,.formGrid select,.formGrid textarea,.panelHeader select,.row select,.reviewCard textarea{width:100%;margin-top:7px;background:#090f1d;border:1px solid var(--line);border-radius:8px;color:white;padding:12px}.authBox input{margin-bottom:10px}.segmented{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.segmented button{border:1px solid var(--line);background:#0c1324;color:white;border-radius:8px;padding:10px}.segmented .active{border-color:var(--blue2);background:rgba(17,103,255,.22)}.authLinks{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.authLinks button{background:none;border:0;color:var(--muted)}.notice{padding:14px;background:rgba(216,173,84,.12);border:1px solid rgba(216,173,84,.35);border-radius:8px;margin:14px 0}.formGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.formGrid label,.slider{color:var(--muted);font-size:13px;text-transform:capitalize}.full{grid-column:1/-1}.formGrid textarea{min-height:110px}.previewStrip{display:flex;gap:8px;overflow:auto;margin:12px 0}.previewStrip img{width:130px;height:88px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}.checkEditor{margin-top:18px}.sliderGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.slider{display:block;background:#0c1324;border:1px solid var(--line);border-radius:8px;padding:12px}.slider span{display:flex;justify-content:space-between}.slider input{width:100%;accent-color:var(--blue2)}.stickyActions{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:10px;padding:14px;background:rgba(5,7,13,.82);backdrop-filter:blur(14px);border-top:1px solid var(--line)}.table{display:grid;gap:10px}.row{display:grid;grid-template-columns:1.4fr repeat(7,auto);align-items:center;gap:12px;padding:13px;background:#0c1324;border:1px solid var(--line);border-radius:8px;color:var(--muted)}.row b{color:white}.interest{padding:6px 9px;border-radius:999px}.interest.alto{background:rgba(54,209,127,.16);color:#bfffd9}.interest.medio{background:rgba(245,200,76,.16);color:#ffe39a}.interest.bajo{background:rgba(255,255,255,.08);color:#c8d2e8}.packGrid{grid-template-columns:repeat(4,1fr)}.pack{padding:18px}.pack strong{font-size:30px}.activity p{padding:12px;background:#0c1324;border:1px solid var(--line);border-radius:8px;color:var(--muted)}.activity b{color:white}.activity small{display:block;color:#7987a1}.reviewCard{padding:18px;margin-top:14px}.toast{position:fixed;right:18px;bottom:18px;z-index:30;max-width:360px;padding:14px 16px;background:#101a30;border:1px solid var(--blue2);border-radius:8px;box-shadow:0 18px 50px rgba(0,0,0,.38)}.photoModal{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.86)}.photoModal img{max-width:96vw;max-height:92vh;border-radius:8px;border:1px solid rgba(255,255,255,.2)}
.videoPreview{width:100%;max-height:320px;margin-top:10px;background:#02040a;border:1px solid var(--line);border-radius:8px}
.reviewStack{display:grid;gap:12px}.diffBox{display:grid;gap:6px;margin-top:12px;padding:12px;background:rgba(255,93,93,.1);border:1px solid rgba(255,93,93,.28);border-radius:8px;color:#ffd0d0}.diffBox span{font-size:13px;color:#ffdada}.confirmModal{position:fixed;inset:0;z-index:35;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.72);backdrop-filter:blur(10px)}.confirmBox{width:min(620px,100%);padding:22px;background:#0c1324;border:1px solid var(--line);border-radius:8px;box-shadow:0 24px 80px rgba(0,0,0,.45)}button:disabled{cursor:not-allowed;opacity:.58}
@media(max-width:900px){.topbar{align-items:flex-start;flex-direction:column}.hero,.detailLayout,.widePanel,.widePanel.two{grid-template-columns:1fr}.categoryBar,.vehicleGrid,.specGrid,.packGrid,.formGrid,.sliderGrid,.statGrid{grid-template-columns:1fr}.row{grid-template-columns:1fr}.hero{min-height:auto}.heroCar{min-height:260px}.serviceGrid{grid-template-columns:1fr}}
`;
