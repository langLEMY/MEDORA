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
          creado_en: string
          creado_por: string | null
          estado: Database["public"]["Enums"]["estado_cita"]
          fin: string
          id: string
          inicio: string
          llegada_en: string | null
          medico_id: string
          motivo: string | null
          motivo_cancelacion: string | null
          notas: string | null
          paciente_id: string
          sede_id: string | null
          servicio_id: string | null
          sistema_id: string
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          atendida_en?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_cita"]
          fin: string
          id?: string
          inicio: string
          llegada_en?: string | null
          medico_id: string
          motivo?: string | null
          motivo_cancelacion?: string | null
          notas?: string | null
          paciente_id: string
          sede_id?: string | null
          servicio_id?: string | null
          sistema_id: string
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          atendida_en?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_cita"]
          fin?: string
          id?: string
          inicio?: string
          llegada_en?: string | null
          medico_id?: string
          motivo?: string | null
          motivo_cancelacion?: string | null
          notas?: string | null
          paciente_id?: string
          sede_id?: string | null
          servicio_id?: string | null
          sistema_id?: string
        }
        Relationships: [
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
          id: string
          monto_cubierto: number
          servicio_id: string
          sistema_id: string
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          aseguradora_id: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          monto_cubierto: number
          servicio_id: string
          sistema_id: string
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          aseguradora_id?: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          monto_cubierto?: number
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
          referencia: string | null
          sistema_id: string
        }
        Insert: {
          cobro_id: string
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          referencia?: string | null
          sistema_id: string
        }
        Update: {
          cobro_id?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
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
          cliente_nombre: string | null
          cliente_rnc: string | null
          cobertura_seguro: number
          creado_en: string
          descuento: number
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto_credito: number
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
          cliente_nombre?: string | null
          cliente_rnc?: string | null
          cobertura_seguro?: number
          creado_en?: string
          descuento?: number
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto_credito?: number
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
          cliente_nombre?: string | null
          cliente_rnc?: string | null
          cobertura_seguro?: number
          creado_en?: string
          descuento?: number
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto_credito?: number
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
          numero: string
          sistema_id: string
          total: number
        }
        Insert: {
          beneficiario_id: string
          creado_en?: string
          creado_por?: string
          hasta: string
          id?: string
          numero: string
          sistema_id: string
          total: number
        }
        Update: {
          beneficiario_id?: string
          creado_en?: string
          creado_por?: string
          hasta?: string
          id?: string
          numero?: string
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
          creado_en: string
          creado_por: string | null
          especialidad: string | null
          exequatur: string | null
          id: string
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
          creado_en?: string
          creado_por?: string | null
          especialidad?: string | null
          exequatur?: string | null
          id?: string
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
          creado_en?: string
          creado_por?: string | null
          especialidad?: string | null
          exequatur?: string | null
          id?: string
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
          creado_en: string
          debe_cambiar_password: boolean
          email: string
          es_superadmin: boolean
          id: string
          nombre_completo: string
          telefono: string | null
          ultimo_sistema_id: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          avatar_url?: string | null
          creado_en?: string
          debe_cambiar_password?: boolean
          email: string
          es_superadmin?: boolean
          id: string
          nombre_completo?: string
          telefono?: string | null
          ultimo_sistema_id?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          avatar_url?: string | null
          creado_en?: string
          debe_cambiar_password?: boolean
          email?: string
          es_superadmin?: boolean
          id?: string
          nombre_completo?: string
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
          id: string
          nombre: string
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
          id?: string
          nombre: string
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
          id?: string
          nombre?: string
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
          color_marca: string
          creado_en: string
          creado_por: string | null
          direccion: string | null
          email: string | null
          id: string
          logo_url: string | null
          moneda: string
          nombre: string
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
          color_marca?: string
          creado_en?: string
          creado_por?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          moneda?: string
          nombre: string
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
          color_marca?: string
          creado_en?: string
          creado_por?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          moneda?: string
          nombre?: string
          razon_social?: string | null
          rnc?: string | null
          slug?: string
          telefono?: string | null
          zona_horaria?: string
        }
        Relationships: []
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
      cuentas_por_cobrar: {
        Row: {
          aseguradora_id: string | null
          cobertura_seguro: number | null
          cobro_id: string | null
          creado_en: string | null
          monto_credito: number | null
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
        Args: { p_monto_apertura: number; p_sede?: string; p_sistema: string }
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
      aprobar_nomina: { Args: { p_nomina: string }; Returns: string }
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
      consultar_codigo_invitacion: { Args: { p_codigo: string }; Returns: Json }
      eliminar_nomina_borrador: {
        Args: { p_nomina: string }
        Returns: undefined
      }
      estado_cuenta: {
        Args: { p_contacto: string; p_sistema: string; p_tipo: string }
        Returns: Json
      }
      estado_instalacion: { Args: never; Returns: Json }
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
      liquidar_comisiones: {
        Args: { p_beneficiario: string; p_hasta: string; p_sistema: string }
        Returns: Json
      }
      marcar_password_actualizada: { Args: never; Returns: undefined }
      mis_sistemas_detalle: {
        Args: never
        Returns: {
          activo: boolean
          color_marca: string
          id: string
          logo_url: string
          moneda: string
          nombre: string
          roles: Database["public"]["Enums"]["rol_sistema"][]
          slug: string
          zona_horaria: string
        }[]
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
          sistemas: number
          telefono: string
          ultimo_acceso: string
        }[]
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
      registrar_evento: {
        Args: { p_accion: string; p_detalle?: Json; p_sistema?: string }
        Returns: undefined
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
      reporte_comisiones: {
        Args: { p_desde: string; p_hasta: string; p_sistema: string }
        Returns: {
          beneficiario_id: string
          generado: number
          liquidado: number
          nombre: string
          operaciones: number
          pendiente: number
        }[]
      }
      resumen_dashboard: { Args: { p_sistema: string }; Returns: Json }
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
        | "en_espera"
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
        "en_espera",
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
      ],
    },
  },
} as const
