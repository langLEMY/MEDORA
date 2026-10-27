# Diseño: MEDORA como producto para varios hospitales

Estado: propuesta. Lo técnico de base ya existe; faltan decisiones comerciales.

## 1. Qué ya está listo

- **Multi-hospital real.** RLS por `sistema_id`, FKs compuestas y la batería de
  aislamiento antes de cada versión.
- **Alta de un hospital.** `plataforma_crear_sistema`, su entorno de pruebas y códigos
  de invitación para el primer administrador.
- **Costo de IA por hospital.** `ia_eventos` con tokens y costo, y un tope mensual por
  hospital.
- **Operación.** Salud de la plataforma (respaldos, cierres, e-CF), helpdesk y modo
  mantenimiento.

## 2. Lo que falta

### Planes y facturación a los hospitales

- Tabla `plataforma.suscripciones` (fuera del alcance de los hospitales): plan, estado
  (`prueba`, `activa`, `vencida`, `suspendida`), fecha de corte y límites (usuarios,
  sedes, módulos, IA).
- Pasarela: **Azul** (local, cobra en RD$, ya hay conector) o Stripe (en USD, más
  simple de integrar). Para hospitales dominicanos, Azul evita el cambio de moneda.
- Al vencer: siete días de gracia con aviso en la campana del administrador; después,
  solo lectura (nunca se bloquea el acceso a la historia clínica: es un dato que el
  hospital necesita por ley).
- MEDORA le emite su factura al hospital con el mismo motor de e-CF (MEDORA como emisor).

### Métricas de uso por hospital

Vista solo para el superadmin, sin datos clínicos ni montos de los hospitales: usuarios
activos en 30 días, cobros registrados (conteo), tamaño de la base y de los archivos,
costo de IA y tickets de soporte.

### Capacidad

- Hoy todos los hospitales están en un solo proyecto de Supabase. Es correcto hasta
  decenas de hospitales medianos.
- **Lo que más carga hoy es Realtime.** El sondeo de `postgres_changes` suma unos 16
  millones de ms acumulados en `pg_stat_statements`: es la consulta más cara de la base,
  muy por encima de cualquier pantalla. Antes de crecer conviene pasar los canales que
  cambian mucho (pantalla de llamados, turnos) a Realtime Broadcast emitido desde
  triggers, que no sondea la WAL.
- Un hospital muy grande se puede llevar a su propio proyecto con las mismas migraciones
  (la licencia ya lo prevé), con el launcher apuntando a su URL.

### Disponibilidad comprometida

- Página de estado pública (por ejemplo, una página propia que lea la salud de la
  plataforma, sin datos de clientes).
- SLA propuesto: 99,5 % mensual, con el soporte en horario laboral de RD.

## 3. Decisiones que necesito de ti

1. Precios y planes: ¿por usuario, por sede o por hospital? ¿Qué módulos van en cada plan?
2. Pasarela: ¿Azul, Stripe o ambas?
3. ¿Qué pasa al vencer una suscripción: solo lectura, o solo lectura salvo Caja?
4. ¿Se publica una página de estado?

Estimado: 2 versiones (suscripciones y bloqueo suave; después pasarela y facturación).
