import { type MetodoPago } from "@/lib/supabase";

export const METODOS_DINERO: MetodoPago[] = ["efectivo", "tarjeta", "transferencia", "cheque", "otro"];

export interface CobroFila {
  id: string;
  numero: string;
  ncf: string | null;
  tipo_ncf: string | null;
  cliente_rnc: string | null;
  cliente_nombre: string | null;
  total: number;
  subtotal: number;
  cobertura_seguro: number;
  monto_fondo: number;
  descuento: number;
  monto_credito: number;
  metodo: MetodoPago;
  numero_autorizacion: string | null;
  creado_en: string;
  paciente: { nombres: string; apellidos: string; expediente: string; documento: string | null } | null;
  cajero: { nombre_completo: string } | null;
  profesional: { nombre_completo: string } | null;
  aseguradora: { nombre: string } | null;
  anulacion: { motivo: string }[] | null;
  cita: { turno: string | null; especialidad: string | null; medico_id: string | null; medico: { nombre_completo: string } | null } | null;
  pagos: { metodo: MetodoPago; monto: number; referencia: string | null; recibido: number | null }[];
  detalles: { descripcion: string; categoria: string; cantidad: number; precio_unitario: number; cobertura: number; total: number }[];
}

export const SELECT_COBRO =
  "id, numero, ncf, tipo_ncf, cliente_rnc, cliente_nombre, total, subtotal, cobertura_seguro, monto_fondo, descuento, monto_credito, metodo, numero_autorizacion, creado_en, " +
  "paciente:pacientes!cobros_sistema_id_paciente_id_fkey(nombres, apellidos, expediente, documento), cajero:perfiles!cobros_cajero_perfil_fk(nombre_completo), " +
  "profesional:perfiles!cobros_profesional_perfil_fk(nombre_completo), aseguradora:aseguradoras!cobros_sistema_id_aseguradora_id_fkey(nombre), " +
  "anulacion:anulaciones_cobro(motivo), cita:citas!cobros_sistema_id_cita_id_fkey(turno, especialidad, medico_id, medico:perfiles!citas_medico_perfil_fk(nombre_completo)), pagos:cobro_pagos(metodo, monto, referencia, recibido), detalles:cobro_detalles(descripcion, categoria, cantidad, precio_unitario, cobertura, total)";
