// Límite de peticiones en MEMORIA (ventana deslizante por clave).
//
// NO es confiable en Vercel ni en ningún despliegue con varias instancias: cada
// instancia tiene su propia memoria y se reinicia sin aviso, así que el límite
// real es "N por minuto POR INSTANCIA". Sirve para frenar abusos simples en un
// servidor único. Antes de un piloto se mueve a una base de datos/KV compartida
// (o se reemplaza el PIN único por credenciales por operador).
import "server-only";

const hits = new Map<string, number[]>();
const MAX_KEYS = 10_000; // para que un atacante con muchas IPs no llene la memoria

/** ¿Se permite otra petición con esta clave? Si sí, la cuenta. */
export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (hits.size > MAX_KEYS) {
    for (const [k, times] of hits) if (times[times.length - 1] <= now - windowMs) hits.delete(k);
    if (hits.size > MAX_KEYS) hits.clear();
  }
  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/**
 * IP del cliente según el proxy (Vercel pone x-forwarded-for). Sin proxy de
 * confianza ese encabezado lo controla el cliente: es un límite "best effort".
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "desconocida";
}
