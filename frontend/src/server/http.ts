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

/** Lee un cuerpo JSON pequeño. No devuelve ni registra el texto si es inválido. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, "TooLarge", "La petición es demasiado grande.");
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
