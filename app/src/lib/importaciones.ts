import { CONVERSORES, normalizarClave, type Conversor } from "./excel";
import { ETIQUETA_ROL, ROLES } from "./permisos";
import { cedula, rnc, sugerirUsuario } from "./utils";

export interface CampoImportacion {
  clave: string;
  titulo: string;
  sinonimos: string[];
  conversor?: Conversor;
  requerido?: boolean;
  ejemplo?: string | number;
}

export interface DefinicionImportacion {
  id: string;
  titulo: string;
  descripcion: string;
  /** RPC de Postgres (o "edge:<función>") que recibe { p_sistema, p_filas }. */
  destino: string;
  campos: CampoImportacion[];
  /** Ajustes por fila después de convertir (p. ej. separar "Nombre completo"). */
  ajustar?: (fila: Record<string, unknown>, original: Record<string, unknown>) => Record<string, unknown>;
  tamanoLote?: number;
}

const c = (clave: string, titulo: string, sinonimos: string[], extra: Partial<CampoImportacion> = {}): CampoImportacion => ({
  clave,
  titulo,
  sinonimos: [titulo, clave, ...sinonimos],
  ...extra,
});

export const IMPORTACIONES = {
  pacientes: {
    id: "pacientes",
    titulo: "Pacientes",
    descripcion: "Si el paciente ya existe (por documento o por nombre y apellido) se completan sus datos vacíos; no se duplica.",
    destino: "importar_pacientes",
    campos: [
      c("nombres", "Nombres", ["nombre", "primer nombre", "nombre completo", "paciente"], { requerido: true, ejemplo: "María" }),
      c("apellidos", "Apellidos", ["apellido", "primer apellido"], { ejemplo: "Rodríguez" }),
      c("documento", "Cédula", ["documento", "identificacion", "no identificacion", "cedula de identidad", "id", "pasaporte"], { ejemplo: "001-1234567-8" }),
      c("documento_tipo", "Tipo de documento", ["tipo documento", "tipo id"], { conversor: "documentoTipo", ejemplo: "Cédula" }),
      c("fecha_nacimiento", "Fecha de nacimiento", ["nacimiento", "fecha nac", "f nacimiento", "cumpleanos"], { conversor: "fecha", ejemplo: "15/03/1985" }),
      c("edad", "Edad", ["anos"], { conversor: "numero" }),
      c("sexo", "Sexo", ["genero", "género"], { conversor: "sexo", ejemplo: "F" }),
      c("telefono", "Teléfono", ["tel", "celular", "movil", "telefono 1", "contacto"], { ejemplo: "809-555-0101" }),
      c("email", "Correo", ["email", "e-mail", "correo electronico"]),
      c("direccion", "Dirección", ["domicilio", "direccion residencial"]),
      c("tipo_sangre", "Tipo de sangre", ["sangre", "grupo sanguineo", "tipo sanguineo"], { conversor: "sangre", ejemplo: "O+" }),
      c("alergias", "Alergias", ["alergia"]),
      c("condiciones_cronicas", "Condiciones crónicas", ["condicion", "condición", "enfermedades", "antecedentes", "diagnostico"]),
      c("aseguradora", "Aseguradora", ["ars", "seguro", "seguro medico"], { ejemplo: "ARS Humano" }),
      c("numero_afiliado", "No. afiliado", ["afiliado", "numero afiliado", "nss", "poliza"]),
      c("contacto_emergencia_nombre", "Contacto de emergencia", ["emergencia", "familiar"]),
      c("contacto_emergencia_telefono", "Teléfono de emergencia", ["tel emergencia"]),
      c("expediente", "Expediente", ["no expediente", "historia", "record"]),
      c("notas", "Notas", ["observaciones", "comentarios"]),
    ],
    ajustar: (f) => {
      // "Nombre completo" en una sola columna → nombres + apellidos (como FUNBIDE).
      if (f.nombres && !f.apellidos) {
        const partes = String(f.nombres).trim().split(/\s+/);
        if (partes.length >= 4) {
          f.nombres = partes.slice(0, 2).join(" ");
          f.apellidos = partes.slice(2).join(" ");
        } else if (partes.length > 1) {
          f.nombres = partes[0];
          f.apellidos = partes.slice(1).join(" ");
        }
      }
      // Cédula dominicana → 000-0000000-0 (así se reconoce el duplicado). Si no
      // tiene 11 dígitos no se pierde: queda como documento "otro".
      if (f.documento && (!f.documento_tipo || f.documento_tipo === "cedula")) {
        const ced = cedula(String(f.documento));
        f.documento_tipo = ced ? "cedula" : "otro";
        if (ced) f.documento = ced;
      }
      if (f.edad !== null && f.edad !== undefined && !f.fecha_nacimiento) {
        f.notas = [f.notas, `Edad declarada al importar: ${f.edad}`].filter(Boolean).join(" · ");
      }
      delete f.edad;
      return f;
    },
  },

  inventario: {
    id: "inventario",
    titulo: "Artículos de inventario",
    descripcion: "Crea o actualiza medicamentos e insumos (por código o nombre). Si traes la existencia, se registra la carga inicial o el ajuste por conteo.",
    destino: "importar_inventario",
    campos: [
      c("codigo", "Código", ["cod", "sku", "referencia", "codigo barra"], { ejemplo: "MED-001" }),
      c("nombre", "Nombre", ["articulo", "producto", "descripcion", "medicamento", "insumo"], { requerido: true, ejemplo: "Paracetamol 500 mg" }),
      c("categoria", "Categoría", ["tipo", "clase"], { conversor: "categoriaInventario", ejemplo: "Medicamento" }),
      c("unidad", "Unidad", ["unidad medida", "um", "presentacion"], { ejemplo: "tableta" }),
      c("existencia", "Existencia", ["stock", "cantidad", "stock actual", "disponible", "inventario"], { conversor: "numero", ejemplo: 100 }),
      c("stock_minimo", "Stock mínimo", ["minimo", "punto reorden"], { conversor: "numero", ejemplo: 20 }),
      c("costo_unitario", "Costo", ["costo unitario", "precio compra"], { conversor: "numero", ejemplo: 8.5 }),
      c("precio_venta", "Precio de venta", ["precio", "pvp", "precio venta"], { conversor: "numero", ejemplo: 25 }),
      c("requiere_receta", "Requiere receta", ["receta", "controlado"], { conversor: "booleano", ejemplo: "No" }),
      c("lote", "Lote", []),
      c("vence_en", "Vencimiento", ["vence", "fecha vencimiento", "expira", "caducidad"], { conversor: "fecha" }),
      c("descripcion", "Descripción", ["detalle"]),
    ],
  },

  movimientosInventario: {
    id: "movimientos",
    titulo: "Movimientos de inventario",
    descripcion: "Entradas, salidas y ajustes. El artículo se busca por código o nombre; las salidas sin stock suficiente se reportan.",
    destino: "importar_movimientos_inventario",
    campos: [
      c("codigo", "Código", ["cod", "sku"], { ejemplo: "MED-001" }),
      c("nombre", "Artículo", ["nombre", "producto", "medicamento", "insumo"], { ejemplo: "Paracetamol 500 mg" }),
      c("tipo", "Tipo", ["movimiento", "tipo movimiento", "operacion"], { conversor: "tipoMovimiento", requerido: true, ejemplo: "Entrada" }),
      c("cantidad", "Cantidad", ["cant", "unidades"], { conversor: "numero", requerido: true, ejemplo: 50 }),
      c("lote", "Lote", []),
      c("vence_en", "Vencimiento", ["vence", "caducidad"], { conversor: "fecha" }),
      c("motivo", "Motivo", ["concepto", "observacion", "detalle"], { ejemplo: "Compra a proveedor" }),
      c("fecha", "Fecha", ["fecha movimiento"], { conversor: "fecha" }),
    ],
  },

  empleados: {
    id: "empleados",
    titulo: "Empleados (nómina)",
    descripcion: "Crea o actualiza empleados por cédula o nombre. Sirve también para el personal que no usa MEDORA.",
    destino: "importar_empleados",
    campos: [
      c("nombres", "Nombres", ["nombre", "nombre completo", "empleado"], { requerido: true, ejemplo: "Juan" }),
      c("apellidos", "Apellidos", ["apellido"], { ejemplo: "Pérez" }),
      c("cedula", "Cédula", ["documento", "identificacion"], { ejemplo: "402-0000000-1" }),
      c("cargo", "Cargo", ["puesto", "posicion"], { ejemplo: "Enfermera" }),
      c("departamento", "Departamento", ["area", "departamento"]),
      c("fecha_ingreso", "Fecha de ingreso", ["ingreso", "fecha entrada", "inicio"], { conversor: "fecha" }),
      c("salario_mensual", "Salario mensual", ["salario", "sueldo", "sueldo mensual"], { conversor: "numero", ejemplo: 35000 }),
      c("frecuencia", "Frecuencia de pago", ["frecuencia", "pago"], { conversor: "frecuencia", ejemplo: "Mensual" }),
      c("banco", "Banco", []),
      c("cuenta_bancaria", "Cuenta bancaria", ["cuenta", "no cuenta"]),
    ],
    ajustar: (f) => {
      if (f.nombres && !f.apellidos) {
        const partes = String(f.nombres).trim().split(/\s+/);
        if (partes.length > 1) {
          f.nombres = partes.slice(0, Math.ceil(partes.length / 2)).join(" ");
          f.apellidos = partes.slice(Math.ceil(partes.length / 2)).join(" ");
        }
      }
      if (f.cedula) f.cedula = cedula(String(f.cedula)) ?? f.cedula;
      return f;
    },
  },

  personal: {
    id: "personal",
    titulo: "Personal con acceso a MEDORA",
    descripcion: "Crea cuentas con usuario y contraseña temporal (se descargan al final en Excel). Si el usuario ya existe, solo se le da acceso a este sistema.",
    destino: "edge:gestion-usuarios",
    tamanoLote: 25,
    campos: [
      c("nombre_completo", "Nombre completo", ["nombre", "nombres y apellidos", "empleado"], { requerido: true, ejemplo: "Dra. Laura Méndez" }),
      c("nombre_usuario", "Usuario", ["nombre usuario", "login", "user"], { ejemplo: "laura.mendez" }),
      c("email", "Correo", ["email", "e-mail", "correo electronico"], { ejemplo: "lmendez@hospital.do" }),
      c("roles", "Roles", ["rol", "cargo", "perfil"], { requerido: true, ejemplo: "Médico, Administración" }),
      c("especialidad", "Especialidad", []),
      c("exequatur", "Exequátur", ["exequatur"]),
    ],
    ajustar: (f) => {
      // "Médico, Administración" / "medico; caja" → ["medico","admin"]
      const partes = String(f.roles ?? "").split(/[,;/|]+/).map((x) => normalizarClave(x)).filter(Boolean);
      f.roles = [
        ...new Set(
          partes
            .map((p) => ROLES.find((r) => normalizarClave(r) === p || normalizarClave(ETIQUETA_ROL[r]) === p || normalizarClave(ETIQUETA_ROL[r]).startsWith(p) || p.startsWith(normalizarClave(r))))
            .filter(Boolean),
        ),
      ];
      if (!(f.roles as string[]).length) f.roles = null;
      // Sin columna de usuario: se sugiere a partir del nombre (ana.perez).
      f.nombre_usuario = String(f.nombre_usuario ?? "").trim().toLowerCase() || sugerirUsuario(String(f.nombre_completo ?? ""));
      return f;
    },
  },

  servicios: {
    id: "servicios",
    titulo: "Servicios y precios",
    descripcion: "Crea o actualiza el catálogo de servicios (por código o nombre).",
    destino: "importar_servicios",
    campos: [
      c("codigo", "Código", ["cod", "codigo procedimiento", "cpt"], { ejemplo: "CON-01" }),
      c("nombre", "Servicio", ["nombre", "procedimiento", "descripcion"], { requerido: true, ejemplo: "Consulta general" }),
      c("categoria", "Categoría", ["tipo", "area"], { conversor: "categoriaServicio", ejemplo: "Consulta" }),
      c("precio", "Precio", ["tarifa", "monto", "valor"], { conversor: "numero", ejemplo: 1500 }),
      c("duracion_min", "Duración (min)", ["duracion", "minutos"], { conversor: "numero", ejemplo: 30 }),
    ],
  },

  coberturas: {
    id: "coberturas",
    titulo: "Tarifario de la aseguradora",
    descripcion: "Cuánto cubre la aseguradora de cada servicio. El servicio se busca por código o nombre.",
    destino: "importar_coberturas",
    campos: [
      c("codigo", "Código", ["cod", "codigo procedimiento"], { ejemplo: "CON-01" }),
      c("servicio", "Servicio", ["procedimiento", "nombre", "descripcion"], { ejemplo: "Consulta general" }),
      c("monto_cubierto", "Monto cubierto", ["cobertura", "monto", "cubre", "valor ars"], { conversor: "numero", requerido: true, ejemplo: 800 }),
    ],
  },

  pagosArs: {
    id: "pagos-ars",
    titulo: "Relación de pagos de la ARS",
    descripcion:
      "Una fila por autorización pagada. Cada pago se abona a la cuenta por cobrar de esa autorización; la diferencia con lo reclamado queda como glosa. Un mismo pago (referencia) no se puede importar dos veces.",
    destino: "importar_pagos_ars",
    // Un pago de la ARS es una unidad: va completo en un solo envío.
    tamanoLote: 20000,
    campos: [
      c("autorizacion", "Autorización", ["no autorizacion", "numero autorizacion", "aut", "autoriz", "no. autorizacion"], { requerido: true, ejemplo: "1926028302" }),
      c("pagado", "Monto pagado", ["pagado", "monto pagado", "valor pagado", "pago", "monto a pagar"], { conversor: "numero", requerido: true, ejemplo: 500 }),
      c("reclamado", "Monto reclamado", ["reclamado", "facturado", "monto reclamado", "valor reclamado"], { conversor: "numero", ejemplo: 500 }),
      c("glosa", "Glosa", ["monto glosado", "glosado", "objetado", "rechazado"], { conversor: "numero", ejemplo: 0 }),
      c("motivo", "Motivo de la glosa", ["motivo", "observacion", "causa", "comentario"], { ejemplo: "" }),
    ],
  },

  movimientosBancarios: {
    id: "movimientos-bancarios",
    titulo: "Estado de cuenta bancario",
    descripcion:
      "El estado de cuenta del banco tal cual (Popular, BHD, Banreservas…): fecha, descripción, referencia y el monto (o columnas de débito y crédito). Importarlo dos veces no duplica movimientos.",
    destino: "importar_movimientos_bancarios",
    tamanoLote: 20000,
    campos: [
      c("fecha", "Fecha", ["fecha transaccion", "fecha valor", "fecha efectiva", "fecha posteo"], { conversor: "fecha", requerido: true, ejemplo: "01/10/2026" }),
      c("descripcion", "Descripción", ["concepto", "detalle", "descripcion transaccion", "transaccion"], { ejemplo: "DEP LOTE VISA" }),
      c("referencia", "Referencia", ["no referencia", "documento", "numero documento", "serial"], { ejemplo: "123456" }),
      c("monto", "Monto", ["importe", "valor", "monto transaccion"], { conversor: "numero", ejemplo: 9400 }),
      c("credito", "Crédito", ["creditos", "depositos", "deposito", "abonos", "entrada"], { conversor: "numero", ejemplo: 9400 }),
      c("debito", "Débito", ["debitos", "retiros", "retiro", "cargos", "salida"], { conversor: "numero", ejemplo: 0 }),
    ],
  },

  parametrosNomina: {
    id: "parametros-nomina",
    titulo: "Parámetros TSS",
    descripcion: "Una fila por concepto: AFP empleado, SFS empleado, AFP empleador, SFS empleador, SRL, INFOTEP, Tope AFP y Tope SFS (mensual; 0 = sin tope).",
    destino: "importar_parametros_nomina",
    campos: [
      c("concepto", "Concepto", ["parametro", "descripcion", "nombre"], { requerido: true, ejemplo: "AFP empleado" }),
      c("valor", "Valor", ["porcentaje", "tasa", "%", "monto"], { conversor: "numero", requerido: true, ejemplo: 2.87 }),
    ],
  },

  escalaIsr: {
    id: "escala-isr",
    titulo: "Escala de ISR",
    descripcion: "Reemplaza la escala anual completa. Una fila por tramo; el último tramo puede dejar «Hasta» vacío.",
    destino: "importar_escala_isr",
    tamanoLote: 1000,
    campos: [
      c("hasta", "Hasta (anual)", ["hasta", "limite", "renta hasta", "monto hasta"], { conversor: "numero", ejemplo: 416220 }),
      c("tasa", "Tasa %", ["tasa", "porcentaje", "%"], { conversor: "numero", requerido: true, ejemplo: 0 }),
      c("fijo", "Monto fijo", ["fijo", "cuota fija", "mas"], { conversor: "numero", ejemplo: 0 }),
    ],
  },

  novedadesNomina: {
    id: "novedades-nomina",
    titulo: "Novedades de la nómina",
    descripcion: "Horas extra, bonos, otros ingresos y descuentos de cada empleado de esta nómina (por cédula o nombre). Las columnas vacías no cambian nada.",
    destino: "importar_novedades_nomina",
    campos: [
      c("cedula", "Cédula", ["documento", "identificacion"], { ejemplo: "402-0000000-1" }),
      c("empleado", "Empleado", ["nombre", "nombre completo", "nombres y apellidos"], { ejemplo: "Juan Pérez" }),
      c("horas_extra", "Horas extra (RD$)", ["horas extra", "extras", "horas extras"], { conversor: "numero", ejemplo: 1500 }),
      c("bonos", "Bonos", ["bono", "bonificacion", "incentivo"], { conversor: "numero", ejemplo: 0 }),
      c("otros_ingresos", "Otros ingresos", ["otros ingresos", "comisiones", "pago por pacientes"], { conversor: "numero", ejemplo: 0 }),
      c("otras_deducciones", "Otras deducciones", ["deducciones", "descuentos", "prestamo", "adelanto"], { conversor: "numero", ejemplo: 0 }),
    ],
    ajustar: (f) => {
      if (f.cedula) f.cedula = cedula(String(f.cedula)) ?? f.cedula;
      return f;
    },
  },

  cuentasContables: {
    id: "cuentas-contables",
    titulo: "Catálogo de cuentas",
    descripcion: "Crea o actualiza cuentas por código. La cuenta padre sale del código (6.2.05 → 6.2) y el tipo, si no viene, del primer dígito (1 activo … 6 gasto).",
    destino: "importar_cuentas_contables",
    tamanoLote: 1000,
    campos: [
      c("codigo", "Código", ["cuenta", "no cuenta", "numero cuenta", "cod"], { requerido: true, ejemplo: "6.2.05" }),
      c("nombre", "Nombre", ["descripcion", "nombre cuenta", "cuenta contable"], { requerido: true, ejemplo: "Combustible" }),
      c("tipo", "Tipo", ["tipo cuenta", "naturaleza", "clase"], { conversor: "tipoCuenta", ejemplo: "Gasto" }),
      c("acepta_movimiento", "Acepta movimiento", ["movimiento", "detalle", "auxiliar"], { conversor: "booleano", ejemplo: "Sí" }),
    ],
  },

  reglasComision: {
    id: "reglas-comision",
    titulo: "Reglas de comisión",
    descripcion:
      "Una fila por regla. Indica la persona (o un rol), a qué servicio o categoría aplica, y si es porcentaje o monto fijo por paciente/servicio. Si ya existe una regla con el mismo nombre, se actualiza.",
    destino: "importar_reglas_comision",
    campos: [
      c("nombre", "Nombre de la regla", ["regla", "nombre"], { ejemplo: "Dra. Méndez · consultas" }),
      c("persona", "Persona", ["medico", "doctor", "profesional", "empleado", "usuario", "beneficiario"], { ejemplo: "Laura Méndez" }),
      c("rol", "Rol", ["cargo", "perfil"], { ejemplo: "Médico" }),
      c("especialidad", "Especialidad", ["area medica"], { ejemplo: "Odontología" }),
      c("retencion", "Retención %", ["retencion", "isr", "descuento"], { conversor: "numero", ejemplo: 10 }),
      c("servicio", "Servicio", ["procedimiento", "codigo servicio"], { ejemplo: "Consulta medicina familiar" }),
      c("categoria", "Categoría", ["area", "tipo servicio"], { conversor: "categoriaServicio", ejemplo: "Consulta" }),
      c("tipo", "Tipo", ["tipo comision", "forma"], { conversor: "tipoComision", ejemplo: "Por paciente" }),
      c("valor", "Valor", ["monto", "porcentaje", "tarifa", "pago por paciente"], { conversor: "numero", requerido: true, ejemplo: 250 }),
      c("base", "Base", ["sobre"], { conversor: "baseComision", ejemplo: "Bruto" }),
      c("aplica_a", "Se paga al", ["aplica a", "paga a"], { conversor: "aplicaComision", ejemplo: "Profesional" }),
      c("vigente_desde", "Vigente desde", ["desde", "inicio"], { conversor: "fecha" }),
      c("vigente_hasta", "Vigente hasta", ["hasta", "fin"], { conversor: "fecha" }),
    ],
    ajustar: (f) => {
      if (f.rol) {
        const k = normalizarClave(String(f.rol));
        f.rol = ROLES.find((r) => normalizarClave(r) === k || normalizarClave(ETIQUETA_ROL[r]) === k || normalizarClave(ETIQUETA_ROL[r]).startsWith(k)) ?? null;
      }
      return f;
    },
  },

  proveedores: {
    id: "proveedores",
    titulo: "Proveedores",
    descripcion: "Crea o actualiza proveedores por RNC o nombre.",
    destino: "importar_proveedores",
    campos: [
      c("nombre", "Nombre", ["razon social", "proveedor", "empresa"], { requerido: true, ejemplo: "Distribuidora Médica SRL" }),
      c("rnc", "RNC", ["cedula", "documento"], { ejemplo: "130123456" }),
      c("telefono", "Teléfono", ["tel"]),
      c("email", "Correo", ["email"]),
      c("contacto", "Contacto", ["persona contacto", "vendedor"]),
      c("direccion", "Dirección", []),
    ],
    ajustar: (f) => {
      if (f.rnc) f.rnc = rnc(String(f.rnc)) ?? f.rnc;
      return f;
    },
  },
} satisfies Record<string, DefinicionImportacion>;

