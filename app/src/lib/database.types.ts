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
            foreignKeyName: "anulaciones_cobro_sistema_id_fkey"
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
      cobros: {
        Row: {
          aseguradora_id: string | null
          cajero_id: string
          cita_id: string | null
          cobertura_seguro: number
          creado_en: string
          descuento: number
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          notas: string | null
          numero: string
          numero_autorizacion: string | null
          paciente_id: string
          referencia: string | null
          sede_id: string | null
          sistema_id: string
          subtotal: number
          total: number
          turno_id: string
        }
        Insert: {
          aseguradora_id?: string | null
          cajero_id?: string
          cita_id?: string | null
          cobertura_seguro?: number
          creado_en?: string
          descuento?: number
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          notas?: string | null
          numero: string
          numero_autorizacion?: string | null
          paciente_id: string
          referencia?: string | null
          sede_id?: string | null
          sistema_id: string
          subtotal: number
          total: number
          turno_id: string
        }
        Update: {
          aseguradora_id?: string | null
          cajero_id?: string
          cita_id?: string | null
          cobertura_seguro?: number
          creado_en?: string
          descuento?: number
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          notas?: string | null
          numero?: string
          numero_autorizacion?: string | null
          paciente_id?: string
          referencia?: string | null
          sede_id?: string | null
          sistema_id?: string
          subtotal?: number
          total?: number
          turno_id?: string
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
      membresias: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
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
      perfiles: {
        Row: {
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
      [_ in never]: never
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
      anular_cobro: {
        Args: { p_cobro: string; p_motivo: string }
        Returns: undefined
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
      estado_instalacion: { Args: never; Returns: Json }
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
      registrar_cobro: {
        Args: {
          p_aseguradora?: string
          p_autorizacion?: string
          p_cita?: string
          p_descuento?: number
          p_items: Json
          p_metodo: Database["public"]["Enums"]["metodo_pago"]
          p_notas?: string
          p_paciente: string
          p_referencia?: string
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
      resumen_dashboard: { Args: { p_sistema: string }; Returns: Json }
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
      rol_sistema:
        | "admin"
        | "medico"
        | "enfermeria"
        | "recepcion"
        | "caja"
        | "farmacia"
        | "auditor"
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
      ],
      rol_sistema: [
        "admin",
        "medico",
        "enfermeria",
        "recepcion",
        "caja",
        "farmacia",
        "auditor",
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
      ],
    },
  },
} as const
