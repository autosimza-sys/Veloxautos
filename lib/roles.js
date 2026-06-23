export function isSellerRole(role) {
  return ["particular", "reseller", "agency"].includes(role);
}

export function roleLabel(role) {
  if (role === "agency") return "Agencia";
  if (role === "reseller") return "Revendedor";
  if (role === "particular") return "Particular";
  if (role === "admin") return "Administrador";
  if (role === "mechanic") return "Mecanico";
  return "Usuario registrado";
}
