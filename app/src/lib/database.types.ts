export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abonos: {
        Row: {
          cobro_id: string
          creado_en: string
          creado_por: string
          deudor: string
          fecha: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          numero: string
          referencia: string | null
          sistema_id: string
          turno_id: string | null
        }
        Insert: {
          cobro_id: string
          creado_en?: string
          creado_por?: string
          deudor: string
          fecha?: string
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          numero: string
          referencia?: string | null
          sistema_id: string
          turno_id?: string | null
        }
        Update: {
          cobro_id?: string
          creado_en?: string
          creado_por?: string
          deudor?: string
          fecha?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          numero?: string
          referencia?: string | null
          sistema_id?: string
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abonos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abonos_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "abonos_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["sistema_id", "cobro_id"]
          },
          {
            foreignKeyName: "abonos_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abonos_sistema_id_turno_id_fkey"
            columns: ["sistema_id", "turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_caja"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      anticipos: {
        Row: {
          creado_en: string
          creado_por: string
          fecha: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas: string | null
          numero: string
          paciente_id: string
          referencia: string | null
          sistema_id: string
          turno_id: string | null
        }
        Insert: {
          creado_en?: string
          creado_por?: string
          fecha?: string
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas?: string | null
          numero: string
          paciente_id: string
          referencia?: string | null
          sistema_id: string
          turno_id?: string | null
        }
        Update: {
          creado_en?: string
          creado_por?: string
          fecha?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          notas?: string | null
          numero?: string
          paciente_id?: string
          referencia?: string | null
          sistema_id?: string
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anticipos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipos_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipos_sistema_id_paciente_id_fkey"
            columns: ["sistema_id", "paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "anticipos_sistema_id_turno_id_fkey"
            columns: ["sistema_id", "turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_caja"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      anulaciones_cobro: {
        Row: {
          anulado_por: string
          cobro_id: string
          creado_en: string
          id: string
          motivo: string
          sistema_id: string
        }
        Insert: {
          anulado_por?: string
          cobro_id: string
          creado_en?: string
          id?: string
          motivo: string
          sistema_id: string
        }
        Update: {
          anulado_por?: string
          cobro_id?: string
          creado_en?: string
          id?: string
          motivo?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anulaciones_autor_perfil_fk"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anulaciones_cobro_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "anulaciones_cobro_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["sistema_id", "cobro_id"]
          },
          {
            foreignKeyName: "anulaciones_cobro_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      anulaciones_compra: {
        Row: {
          anulado_por: string
          compra_id: string
          creado_en: string
          id: string
          motivo: string
          sistema_id: string
        }
        Insert: {
          anulado_por?: string
          compra_id: string
          creado_en?: string
          id?: string
          motivo: string
          sistema_id: string
        }
        Update: {
          anulado_por?: string
          compra_id?: string
          creado_en?: string
          id?: string
          motivo?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anulaciones_compra_anulado_por_fkey"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anulaciones_compra_sistema_id_compra_id_fkey"
            columns: ["sistema_id", "compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "anulaciones_compra_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      anulaciones_donacion: {
        Row: {
          anulado_por: string
          creado_en: string
          donacion_id: string
          id: string
          motivo: string
          sistema_id: string
        }
        Insert: {
          anulado_por?: string
          creado_en?: string
          donacion_id: string
          id?: string
          motivo: string
          sistema_id: string
        }
        Update: {
          anulado_por?: string
          creado_en?: string
          donacion_id?: string
          id?: string
          motivo?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anulaciones_donacion_anulado_por_fkey"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anulaciones_donacion_sistema_id_donacion_id_fkey"
            columns: ["sistema_id", "donacion_id"]
            isOneToOne: false
            referencedRelation: "donaciones"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "anulaciones_donacion_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      ars_pagos_items: {
        Row: {
          aplicado: number
          cobro_id: string | null
          creado_en: string
          estado: string
          glosa: number
          id: string
          lote_id: string
          motivo_glosa: string | null
          numero_autorizacion: string
          pagado: number
          reclamado: number | null
          sistema_id: string
        }
        Insert: {
          aplicado?: number
          cobro_id?: string | null
          creado_en?: string
          estado: string
          glosa?: number
          id?: string
          lote_id: string
          motivo_glosa?: string | null
          numero_autorizacion: string
          pagado?: number
          reclamado?: number | null
          sistema_id: string
        }
        Update: {
          aplicado?: number
          cobro_id?: string | null
          creado_en?: string
          estado?: string
          glosa?: number
          id?: string
          lote_id?: string
          motivo_glosa?: string | null
          numero_autorizacion?: string
          pagado?: number
          reclamado?: number | null
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ars_pagos_items_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "ars_pagos_items_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["sistema_id", "cobro_id"]
          },
          {
            foreignKeyName: "ars_pagos_items_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ars_pagos_items_sistema_id_lote_id_fkey"
            columns: ["sistema_id", "lote_id"]
            isOneToOne: false
            referencedRelation: "ars_pagos_lotes"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "ars_pagos_items_sistema_id_lote_id_fkey"
            columns: ["sistema_id", "lote_id"]
            isOneToOne: false
            referencedRelation: "ars_pagos_resumen"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      ars_pagos_lotes: {
        Row: {
          aseguradora_id: string
          creado_en: string
          creado_por: string | null
          fecha: string
          id: string
          referencia: string
          sistema_id: string
        }
        Insert: {
          aseguradora_id: string
          creado_en?: string
          creado_por?: string | null
          fecha: string
          id?: string
          referencia: string
          sistema_id: string
        }
        Update: {
          aseguradora_id?: string
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          id?: string
          referencia?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ars_pagos_lotes_sistema_id_aseguradora_id_fkey"
            columns: ["sistema_id", "aseguradora_id"]
            isOneToOne: false
            referencedRelation: "aseguradoras"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "ars_pagos_lotes_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      aseguradoras: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          codigo: string | null
          creado_en: string
          creado_por: string | null
          email: string | null
          id: string
          nombre: string
          sistema_id: string
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          codigo?: string | null
          creado_en?: string
          creado_por?: string | null
          email?: string | null
          id?: string
          nombre: string
          sistema_id: string
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          codigo?: string | null
          creado_en?: string
          creado_por?: string | null
          email?: string | null
          id?: string
          nombre?: string
          sistema_id?: string
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aseguradoras_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      asiento_lineas: {
        Row: {
          asiento_id: string
          cuenta_codigo: string
          debe: number
          descripcion: string | null
          haber: number
          id: string
          sistema_id: string
        }
        Insert: {
          asiento_id: string
          cuenta_codigo: string
          debe?: number
          descripcion?: string | null
          haber?: number
          id?: string
          sistema_id: string
        }
        Update: {
          asiento_id?: string
          cuenta_codigo?: string
          debe?: number
          descripcion?: string | null
          haber?: number
          id?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asiento_lineas_sistema_id_asiento_id_fkey"
            columns: ["sistema_id", "asiento_id"]
            isOneToOne: false
            referencedRelation: "asientos"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "asiento_lineas_sistema_id_cuenta_codigo_fkey"
            columns: ["sistema_id", "cuenta_codigo"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["sistema_id", "codigo"]
          },
          {
            foreignKeyName: "asiento_lineas_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      asientos: {
        Row: {
          concepto: string
          creado_en: string
          creado_por: string | null
          fecha: string
          id: string
          numero: number
          origen: string
          origen_id: string | null
          sistema_id: string
        }
        Insert: {
          concepto: string
          creado_en?: string
          creado_por?: string | null
          fecha: string
          id?: string
          numero: number
          origen: string
          origen_id?: string | null
          sistema_id: string
        }
        Update: {
          concepto?: string
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          id?: string
          numero?: number
          origen?: string
          origen_id?: string | null
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asientos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asientos_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          accion: string
          cambios: Json | null
          creado_en: string
          id: number
          registro_id: string | null
          sistema_id: string | null
          tabla: string | null
          usuario_id: string | null
        }
        Insert: {
          accion: string
          cambios?: Json | null
          creado_en?: string
          id?: never
          registro_id?: string | null
          sistema_id?: string | null
          tabla?: string | null
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          cambios?: Json | null
          creado_en?: string
          id?: never
          registro_id?: string | null
          sistema_id?: string | null
          tabla?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      citas: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          atendida_en: string | null
          cedula_llegada: string | null
          creado_en: string
          creado_por: string | null
          especialidad: string | null
          estado: Database["public"]["Enums"]["estado_cita"]
          exonerado_por: string | null
          fin: string
          id: string
          inicio: string
          llamado_en: string | null
          llamado_veces: number
          llegada_en: string | null
          medico_id: string | null
          motivo: string | null
          motivo_cancelacion: string | null
          motivo_exoneracion: string | null
          motivo_prioridad: string | null
          notas: string | null
          paciente_id: string | null
          por_identificar: boolean
          prioridad: boolean
          sede_id: string | null
          servicio_id: string | null
          sistema_id: string
          turno: string | null
          turno_en: string | null
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          atendida_en?: string | null
          cedula_llegada?: string | null
          creado_en?: string
          creado_por?: string | null
          especialidad?: string | null
          estado?: Database["public"]["Enums"]["estado_cita"]
          exonerado_por?: string | null
          fin: string
          id?: string
          inicio: string
          llamado_en?: string | null
          llamado_veces?: number
          llegada_en?: string | null
          medico_id?: string | null
          motivo?: string | null
          motivo_cancelacion?: string | null
          motivo_exoneracion?: string | null
          motivo_prioridad?: string | null
          notas?: string | null
          paciente_id?: string | null
          por_identificar?: boolean
          prioridad?: boolean
          sede_id?: string | null
          servicio_id?: string | null
          sistema_id: string
          turno?: string | null
          turno_en?: string | null
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          atendida_en?: string | null
          cedula_llegada?: string | null
          creado_en?: string
          creado_por?: string | null
          especialidad?: string | null
          estado?: Database["public"]["Enums"]["estado_cita"]
          exonerado_por?: string | null
          fin?: string
          id?: string
          inicio?: string
          llamado_en?: string | null
          llamado_veces?: number
          llegada_en?: string | null
          medico_id?: string | null
          motivo?: string | null
          motivo_cancelacion?: string | null
          motivo_exoneracion?: string | null
          motivo_prioridad?: string | null
          notas?: string | null
          paciente_id?: string | null
          por_identificar?: boolean
          prioridad?: boolean
          sede_id?: string | null
          servicio_id?: string | null
          sistema_id?: string
          turno?: string | null
          turno_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "citas_exonerado_por_fkey"
            columns: ["exonerado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_medico_perfil_fk"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_sistema_id_medico_id_fkey"
            columns: ["sistema_id", "medico_id"]
            isOneToOne: false
            referencedRelation: "membresias"
            referencedColumns: ["sistema_id", "usuario_id"]
          },
          {
            foreignKeyName: "citas_sistema_id_paciente_id_fkey"
            columns: ["sistema_id", "paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "citas_sistema_id_sede_id_fkey"
            columns: ["sistema_id", "sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "citas_sistema_id_servicio_id_fkey"
            columns: ["sistema_id", "servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      coberturas: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          aseguradora_id: string
          creado_en: string
          creado_por: string | null
          especialidad: string | null
          id: string
          monto_cubierto: number
          monto_fondo: number | null
          precio: number | null
          servicio_id: string
          sistema_id: string
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          aseguradora_id: string
          creado_en?: string
          creado_por?: string | null
          especialidad?: string | null
          id?: string
          monto_cubierto: number
          monto_fondo?: number | null
          precio?: number | null
          servicio_id: string
          sistema_id: string
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          aseguradora_id?: string
          creado_en?: string
          creado_por?: string | null
          especialidad?: string | null
          id?: string
          monto_cubierto?: number
          monto_fondo?: number | null
          precio?: number | null
          servicio_id?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coberturas_sistema_id_aseguradora_id_fkey"
            columns: ["sistema_id", "aseguradora_id"]
            isOneToOne: false
            referencedRelation: "aseguradoras"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "coberturas_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coberturas_sistema_id_servicio_id_fkey"
            columns: ["sistema_id", "servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      cobro_detalles: {
        Row: {
          cantidad: number
          categoria: string
          cobertura: number
          cobro_id: string
          descripcion: string
          id: string
          precio_unitario: number
          servicio_id: string | null
          sistema_id: string
          total: number
        }
        Insert: {
          cantidad: number
          categoria?: string
          cobertura?: number
          cobro_id: string
          descripcion: string
          id?: string
          precio_unitario: number
          servicio_id?: string | null
          sistema_id: string
          total: number
        }
        Update: {
          cantidad?: number
          categoria?: string
          cobertura?: number
          cobro_id?: string
          descripcion?: string
          id?: string
          precio_unitario?: number
          servicio_id?: string | null
          sistema_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobro_detalles_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "cobro_detalles_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["sistema_id", "cobro_id"]
          },
          {
            foreignKeyName: "cobro_detalles_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobro_detalles_sistema_id_servicio_id_fkey"
            columns: ["sistema_id", "servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      cobro_pagos: {
        Row: {
          cobro_id: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          recibido: number | null
          referencia: string | null
          sistema_id: string
        }
        Insert: {
          cobro_id: string
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          recibido?: number | null
          referencia?: string | null
          sistema_id: string
        }
        Update: {
          cobro_id?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          recibido?: number | null
          referencia?: string | null
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobro_pagos_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "cobro_pagos_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["sistema_id", "cobro_id"]
          },
          {
            foreignKeyName: "cobro_pagos_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobros: {
        Row: {
          aseguradora_id: string | null
          cajero_id: string
          cita_id: string | null
          clave_idempotencia: string | null
          cliente_nombre: string | null
          cliente_rnc: string | null
          cobertura_seguro: number
          creado_en: string
          descuento: number
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto_credito: number
          monto_fondo: number
          ncf: string | null
          notas: string | null
          numero: string
          numero_autorizacion: string | null
          paciente_id: string
          profesional_id: string | null
          referencia: string | null
          sede_id: string | null
          sistema_id: string
          subtotal: number
          tipo_ncf: string | null
          total: number
          turno_id: string
          vendedor_id: string | null
        }
        Insert: {
          aseguradora_id?: string | null
          cajero_id?: string
          cita_id?: string | null
          clave_idempotencia?: string | null
          cliente_nombre?: string | null
          cliente_rnc?: string | null
          cobertura_seguro?: number
          creado_en?: string
          descuento?: number
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto_credito?: number
          monto_fondo?: number
          ncf?: string | null
          notas?: string | null
          numero: string
          numero_autorizacion?: string | null
          paciente_id: string
          profesional_id?: string | null
          referencia?: string | null
          sede_id?: string | null
          sistema_id: string
          subtotal: number
          tipo_ncf?: string | null
          total: number
          turno_id: string
          vendedor_id?: string | null
        }
        Update: {
          aseguradora_id?: string | null
          cajero_id?: string
          cita_id?: string | null
          clave_idempotencia?: string | null
          cliente_nombre?: string | null
          cliente_rnc?: string | null
          cobertura_seguro?: number
          creado_en?: string
          descuento?: number
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto_credito?: number
          monto_fondo?: number
          ncf?: string | null
          notas?: string | null
          numero?: string
          numero_autorizacion?: string | null
          paciente_id?: string
          profesional_id?: string | null
          referencia?: string | null
          sede_id?: string | null
          sistema_id?: string
          subtotal?: number
          tipo_ncf?: string | null
          total?: number
          turno_id?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobros_cajero_perfil_fk"
            columns: ["cajero_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_profesional_fk"
            columns: ["sistema_id", "profesional_id"]
            isOneToOne: false
            referencedRelation: "membresias"
            referencedColumns: ["sistema_id", "usuario_id"]
          },
          {
            foreignKeyName: "cobros_profesional_perfil_fk"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_sistema_id_aseguradora_id_fkey"
            columns: ["sistema_id", "aseguradora_id"]
            isOneToOne: false
            referencedRelation: "aseguradoras"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "cobros_sistema_id_cita_id_fkey"
            columns: ["sistema_id", "cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "cobros_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_sistema_id_paciente_id_fkey"
            columns: ["sistema_id", "paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "cobros_sistema_id_sede_id_fkey"
            columns: ["sistema_id", "sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "cobros_sistema_id_turno_id_fkey"
            columns: ["sistema_id", "turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_caja"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "cobros_vendedor_fk"
            columns: ["sistema_id", "vendedor_id"]
            isOneToOne: false
            referencedRelation: "membresias"
            referencedColumns: ["sistema_id", "usuario_id"]
          },
          {
            foreignKeyName: "cobros_vendedor_perfil_fk"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      codigos_invitacion: {
        Row: {
          codigo_hash: string
          creado_en: string
          creado_por: string | null
          descripcion: string | null
          expira_en: string
          id: string
          otorga_superadmin: boolean
          pista: string
          revocado_en: string | null
          roles: Database["public"]["Enums"]["rol_sistema"][]
          sistema_id: string | null
          usos: number
          usos_maximos: number
        }
        Insert: {
          codigo_hash: string
          creado_en?: string
          creado_por?: string | null
          descripcion?: string | null
          expira_en: string
          id?: string
          otorga_superadmin?: boolean
          pista: string
          revocado_en?: string | null
          roles?: Database["public"]["Enums"]["rol_sistema"][]
          sistema_id?: string | null
          usos?: number
          usos_maximos?: number
        }
        Update: {
          codigo_hash?: string
          creado_en?: string
          creado_por?: string | null
          descripcion?: string | null
          expira_en?: string
          id?: string
          otorga_superadmin?: boolean
          pista?: string
          revocado_en?: string | null
          roles?: Database["public"]["Enums"]["rol_sistema"][]
          sistema_id?: string | null
          usos?: number
          usos_maximos?: number
        }
        Relationships: [
          {
            foreignKeyName: "codigos_invitacion_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codigos_invitacion_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      comisiones: {
        Row: {
          base_monto: number
          beneficiario_id: string
          cobro_id: string
          concepto: string
          creado_en: string
          detalle_id: string | null
          id: string
          monto: number
          regla_id: string | null
          retencion: number
          sistema_id: string
        }
        Insert: {
          base_monto: number
          beneficiario_id: string
          cobro_id: string
          concepto: string
          creado_en?: string
          detalle_id?: string | null
          id?: string
          monto: number
          regla_id?: string | null
          retencion?: number
          sistema_id: string
        }
        Update: {
          base_monto?: number
          beneficiario_id?: string
          cobro_id?: string
          concepto?: string
          creado_en?: string
          detalle_id?: string | null
          id?: string
          monto?: number
          regla_id?: string | null
          retencion?: number
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comisiones_beneficiario_id_fkey"
            columns: ["beneficiario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comisiones_regla_id_fkey"
            columns: ["regla_id"]
            isOneToOne: false
            referencedRelation: "reglas_comision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comisiones_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "comisiones_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["sistema_id", "cobro_id"]
          },
          {
            foreignKeyName: "comisiones_sistema_id_detalle_id_fkey"
            columns: ["sistema_id", "detalle_id"]
            isOneToOne: false
            referencedRelation: "cobro_detalles"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "comisiones_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_items: {
        Row: {
          cantidad: number
          compra_id: string
          costo_unitario: number
          cuenta_codigo: string | null
          descripcion: string
          id: string
          itbis: number
          item_id: string | null
          sistema_id: string
          total: number
        }
        Insert: {
          cantidad: number
          compra_id: string
          costo_unitario: number
          cuenta_codigo?: string | null
          descripcion: string
          id?: string
          itbis?: number
          item_id?: string | null
          sistema_id: string
          total: number
        }
        Update: {
          cantidad?: number
          compra_id?: string
          costo_unitario?: number
          cuenta_codigo?: string | null
          descripcion?: string
          id?: string
          itbis?: number
          item_id?: string | null
          sistema_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "compra_items_sistema_id_compra_id_fkey"
            columns: ["sistema_id", "compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "compra_items_sistema_id_cuenta_codigo_fkey"
            columns: ["sistema_id", "cuenta_codigo"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["sistema_id", "codigo"]
          },
          {
            foreignKeyName: "compra_items_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_sistema_id_item_id_fkey"
            columns: ["sistema_id", "item_id"]
            isOneToOne: false
            referencedRelation: "inventario_items"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      compras: {
        Row: {
          creado_en: string
          creado_por: string
          fecha: string
          forma_pago: string
          id: string
          itbis: number
          ncf_proveedor: string | null
          notas: string | null
          numero: string
          proveedor_id: string | null
          sistema_id: string
          subtotal: number
          total: number
          turno_id: string | null
        }
        Insert: {
          creado_en?: string
          creado_por?: string
          fecha?: string
          forma_pago: string
          id?: string
          itbis?: number
          ncf_proveedor?: string | null
          notas?: string | null
          numero: string
          proveedor_id?: string | null
          sistema_id: string
          subtotal: number
          total: number
          turno_id?: string | null
        }
        Update: {
          creado_en?: string
          creado_por?: string
          fecha?: string
          forma_pago?: string
          id?: string
          itbis?: number
          ncf_proveedor?: string | null
          notas?: string | null
          numero?: string
          proveedor_id?: string | null
          sistema_id?: string
          subtotal?: number
          total?: number
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_sistema_id_proveedor_id_fkey"
            columns: ["sistema_id", "proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "compras_sistema_id_turno_id_fkey"
            columns: ["sistema_id", "turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_caja"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      conciliaciones_bancarias: {
        Row: {
          automatica: boolean
          creado_en: string
          creado_por: string | null
          id: string
          monto: number
          movimiento_id: string
          nota: string | null
          origen_id: string | null
          sistema_id: string
          tipo: string
        }
        Insert: {
          automatica?: boolean
          creado_en?: string
          creado_por?: string | null
          id?: string
          monto: number
          movimiento_id: string
          nota?: string | null
          origen_id?: string | null
          sistema_id: string
          tipo: string
        }
        Update: {
          automatica?: boolean
          creado_en?: string
          creado_por?: string | null
          id?: string
          monto?: number
          movimiento_id?: string
          nota?: string | null
          origen_id?: string | null
          sistema_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliaciones_bancarias_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliaciones_bancarias_sistema_id_movimiento_id_fkey"
            columns: ["sistema_id", "movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos_bancarios"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "conciliaciones_bancarias_sistema_id_movimiento_id_fkey"
            columns: ["sistema_id", "movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos_bancarios_estado"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      contadores: {
        Row: {
          clave: string
          sistema_id: string
          valor: number
        }
        Insert: {
          clave: string
          sistema_id: string
          valor?: number
        }
        Update: {
          clave?: string
          sistema_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contadores_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_bancarias: {
        Row: {
          activo: boolean
          banco: string
          creado_en: string
          creado_por: string | null
          id: string
          nombre: string
          numero: string | null
          sistema_id: string
        }
        Insert: {
          activo?: boolean
          banco: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre: string
          numero?: string | null
          sistema_id: string
        }
        Update: {
          activo?: boolean
          banco?: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre?: string
          numero?: string | null
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_bancarias_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_contables: {
        Row: {
          acepta_movimiento: boolean
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          busqueda: string | null
          codigo: string
          creado_en: string
          creado_por: string | null
          id: string
          nombre: string
          padre_codigo: string | null
          sistema_id: string
          tipo: string
        }
        Insert: {
          acepta_movimiento?: boolean
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          busqueda?: string | null
          codigo: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre: string
          padre_codigo?: string | null
          sistema_id: string
          tipo: string
        }
        Update: {
          acepta_movimiento?: boolean
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          busqueda?: string | null
          codigo?: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre?: string
          padre_codigo?: string | null
          sistema_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_contables_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_contables_sistema_id_padre_codigo_fkey"
            columns: ["sistema_id", "padre_codigo"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["sistema_id", "codigo"]
          },
        ]
      }
      cuentas_predeterminadas: {
        Row: {
          clave: string
          cuenta_codigo: string
          sistema_id: string
        }
        Insert: {
          clave: string
          cuenta_codigo: string
          sistema_id: string
        }
        Update: {
          clave?: string
          cuenta_codigo?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_predeterminadas_sistema_id_cuenta_codigo_fkey"
            columns: ["sistema_id", "cuenta_codigo"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["sistema_id", "codigo"]
          },
          {
            foreignKeyName: "cuentas_predeterminadas_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      donaciones: {
        Row: {
          anonima: boolean
          creado_en: string
          creado_por: string
          destino: string | null
          donante_contacto: string | null
          donante_documento: string | null
          donante_nombre: string
          fecha: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas: string | null
          numero: string
          referencia: string | null
          sistema_id: string
          turno_id: string | null
        }
        Insert: {
          anonima?: boolean
          creado_en?: string
          creado_por?: string
          destino?: string | null
          donante_contacto?: string | null
          donante_documento?: string | null
          donante_nombre: string
          fecha?: string
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas?: string | null
          numero: string
          referencia?: string | null
          sistema_id: string
          turno_id?: string | null
        }
        Update: {
          anonima?: boolean
          creado_en?: string
          creado_por?: string
          destino?: string | null
          donante_contacto?: string | null
          donante_documento?: string | null
          donante_nombre?: string
          fecha?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          notas?: string | null
          numero?: string
          referencia?: string | null
          sistema_id?: string
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donaciones_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donaciones_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donaciones_sistema_id_turno_id_fkey"
            columns: ["sistema_id", "turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_caja"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      ecf_documentos: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          cobro_id: string
          codigo_seguridad: string | null
          creado_en: string
          encf: string
          estado: string
          fecha_firma: string | null
          id: string
          intentos: number
          mensajes: Json | null
          monto_total: number
          qr_url: string | null
          resumen: boolean
          sistema_id: string
          tipo: string
          track_id: string | null
          ultimo_intento: string | null
          xml: string | null
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          cobro_id: string
          codigo_seguridad?: string | null
          creado_en?: string
          encf: string
          estado?: string
          fecha_firma?: string | null
          id?: string
          intentos?: number
          mensajes?: Json | null
          monto_total: number
          qr_url?: string | null
          resumen?: boolean
          sistema_id: string
          tipo: string
          track_id?: string | null
          ultimo_intento?: string | null
          xml?: string | null
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          cobro_id?: string
          codigo_seguridad?: string | null
          creado_en?: string
          encf?: string
          estado?: string
          fecha_firma?: string | null
          id?: string
          intentos?: number
          mensajes?: Json | null
          monto_total?: number
          qr_url?: string | null
          resumen?: boolean
          sistema_id?: string
          tipo?: string
          track_id?: string | null
          ultimo_intento?: string | null
          xml?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecf_documentos_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "ecf_documentos_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["sistema_id", "cobro_id"]
          },
          {
            foreignKeyName: "ecf_documentos_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      empleados: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          apellidos: string
          banco: string | null
          cargo: string | null
          cedula: string | null
          creado_en: string
          creado_por: string | null
          cuenta_bancaria: string | null
          departamento: string | null
          fecha_ingreso: string | null
          frecuencia: string
          id: string
          nombres: string
          salario_mensual: number
          sistema_id: string
          usuario_id: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          apellidos: string
          banco?: string | null
          cargo?: string | null
          cedula?: string | null
          creado_en?: string
          creado_por?: string | null
          cuenta_bancaria?: string | null
          departamento?: string | null
          fecha_ingreso?: string | null
          frecuencia?: string
          id?: string
          nombres: string
          salario_mensual?: number
          sistema_id: string
          usuario_id?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          apellidos?: string
          banco?: string | null
          cargo?: string | null
          cedula?: string | null
          creado_en?: string
          creado_por?: string | null
          cuenta_bancaria?: string | null
          departamento?: string | null
          fecha_ingreso?: string | null
          frecuencia?: string
          id?: string
          nombres?: string
          salario_mensual?: number
          sistema_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empleados_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      errores_cliente: {
        Row: {
          creado_en: string
          entorno: string | null
          id: string
          mensaje: string
          pantalla: string | null
          resuelto: boolean
          rol: string | null
          sistema_id: string | null
          stack: string | null
          tipo: string | null
          user_agent: string | null
          usuario_id: string | null
          version: string | null
        }
        Insert: {
          creado_en?: string
          entorno?: string | null
          id?: string
          mensaje: string
          pantalla?: string | null
          resuelto?: boolean
          rol?: string | null
          sistema_id?: string | null
          stack?: string | null
          tipo?: string | null
          user_agent?: string | null
          usuario_id?: string | null
          version?: string | null
        }
        Update: {
          creado_en?: string
          entorno?: string | null
          id?: string
          mensaje?: string
          pantalla?: string | null
          resuelto?: boolean
          rol?: string | null
          sistema_id?: string | null
          stack?: string | null
          tipo?: string | null
          user_agent?: string | null
          usuario_id?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "errores_cliente_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_clinico: {
        Row: {
          autor_id: string
          cita_id: string | null
          contenido: string
          corrige_a: string | null
          creado_en: string
          datos: Json
          id: string
          paciente_id: string
          sistema_id: string
          tipo: Database["public"]["Enums"]["tipo_entrada_clinica"]
          titulo: string | null
        }
        Insert: {
          autor_id?: string
          cita_id?: string | null
          contenido: string
          corrige_a?: string | null
          creado_en?: string
          datos?: Json
          id?: string
          paciente_id: string
          sistema_id: string
          tipo: Database["public"]["Enums"]["tipo_entrada_clinica"]
          titulo?: string | null
        }
        Update: {
          autor_id?: string
          cita_id?: string | null
          contenido?: string
          corrige_a?: string | null
          creado_en?: string
          datos?: Json
          id?: string
          paciente_id?: string
          sistema_id?: string
          tipo?: Database["public"]["Enums"]["tipo_entrada_clinica"]
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historial_autor_perfil_fk"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_clinico_corrige_a_fkey"
            columns: ["corrige_a"]
            isOneToOne: false
            referencedRelation: "historial_clinico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_clinico_sistema_id_cita_id_fkey"
            columns: ["sistema_id", "cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "historial_clinico_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_clinico_sistema_id_paciente_id_fkey"
            columns: ["sistema_id", "paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      ia_eventos: {
        Row: {
          costo_usd: number
          creado_en: string
          error: string | null
          funcion: string
          id: string
          modelo: string
          ok: boolean
          sistema_id: string
          tokens_entrada: number
          tokens_salida: number
          usuario_id: string | null
        }
        Insert: {
          costo_usd?: number
          creado_en?: string
          error?: string | null
          funcion: string
          id?: string
          modelo: string
          ok: boolean
          sistema_id: string
          tokens_entrada?: number
          tokens_salida?: number
          usuario_id?: string | null
        }
        Update: {
          costo_usd?: number
          creado_en?: string
          error?: string | null
          funcion?: string
          id?: string
          modelo?: string
          ok?: boolean
          sistema_id?: string
          tokens_entrada?: number
          tokens_salida?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_eventos_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      integracion_eventos: {
        Row: {
          creado_en: string
          creado_por: string | null
          detalle: Json
          id: string
          proveedor: string
          resultado: string
          sistema_id: string
          tipo: string
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          detalle?: Json
          id?: string
          proveedor: string
          resultado?: string
          sistema_id: string
          tipo: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          detalle?: Json
          id?: string
          proveedor?: string
          resultado?: string
          sistema_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracion_eventos_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      integraciones: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          config: Json
          creado_en: string
          detalle_conexion: Json | null
          estado: string
          id: string
          proveedor: string
          secretos: Json
          sistema_id: string
          ultimo_error: string | null
          verificado_en: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          config?: Json
          creado_en?: string
          detalle_conexion?: Json | null
          estado?: string
          id?: string
          proveedor: string
          secretos?: Json
          sistema_id: string
          ultimo_error?: string | null
          verificado_en?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          config?: Json
          creado_en?: string
          detalle_conexion?: Json | null
          estado?: string
          id?: string
          proveedor?: string
          secretos?: Json
          sistema_id?: string
          ultimo_error?: string | null
          verificado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integraciones_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_items: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          categoria: string
          codigo: string | null
          costo_unitario: number | null
          creado_en: string
          creado_por: string | null
          descripcion: string | null
          id: string
          nombre: string
          precio_venta: number | null
          requiere_receta: boolean
          sede_id: string | null
          sistema_id: string
          stock_actual: number
          stock_minimo: number
          unidad: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          categoria?: string
          codigo?: string | null
          costo_unitario?: number | null
          creado_en?: string
          creado_por?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          precio_venta?: number | null
          requiere_receta?: boolean
          sede_id?: string | null
          sistema_id: string
          stock_actual?: number
          stock_minimo?: number
          unidad?: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          categoria?: string
          codigo?: string | null
          costo_unitario?: number | null
          creado_en?: string
          creado_por?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          precio_venta?: number | null
          requiere_receta?: boolean
          sede_id?: string | null
          sistema_id?: string
          stock_actual?: number
          stock_minimo?: number
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_items_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_items_sistema_id_sede_id_fkey"
            columns: ["sistema_id", "sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      liquidacion_items: {
        Row: {
          comision_id: string
          liquidacion_id: string
          sistema_id: string
        }
        Insert: {
          comision_id: string
          liquidacion_id: string
          sistema_id: string
        }
        Update: {
          comision_id?: string
          liquidacion_id?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidacion_items_sistema_id_comision_id_fkey"
            columns: ["sistema_id", "comision_id"]
            isOneToOne: false
            referencedRelation: "comisiones"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "liquidacion_items_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_items_sistema_id_liquidacion_id_fkey"
            columns: ["sistema_id", "liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones_comision"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      liquidaciones_comision: {
        Row: {
          beneficiario_id: string
          creado_en: string
          creado_por: string
          hasta: string
          id: string
          neto: number | null
          numero: string
          retencion: number
          sistema_id: string
          total: number
        }
        Insert: {
          beneficiario_id: string
          creado_en?: string
          creado_por?: string
          hasta: string
          id?: string
          neto?: number | null
          numero: string
          retencion?: number
          sistema_id: string
          total: number
        }
        Update: {
          beneficiario_id?: string
          creado_en?: string
          creado_por?: string
          hasta?: string
          id?: string
          neto?: number | null
          numero?: string
          retencion?: number
          sistema_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_comision_beneficiario_id_fkey"
            columns: ["beneficiario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_comision_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_comision_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      membresias: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          atiende_agenda: boolean
          consultorio: string | null
          creado_en: string
          creado_por: string | null
          eliminado_en: string | null
          especialidad: string | null
          exequatur: string | null
          id: string
          permisos: Json
          roles: Database["public"]["Enums"]["rol_sistema"][]
          sede_id: string | null
          sistema_id: string
          usuario_id: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          atiende_agenda?: boolean
          consultorio?: string | null
          creado_en?: string
          creado_por?: string | null
          eliminado_en?: string | null
          especialidad?: string | null
          exequatur?: string | null
          id?: string
          permisos?: Json
          roles: Database["public"]["Enums"]["rol_sistema"][]
          sede_id?: string | null
          sistema_id: string
          usuario_id: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          atiende_agenda?: boolean
          consultorio?: string | null
          creado_en?: string
          creado_por?: string | null
          eliminado_en?: string | null
          especialidad?: string | null
          exequatur?: string | null
          id?: string
          permisos?: Json
          roles?: Database["public"]["Enums"]["rol_sistema"][]
          sede_id?: string | null
          sistema_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membresias_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membresias_sistema_id_sede_id_fkey"
            columns: ["sistema_id", "sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "membresias_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_bancarios: {
        Row: {
          creado_en: string
          creado_por: string | null
          cuenta_id: string
          descripcion: string
          fecha: string
          huella: string
          id: string
          monto: number
          referencia: string | null
          sistema_id: string
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          cuenta_id: string
          descripcion?: string
          fecha: string
          huella: string
          id?: string
          monto: number
          referencia?: string | null
          sistema_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          cuenta_id?: string
          descripcion?: string
          fecha?: string
          huella?: string
          id?: string
          monto?: number
          referencia?: string | null
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_bancarios_sistema_id_cuenta_id_fkey"
            columns: ["sistema_id", "cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "movimientos_bancarios_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_financieros: {
        Row: {
          categoria: string
          cobro_id: string | null
          concepto: string
          creado_en: string
          creado_por: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          sede_id: string | null
          sistema_id: string
          tipo: string
          turno_id: string | null
        }
        Insert: {
          categoria?: string
          cobro_id?: string | null
          concepto: string
          creado_en?: string
          creado_por?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          sede_id?: string | null
          sistema_id: string
          tipo: string
          turno_id?: string | null
        }
        Update: {
          categoria?: string
          cobro_id?: string | null
          concepto?: string
          creado_en?: string
          creado_por?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          sede_id?: string | null
          sistema_id?: string
          tipo?: string
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_autor_perfil_fk"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_financieros_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "movimientos_financieros_sistema_id_cobro_id_fkey"
            columns: ["sistema_id", "cobro_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["sistema_id", "cobro_id"]
          },
          {
            foreignKeyName: "movimientos_financieros_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_financieros_sistema_id_sede_id_fkey"
            columns: ["sistema_id", "sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "movimientos_financieros_sistema_id_turno_id_fkey"
            columns: ["sistema_id", "turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_caja"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          cantidad: number
          creado_en: string
          creado_por: string
          id: string
          item_id: string
          lote: string | null
          motivo: string | null
          paciente_id: string | null
          sistema_id: string
          tipo: string
          vence_en: string | null
        }
        Insert: {
          cantidad: number
          creado_en?: string
          creado_por?: string
          id?: string
          item_id: string
          lote?: string | null
          motivo?: string | null
          paciente_id?: string | null
          sistema_id: string
          tipo: string
          vence_en?: string | null
        }
        Update: {
          cantidad?: number
          creado_en?: string
          creado_por?: string
          id?: string
          item_id?: string
          lote?: string | null
          motivo?: string | null
          paciente_id?: string | null
          sistema_id?: string
          tipo?: string
          vence_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mov_inventario_autor_perfil_fk"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_sistema_id_item_id_fkey"
            columns: ["sistema_id", "item_id"]
            isOneToOne: false
            referencedRelation: "inventario_items"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "movimientos_inventario_sistema_id_paciente_id_fkey"
            columns: ["sistema_id", "paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      nomina_lineas: {
        Row: {
          afp: number
          afp_patronal: number
          bonos: number
          bruto: number
          empleado_id: string
          horas_extra: number
          id: string
          infotep: number
          isr: number
          neto: number
          nomina_id: string
          otras_deducciones: number
          otros_ingresos: number
          salario: number
          sfs: number
          sfs_patronal: number
          sistema_id: string
          srl_patronal: number
        }
        Insert: {
          afp?: number
          afp_patronal?: number
          bonos?: number
          bruto?: number
          empleado_id: string
          horas_extra?: number
          id?: string
          infotep?: number
          isr?: number
          neto?: number
          nomina_id: string
          otras_deducciones?: number
          otros_ingresos?: number
          salario?: number
          sfs?: number
          sfs_patronal?: number
          sistema_id: string
          srl_patronal?: number
        }
        Update: {
          afp?: number
          afp_patronal?: number
          bonos?: number
          bruto?: number
          empleado_id?: string
          horas_extra?: number
          id?: string
          infotep?: number
          isr?: number
          neto?: number
          nomina_id?: string
          otras_deducciones?: number
          otros_ingresos?: number
          salario?: number
          sfs?: number
          sfs_patronal?: number
          sistema_id?: string
          srl_patronal?: number
        }
        Relationships: [
          {
            foreignKeyName: "nomina_lineas_sistema_id_empleado_id_fkey"
            columns: ["sistema_id", "empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "nomina_lineas_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomina_lineas_sistema_id_nomina_id_fkey"
            columns: ["sistema_id", "nomina_id"]
            isOneToOne: false
            referencedRelation: "nominas"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      nominas: {
        Row: {
          aprobada_en: string | null
          aprobada_por: string | null
          creado_en: string
          creado_por: string | null
          descripcion: string
          desde: string
          estado: string
          frecuencia: string
          hasta: string
          id: string
          numero: string
          sistema_id: string
        }
        Insert: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          creado_en?: string
          creado_por?: string | null
          descripcion: string
          desde: string
          estado?: string
          frecuencia: string
          hasta: string
          id?: string
          numero: string
          sistema_id: string
        }
        Update: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          creado_en?: string
          creado_por?: string | null
          descripcion?: string
          desde?: string
          estado?: string
          frecuencia?: string
          hasta?: string
          id?: string
          numero?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nominas_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nominas_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nominas_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          alergias: string | null
          apellidos: string
          aseguradora_id: string | null
          busqueda: string | null
          condiciones_cronicas: string | null
          contacto_emergencia_nombre: string | null
          contacto_emergencia_telefono: string | null
          creado_en: string
          creado_por: string | null
          direccion: string | null
          documento: string | null
          documento_tipo: string
          eliminado_en: string | null
          email: string | null
          expediente: string
          fecha_nacimiento: string | null
          foto_documento: string | null
          id: string
          nombres: string
          notas: string | null
          numero_afiliado: string | null
          sexo: string | null
          sistema_id: string
          telefono: string | null
          tipo_sangre: string | null
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          alergias?: string | null
          apellidos: string
          aseguradora_id?: string | null
          busqueda?: string | null
          condiciones_cronicas?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_telefono?: string | null
          creado_en?: string
          creado_por?: string | null
          direccion?: string | null
          documento?: string | null
          documento_tipo?: string
          eliminado_en?: string | null
          email?: string | null
          expediente: string
          fecha_nacimiento?: string | null
          foto_documento?: string | null
          id?: string
          nombres: string
          notas?: string | null
          numero_afiliado?: string | null
          sexo?: string | null
          sistema_id: string
          telefono?: string | null
          tipo_sangre?: string | null
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          alergias?: string | null
          apellidos?: string
          aseguradora_id?: string | null
          busqueda?: string | null
          condiciones_cronicas?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_telefono?: string | null
          creado_en?: string
          creado_por?: string | null
          direccion?: string | null
          documento?: string | null
          documento_tipo?: string
          eliminado_en?: string | null
          email?: string | null
          expediente?: string
          fecha_nacimiento?: string | null
          foto_documento?: string | null
          id?: string
          nombres?: string
          notas?: string | null
          numero_afiliado?: string | null
          sexo?: string | null
          sistema_id?: string
          telefono?: string | null
          tipo_sangre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_sistema_id_aseguradora_id_fkey"
            columns: ["sistema_id", "aseguradora_id"]
            isOneToOne: false
            referencedRelation: "aseguradoras"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "pacientes_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros_nomina: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          afp_empleado: number
          afp_empleador: number
          escala_isr: Json
          infotep: number
          sfs_empleado: number
          sfs_empleador: number
          sistema_id: string
          srl_empleador: number
          tope_afp_mensual: number | null
          tope_sfs_mensual: number | null
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          afp_empleado?: number
          afp_empleador?: number
          escala_isr?: Json
          infotep?: number
          sfs_empleado?: number
          sfs_empleador?: number
          sistema_id: string
          srl_empleador?: number
          tope_afp_mensual?: number | null
          tope_sfs_mensual?: number | null
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          afp_empleado?: number
          afp_empleador?: number
          escala_isr?: Json
          infotep?: number
          sfs_empleado?: number
          sfs_empleador?: number
          sistema_id?: string
          srl_empleador?: number
          tope_afp_mensual?: number | null
          tope_sfs_mensual?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parametros_nomina_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: true
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          avatar_url: string | null
          correo_contacto: string | null
          creado_en: string
          debe_cambiar_password: boolean
          email: string
          es_superadmin: boolean
          foto: string | null
          id: string
          nombre_completo: string
          nombre_usuario: string | null
          preferencias: Json
          recibir_whatsapp: boolean
          telefono: string | null
          ultimo_sistema_id: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          avatar_url?: string | null
          correo_contacto?: string | null
          creado_en?: string
          debe_cambiar_password?: boolean
          email: string
          es_superadmin?: boolean
          foto?: string | null
          id: string
          nombre_completo?: string
          nombre_usuario?: string | null
          preferencias?: Json
          recibir_whatsapp?: boolean
          telefono?: string | null
          ultimo_sistema_id?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          avatar_url?: string | null
          correo_contacto?: string | null
          creado_en?: string
          debe_cambiar_password?: boolean
          email?: string
          es_superadmin?: boolean
          foto?: string | null
          id?: string
          nombre_completo?: string
          nombre_usuario?: string | null
          preferencias?: Json
          recibir_whatsapp?: boolean
          telefono?: string | null
          ultimo_sistema_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_ultimo_sistema_id_fkey"
            columns: ["ultimo_sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      plataforma: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          id: boolean
          mantenimiento: boolean
          mantenimiento_desde: string | null
          mantenimiento_mensaje: string | null
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          id?: boolean
          mantenimiento?: boolean
          mantenimiento_desde?: string | null
          mantenimiento_mensaje?: string | null
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          id?: boolean
          mantenimiento?: boolean
          mantenimiento_desde?: string | null
          mantenimiento_mensaje?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plataforma_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          contacto: string | null
          creado_en: string
          creado_por: string | null
          direccion: string | null
          email: string | null
          id: string
          nombre: string
          rnc: string | null
          sistema_id: string
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          contacto?: string | null
          creado_en?: string
          creado_por?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          nombre: string
          rnc?: string | null
          sistema_id: string
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          contacto?: string | null
          creado_en?: string
          creado_por?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          nombre?: string
          rnc?: string | null
          sistema_id?: string
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      reglas_comision: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          aplica_a: string
          base: string
          beneficiario_id: string | null
          categoria: string | null
          creado_en: string
          creado_por: string | null
          especialidad: string | null
          id: string
          nombre: string
          retencion: number
          rol: Database["public"]["Enums"]["rol_sistema"] | null
          servicio_id: string | null
          sistema_id: string
          tipo: string
          valor: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          aplica_a?: string
          base?: string
          beneficiario_id?: string | null
          categoria?: string | null
          creado_en?: string
          creado_por?: string | null
          especialidad?: string | null
          id?: string
          nombre: string
          retencion?: number
          rol?: Database["public"]["Enums"]["rol_sistema"] | null
          servicio_id?: string | null
          sistema_id: string
          tipo: string
          valor: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          aplica_a?: string
          base?: string
          beneficiario_id?: string | null
          categoria?: string | null
          creado_en?: string
          creado_por?: string | null
          especialidad?: string | null
          id?: string
          nombre?: string
          retencion?: number
          rol?: Database["public"]["Enums"]["rol_sistema"] | null
          servicio_id?: string | null
          sistema_id?: string
          tipo?: string
          valor?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reglas_comision_sistema_id_beneficiario_id_fkey"
            columns: ["sistema_id", "beneficiario_id"]
            isOneToOne: false
            referencedRelation: "membresias"
            referencedColumns: ["sistema_id", "usuario_id"]
          },
          {
            foreignKeyName: "reglas_comision_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reglas_comision_sistema_id_servicio_id_fkey"
            columns: ["sistema_id", "servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      respaldos: {
        Row: {
          bytes: number | null
          creado_en: string
          duracion_ms: number | null
          error: string | null
          estado: string
          filas: number | null
          id: string
          origen: string
          ruta: string | null
          solicitado_por: string | null
          tablas: number | null
        }
        Insert: {
          bytes?: number | null
          creado_en?: string
          duracion_ms?: number | null
          error?: string | null
          estado: string
          filas?: number | null
          id?: string
          origen: string
          ruta?: string | null
          solicitado_por?: string | null
          tablas?: number | null
        }
        Update: {
          bytes?: number | null
          creado_en?: string
          duracion_ms?: number | null
          error?: string | null
          estado?: string
          filas?: number | null
          id?: string
          origen?: string
          ruta?: string | null
          solicitado_por?: string | null
          tablas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "respaldos_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resultados_laboratorio: {
        Row: {
          asignado_en: string | null
          asignado_por: string | null
          estado: string
          fecha_resultado: string | null
          id: string
          identificacion: string | null
          laboratorio: string
          nombre_paciente: string | null
          observaciones: string | null
          orden: string | null
          paciente_id: string | null
          pdf_ruta: string | null
          recibido_en: string
          resultados: Json
          sistema_id: string
        }
        Insert: {
          asignado_en?: string | null
          asignado_por?: string | null
          estado?: string
          fecha_resultado?: string | null
          id?: string
          identificacion?: string | null
          laboratorio: string
          nombre_paciente?: string | null
          observaciones?: string | null
          orden?: string | null
          paciente_id?: string | null
          pdf_ruta?: string | null
          recibido_en?: string
          resultados?: Json
          sistema_id: string
        }
        Update: {
          asignado_en?: string | null
          asignado_por?: string | null
          estado?: string
          fecha_resultado?: string | null
          id?: string
          identificacion?: string | null
          laboratorio?: string
          nombre_paciente?: string | null
          observaciones?: string | null
          orden?: string | null
          paciente_id?: string | null
          pdf_ruta?: string | null
          recibido_en?: string
          resultados?: Json
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resultados_laboratorio_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resultados_laboratorio_sistema_id_paciente_id_fkey"
            columns: ["sistema_id", "paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      resumenes_diarios: {
        Row: {
          atendidos: number
          citas: number
          cobertura_ars: number
          cobros: number
          donaciones: number
          efectivo: number
          facturado: number
          fecha: string
          gastos: number
          generado_en: string
          otros: number
          pacientes_cobrados: number
          sistema_id: string
          tarjeta: number
          transferencia: number
        }
        Insert: {
          atendidos?: number
          citas?: number
          cobertura_ars?: number
          cobros?: number
          donaciones?: number
          efectivo?: number
          facturado?: number
          fecha: string
          gastos?: number
          generado_en?: string
          otros?: number
          pacientes_cobrados?: number
          sistema_id: string
          tarjeta?: number
          transferencia?: number
        }
        Update: {
          atendidos?: number
          citas?: number
          cobertura_ars?: number
          cobros?: number
          donaciones?: number
          efectivo?: number
          facturado?: number
          fecha?: string
          gastos?: number
          generado_en?: string
          otros?: number
          pacientes_cobrados?: number
          sistema_id?: string
          tarjeta?: number
          transferencia?: number
        }
        Relationships: [
          {
            foreignKeyName: "resumenes_diarios_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      secuencias_ncf: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          creado_en: string
          creado_por: string | null
          desde: number
          hasta: number
          id: string
          siguiente: number
          sistema_id: string
          tipo: string
          vence_en: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          desde: number
          hasta: number
          id?: string
          siguiente: number
          sistema_id: string
          tipo: string
          vence_en?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          desde?: number
          hasta?: number
          id?: string
          siguiente?: number
          sistema_id?: string
          tipo?: string
          vence_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "secuencias_ncf_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      sedes: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          codigo: string | null
          creado_en: string
          creado_por: string | null
          direccion: string | null
          id: string
          nombre: string
          sistema_id: string
          telefono: string | null
          tipo: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          codigo?: string | null
          creado_en?: string
          creado_por?: string | null
          direccion?: string | null
          id?: string
          nombre: string
          sistema_id: string
          telefono?: string | null
          tipo?: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          codigo?: string | null
          creado_en?: string
          creado_por?: string | null
          direccion?: string | null
          id?: string
          nombre?: string
          sistema_id?: string
          telefono?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sedes_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          categoria: string
          codigo: string | null
          creado_en: string
          creado_por: string | null
          duracion_min: number
          especialidad: string | null
          id: string
          nombre: string
          precio: number
          sistema_id: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          categoria?: string
          codigo?: string | null
          creado_en?: string
          creado_por?: string | null
          duracion_min?: number
          especialidad?: string | null
          id?: string
          nombre: string
          precio?: number
          sistema_id: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          categoria?: string
          codigo?: string | null
          creado_en?: string
          creado_por?: string | null
          duracion_min?: number
          especialidad?: string | null
          id?: string
          nombre?: string
          precio?: number
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicios_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      sistemas: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          cobro_antes_consulta: boolean
          color_marca: string
          creado_en: string
          creado_por: string | null
          direccion: string | null
          ecf_activo: boolean
          email: string | null
          es_pruebas: boolean
          fondo_caja: number
          ia_activa: boolean
          ia_tope_mensual_usd: number
          id: string
          logo_factura: string | null
          logo_url: string | null
          moneda: string
          nombre: string
          pruebas_de: string | null
          razon_social: string | null
          rnc: string | null
          slug: string
          telefono: string | null
          zona_horaria: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          cobro_antes_consulta?: boolean
          color_marca?: string
          creado_en?: string
          creado_por?: string | null
          direccion?: string | null
          ecf_activo?: boolean
          email?: string | null
          es_pruebas?: boolean
          fondo_caja?: number
          ia_activa?: boolean
          ia_tope_mensual_usd?: number
          id?: string
          logo_factura?: string | null
          logo_url?: string | null
          moneda?: string
          nombre: string
          pruebas_de?: string | null
          razon_social?: string | null
          rnc?: string | null
          slug: string
          telefono?: string | null
          zona_horaria?: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          cobro_antes_consulta?: boolean
          color_marca?: string
          creado_en?: string
          creado_por?: string | null
          direccion?: string | null
          ecf_activo?: boolean
          email?: string | null
          es_pruebas?: boolean
          fondo_caja?: number
          ia_activa?: boolean
          ia_tope_mensual_usd?: number
          id?: string
          logo_factura?: string | null
          logo_url?: string | null
          moneda?: string
          nombre?: string
          pruebas_de?: string | null
          razon_social?: string | null
          rnc?: string | null
          slug?: string
          telefono?: string | null
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "sistemas_pruebas_de_fkey"
            columns: ["pruebas_de"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      turnos_caja: {
        Row: {
          abierto_en: string
          cajero_id: string
          cerrado_en: string | null
          estado: string
          id: string
          monto_apertura: number
          monto_declarado: number | null
          monto_esperado: number | null
          notas_cierre: string | null
          sede_id: string | null
          sistema_id: string
        }
        Insert: {
          abierto_en?: string
          cajero_id?: string
          cerrado_en?: string | null
          estado?: string
          id?: string
          monto_apertura?: number
          monto_declarado?: number | null
          monto_esperado?: number | null
          notas_cierre?: string | null
          sede_id?: string | null
          sistema_id: string
        }
        Update: {
          abierto_en?: string
          cajero_id?: string
          cerrado_en?: string | null
          estado?: string
          id?: string
          monto_apertura?: number
          monto_declarado?: number | null
          monto_esperado?: number | null
          notas_cierre?: string | null
          sede_id?: string | null
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnos_caja_sistema_id_cajero_id_fkey"
            columns: ["sistema_id", "cajero_id"]
            isOneToOne: false
            referencedRelation: "membresias"
            referencedColumns: ["sistema_id", "usuario_id"]
          },
          {
            foreignKeyName: "turnos_caja_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_caja_sistema_id_sede_id_fkey"
            columns: ["sistema_id", "sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "turnos_cajero_perfil_fk"
            columns: ["cajero_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ars_pagos_resumen: {
        Row: {
          aplicado: number | null
          aseguradora: string | null
          aseguradora_id: string | null
          creado_en: string | null
          fecha: string | null
          filas: number | null
          glosado: number | null
          id: string | null
          pagado: number | null
          referencia: string | null
          sin_cobro: number | null
          sistema_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ars_pagos_lotes_sistema_id_aseguradora_id_fkey"
            columns: ["sistema_id", "aseguradora_id"]
            isOneToOne: false
            referencedRelation: "aseguradoras"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "ars_pagos_lotes_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_por_cobrar: {
        Row: {
          aseguradora_id: string | null
          cobertura_seguro: number | null
          cobro_id: string | null
          creado_en: string | null
          monto_credito: number | null
          monto_fondo: number | null
          ncf: string | null
          numero: string | null
          numero_autorizacion: string | null
          paciente_id: string | null
          pendiente_aseguradora: number | null
          pendiente_paciente: number | null
          sistema_id: string | null
        }
        Insert: {
          aseguradora_id?: string | null
          cobertura_seguro?: number | null
          cobro_id?: string | null
          creado_en?: string | null
          monto_credito?: number | null
          monto_fondo?: number | null
          ncf?: string | null
          numero?: string | null
          numero_autorizacion?: string | null
          paciente_id?: string | null
          pendiente_aseguradora?: never
          pendiente_paciente?: never
          sistema_id?: string | null
        }
        Update: {
          aseguradora_id?: string | null
          cobertura_seguro?: number | null
          cobro_id?: string | null
          creado_en?: string | null
          monto_credito?: number | null
          monto_fondo?: number | null
          ncf?: string | null
          numero?: string | null
          numero_autorizacion?: string | null
          paciente_id?: string | null
          pendiente_aseguradora?: never
          pendiente_paciente?: never
          sistema_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobros_sistema_id_aseguradora_id_fkey"
            columns: ["sistema_id", "aseguradora_id"]
            isOneToOne: false
            referencedRelation: "aseguradoras"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "cobros_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_sistema_id_paciente_id_fkey"
            columns: ["sistema_id", "paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
      movimientos_bancarios_estado: {
        Row: {
          automatica: boolean | null
          conciliado: number | null
          creado_en: string | null
          creado_por: string | null
          cuadrado: boolean | null
          cuenta_id: string | null
          descripcion: string | null
          fecha: string | null
          huella: string | null
          id: string | null
          monto: number | null
          referencia: string | null
          sistema_id: string | null
          vinculos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_bancarios_sistema_id_cuenta_id_fkey"
            columns: ["sistema_id", "cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["sistema_id", "id"]
          },
          {
            foreignKeyName: "movimientos_bancarios_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      saldos_anticipo: {
        Row: {
          anticipado: number | null
          aplicado: number | null
          paciente_id: string | null
          sistema_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anticipos_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipos_sistema_id_paciente_id_fkey"
            columns: ["sistema_id", "paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["sistema_id", "id"]
          },
        ]
      }
    }
    Functions: {
      abrir_turno_caja: {
        Args: { p_monto_apertura?: number; p_sede?: string; p_sistema: string }
        Returns: {
          abierto_en: string
          cajero_id: string
          cerrado_en: string | null
          estado: string
          id: string
          monto_apertura: number
          monto_declarado: number | null
          monto_esperado: number | null
          notas_cierre: string | null
          sede_id: string | null
          sistema_id: string
        }
        SetofOptions: {
          from: "*"
          to: "turnos_caja"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accesos_expediente: {
        Args: { p_paciente: string }
        Returns: {
          cuando: string
          recurso: string
          usuario: string
        }[]
      }
      activar_facturacion_electronica: {
        Args: { p_activo: boolean; p_sistema: string }
        Returns: undefined
      }
      activar_integracion: {
        Args: { p_activo: boolean; p_proveedor: string; p_sistema: string }
        Returns: undefined
      }
      actualizar_linea_nomina: {
        Args: {
          p_bonos: number
          p_horas_extra: number
          p_linea: string
          p_otras_deducciones: number
          p_otros_ingresos: number
        }
        Returns: undefined
      }
      anular_cobro: {
        Args: { p_cobro: string; p_motivo: string }
        Returns: undefined
      }
      anular_compra: {
        Args: { p_compra: string; p_motivo: string }
        Returns: undefined
      }
      anular_donacion: {
        Args: { p_donacion: string; p_motivo: string }
        Returns: undefined
      }
      aprobar_nomina: { Args: { p_nomina: string }; Returns: string }
      asignar_medico_cobro: {
        Args: { p_cobro: string; p_medico: string }
        Returns: string
      }
      asignar_resultado_laboratorio: {
        Args: { p_paciente: string; p_resultado: string }
        Returns: undefined
      }
      balanza_comprobacion: {
        Args: { p_desde: string; p_hasta: string; p_sistema: string }
        Returns: {
          codigo: string
          debe: number
          haber: number
          nombre: string
          saldo: number
          tipo: string
        }[]
      }
      canjear_codigo_invitacion: {
        Args: { p_codigo: string; p_usuario: string }
        Returns: Json
      }
      cerrar_acceso_restablecido: {
        Args: { p_autor: string; p_sistema: string; p_usuarios: string[] }
        Returns: number
      }
      cerrar_turno_caja: {
        Args: { p_monto_declarado: number; p_notas?: string; p_turno: string }
        Returns: {
          abierto_en: string
          cajero_id: string
          cerrado_en: string | null
          estado: string
          id: string
          monto_apertura: number
          monto_declarado: number | null
          monto_esperado: number | null
          notas_cierre: string | null
          sede_id: string | null
          sistema_id: string
        }
        SetofOptions: {
          from: "*"
          to: "turnos_caja"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cobros_sin_medico: {
        Args: { p_desde: string; p_hasta: string; p_sistema: string }
        Returns: {
          cobro_id: string
          creado_en: string
          especialidad: string
          numero: string
          paciente: string
          total: number
          turno: string
        }[]
      }
      conciliar_automatico: {
        Args: { p_cuenta: string; p_sistema: string }
        Returns: Json
      }
      conciliar_manual: {
        Args: {
          p_ajuste: string
          p_movimiento: string
          p_nota: string
          p_partidas: Json
          p_sistema: string
        }
        Returns: undefined
      }
      consultar_codigo_invitacion: { Args: { p_codigo: string }; Returns: Json }
      consumir_credencial_legado: {
        Args: { p_usuario_id: string }
        Returns: undefined
      }
      consumir_limite: {
        Args: { p_clave: string; p_max: number; p_ventana_seg: number }
        Returns: boolean
      }
      correo_de_acceso: { Args: { p_usuario: string }; Returns: string }
      credencial_legado: {
        Args: { p_usuario: string }
        Returns: {
          email: string
          hash: string
          usuario_id: string
        }[]
      }
      cuenta_tiene_mfa: { Args: { p_usuario: string }; Returns: boolean }
      deshacer_conciliacion: {
        Args: { p_movimiento: string; p_sistema: string }
        Returns: undefined
      }
      detalle_financiero: {
        Args: {
          p_cuentas?: string[]
          p_desde: string
          p_hasta: string
          p_sistema: string
          p_vista: string
        }
        Returns: Json
      }
      diagnostico_plataforma: { Args: never; Returns: Json }
      directorio_medicos: {
        Args: { p_sistema: string }
        Returns: {
          atendidos_30d: number
          atendidos_hoy: number
          cierre_pct: number
          cola_especialidad: number
          consultorio: string
          en_cola: number
          especialidad: string
          espera_promedio: number
          estado: string
          estrellas: number
          exequatur: string
          nombre: string
          pendientes_hoy: number
          puntos: number
          turno_actual: string
          usuario_id: string
        }[]
      }
      eliminar_empleado: { Args: { p_empleado: string }; Returns: string }
      eliminar_item: { Args: { p_item: string }; Returns: string }
      eliminar_miembro: {
        Args: { p_sistema: string; p_usuario: string }
        Returns: string
      }
      eliminar_nomina_borrador: {
        Args: { p_nomina: string }
        Returns: undefined
      }
      espera_limite: {
        Args: { p_clave: string; p_ventana_seg: number }
        Returns: number
      }
      estadisticas_medico: {
        Args: {
          p_desde: string
          p_hasta: string
          p_medico: string
          p_sistema: string
        }
        Returns: Json
      }
      estado_cuenta: {
        Args: { p_contacto: string; p_sistema: string; p_tipo: string }
        Returns: Json
      }
      estado_instalacion: { Args: never; Returns: Json }
      estado_plataforma: { Args: never; Returns: Json }
      exonerar_turno: {
        Args: { p_cita: string; p_motivo: string }
        Returns: string
      }
      generar_codigo_invitacion: {
        Args: {
          p_descripcion: string
          p_dias: number
          p_roles: Database["public"]["Enums"]["rol_sistema"][]
          p_sistema: string
          p_superadmin: boolean
          p_usos: number
        }
        Returns: string
      }
      generar_nomina: {
        Args: {
          p_descripcion?: string
          p_desde: string
          p_frecuencia: string
          p_hasta: string
          p_sistema: string
        }
        Returns: string
      }
      guardar_cuenta_bancaria: {
        Args: {
          p_activo: boolean
          p_banco: string
          p_id: string
          p_nombre: string
          p_numero: string
          p_sistema: string
        }
        Returns: string
      }
      guardar_integracion: {
        Args: {
          p_config: Json
          p_proveedor: string
          p_secretos: Json
          p_sistema: string
        }
        Returns: Json
      }
      ia_consumo_mes: { Args: { p_sistema: string }; Returns: number }
      identificar_turno: {
        Args: { p_cita: string; p_paciente: string }
        Returns: undefined
      }
      importar_coberturas: {
        Args: { p_aseguradora: string; p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_cuentas_contables: {
        Args: { p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_empleados: {
        Args: { p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_escala_isr: {
        Args: { p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_inventario: {
        Args: { p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_movimientos_bancarios: {
        Args: { p_cuenta: string; p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_movimientos_inventario: {
        Args: { p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_novedades_nomina: {
        Args: { p_filas: Json; p_nomina: string; p_sistema: string }
        Returns: Json
      }
      importar_pacientes: {
        Args: { p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_pagos_ars: {
        Args: {
          p_aseguradora: string
          p_fecha: string
          p_filas: Json
          p_referencia: string
          p_sistema: string
        }
        Returns: Json
      }
      importar_parametros_nomina: {
        Args: { p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_proveedores: {
        Args: { p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_reglas_comision: {
        Args: { p_filas: Json; p_sistema: string }
        Returns: Json
      }
      importar_servicios: {
        Args: { p_filas: Json; p_sistema: string }
        Returns: Json
      }
      integracion_secreto: {
        Args: { p_campo: string; p_proveedor: string; p_sistema: string }
        Returns: string
      }
      liquidar_comisiones: {
        Args: { p_beneficiario: string; p_hasta: string; p_sistema: string }
        Returns: Json
      }
      llamar_siguiente: { Args: { p_sistema: string }; Returns: Json }
      llamar_turno: { Args: { p_cita: string }; Returns: Json }
      marcar_password_actualizada: { Args: never; Returns: undefined }
      mis_avisos: { Args: { p_sistema: string }; Returns: Json }
      mis_sistemas_detalle: {
        Args: never
        Returns: {
          activo: boolean
          color_marca: string
          id: string
          logo_factura: string
          logo_url: string
          moneda: string
          nombre: string
          permisos: Json
          roles: Database["public"]["Enums"]["rol_sistema"][]
          slug: string
          zona_horaria: string
        }[]
      }
      movimientos_importantes: {
        Args: {
          p_desde: string
          p_hasta: string
          p_minimo?: number
          p_sistema: string
        }
        Returns: Json
      }
      pantalla_llamados: { Args: { p_sistema: string }; Returns: Json }
      partidas_sin_conciliar: {
        Args: { p_desde: string; p_hasta: string; p_sistema: string }
        Returns: {
          descripcion: string
          fecha: string
          metodo: string
          monto: number
          origen_id: string
          tipo: string
        }[]
      }
      plataforma_cajas_abiertas: {
        Args: never
        Returns: {
          abierto_en: string
          cajero: string
          movimientos: number
          sede: string
          sistema: string
          sistema_id: string
          turno_id: string
        }[]
      }
      plataforma_cerrar_caja: {
        Args: { p_notas?: string; p_turno: string }
        Returns: undefined
      }
      plataforma_cerrar_sesiones: { Args: never; Returns: number }
      plataforma_crear_sistema_pruebas: {
        Args: { p_miembros?: string[]; p_origen: string }
        Returns: string
      }
      plataforma_eliminar_sistema: {
        Args: { p_confirmacion: string; p_sistema: string }
        Returns: Json
      }
      plataforma_limpiar_errores: { Args: { p_dias?: number }; Returns: number }
      plataforma_limpiar_operaciones: {
        Args: {
          p_alcance: string[]
          p_confirmacion?: string
          p_sistema: string
        }
        Returns: Json
      }
      plataforma_mantenimiento: {
        Args: { p_activo: boolean; p_mensaje: string }
        Returns: undefined
      }
      plataforma_usuarios: {
        Args: never
        Returns: {
          activo: boolean
          creado_en: string
          email: string
          es_superadmin: boolean
          id: string
          nombre_completo: string
          nombre_usuario: string
          sistemas: number
          telefono: string
          ultimo_acceso: string
        }[]
      }
      quiosco_buscar: {
        Args: { p_cedula: string; p_sistema: string }
        Returns: Json
      }
      quiosco_opciones: { Args: { p_sistema: string }; Returns: Json }
      quiosco_tomar_turno: {
        Args: {
          p_cedula?: string
          p_cita?: string
          p_especialidad?: string
          p_medico?: string
          p_motivo_prioridad?: string
          p_paciente?: string
          p_prioridad?: boolean
          p_sistema: string
        }
        Returns: Json
      }
      quitar_integracion: {
        Args: { p_proveedor: string; p_sistema: string }
        Returns: undefined
      }
      recalcular_nomina: { Args: { p_nomina: string }; Returns: undefined }
      registrar_abono: {
        Args: {
          p_cobro: string
          p_deudor: string
          p_fecha?: string
          p_metodo: Database["public"]["Enums"]["metodo_pago"]
          p_monto: number
          p_referencia?: string
          p_sistema: string
        }
        Returns: Json
      }
      registrar_acceso_expediente: {
        Args: { p_paciente: string; p_recurso?: string }
        Returns: undefined
      }
      registrar_anticipo: {
        Args: {
          p_fecha?: string
          p_metodo: Database["public"]["Enums"]["metodo_pago"]
          p_monto: number
          p_notas?: string
          p_paciente: string
          p_referencia?: string
          p_sistema: string
        }
        Returns: Json
      }
      registrar_asiento_manual: {
        Args: {
          p_concepto: string
          p_fecha: string
          p_lineas: Json
          p_sistema: string
        }
        Returns: string
      }
      registrar_cobro: {
        Args: {
          p_aseguradora?: string
          p_autorizacion?: string
          p_cita?: string
          p_cliente_nombre?: string
          p_cliente_rnc?: string
          p_descuento?: number
          p_idempotencia?: string
          p_items: Json
          p_notas?: string
          p_paciente: string
          p_pagos: Json
          p_profesional?: string
          p_referencia?: string
          p_sistema: string
          p_tipo_ncf?: string
          p_vendedor?: string
        }
        Returns: Json
      }
      registrar_compra: {
        Args: {
          p_fecha: string
          p_forma_pago: string
          p_items: Json
          p_ncf: string
          p_notas?: string
          p_proveedor: string
          p_sistema: string
        }
        Returns: Json
      }
      registrar_donacion: {
        Args: {
          p_anonima?: boolean
          p_contacto?: string
          p_destino?: string
          p_documento?: string
          p_donante: string
          p_fecha?: string
          p_metodo: Database["public"]["Enums"]["metodo_pago"]
          p_monto: number
          p_notas?: string
          p_referencia?: string
          p_sistema: string
        }
        Returns: Json
      }
      registrar_error_cliente: {
        Args: {
          p_entorno: string
          p_mensaje: string
          p_pantalla: string
          p_rol?: string
          p_sistema?: string
          p_stack?: string
          p_tipo: string
          p_user_agent?: string
          p_version: string
        }
        Returns: undefined
      }
      registrar_evento: {
        Args: { p_accion: string; p_detalle?: Json; p_sistema?: string }
        Returns: undefined
      }
      registrar_evento_integracion: {
        Args: {
          p_detalle: Json
          p_ok: boolean
          p_proveedor: string
          p_sistema: string
          p_tipo: string
        }
        Returns: undefined
      }
      registrar_llegada: {
        Args: {
          p_cita?: string
          p_especialidad?: string
          p_medico?: string
          p_motivo_prioridad?: string
          p_paciente: string
          p_prioridad?: boolean
          p_servicio?: string
          p_sistema: string
        }
        Returns: Json
      }
      registrar_movimiento: {
        Args: {
          p_categoria?: string
          p_concepto: string
          p_metodo?: Database["public"]["Enums"]["metodo_pago"]
          p_monto: number
          p_sistema: string
          p_tipo: string
        }
        Returns: {
          categoria: string
          cobro_id: string | null
          concepto: string
          creado_en: string
          creado_por: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          sede_id: string | null
          sistema_id: string
          tipo: string
          turno_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "movimientos_financieros"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_prueba_integracion: {
        Args: {
          p_detalle: Json
          p_error: string
          p_ok: boolean
          p_proveedor: string
          p_sistema: string
          p_usuario: string
        }
        Returns: undefined
      }
      registrar_uso_ia: {
        Args: {
          p_costo: number
          p_entrada: number
          p_error?: string
          p_funcion: string
          p_modelo: string
          p_ok: boolean
          p_salida: number
          p_sistema: string
          p_usuario: string
        }
        Returns: undefined
      }
      renombrar_miembro: {
        Args: { p_nombre: string; p_sistema: string; p_usuario: string }
        Returns: undefined
      }
      reporte_comisiones: {
        Args: { p_desde: string; p_hasta: string; p_sistema: string }
        Returns: {
          a_pagar: number
          beneficiario_id: string
          especialidad: string
          generado: number
          liquidado: number
          nombre: string
          operaciones: number
          pacientes: number
          pendiente: number
          retencion: number
        }[]
      }
      respaldo_tabla: { Args: { p_tabla: string }; Returns: Json }
      respaldo_tablas: { Args: never; Returns: string[] }
      resumen_dashboard: { Args: { p_sistema: string }; Returns: Json }
      resumen_financiero: {
        Args: {
          p_agrupar?: string
          p_desde: string
          p_hasta: string
          p_sistema: string
        }
        Returns: Json
      }
      revocar_codigo_invitacion: { Args: { p_id: string }; Returns: undefined }
      verificar_codigo_instalacion: {
        Args: { p_codigo: string }
        Returns: boolean
      }
      vista_previa_asiento_nomina: { Args: { p_nomina: string }; Returns: Json }
    }
    Enums: {
      estado_cita:
        | "programada"
        | "confirmada"
        | "por_cobrar"
        | "en_espera"
        | "llamado"
        | "en_consulta"
        | "completada"
        | "cancelada"
        | "no_asistio"
      metodo_pago:
        | "efectivo"
        | "tarjeta"
        | "transferencia"
        | "cheque"
        | "seguro"
        | "otro"
        | "anticipo"
        | "credito"
      rol_sistema:
        | "admin"
        | "medico"
        | "enfermeria"
        | "recepcion"
        | "caja"
        | "farmacia"
        | "auditor"
        | "gerencia"
        | "contabilidad"
        | "psicologia"
        | "nutricion"
        | "terapia"
        | "quiosco"
      tipo_entrada_clinica:
        | "consulta"
        | "evolucion"
        | "diagnostico"
        | "receta"
        | "signos_vitales"
        | "laboratorio"
        | "imagen"
        | "procedimiento"
        | "triaje"
        | "adenda"
        | "nutricion"
        | "anestesia"
        | "psicologia"
        | "anexo"
        | "certificado"
        | "referimiento"
        | "orden"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_cita: [
        "programada",
        "confirmada",
        "por_cobrar",
        "en_espera",
        "llamado",
        "en_consulta",
        "completada",
        "cancelada",
        "no_asistio",
      ],
      metodo_pago: [
        "efectivo",
        "tarjeta",
        "transferencia",
        "cheque",
        "seguro",
        "otro",
        "anticipo",
        "credito",
      ],
      rol_sistema: [
        "admin",
        "medico",
        "enfermeria",
        "recepcion",
        "caja",
        "farmacia",
        "auditor",
        "gerencia",
        "contabilidad",
        "psicologia",
        "nutricion",
        "terapia",
        "quiosco",
      ],
      tipo_entrada_clinica: [
        "consulta",
        "evolucion",
        "diagnostico",
        "receta",
        "signos_vitales",
        "laboratorio",
        "imagen",
        "procedimiento",
        "triaje",
        "adenda",
        "nutricion",
        "anestesia",
        "psicologia",
        "anexo",
        "certificado",
        "referimiento",
        "orden",
      ],
    },
  },
} as const
