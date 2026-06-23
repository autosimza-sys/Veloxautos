import "./globals.css";

export const metadata = {
  title: "VELOX | Te ayudamos a vender tu vehiculo",
  description: "Publica mejor, responde menos y coordina visitas con el asistente de venta de VELOX.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
