# Diseño: MEDORA en el celular del médico

Estado: propuesta.

## 1. Para quién y para qué

Para los médicos que rotan entre hospitales y consultan desde el celular. Alcance
inicial, solo lo que ya ve la «vista del médico» (`soloPropio`):

- su agenda de hoy y de la semana, en todos los hospitales donde tiene membresía;
- la cola de su consulta y el botón «Llamar siguiente»;
- el expediente de sus pacientes (lectura) y la nota de la consulta;
- recetas, certificados y referimientos con el membrete del hospital (compartir PDF);
- sus estadísticas y comisiones.

Fuera del alcance: caja, finanzas, configuración y quiosco.

## 2. Cómo construirlo

- **La misma app.** Se empaqueta la misma `app/` (React) con **Capacitor**: una sola base
  de código, los mismos permisos y el mismo RLS. Tauri 2 móvil es otra opción, pero
  Capacitor tiene más plugins maduros (biometría, notificaciones, compartir).
- **Rutas a pantalla de celular.** Las pantallas del médico ya existen; se ajustan a
  pantallas angostas (la app ya trae controles de 44 px en pantallas táctiles).
- **Entrada.** El mismo login por usuario. Huella o Face ID solo para desbloquear una
  sesión ya abierta, igual que el bloqueo por inactividad. Nunca se guarda la contraseña.
- **Avisos.** Notificación push «Tu paciente llegó» (FCM/APNs) desde un trigger de
  `citas` cuando pasa a `en_espera` y el médico tiene la app.
- **Privacidad en el teléfono.** Nada clínico se guarda en el teléfono. La caché sin
  conexión se limita a la agenda, como en la PC. La pantalla se oculta en el selector de
  apps (FLAG_SECURE en Android) y la sesión se bloquea por inactividad.

## 3. Publicación

- Android: Google Play (cuenta de desarrollador) o APK firmado propio para empezar.
- iOS: App Store (cuenta de desarrollador de Apple). La revisión de Apple pide la
  política de privacidad (ya está en `seguridad-y-privacidad.md`).

## 4. Decisiones que necesito de ti

1. ¿Empezamos solo con Android (más rápido y sin revisión de Apple)?
2. ¿Notificaciones push en la primera versión?
3. ¿La app se publica a nombre de MEDORA o de cada hospital?

Estimado: 1 versión para la primera app Android interna (agenda, cola, expediente y
recetas); otra para iOS y las notificaciones.
