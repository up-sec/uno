// Llamadas a las rutas /api del propio servidor (registro y cobro). Sin React.

/** Error que devolvió una ruta /api: código estable + mensaje para la persona. */
export class ApiCallError extends Error {
  constructor(
    public code: string,
    message: string,
    public hash?: string, // si la transacción ya se envió
  ) {
    super(message);
  }
}

export async function postApi<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiCallError("Network", "No se pudo conectar con el servidor. Revisa tu conexión.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiCallError(data?.error ?? "Http", data?.message ?? `El servidor respondió ${response.status}.`, data?.hash);
  }
  return data as T;
}
