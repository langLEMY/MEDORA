import { CONVERSORES, normalizarClave, type Conversor } from "./excel";
import { ETIQUETA_ROL, ROLES } from "./permisos";

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
      return f;
    },
  },

  personal: {
    id: "personal",
    titulo: "Personal con acceso a MEDORA",
    descripcion: "Crea cuentas con contraseña temporal (se descargan al final en Excel). Si el correo ya existe, solo se le da acceso a este sistema.",
    destino: "edge:gestion-usuarios",
    tamanoLote: 25,
    campos: [
      c("nombre_completo", "Nombre completo", ["nombre", "nombres y apellidos", "empleado"], { requerido: true, ejemplo: "Dra. Laura Méndez" }),
      c("email", "Correo", ["email", "e-mail", "usuario"], { requerido: true, ejemplo: "lmendez@hospital.do" }),
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
