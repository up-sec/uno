// Entrada y salida de las rutas /api. Regla de logs: nunca se registran cuerpos
// de peticiones, CURP, huellas, firmas ni mensajes crudos del RPC (las
// simulaciones fallidas traen los argumentos de la llamada en sus eventos).
import "server-only";

/** Error con mensaje seguro para mostrar a la persona. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public hash?: string, // si la transacción ya se envió
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 4096;

/**
 * Solo peticiones del propio sitio (auditoría B-02). Un navegador SIEMPRE manda
 * Origin en un POST entre sitios, así que:
 *   - con Origin, su host debe ser el de este servidor;
 *   - sin Origin, se rechaza si el navegador dice que no es del mismo origen
 *     (Sec-Fetch-Site). Clientes sin navegador (curl, el script e2e) no mandan
 *     ninguno de los dos y no pueden montar un CSRF.
 */
function checkOrigin(request: Request): void {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (origin !== null) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      // "null" u otro valor no válido
    }
    if (!host || originHost !== host) throw new ApiError(403, "BadOrigin", "Origen no permitido.");
    return;
  }
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") throw new ApiError(403, "BadOrigin", "Origen no permitido.");
}

/** Lee el cuerpo con tope en BYTES, sin bajar más de lo permitido. */
async function readLimited(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new ApiError(413, "TooLarge", "La petición es demasiado grande.");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ApiError(413, "TooLarge", "La petición es demasiado grande.");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Lee un cuerpo JSON pequeño del propio sitio. Exige Content-Type
 * application/json y un tope de bytes. No devuelve ni registra el texto si es inválido.
 */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  checkOrigin(request);
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;|$)/i.test(type)) throw new ApiError(415, "BadContentType", "La petición debe ser application/json.");
  const text = await readLimited(request);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "BadJson", "La petición no es JSON válido.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ApiError(400, "BadJson", "La petición no es un objeto JSON.");
  return body as Record<string, unknown>;
}

export function str(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new ApiError(400, "BadRequest", `Falta el campo "${key}".`);
  return value;
}

export function int(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 4_294_967_295) {
    throw new ApiError(400, "BadRequest", `El campo "${key}" debe ser un número entero.`);
  }
  return value;
}

/** Convierte cualquier error en una respuesta sin datos sensibles. */
export function errorResponse(route: string, error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.code, message: error.message, ...(error.hash && { hash: error.hash }) }, { status: error.status });
  }
  // Solo el tipo de error: el mensaje podría traer datos de la petición.
  console.error(`[${route}] error inesperado:`, error instanceof Error ? error.name : typeof error);
  return Response.json({ error: "Internal", message: "Ocurrió un error inesperado en el servidor." }, { status: 500 });
}
