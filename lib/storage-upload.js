export async function uploadMediaWithAdmission(client, bucket, storagePath, file) {
  const reservation = await client.rpc("reserve_vehicle_upload", {
    object_bucket: bucket, object_path: storagePath, byte_size: file.size, mime_type: file.type,
  });
  if (reservation.error || !["reserved", "consumed"].includes(reservation.data?.state)) {
    throw new Error("No pudimos reservar espacio para las fotos. Revisá tu cuota o intentá más tarde.");
  }
  if (reservation.data.state === "consumed") return;
  let error;
  try {
    ({ error } = await client.storage.from(bucket).upload(storagePath, file, {
      cacheControl: "3600", contentType: file.type, upsert: false,
    }));
  } catch { error = { message: "Upload connection failed" }; }
  // Deterministic, content-addressed paths make retry of an existing upload safe.
  const duplicate = String(error?.statusCode) === "409"
    || (String(error?.statusCode) === "400" && (error.error === "Duplicate" || error.code === "Duplicate"
      || /^(?:The resource already exists|Asset Already Exists)\.?$/i.test(error.message || "")));
  if (error && !duplicate) {
    // Cancel unconsumed admission on failure. A racing/late Storage INSERT
    // takes the same owner lock: either it committed, or it must now fail.
    try {
      const released = await client.rpc("finish_vehicle_upload", { object_bucket: bucket, object_path: storagePath, release_pending: true });
      if (!released.error && released.data?.state === "consumed") return;
    } catch { /* Keep the bounded pending reservation for expiry/retry. */ }
    throw new Error(`No se pudo subir ${file.name}. Revisá la conexión y reintentá.`);
  }
  const confirmed = await client.rpc("finish_vehicle_upload", { object_bucket: bucket, object_path: storagePath, release_pending: false });
  if (confirmed.error || confirmed.data?.state !== "consumed") {
    throw new Error("No pudimos confirmar la foto. Reintentá sin cambiar los archivos.");
  }
}

