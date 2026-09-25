# Arquitectura de MEDORA

## Por qué no se copió tal cual el modelo de FUNBIDE

FUNBIDE corre una API .NET en cada PC que se conecta a Postgres con un rol acotado (`funbide_app`) cuya contraseña viaja en el instalador. Su RLS es una sola política `authenticated_access USING (true)`: los roles solo los aplica la API.

Con **varios sistemas hospitalarios en la misma base**, ese modelo no alcanza: quien extraiga la contraseña del instalador puede leer datos de cualquier sistema. MEDORA toma de FUNBIDE lo que funcionaba (launcher WinForms + WebView2, auto‑update por GitHub Releases con SHA256, `version.txt` como fuente única, tablas append‑only, bitácora, CI con escaneo de vulnerabilidades, skills de animación) y mueve la autorización **dentro de Postgres**:

| | FUNBIDE | MEDORA |
|---|---|---|
| Autorización | API .NET | RLS de Postgres por sistema y rol |
| Secreto en el instalador | Contraseña de `funbide_app` | Ninguno (solo clave publicable) |
| Proceso local | API en `localhost:5090` + WebView2 | Solo WebView2 (archivos estáticos) |
| Métodos de instalación | Docker web, offline/USB, portable, instalador | Solo instalador con auto‑update |
| Auditoría | Registrada por la API | Triggers en cada tabla (no se puede omitir) |
| Integridad entre tenants | — | FKs compuestas `(sistema_id, id)` |

## Modelo de datos

```
sistemas ─┬─ sedes
          ├─ membresias (usuario ↔ sistema, roles[])  ── perfiles ── auth.users
          ├─ pacientes ─┬─ citas ── historial_clinico (append‑only)
          │             └─ cobros ── cobro_detalles / anulaciones_cobro (append‑only)
          ├─ servicios / aseguradoras / coberturas
          ├─ turnos_caja ── movimientos_financieros (append‑only)
          ├─ inventario_items ── movimientos_inventario (append‑only, actualiza stock por trigger)
          └─ auditoria (append‑only, llenada por triggers)
```

## Seguridad

- **RLS** en todas las tablas; helpers `privado.mis_sistemas()`, `privado.mis_sistemas_con_rol(roles)`, `privado.sistemas_administrables()` (esquema no expuesto por la API).
- **Perfiles**: el usuario solo puede editar `nombre_completo`, `telefono`, `avatar_url`, `ultimo_sistema_id` (privilegios por columna). `es_superadmin` solo lo cambia la service key.
- **Edge Functions**
  - `configuracion-inicial` (sin JWT): crea el primer superadmin; exige el código de instalación y deja de funcionar para siempre cuando ya existe uno.
  - `gestion-usuarios` (JWT): alta de personal y restablecimiento de contraseñas; valida que quien llama sea admin del sistema o superadmin.
- **Realtime** en `citas` (sala de espera en vivo), filtrado por RLS.

## Pendientes recomendados

- En Supabase → Authentication → Sign In / Providers: **desactivar "Allow new users to sign up"** (las cuentas las crea `gestion-usuarios`).
- Firma de código (Authenticode) del instalador cuando haya certificado: elimina el aviso de SmartScreen en la primera instalación.
- Plan Pro de Supabase para producción (backups diarios con PITR, sin pausa por inactividad).
