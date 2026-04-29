import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "velox_mvp_estable";
const ADMIN_HASH = "YWRtaW46djNsMHgkMjAyNg=="; // admin:v3l0x$2026 codificado para MVP. En producción debe ir en backend/Supabase Auth.

const RULES = {
  initialPromoCredits: 10000,
  monthlyPromoCredits: 5000,
  privateFreeListings: 1,
  dealerFreeListings: 3,
  extraDealerListingCost: 10,
  imageClickCost: 1,
  videoViewCost: 1,
  unlockPriceCost: 2,
  unlockPhoneCost: 2,
  unlockTechReportCost: 5000,
  domainReportCost: 8000,
  patentDebtCost: 5000,
  ticketReportCost: 10000,
  mechanicReviewCost: 30000,
  legalPackCost: 55000,
};

const PAYMENT_PACKS = [
  { id: "pack5000", name: "Pack 5.000", credits: 5000, price: 5000, link: "https://mpago.la/2yLmEsX" },
  { id: "pack10000", name: "Pack 10.000", credits: 10000, price: 10000, link: "https://mpago.la/2yLmEsX" },
  { id: "pack30000", name: "Pack 30.000", credits: 30000, price: 30000, link: "https://mpago.la/2yLmEsX" },
  { id: "pack55000", name: "Pack Compra Velox", credits: 55000, price: 55000, link: "https://mpago.la/2yLmEsX" },
];

const MECHANICS = [
  { id: 1, name: "Juan Pérez", zone: "Maipú" },
  { id: 2, name: "Carlos Gómez", zone: "Godoy Cruz" },
  { id: 3, name: "Lucas Díaz", zone: "Luján de Cuyo" },
];

const CONDITION_FIELDS = [
  ["motor", "Motor"],
  ["gearbox", "Caja"],
  ["chassis", "Chasis"],
  ["brakes", "Frenos"],
  ["suspension", "Suspensión"],
  ["paint", "Pintura"],
  ["interior", "Interior"],
  ["lights", "Luces"],
];

const TIRE_FIELDS = [
  ["frontLeft", "Del. izquierda"],
  ["frontRight", "Del. derecha"],
  ["rearLeft", "Tras. izquierda"],
  ["rearRight", "Tras. derecha"],
  ["spare", "Auxilio"],
];

const START_USERS = [
  {
    id: "dealer_demo",
    name: "AutoSi MZA",
    phone: "2610000000",
    password: "1234",
    role: "dealer",
    sellerName: "AutoSi MZA",
    promoCredits: 10000,
    paidCredits: 55000,
    unlockedPrices: [],
    unlockedPhones: [],
    unlockedReports: [],
    createdAt: Date.now(),
    lastPromoGrant: Date.now(),
  },
];

