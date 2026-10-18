// Se ejecuta una vez al arrancar el servidor, antes de atender peticiones.
// Si falta un secreto o no es válido (ej. PUNTO_UNO_PIN de menos de 16
// caracteres), el servidor no arranca y el error dice cuál variable revisar.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { serverEnv } = await import("./server/env");
    serverEnv();
  }
}