/** Asigna cada encabezado del Excel al campo que le corresponde (o a ninguno). */
export function detectarColumnas(def: DefinicionImportacion, encabezados: string[]) {
  const asignadas = new Map<string, CampoImportacion>();
  const usados = new Set<string>();
  // Primero coincidencias exactas; después "empieza con".
  for (const exacta of [true, false]) {
    for (const h of encabezados) {
      if (asignadas.has(h) || !h) continue;
      const k = normalizarClave(h);
      const campo = def.campos.find(
        (cp) => !usados.has(cp.clave) && cp.sinonimos.some((s) => (exacta ? normalizarClave(s) === k : k.startsWith(normalizarClave(s)) && normalizarClave(s).length >= 3)),
      );
      if (campo) {
        asignadas.set(h, campo);
        usados.add(campo.clave);
      }
    }
  }
  return asignadas;
}

export interface FilaPreparada {
  _fila: number;
  datos: Record<string, unknown>;
  avisos: string[];
}

export function prepararFilas(def: DefinicionImportacion, filas: { _fila: number; valores: Record<string, unknown> }[], columnas: Map<string, CampoImportacion>): FilaPreparada[] {
  return filas.map(({ _fila, valores }) => {
    const avisos: string[] = [];
    let datos: Record<string, unknown> = {};
    for (const [h, campo] of columnas) {
      const bruto = valores[h];
      const conv = CONVERSORES[campo.conversor ?? "texto"] as (v: unknown) => unknown;
      const v = conv(bruto);
      if (v === undefined) avisos.push(`${campo.titulo}: "${String(bruto)}" no reconocido`);
      datos[campo.clave] = v === undefined ? null : v;
    }
    if (def.ajustar) datos = def.ajustar(datos, valores);
    for (const cp of def.campos.filter((x) => x.requerido)) {
      if (datos[cp.clave] === null || datos[cp.clave] === undefined || datos[cp.clave] === "") avisos.push(`Falta ${cp.titulo}`);
    }
    return { _fila, datos, avisos };
  });
}
