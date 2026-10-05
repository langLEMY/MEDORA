/**
 * Lo que una computadora recuerda para el login (localStorage, nunca contraseñas):
 *   · la cuenta, solo si la persona marcó "Recordar mi usuario en este equipo";
 *   · el hospital donde se trabajó por última vez (logo y color), para que el login
 *     se vea como el del hospital;
 *   · si la sesión se cerró sola (vencida o cerrada por soporte), para avisarlo.
 */
export interface CuentaRecordada {
  usuario: string;
  nombre: string;
  foto: string | null;
}
export interface HospitalEquipo {
  nombre: string;
  logo: string | null;
  color: string;
}

const CUENTA = "medora.cuenta-recordada";
const HOSPITAL = "medora.hospital-equipo";
const SALIDA = "medora.aviso-salida";

function leer<T>(clave: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? "null") as T | null;
  } catch {
    return null;
  }
}
function escribir(clave: string, valor: unknown) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: el login funciona igual, solo no recuerda */
  }
}

export const cuentaRecordada = () => leer<CuentaRecordada>(CUENTA);
export const recordarCuenta = (c: CuentaRecordada | null) => escribir(CUENTA, c);

export const hospitalDelEquipo = () => leer<HospitalEquipo>(HOSPITAL);
export const recordarHospital = (h: HospitalEquipo) => escribir(HOSPITAL, h);

/** La sesión se cerró sin que la persona lo pidiera: el login lo explica una vez. */
export const marcarSalidaInvoluntaria = () => escribir(SALIDA, true);
export function tomarAvisoSalida(): boolean {
  const hay = leer<boolean>(SALIDA) === true;
  if (hay) escribir(SALIDA, null);
  return hay;
}

const COMUNES = ["contraseña", "contrasena", "password", "medora", "hospital", "funbide", "123456", "qwerty", "abc123", "republica", "dominicana"];

/** Qué tan difícil de adivinar es una contraseña (0–4): largo, variedad y que no sea algo común. */
export function seguridadClave(p: string, usuario?: string | null): 0 | 1 | 2 | 3 | 4 {
  if (!p) return 0;
  const baja = p.toLowerCase();
  if (COMUNES.some((c) => baja.includes(c)) || (usuario && baja.includes(usuario.toLowerCase())) || /^\d+$/.test(p)) return 1;
  if (p.length < 10) return 1;
  let puntos = 0;
  if (p.length >= 14) puntos++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) puntos++;
  if (/\d/.test(p)) puntos++;
  if (/[^A-Za-z0-9]/.test(p)) puntos++;
  return Math.min(4, Math.max(1, puntos)) as 1 | 2 | 3 | 4;
}

/** Buenos días / tardes / noches (hora local de la computadora, que es la de RD). */
export function saludo(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}
