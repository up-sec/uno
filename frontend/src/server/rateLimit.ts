// Límite de peticiones en MEMORIA (ventana deslizante por clave).
//
// NO es confiable en Vercel ni en ningún despliegue con varias instancias: cada
// instancia tiene su propia memoria y se reinicia sin aviso, así que el límite
// real es "N por minuto POR INSTANCIA". Sirve para frenar abusos simples en un
// servidor único. Antes de un piloto se mueve a una base de datos/KV compartida
// (o se reemplaza el PIN único por credenciales por operador).
import "server-only";
import { isIP } from "node:net";

const hits = new Map<string, number[]>();
const MAX_KEYS = 10_000;

/**
 * Con demasiadas claves se desalojan las MÁS VIEJAS (el Map conserva el orden
 * de inserción y cada uso mueve la clave al final). Antes se borraba todo, lo
 * que reiniciaba también el contador de quien estaba bloqueado (auditoría N-03).
 */
function evictOldest(): void {
  for (const key of hits.keys()) {
    if (hits.size <= MAX_KEYS) break;
    hits.delete(key);
  }
}

/** ¿Se permite otra petición con esta clave? Si sí, la cuenta. */
export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  hits.delete(key); // al final del Map = usada más recientemente
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  evictOldest();
  return true;
}

/** Clave compartida cuando no hay una IP confiable: el límite pasa a ser global. */
const SIN_IP = "sin-ip";

/**
 * IP del cliente, SOLO si viene de una fuente confiable (auditoría N-03).
 *
 * - En Vercel (VERCEL=1, variable de sistema disponible en runtime) se usa
 *   `x-vercel-forwarded-for`. Según la documentación de Vercel
 *   (vercel.com/docs/headers/request-headers, actualizada 2025-12-13), la
 *   plataforma sobrescribe x-forwarded-for "to prevent IP spoofing", y
 *   x-vercel-forwarded-for es idéntica pero no la puede pisar un proxy puesto
 *   delante de Vercel.
 * - En cualquier otro entorno (por ejemplo `next start` sin proxy) esas
 *   cabeceras las escribe el cliente, así que NO se confía en ninguna: todas las
 *   peticiones comparten un límite global. Es más estricto, nunca más laxo.
 *
 * El valor se valida con net.isIP: un encabezado inválido o gigante no se usa
 * como clave, así que la memoria por clave queda acotada.
 */
export function clientIp(request: Request): string {
  if (process.env.VERCEL !== "1") return SIN_IP;
  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return isIP(ip) ? ip : SIN_IP;
}
