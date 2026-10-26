/*
 * Guías de Ayuda. Cada una dice en qué pantallas es útil (`rutas`): Ayuda muestra
 * primero las de la pantalla desde la que se abrió. Cortas y en el lenguaje del
 * día a día; si un paso cambia en la app, se cambia aquí.
 */

export interface Guia {
  id: string;
  titulo: string;
  resumen: string;
  /** Rutas (sin parámetros) donde la guía es útil. Vacío = general. */
  rutas: string[];
  pasos: string[];
  /** Palabras extra para el buscador. */
  claves?: string;
}

export const GUIAS: Guia[] = [
  {
    id: "cobrar",
    titulo: "Cobrar a un paciente",
    resumen: "El cobro completo desde Caja, con atajos de teclado.",
    rutas: ["/caja", "/"],
    pasos: [
      "Entra a Caja y facturación (o usa el botón Cobrar del Inicio).",
      "F2 empieza un cobro nuevo y F4 te lleva a buscar al paciente.",
      "F6 agrega un servicio. Si el paciente tiene ARS, elige la aseguradora para que se aplique su cobertura.",
      "Revisa el total y la forma de pago, y registra con F9.",
      "Si se cobra dos veces por un doble clic o un fallo de internet, MEDORA lo detecta y no duplica el cobro.",
    ],
    claves: "factura recibo pagar atajos f2 f4 f6 f9",
  },
  {
    id: "farmacia-ars",
    titulo: "Medicamentos que paga la ARS",
    resumen: "Cómo cargar farmacia cubierta por el seguro dentro del cobro.",
    rutas: ["/caja"],
    pasos: [
      "En el cobro, con la aseguradora del paciente elegida, toca el botón Farmacia.",
      "Escribe el medicamento y su precio: la ARS lo paga completo y queda en lo que debe la aseguradora.",
    ],
    claves: "medicina medicamento seguro senasa",
  },
  {
    id: "cuadre",
    titulo: "Cuadre del día",
    resumen: "El resumen de caja por médico, por ARS y por forma de pago.",
    rutas: ["/caja"],
    pasos: [
      "En Caja y facturación, abre el menú Más y elige Cuadre del día.",
      "Verás lo cobrado por médico, las columnas por ARS, efectivo, tarjeta y transferencia, la comisión y el 10 %.",
      "Desde ahí puedes exportarlo a Excel o imprimirlo.",
    ],
    claves: "cierre arqueo excel",
  },
  {
    id: "anular",
    titulo: "Anular un cobro",
    resumen: "Los cobros no se borran: se anulan y queda el registro.",
    rutas: ["/caja"],
    pasos: [
      "En la lista de cobros, pasa el mouse sobre el cobro y toca el ícono de Anular.",
      "Escribe el motivo. El cobro queda marcado como anulado y la contabilidad se revierte sola.",
      "Un cobro con factura electrónica ya enviada a la DGII no se anula: necesita una nota de crédito.",
    ],
    claves: "cancelar devolver error cobro",
  },
  {
    id: "pagos-ars",
    titulo: "Registrar lo que pagó una ARS",
    resumen: "Importar el pago de la aseguradora y cuadrar lo que debe.",
    rutas: ["/caja"],
    pasos: [
      "En Caja y facturación, abre Más → Lo que deben.",
      "Toca Importar pago de ARS y sube el archivo del pago.",
      "MEDORA abona cada autorización a su cobro y registra lo que la ARS glosó.",
    ],
    claves: "senasa cuentas por cobrar abono glosa",
  },
  {
    id: "llegada",
    titulo: "Registrar la llegada de un paciente",
    resumen: "Darle turno al paciente cuando llega.",
    rutas: ["/recepcion", "/"],
    pasos: [
      "En Recepción (o desde el Inicio), toca Registrar llegada.",
      "Busca al paciente por nombre o cédula y elige su cita. Si llegó sin cita, también puedes registrarlo.",
      "MEDORA le asigna su turno y aparece en la sala de espera de su médico.",
    ],
    claves: "turno sala de espera cita",
  },
  {
    id: "llamar",
    titulo: "Llamar al siguiente paciente",
    resumen: "Para médicos: atender en orden de llegada y prioridad.",
    rutas: ["/recepcion"],
    pasos: [
      "En tu sala de espera, toca Llamar siguiente: se llama primero a quien tiene prioridad legal y luego por orden de llegada.",
      "Para atender a alguien fuera de orden, usa Llamar en su fila.",
      "El llamado sale en la pantalla de la sala.",
    ],
    claves: "turno consulta pantalla tv",
  },
  {
    id: "deshacer-cita",
    titulo: "Me equivoqué con el estado de una cita",
    resumen: "Confirmar, cancelar o marcar no asistió se puede deshacer.",
    rutas: ["/agenda", "/recepcion"],
    pasos: [
      "Justo después del cambio aparece un aviso abajo con el botón Deshacer.",
      "Funciona para confirmar, cancelar, no asistió y completar. Lo que toca dinero o la historia clínica no se deshace así.",
    ],
    claves: "cancelar cita error",
  },
  {
    id: "detalle-finanzas",
    titulo: "Ver qué pasó un día en Finanzas",
    resumen: "Del gráfico al detalle de cada movimiento.",
    rutas: ["/finanzas"],
    pasos: [
      "En Entradas y salidas, toca el día que quieras revisar.",
      "Se abre el detalle de lo que entró y lo que salió, con el paciente, la ARS o el médico de cada línea.",
      "Las tarjetas de arriba (Lo que entró, Lo que salió…) también abren su detalle.",
    ],
    claves: "gráfico reporte ingresos gastos",
  },
  {
    id: "excel",
    titulo: "Exportar a Excel o imprimir un listado",
    resumen: "Casi todos los listados se pueden sacar en Excel o PDF.",
    rutas: [],
    pasos: [
      "Busca los botones de Excel e imprimir arriba del listado.",
      "El archivo sale con lo que tienes filtrado en ese momento.",
    ],
    claves: "pdf descargar reporte",
  },
  {
    id: "buscar",
    titulo: "Encontrar cualquier pantalla o paciente",
    resumen: "El buscador de arriba llega a todo.",
    rutas: [],
    pasos: [
      "Pulsa Ctrl + K (o toca la barra de búsqueda de arriba).",
      "Escribe el nombre de un paciente o de una pantalla, como «cuadre» o «nómina».",
    ],
    claves: "ctrl k atajo",
  },
  {
    id: "dos-pasos",
    titulo: "Proteger tu cuenta con verificación en dos pasos",
    resumen: "Un código del teléfono además de la contraseña.",
    rutas: ["/perfil"],
    pasos: [
      "Ve a Mi perfil → Seguridad.",
      "En verificación en dos pasos, escanea el código con una app autenticadora (Google Authenticator, Microsoft Authenticator…).",
      "Escribe el código de 6 dígitos para activarla. Desde entonces te lo pedirá al entrar.",
    ],
    claves: "2fa seguridad contraseña código",
  },
  {
    id: "contrasena",
    titulo: "Cambiar mi contraseña",
    resumen: "Desde tu perfil, en cualquier momento.",
    rutas: ["/perfil"],
    pasos: [
      "Ve a Mi perfil → Seguridad → Cambiar contraseña.",
      "Si la olvidaste, en la pantalla de entrada toca ¿Olvidaste tu contraseña? y te llegará un código.",
    ],
    claves: "clave olvidé acceso",
  },
  {
    id: "preferencias",
    titulo: "Tema oscuro, tamaño de letra y bloqueo",
    resumen: "Ajusta MEDORA a tu gusto y a tu puesto.",
    rutas: ["/perfil"],
    pasos: [
      "Ve a Mi perfil → Preferencias.",
      "Elige tema claro u oscuro y su estilo, el tamaño del texto y la pantalla con la que abre MEDORA.",
      "En Bloqueo por inactividad decide tras cuántos minutos se cubre la pantalla si te alejas.",
    ],
    claves: "oscuro letra grande personalizar",
  },
  {
    id: "impresora",
    titulo: "Elegir la impresora de recibos",
    resumen: "Recibos y tickets salen por la impresora que elijas.",
    rutas: ["/perfil", "/caja"],
    pasos: [
      "En la app de escritorio, ve a Mi perfil → Dispositivo.",
      "Elige la impresora para recibos y para tickets, o que pregunte cada vez.",
    ],
    claves: "imprimir ticket recibo",
  },
];

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Guías de una pantalla y búsqueda por texto (sin acentos). */
export function guiasPara(pantalla: string) {
  const ruta = pantalla.split("?")[0] || "/";
  return GUIAS.filter((g) => g.rutas.includes(ruta));
}

export function buscarGuias(texto: string) {
  const q = normalizar(texto.trim());
  if (!q) return GUIAS;
  return GUIAS.filter((g) => normalizar(`${g.titulo} ${g.resumen} ${g.claves ?? ""} ${g.pasos.join(" ")}`).includes(q));
}