const START_VEHICLES = [
  {
    id: 1,
    ownerId: "dealer_demo",
    seller: "AutoSi MZA",
    sellerType: "dealer",
    saleType: "own",
    vehicleType: "auto",
    vehicleSubType: "auto",
    brand: "TOYOTA",
    model: "COROLLA GR-SPORT",
    title: "TOYOTA COROLLA GR-SPORT",
    year: 2023,
    km: 12000,
    price: 32500000,
    plate: "AB123CD",
    location: "Mendoza, ARG",
    phone: "2615551234",
    fuel: "Nafta",
    image: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&q=80&w=1200",
    photos: [{ url: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&q=80&w=1200", name: "corolla" }],
    video: null,
    description: "Estado impecable, service oficial al día. Cubiertas nuevas. Unidad verificada con Velox Score.",
    adminStatus: "published",
    mechanicStatus: "approved",
    assignedMechanicId: 1,
    mechanicNotes: "Unidad revisada. Apta para Compra Velox.",
    sellerScore: 9.4,
    mechanicScore: 10,
    finalScore: 9.8,
    verified: true,
    featured: true,
    checklist: {
      titleDoc: true,
      greenCard: true,
      rto: "vigente",
      knownDebt: false,
      knownTickets: false,
      condition: { motor: 10, gearbox: 10, chassis: 9, brakes: 9, suspension: 9, paint: 10, interior: 10, lights: 10 },
      tires: { frontLeft: 90, frontRight: 90, rearLeft: 90, rearRight: 90, spare: 80 },
      details: "Sin detalles relevantes.",
    },
    stats: { views: 24, imageClicks: 9, videoViews: 1, priceUnlocks: 6, phoneUnlocks: 3, creditsSpent: 27 },
  },
  {
    id: 2,
    ownerId: "dealer_demo",
    seller: "AutoSi MZA",
    sellerType: "dealer",
    saleType: "consignment",
    vehicleType: "truck",
    vehicleSubType: "pickup",
    brand: "FORD",
    model: "RAPTOR F-150",
    title: "FORD RAPTOR F-150",
    year: 2022,
    km: 28000,
    price: 85000000,
    plate: "AC789EF",
    location: "Córdoba, ARG",
    phone: "2615558899",
    fuel: "Nafta",
    image: "https://images.unsplash.com/photo-1591461803011-85b5d92df995?auto=format&fit=crop&q=80&w=1200",
    photos: [{ url: "https://images.unsplash.com/photo-1591461803011-85b5d92df995?auto=format&fit=crop&q=80&w=1200", name: "raptor" }],
    video: null,
    description: "Única mano, máximo equipamiento, unidad en consignación. Excelente estado general.",
    adminStatus: "published",
    mechanicStatus: "approved",
    assignedMechanicId: 2,
    mechanicNotes: "Aprobada con observaciones menores.",
    sellerScore: 9.1,
    mechanicScore: 9.7,
    finalScore: 9.5,
    verified: true,
    featured: false,
    checklist: {
      titleDoc: true,
      greenCard: true,
      rto: "vigente",
      knownDebt: false,
      knownTickets: false,
      condition: { motor: 9, gearbox: 10, chassis: 10, brakes: 9, suspension: 9, paint: 9, interior: 9, lights: 10 },
      tires: { frontLeft: 80, frontRight: 80, rearLeft: 80, rearRight: 80, spare: 70 },
      details: "Detalles mínimos de uso.",
    },
    stats: { views: 19, imageClicks: 6, videoViews: 0, priceUnlocks: 4, phoneUnlocks: 2, creditsSpent: 16 },
  },
];

function money(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function avg(values) {
  const nums = values.map(Number).filter((n) => !Number.isNaN(n));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ url: reader.result, name: file.name, size: file.size, type: file.type });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blankChecklist() {
  return {
    titleDoc: false,
    greenCard: false,
    rto: "vigente",
    knownDebt: false,
    knownTickets: false,
    condition: Object.fromEntries(CONDITION_FIELDS.map(([key]) => [key, 7])),
    tires: Object.fromEntries(TIRE_FIELDS.map(([key]) => [key, 70])),
    details: "",
  };
}

function blankVehicleForm() {
  return {
    vehicleType: "auto",
    vehicleSubType: "auto",
    saleType: "own",
    brand: "",
    model: "",
    year: "",
    km: "",
    price: "",
    plate: "",
    location: "Mendoza, ARG",
    phone: "",
    fuel: "Nafta",
    description: "",
    photos: [],
    video: null,
    checklist: blankChecklist(),
  };
}

function readSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const saved = readSaved();

  const [users, setUsers] = useState(saved?.users || START_USERS);
  const [vehicles, setVehicles] = useState(saved?.vehicles || START_VEHICLES);
  const [orders, setOrders] = useState(saved?.orders || []);
  const [serviceOrders, setServiceOrders] = useState(saved?.serviceOrders || []);
  const [activity, setActivity] = useState(saved?.activity || []);
  const [user, setUser] = useState(saved?.user || null);

  const [view, setView] = useState("catalog");
  const [selected, setSelected] = useState(null);
  const [vehicleType, setVehicleType] = useState("auto");
  const [vehicleSubType, setVehicleSubType] = useState("auto");
  const [search, setSearch] = useState("");

  const [loginOpen, setLoginOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [sellerPanelOpen, setSellerPanelOpen] = useState(false);
  const [mechanicOpen, setMechanicOpen] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);
  const [adminAccessUnlocked, setAdminAccessUnlocked] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);

  const [loginForm, setLoginForm] = useState({ name: "", phone: "", password: "", role: "user", sellerName: "" });
  const [vehicleForm, setVehicleForm] = useState(blankVehicleForm());
  const [mechanicForm, setMechanicForm] = useState({});
  const [selectedMechanic, setSelectedMechanic] = useState(1);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ users, vehicles, orders, serviceOrders, activity, user }));
  }, [users, vehicles, orders, serviceOrders, activity, user]);

  const isAdmin = user?.role === "admin";
  const isDealer = user?.role === "dealer";

  const filteredVehicles = useMemo(() => {
    return vehicles
      .filter((v) => v.adminStatus === "published")
      .filter((v) => v.vehicleType === vehicleType)
      .filter((v) => vehicleType !== "truck" || v.vehicleSubType === vehicleSubType)
      .filter((v) => `${v.brand} ${v.model} ${v.title} ${v.location}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => Number(b.featured) - Number(a.featured));
  }, [vehicles, vehicleType, vehicleSubType, search]);

  const myVehicles = vehicles.filter((v) => v.ownerId === user?.id);

  function log(text) {
    setActivity((prev) => [{ id: Date.now(), text, date: new Date().toLocaleString("es-AR") }, ...prev]);
  }

  function updateUser(id, patch) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    if (user?.id === id) setUser((prev) => ({ ...prev, ...patch }));
  }

  function renewPromoCreditsIfNeeded(account) {
    const now = Date.now();
    const createdAt = Number(account.createdAt || now);
    const lastGrant = Number(account.lastPromoGrant || createdAt);
    const thirtyDays = 1000 * 60 * 60 * 24 * 30;
    const ninetyDays = 1000 * 60 * 60 * 24 * 90;
    if (now - createdAt > ninetyDays) return account;
    if (now - lastGrant < thirtyDays) return account;
    return {
      ...account,
      promoCredits: Number(account.promoCredits || 0) + RULES.monthlyPromoCredits,
      lastPromoGrant: now,
    };
  }

  function updateVehicle(id, patch) {
    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    if (selected?.id === id) setSelected((prev) => ({ ...prev, ...patch }));
  }

  function consumePromo(userId, amount) {
    const u = users.find((x) => x.id === userId);
    if (!u || Number(u.promoCredits || 0) < amount) return false;
    updateUser(userId, { promoCredits: Number(u.promoCredits || 0) - amount });
    return true;
  }

  function consumePaid(userId, amount) {
    const u = users.find((x) => x.id === userId);
    if (!u || Number(u.paidCredits || 0) < amount) return false;
    updateUser(userId, { paidCredits: Number(u.paidCredits || 0) - amount });
    return true;
  }

  function chargeSeller(v, amount, statKey, reason) {
    if (!v.ownerId || user?.id === v.ownerId) return;
    const ok = consumePromo(v.ownerId, amount);
    const nextStats = {
      ...(v.stats || {}),
      [statKey]: Number(v.stats?.[statKey] || 0) + 1,
      creditsSpent: Number(v.stats?.creditsSpent || 0) + amount,
    };
    updateVehicle(v.id, { stats: nextStats });
    log(`${reason}: ${ok ? "descontado" : "sin saldo"} ${amount} crédito(s) al vendedor de ${v.title}.`);
  }

  function handleLogoClick() {
    const next = logoClicks + 1;
    setLogoClicks(next);
    if (next >= 5) {
      setAdminAccessUnlocked(true);
      setLoginOpen(true);
      setLogoClicks(0);
      alert("Acceso administrador habilitado.");
    }
  }

  function doLogin() {
    const adminHash = btoa(`${loginForm.phone}:${loginForm.password}`);
    if (adminAccessUnlocked && adminHash === ADMIN_HASH) {
      setUser({ id: "admin", name: "Admin VELOX", phone: "admin", role: "admin", promoCredits: 999999, paidCredits: 999999, unlockedPrices: [], unlockedPhones: [], unlockedReports: [] });
      setLoginOpen(false);
      setAdminOpen(true);
      return;
    }

    if (!loginForm.name || !loginForm.phone || !loginForm.password) return alert("Completá nombre, teléfono y contraseña.");
    if (loginForm.role === "dealer" && !loginForm.sellerName) return alert("Completá el nombre comercial.");

    const found = users.find((u) => u.phone === loginForm.phone && u.password === loginForm.password);
    if (found) {
      const renewed = renewPromoCreditsIfNeeded(found);
      updateUser(found.id, renewed);
      setUser(renewed);
      setLoginOpen(false);
      return;
    }

    const newUser = {
      id: `u_${Date.now()}`,
      name: loginForm.name,
      phone: loginForm.phone,
      password: loginForm.password,
      role: loginForm.role,
      sellerName: loginForm.role === "dealer" ? loginForm.sellerName : loginForm.name,
      promoCredits: RULES.initialPromoCredits,
      paidCredits: 0,
      unlockedPrices: [],
      unlockedPhones: [],
      unlockedReports: [],
      createdAt: Date.now(),
      lastPromoGrant: Date.now(),
    };
    setUsers((prev) => [...prev, newUser]);
    setUser(newUser);
    setLoginOpen(false);
    log(`Nuevo registro: ${newUser.name} recibió ${RULES.initialPromoCredits} créditos promocionales.`);
  }

  function recoverPassword() {
    const phone = prompt("Ingresá tu teléfono registrado");
    const found = users.find((u) => u.phone === phone);
    if (!found) return alert("No encontramos ese teléfono.");
    const pass = String(Math.floor(100000 + Math.random() * 900000));
    updateUser(found.id, { password: pass });
    alert(`Contraseña temporal: ${pass}\nEn producción se enviará por WhatsApp.`);
  }

  function canSeePrice(v) {
    return isAdmin || user?.id === v.ownerId || user?.unlockedPrices?.includes(v.id);
  }

  function canSeePhone(v) {
    return isAdmin || user?.id === v.ownerId || user?.unlockedPhones?.includes(v.id);
  }

  function canSeeReport(v) {
    return isAdmin || user?.id === v.ownerId || user?.unlockedReports?.includes(v.id);
  }

  function unlockPrice(v) {
    if (!user) return setLoginOpen(true);
    if (canSeePrice(v)) return;
    chargeSeller(v, RULES.unlockPriceCost, "priceUnlocks", "Precio desbloqueado");
    setUser((prev) => ({ ...prev, unlockedPrices: [...(prev.unlockedPrices || []), v.id] }));
  }

  function unlockPhone(v) {
    if (!user) return setLoginOpen(true);
    if (canSeePhone(v)) return;
    chargeSeller(v, RULES.unlockPhoneCost, "phoneUnlocks", "Contacto solicitado");
    setUser((prev) => ({ ...prev, unlockedPhones: [...(prev.unlockedPhones || []), v.id] }));
  }

  function unlockReport(v) {
    if (!user) return setLoginOpen(true);
    if (canSeeReport(v)) return;
    if (!consumePaid(user.id, RULES.unlockTechReportCost)) return alert("Este servicio requiere créditos reales pagos.");
    setUser((prev) => ({ ...prev, unlockedReports: [...(prev.unlockedReports || []), v.id] }));
    log(`${user.name} desbloqueó informe técnico de ${v.title}.`);
  }

  function requestPaidService(v, service, cost) {
    if (!user) return setLoginOpen(true);
    if (!consumePaid(user.id, cost)) return alert("Este servicio requiere créditos reales pagos. Los créditos promocionales no aplican.");
    const request = {
      id: Date.now(),
      userId: user.id,
      userName: user.name,
      vehicleId: v.id,
      vehicleTitle: v.title,
      service,
      cost,
      status: "requested",
      date: new Date().toLocaleString("es-AR"),
    };
    setServiceOrders((prev) => [request, ...prev]);
    log(`${user.name} solicitó ${service} para ${v.title}.`);
    alert(`Solicitud recibida: ${service}. Coordinaremos por WhatsApp.`);
  }

  function buyPack(pack) {
    if (!user) return setLoginOpen(true);
    setOrders((prev) => [{ id: Date.now(), userId: user.id, userName: user.name, packName: pack.name, credits: pack.credits, price: pack.price, status: "pending", date: new Date().toLocaleString("es-AR") }, ...prev]);
    window.open(pack.link, "_blank");
    alert("Se abrió Mercado Pago. El admin confirma y carga créditos reales.");
  }

  function approveOrder(order) {
    const u = users.find((x) => x.id === order.userId);
    if (!u) return;
    updateUser(order.userId, { paidCredits: Number(u.paidCredits || 0) + order.credits });
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: "approved" } : o)));
    log(`Admin cargó ${order.credits} créditos reales a ${order.userName}.`);
  }

  async function uploadPhotos(e) {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/")).slice(0, 8);
    const photos = await Promise.all(files.map(fileToDataUrl));
    setVehicleForm((prev) => ({ ...prev, photos: [...prev.photos, ...photos].slice(0, 8) }));
  }

  async function uploadVideo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) return alert("El archivo no es video.");
    setVehicleForm((prev) => ({ ...prev, video: { url: URL.createObjectURL(file), name: file.name } }));
  }

  function updateChecklist(path, value) {
    setVehicleForm((prev) => {
      const next = { ...prev, checklist: { ...prev.checklist } };
      if (path[0] === "condition") next.checklist.condition = { ...next.checklist.condition, [path[1]]: value };
      else if (path[0] === "tires") next.checklist.tires = { ...next.checklist.tires, [path[1]]: value };
      else next.checklist[path[0]] = value;
      return next;
    });
  }

  function sellerScore(checklist) {
    const docs = [checklist.titleDoc ? 10 : 3, checklist.greenCard ? 10 : 4, checklist.rto === "vigente" ? 10 : checklist.rto === "vencida" ? 5 : 2, checklist.knownDebt ? 4 : 10, checklist.knownTickets ? 6 : 10];
    const cond = Object.values(checklist.condition || {});
    const tires = Object.values(checklist.tires || {}).map((x) => Number(x) / 10);
    return Number(avg([...docs, ...cond, ...tires]).toFixed(1));
  }

  function publishVehicle() {
    if (!user) return setLoginOpen(true);
    if (isAdmin) return alert("El admin no publica vehículos.");
    if (!vehicleForm.brand || !vehicleForm.model || !vehicleForm.year || !vehicleForm.price || !vehicleForm.phone) return alert("Completá marca, modelo, año, precio y teléfono.");

    const ownCount = vehicles.filter((v) => v.ownerId === user.id).length;
    const freeLimit = isDealer ? RULES.dealerFreeListings : RULES.privateFreeListings;
    if (ownCount >= freeLimit) {
      if (!isDealer) return alert("Como particular podés publicar 1 vehículo. Para publicar más, registrate como vendedor de autos.");
      if (!consumePromo(user.id, RULES.extraDealerListingCost)) return alert("No tenés créditos promo suficientes para publicación extra.");
    }

    const sScore = sellerScore(vehicleForm.checklist);
    const title = `${vehicleForm.brand.toUpperCase()} ${vehicleForm.model.toUpperCase()}`;
    const newVehicle = {
      ...vehicleForm,
      id: Date.now(),
      ownerId: user.id,
      seller: isDealer ? user.sellerName : user.name,
      sellerType: user.role,
      title,
      year: Number(vehicleForm.year),
      km: Number(vehicleForm.km || 0),
      price: Number(vehicleForm.price),
      image: vehicleForm.photos?.[0]?.url || "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&q=80&w=1200",
      adminStatus: "published",
      mechanicStatus: "pending",
      assignedMechanicId: null,
      mechanicNotes: "Pendiente de revisión mecánica.",
      sellerScore: sScore,
      mechanicScore: null,
      finalScore: sScore,
      verified: false,
      featured: false,
      stats: { views: 0, imageClicks: 0, videoViews: 0, priceUnlocks: 0, phoneUnlocks: 0, creditsSpent: 0 },
    };
    setVehicles((prev) => [newVehicle, ...prev]);
    setVehicleForm(blankVehicleForm());
    setPublishOpen(false);
    log(`${newVehicle.seller} publicó ${newVehicle.title}.`);
  }

  function assignMechanic(vehicleId, mechanicId) {
    updateVehicle(vehicleId, { assignedMechanicId: mechanicId, mechanicStatus: "pending" });
  }

  function submitMechanic(v, status) {
    if (v.assignedMechanicId !== selectedMechanic) return alert("Este vehículo no está asignado a este mecánico.");
    const form = mechanicForm[v.id] || {};
    const scores = Object.values(form.scores || {}).map(Number).filter((n) => n >= 1 && n <= 10);
    const mScore = scores.length ? Number(avg(scores).toFixed(1)) : status === "approved" ? 8 : 6;
    const finalScore = Number(((v.sellerScore || 0) * 0.4 + mScore * 0.6).toFixed(1));
    updateVehicle(v.id, { mechanicStatus: status, verified: status === "approved", mechanicScore: mScore, finalScore, mechanicNotes: form.notes || "Revisión mecánica cargada." });
    log(`Mecánico ${status === "approved" ? "aprobó" : "observó"} ${v.title}. Score ${finalScore}/10.`);
  }

  function openDetail(v) {
    updateVehicle(v.id, { stats: { ...(v.stats || {}), views: Number(v.stats?.views || 0) + 1 } });
    setSelected(v);
    setView("detail");
  }

  function imageClick(v, photo) {
    chargeSeller(v, RULES.imageClickCost, "imageClicks", "Click en foto");
    setZoomImage(photo?.url || v.image);
  }

  function vehicleIcon(type) {
    if (type === "truck") return "🚙";
    if (type === "moto") return "🏍️";
    return "🚗";
  }

  return (
    <div style={styles.page}>
      {view === "catalog" && <Catalog />}
      {view === "detail" && selected && <Detail />}
      {loginOpen && <LoginModal />}
      {publishOpen && <PublishModal />}
      {creditsOpen && <CreditsModal />}
      {sellerPanelOpen && <SellerPanel />}
      {adminOpen && <AdminPanel />}
      {mechanicOpen && <MechanicPanel />}
      {zoomImage && <div style={styles.zoom} onClick={() => setZoomImage(null)}><img src={zoomImage} style={styles.zoomImg} /><button style={styles.closeFloating}>×</button></div>}
    </div>
  );

  function Catalog() {
    return <>
      <header style={styles.header}>
        <div style={styles.brandBox}>
          <div style={styles.logo} onClick={handleLogoClick} title="VELOX">VX</div>
          <div><h1 style={styles.brand}>VELOX</h1><p style={styles.subBrand}>Vehículos · Score · Compra segura</p></div>
        </div>
        <div style={styles.headerActions}>
          {user && <span style={styles.creditsPill}>Promo {user.promoCredits || 0} · Reales {user.paidCredits || 0}</span>}
          {user && <button style={styles.miniButton} onClick={() => setSellerPanelOpen(true)}>Mi panel</button>}
          {user && <button style={styles.miniButton} onClick={() => setCreditsOpen(true)}>Créditos</button>}
          {user && !isAdmin && <button style={styles.primaryMini} onClick={() => setPublishOpen(true)}>+ Publicar</button>}
          {isAdmin && <button style={styles.primaryMini} onClick={() => setAdminOpen(true)}>Admin</button>}
          {isAdmin && <button style={styles.miniButton} onClick={() => setMechanicOpen(true)}>Mecánico</button>}
          {user ? <button style={styles.linkButton} onClick={() => setUser(null)}>Salir</button> : <button style={styles.miniButton} onClick={() => setLoginOpen(true)}>Ingresar</button>}
        </div>
      </header>

      <main style={styles.container}>
        <section style={styles.hero}>
          <h2 style={styles.heroTitle}>Encontrá tu próximo vehículo</h2>
          <p style={styles.heroText}>Navegá autos, camionetas y motos con fotos claras, score, checklist y servicios VELOX. Si no estás registrado, ves lo básico; al registrarte desbloqueás información y recibís 10.000 créditos promocionales.</p>
          <div style={styles.searchBox}><span>🔎</span><input style={styles.searchInput} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar marca o modelo..." /></div>
          <div style={styles.infoStrip}>
            <span>Visitante: precio, km, dominio y contacto bloqueados.</span>
            <span>Registrado: 10.000 créditos promo + renovación de 5.000 por 90 días.</span>
            <span>Servicios reales: solo con créditos pagos.</span>
          </div>
          <div style={styles.mainActions}>
            <button style={styles.bigAction} onClick={() => setView("catalog")}>🔎 Buscar vehículo</button>
            <button style={styles.bigActionAlt} onClick={() => user ? setPublishOpen(true) : setLoginOpen(true)}>🚀 Publicar gratis</button>
          </div>

          <div style={styles.servicesBox}>
            <h3 style={{margin:0}}>¿Cómo funciona VELOX?</h3>
            <p style={styles.heroText}>Podés buscar vehículos gratis. Solo pagás si querés desbloquear información o usar servicios reales como informes, revisión mecánica o Compra Velox.</p>
            <ul style={{fontSize:12, color:"#a1a1aa", lineHeight:1.6}}>
              <li>✔ Publicar es gratis (1 auto particular / 3 vendedor)</li>
              <li>✔ Pagás solo por interacción o servicios</li>
              <li>✔ Compra Velox asegura la operación completa</li>
            </ul>
          </div>

          <div style={styles.categoryRow}>
            <button style={vehicleType === "auto" ? styles.categoryActive : styles.category} onClick={() => { setVehicleType("auto"); setVehicleSubType("auto"); }}>🚗 Autos</button>
            <button style={vehicleType === "truck" ? styles.categoryActive : styles.category} onClick={() => { setVehicleType("truck"); setVehicleSubType("suv"); }}>🚙 Camionetas</button>
            <button style={vehicleType === "moto" ? styles.categoryActive : styles.category} onClick={() => { setVehicleType("moto"); setVehicleSubType("moto"); }}>🏍️ Motos</button>
          </div>
          {vehicleType === "truck" && <div style={styles.categoryRow}><button style={vehicleSubType === "suv" ? styles.subActive : styles.subButton} onClick={() => setVehicleSubType("suv")}>SUV</button><button style={vehicleSubType === "pickup" ? styles.subActive : styles.subButton} onClick={() => setVehicleSubType("pickup")}>Pick-up</button></div>}
        </section>

        <section style={styles.grid}>
          {filteredVehicles.map((v) => <article key={v.id} style={styles.card}>
            <div style={styles.imgWrap} onClick={() => imageClick(v, v.photos?.[0])}>
              <img src={v.image || v.photos?.[0]?.url} style={styles.img} />
              <div style={styles.scoreBadge}>SCORE {v.finalScore}</div>
              {v.verified && <div style={styles.certified}>✓ CERTIFIED</div>}
            </div>
            <div style={styles.cardBody}>
              <div style={styles.cardTop}>
                <div><h3 style={styles.carTitle}>{vehicleIcon(v.vehicleType)} {v.brand} {v.model}</h3><p style={styles.muted}>{v.year} {user ? `· ${Number(v.km || 0).toLocaleString("es-AR")} KM` : "· KM bloqueado"}</p></div>
                <button style={styles.priceBtn} onClick={() => unlockPrice(v)}>{canSeePrice(v) ? money(v.price) : "🔒 Ver precio"}</button>
              </div>
              <div style={styles.statsRow}><Stat label="MOTOR" value={`${v.checklist?.condition?.motor || "-"}/10`} /><Stat label="CHASIS" value={`${v.checklist?.condition?.chassis || "-"}/10`} /><Stat label="CUBIERTAS" value={`${Math.round(avg(Object.values(v.checklist?.tires || {}))) || "-"}%`} /></div>
              <div style={styles.actionRow}><button style={styles.secondaryBtn} onClick={() => openDetail(v)}>Detalles</button><button style={styles.primaryBtn} onClick={() => unlockPhone(v)}>{canSeePhone(v) ? v.phone : "Contactar"}</button></div>
            </div>
          </article>)}
        </section>
      </main>
    </>;
  }

  function Detail() {
    const v = selected;
    return <main style={styles.detailPage}>
      <button style={styles.backBtn} onClick={() => setView("catalog")}>‹ Volver al catálogo</button>
      <section style={styles.detailHero} onClick={() => imageClick(v, v.photos?.[0])}>
        <img src={v.image || v.photos?.[0]?.url} style={styles.detailImg} />
        <div style={styles.detailOverlay}><h1 style={styles.detailTitle}>{v.brand} {v.model}</h1><p style={styles.detailSub}>✓ VELOX CERTIFIED · {(v.photos?.length || 1)} FOTOS</p></div>
      </section>
      <section style={styles.detailGrid}>
        <div style={styles.leftCol}>
          <Box title="Descripción del experto"><p style={styles.text}>{v.description}</p></Box>
          <div style={styles.quickGrid}><Quick label="AÑO" value={v.year} /><Quick label="KM" value={user ? Number(v.km || 0).toLocaleString("es-AR") : "Bloqueado"} /><Quick label="COMBUSTIBLE" value={v.fuel} /><Quick label="SCORE" value={v.finalScore} /></div>
          <Box title="Croquis VELOX"><div style={styles.conditionGrid}>{CONDITION_FIELDS.slice(0, 6).map(([key, label]) => <Condition key={key} label={label} value={v.checklist?.condition?.[key] || 0} />)}</div></Box>
          <Box title="Revisión mecánica"><p style={styles.text}>{v.mechanicNotes}</p>{canSeeReport(v) ? <p style={styles.okText}>Informe técnico desbloqueado.</p> : <button style={styles.secondaryBtn} onClick={() => unlockReport(v)}>Desbloquear informe técnico {money(RULES.unlockTechReportCost)}</button>}</Box>
        </div>
        <aside style={styles.sideCard}><p style={styles.sideLabel}>PRECIO FINAL</p><h2 style={styles.sidePrice}>{canSeePrice(v) ? money(v.price) : "Bloqueado"}</h2><button style={styles.bigPrimary} onClick={() => canSeePrice(v) ? unlockPhone(v) : unlockPrice(v)}>{canSeePrice(v) ? "PEDIR CONTACTO" : "VER PRECIO"}</button><button style={styles.bigSecondary} onClick={() => requestPaidService(v, "Pack Compra Velox", RULES.legalPackCost)}>COMPRA VELOX {money(RULES.legalPackCost)}</button><div style={styles.services}><p style={styles.sideLabel}>Servicios pagos</p><button onClick={() => requestPaidService(v, "Informe de dominio", RULES.domainReportCost)}>Dominio {money(RULES.domainReportCost)}</button><button onClick={() => requestPaidService(v, "Deuda de patente", RULES.patentDebtCost)}>Patentes {money(RULES.patentDebtCost)}</button><button onClick={() => requestPaidService(v, "Informe de multas", RULES.ticketReportCost)}>Multas {money(RULES.ticketReportCost)}</button><button onClick={() => requestPaidService(v, "Revisión mecánica", RULES.mechanicReviewCost)}>Revisión {money(RULES.mechanicReviewCost)}</button></div></aside>
      </section>
    </main>;
  }

  function Modal({ children, wide = false }) {
    return <div style={styles.modal}><div style={wide ? styles.modalWide : styles.modalBox}>{children}</div></div>;
  }

  function LoginModal() {
    return <Modal><ModalHead title="Ingresar" onClose={() => setLoginOpen(false)} /><div style={styles.formGrid}><Input placeholder="Nombre" value={loginForm.name} onChange={(v) => setLoginForm({ ...loginForm, name: v })} /><Input placeholder="Teléfono" value={loginForm.phone} onChange={(v) => setLoginForm({ ...loginForm, phone: v })} /><Input placeholder="Contraseña" type="password" value={loginForm.password} onChange={(v) => setLoginForm({ ...loginForm, password: v })} /><select style={styles.input} value={loginForm.role} onChange={(e) => setLoginForm({ ...loginForm, role: e.target.value })}><option value="user">Usuario / particular</option><option value="dealer">Vendedor de autos</option></select>{loginForm.role === "dealer" && <Input placeholder="Nombre comercial" value={loginForm.sellerName} onChange={(v) => setLoginForm({ ...loginForm, sellerName: v })} />}<button style={styles.bigPrimary} onClick={doLogin}>Ingresar / crear cuenta</button><button style={styles.linkButton} onClick={recoverPassword}>Olvidé contraseña</button></div></Modal>;
  }

  function CreditsModal() {
    return <Modal wide><ModalHead title="Créditos reales" onClose={() => setCreditsOpen(false)} /><p style={styles.text}>1 crédito real = $1. Los créditos promocionales no sirven para servicios con costo real.</p><div style={styles.packGrid}>{PAYMENT_PACKS.map((p) => <div key={p.id} style={styles.pack}><h3>{p.name}</h3><p>{p.credits} créditos reales</p><h2>{money(p.price)}</h2><button style={styles.primaryBtn} onClick={() => buyPack(p)}>Pagar</button></div>)}</div></Modal>;
  }

  function SellerPanel() {
    return <Modal wide><ModalHead title="Mi panel" onClose={() => setSellerPanelOpen(false)} /><p style={styles.text}>Promo: {user?.promoCredits || 0} · Reales: {user?.paidCredits || 0}</p>{myVehicles.length === 0 ? <p style={styles.text}>No tenés publicaciones.</p> : myVehicles.map((v) => <div key={v.id} style={styles.listItem}><h3>{v.title}</h3><p>Visitas {v.stats?.views || 0} · Fotos {v.stats?.imageClicks || 0} · Videos {v.stats?.videoViews || 0} · Precios {v.stats?.priceUnlocks || 0} · Contactos {v.stats?.phoneUnlocks || 0}</p><b>Créditos consumidos: {v.stats?.creditsSpent || 0}</b></div>)}</Modal>;
  }

  function AdminPanel() {
    if (!isAdmin) return null;
    const pendingPayments = orders.filter((o) => o.status === "pending");
    const approvedPayments = orders.filter((o) => o.status === "approved");
    const pendingRevenue = pendingPayments.reduce((sum, o) => sum + Number(o.price || 0), 0);
    const approvedRevenue = approvedPayments.reduce((sum, o) => sum + Number(o.price || 0), 0);
    const servicesRevenue = serviceOrders.reduce((sum, s) => sum + Number(s.cost || 0), 0);
    return <Modal wide><ModalHead title="Admin Velox" onClose={() => setAdminOpen(false)} /><div style={styles.quickGrid}><Quick label="Usuarios" value={users.length} /><Quick label="Vehículos" value={vehicles.length} /><Quick label="Pagos pendientes" value={pendingPayments.length} /><Quick label="Mecánica" value={vehicles.filter((v) => v.mechanicStatus === "pending").length} /><Quick label="Aprobado" value={money(approvedRevenue)} /><Quick label="Pendiente" value={money(pendingRevenue)} /><Quick label="Servicios" value={serviceOrders.length} /><Quick label="Potencial servicios" value={money(servicesRevenue)} /></div><h3>Órdenes de créditos</h3>{orders.map((o) => <div key={o.id} style={styles.listItem}><span>{o.userName} · {o.packName} · {o.status}</span>{o.status === "pending" && <button style={styles.primaryBtn} onClick={() => approveOrder(o)}>Aprobar</button>}</div>)}<h3>Servicios solicitados</h3>{serviceOrders.length === 0 ? <p style={styles.text}>Sin servicios solicitados.</p> : serviceOrders.map((s) => <div key={s.id} style={styles.listItem}><b>{s.service} · {money(s.cost)}</b><p style={styles.text}>{s.userName} · {s.vehicleTitle} · {s.date}</p><span style={styles.creditsPill}>{s.status}</span></div>)}<h3>Vehículos</h3>{vehicles.map((v) => <div key={v.id} style={styles.listItem}><b>{v.title} · {v.seller}</b><button style={styles.dangerBtn} onClick={() => setVehicles(vehicles.filter((x) => x.id !== v.id))}>Eliminar</button><select style={styles.input} value={v.assignedMechanicId || ""} onChange={(e) => assignMechanic(v.id, Number(e.target.value))}><option value="">Asignar mecánico</option>{MECHANICS.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.zone}</option>)}</select></div>)}</Modal>;
  }

  function MechanicPanel() {
    if (!isAdmin) return null;
    const assigned = vehicles.filter((v) => v.assignedMechanicId === selectedMechanic && v.mechanicStatus === "pending");
    return <Modal wide><ModalHead title="Panel mecánico" onClose={() => setMechanicOpen(false)} /><select style={styles.input} value={selectedMechanic} onChange={(e) => setSelectedMechanic(Number(e.target.value))}>{MECHANICS.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.zone}</option>)}</select>{assigned.length === 0 ? <p style={styles.text}>No hay vehículos asignados.</p> : assigned.map((v) => <div key={v.id} style={styles.listItem}><h3>{v.title}</h3><div style={styles.quickGrid}>{["motor", "caja", "estructura", "frenos", "electronica", "interior"].map((field) => <input key={field} style={styles.input} type="number" min="1" max="10" placeholder={`${field} 1 a 10`} value={mechanicForm[v.id]?.scores?.[field] || ""} onChange={(e) => setMechanicForm({ ...mechanicForm, [v.id]: { ...mechanicForm[v.id], scores: { ...(mechanicForm[v.id]?.scores || {}), [field]: Number(e.target.value) } } })} />)}</div><textarea style={styles.input} placeholder="Observaciones" value={mechanicForm[v.id]?.notes || ""} onChange={(e) => setMechanicForm({ ...mechanicForm, [v.id]: { ...mechanicForm[v.id], notes: e.target.value } })} /><button style={styles.primaryBtn} onClick={() => submitMechanic(v, "approved")}>Aprobar</button><button style={styles.dangerBtn} onClick={() => submitMechanic(v, "observed")}>Observar</button></div>)}</Modal>;
  }

  function PublishModal() {
    return <Modal wide><ModalHead title="Publicar vehículo" onClose={() => setPublishOpen(false)} /><div style={styles.quickGrid}><select style={styles.input} value={vehicleForm.vehicleType} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value, vehicleSubType: e.target.value === "truck" ? "suv" : e.target.value })}><option value="auto">Auto</option><option value="truck">Camioneta</option><option value="moto">Moto</option></select>{vehicleForm.vehicleType === "truck" && <select style={styles.input} value={vehicleForm.vehicleSubType} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleSubType: e.target.value })}><option value="suv">SUV</option><option value="pickup">Pick-up</option></select>}<select style={styles.input} value={vehicleForm.saleType} onChange={(e) => setVehicleForm({ ...vehicleForm, saleType: e.target.value })}><option value="own">Propio</option><option value="consignment">Consignación</option></select>{["brand", "model", "year", "km", "price", "plate", "phone", "location"].map((k) => <Input key={k} placeholder={k} value={vehicleForm[k]} onChange={(v) => setVehicleForm({ ...vehicleForm, [k]: v })} />)}</div><textarea style={styles.input} placeholder="Descripción" value={vehicleForm.description} onChange={(e) => setVehicleForm({ ...vehicleForm, description: e.target.value })} /><h3>Fotos y video</h3><input type="file" multiple accept="image/*" onChange={uploadPhotos} /><input type="file" accept="video/*" onChange={uploadVideo} /><h3>Checklist</h3><div style={styles.quickGrid}><label><input type="checkbox" checked={vehicleForm.checklist.titleDoc} onChange={(e) => updateChecklist(["titleDoc"], e.target.checked)} /> Título/documentación</label><label><input type="checkbox" checked={vehicleForm.checklist.greenCard} onChange={(e) => updateChecklist(["greenCard"], e.target.checked)} /> Cédula verde</label><select style={styles.input} value={vehicleForm.checklist.rto} onChange={(e) => updateChecklist(["rto"], e.target.value)}><option value="vigente">RTO vigente</option><option value="vencida">RTO vencida</option><option value="no_tiene">No tiene RTO</option></select></div><h3>Estado general</h3><div style={styles.quickGrid}>{CONDITION_FIELDS.map(([key, label]) => <label key={key}>{label}<input style={styles.input} type="number" min="1" max="10" value={vehicleForm.checklist.condition[key]} onChange={(e) => updateChecklist(["condition", key], Number(e.target.value))} /></label>)}</div><h3>Cubiertas %</h3><div style={styles.quickGrid}>{TIRE_FIELDS.map(([key, label]) => <label key={key}>{label}<input style={styles.input} type="number" min="10" max="100" value={vehicleForm.checklist.tires[key]} onChange={(e) => updateChecklist(["tires", key], Number(e.target.value))} /></label>)}</div><button style={styles.bigPrimary} onClick={publishVehicle}>Publicar automáticamente</button></Modal>;
  }

  function ModalHead({ title, onClose }) {
    return <div style={styles.modalHead}><h2>{title}</h2><button style={styles.closeBtn} onClick={onClose}>×</button></div>;
  }

  function Input({ value, onChange, placeholder, type = "text" }) {
    return <input style={styles.input} type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
  }

  function Stat({ label, value }) {
    return <div style={styles.stat}><span>{label}</span><b>{value}</b></div>;
  }

  function Quick({ label, value }) {
    return <div style={styles.quick}><span>{label}</span><b>{value}</b></div>;
  }

  function Box({ title, children }) {
    return <section style={styles.box}><h3>{title}</h3>{children}</section>;
  }

  function Condition({ label, value }) {
    const color = value >= 8 ? "#22c55e" : value >= 6 ? "#f59e0b" : "#ef4444";
    return <div style={{ ...styles.condition, borderColor: color, color }}><span>{label}</span><b>{value}/10</b></div>;
  }
}

const styles = {
  page: { minHeight: "100vh", background: "#0a110d", color: "white", fontFamily: "Inter, Arial, sans-serif" },
  header: { maxWidth: 1180, margin: "0 auto", padding: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" },
  brandBox: { display: "flex", alignItems: "center", gap: 14 },
  logo: { height: 48, width: 48, borderRadius: 16, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontStyle: "italic" },
  brand: { margin: 0, fontSize: 22, fontWeight: 1000, fontStyle: "italic", letterSpacing: -1 },
  subBrand: { margin: 0, color: "#71717a", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1 },
  headerActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  creditsPill: { color: "#a1a1aa", fontSize: 11, fontWeight: 900, textTransform: "uppercase" },
  miniButton: { background: "#18181b", border: "1px solid #27272a", color: "white", borderRadius: 12, padding: "10px 14px", fontSize: 11, fontWeight: 900, cursor: "pointer" },
  primaryMini: { background: "#2563eb", border: 0, color: "white", borderRadius: 12, padding: "10px 14px", fontSize: 11, fontWeight: 900, cursor: "pointer" },
  linkButton: { background: "transparent", border: 0, color: "#71717a", fontSize: 11, fontWeight: 900, cursor: "pointer" },
  container: { maxWidth: 1180, margin: "0 auto", padding: "0 24px 60px" },
  hero: { marginBottom: 28 },
  heroTitle: { fontSize: 34, fontWeight: 1000, fontStyle: "italic", letterSpacing: -2, margin: "20px 0 4px" },
  heroText: { color: "#71717a", marginTop: 0, maxWidth: 720, fontSize: 14, lineHeight: 1.5 },
  searchBox: { display: "flex", alignItems: "center", gap: 10, background: "rgba(24,24,27,.6)", border: "1px solid #27272a", borderRadius: 18, padding: "12px 16px", maxWidth: 420, marginTop: 22 },
  searchInput: { background: "transparent", border: 0, outline: 0, color: "white", width: "100%" },
  categoryRow: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 },
  infoStrip: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, color: "#a1a1aa", fontSize: 11, fontWeight: 800 },
  mainActions:{display:"flex",gap:12,marginTop:20,flexWrap:"wrap"},
  bigAction:{flex:1,background:"#2563eb",border:0,color:"white",padding:"16px 18px",borderRadius:18,fontWeight:900,cursor:"pointer"},
  bigActionAlt:{flex:1,background:"#111827",border:"1px solid #1f2937",color:"white",padding:"16px 18px",borderRadius:18,fontWeight:900,cursor:"pointer"},
  servicesBox:{marginTop:20,padding:16,background:"#111827",border:"1px solid #1f2937",borderRadius:18},
  infoStripSpan: { background: "#111827" },
  category: { background: "#111827", color: "white", border: "1px solid #1f2937", borderRadius: 20, padding: "14px 22px", fontWeight: 900, cursor: "pointer", fontSize: 14 },
  categoryActive: { background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "white", border: 0, borderRadius: 20, padding: "14px 22px", fontWeight: 900, cursor: "pointer", fontSize: 14, boxShadow:"0 0 20px rgba(37,99,235,.4)" },
  subButton: { background: "#18181b", color: "white", border: "1px solid #27272a", borderRadius: 16, padding: "11px 16px", fontWeight: 900, cursor: "pointer" },
  subActive: { background: "white", color: "black", border: 0, borderRadius: 16, padding: "11px 16px", fontWeight: 900, cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 28 },
  card: { background: "#121c17", border: "1px solid rgba(63,63,70,.7)", borderRadius: 32, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.35)" },
  imgWrap: { position: "relative", height: 224, overflow: "hidden", cursor: "zoom-in" },
  img: { width: "100%", height: "100%", objectFit: "cover" },
  scoreBadge: { position: "absolute", top: 16, left: 16, background: "#3b82f6", padding: "6px 10px", borderRadius: 8, fontSize: 10, fontWeight: 1000, fontStyle: "italic" },
  certified: { position: "absolute", top: 16, right: 16, background: "#2563eb", padding: "6px 10px", borderRadius: 8, fontSize: 10, fontWeight: 1000, fontStyle: "italic" },
  cardBody: { padding: 24 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 },
  carTitle: { fontSize: 16, margin: 0, fontWeight: 1000, fontStyle: "italic", textTransform: "uppercase", lineHeight: 1 },
  muted: { color: "#71717a", fontSize: 11, fontWeight: 900, textTransform: "uppercase" },
  priceBtn: { background: "#09090b", color: "#60a5fa", border: "1px solid #27272a", borderRadius: 12, padding: "10px 12px", fontSize: 10, fontWeight: 900, cursor: "pointer" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderTop: "1px solid #27272a", borderBottom: "1px solid #27272a", padding: "16px 0", margin: "22px 0" },
  stat: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5 },
  actionRow: { display: "flex", gap: 12 },
  secondaryBtn: { flex: 1, background: "#09090b", color: "white", border: "1px solid #27272a", borderRadius: 16, padding: "13px 16px", fontWeight: 900, cursor: "pointer" },
  primaryBtn: { flex: 1, background: "#2563eb", color: "white", border: 0, borderRadius: 16, padding: "13px 16px", fontWeight: 900, cursor: "pointer" },
  detailPage: { minHeight: "100vh", background: "#080d0b", color: "white", maxWidth: 1100, margin: "0 auto", padding: 24 },
  backBtn: { background: "transparent", border: 0, color: "#71717a", fontWeight: 900, cursor: "pointer", marginBottom: 20 },
  detailHero: { position: "relative", aspectRatio: "16/9", borderRadius: 40, overflow: "hidden", border: "1px solid #27272a", cursor: "zoom-in" },
  detailImg: { width: "100%", height: "100%", objectFit: "cover" },
  detailOverlay: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 42, background: "linear-gradient(to top,rgba(0,0,0,.9),transparent 60%)" },
  detailTitle: { fontSize: 38, fontWeight: 1000, fontStyle: "italic", margin: 0, letterSpacing: -2 },
  detailSub: { color: "#d4d4d8", fontSize: 12, fontWeight: 900 },
  detailGrid: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 28, marginTop: 32 },
  leftCol: { display: "flex", flexDirection: "column", gap: 22 },
  box: { background: "rgba(24,24,27,.45)", border: "1px solid #27272a", borderRadius: 28, padding: 28 },
  text: { color: "#a1a1aa", lineHeight: 1.6 },
  okText: { color: "#22c55e", fontWeight: 900 },
  quickGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14 },
  quick: { background: "rgba(24,24,27,.6)", border: "1px solid #27272a", borderRadius: 18, padding: 16, textAlign: "center" },
  conditionGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12 },
  condition: { border: "1px solid", borderRadius: 18, padding: 14, textAlign: "center" },
  sideCard: { background: "#121c17", border: "1px solid #27272a", borderRadius: 32, padding: 28, alignSelf: "start" },
  sideLabel: { color: "#71717a", fontSize: 10, fontWeight: 1000, textTransform: "uppercase" },
  sidePrice: { fontSize: 30, fontWeight: 1000, fontStyle: "italic" },
  bigPrimary: { width: "100%", background: "#2563eb", color: "white", border: 0, borderRadius: 18, padding: "17px 18px", fontWeight: 1000, cursor: "pointer", marginTop: 12 },
  bigSecondary: { width: "100%", background: "#09090b", color: "white", border: "1px solid #27272a", borderRadius: 18, padding: "15px 18px", fontWeight: 1000, cursor: "pointer", marginTop: 12 },
  services: { display: "flex", flexDirection: "column", gap: 8, marginTop: 20 },
  modal: { position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 },
  modalBox: { width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", background: "#121c17", border: "1px solid #27272a", borderRadius: 30, padding: 24 },
  modalWide: { width: "100%", maxWidth: 1050, maxHeight: "90vh", overflow: "auto", background: "#121c17", border: "1px solid #27272a", borderRadius: 30, padding: 24 },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  closeBtn: { background: "transparent", color: "white", border: 0, fontSize: 32, cursor: "pointer" },
  formGrid: { display: "grid", gap: 12 },
  input: { width: "100%", boxSizing: "border-box", background: "#09090b", color: "white", border: "1px solid #27272a", borderRadius: 16, padding: 14, marginBottom: 10 },
  packGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 },
  pack: { background: "#09090b", border: "1px solid #27272a", borderRadius: 24, padding: 18 },
  listItem: { background: "#09090b", border: "1px solid #27272a", borderRadius: 20, padding: 16, marginBottom: 12 },
  dangerBtn: { background: "#dc2626", color: "white", border: 0, borderRadius: 12, padding: "9px 12px", fontWeight: 900, cursor: "pointer", marginLeft: 8 },
  zoom: { position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  zoomImg: { maxWidth: "96vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 22 },
  closeFloating: { position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,.12)", color: "white", border: 0, borderRadius: 999, height: 44, width: 44, fontSize: 30, cursor: "pointer" },
}; // duplicate stat property harmless overwritten above
