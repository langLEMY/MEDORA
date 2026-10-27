# MEDORA · Seguridad y privacidad de los datos

Documento para hospitales, clínicas y ARS que evalúan MEDORA. Explica cómo se protegen
los datos de pacientes, dinero y personal, y cómo se cumple la Ley 172-13 de protección
de datos personales de la República Dominicana. Describe controles que ya están en
funcionamiento. Lo que todavía no existe aparece en la sección «Pendiente».

## 1. Dónde viven los datos

- **Base de datos.** PostgreSQL 17 administrado por Supabase, cifrado en reposo (AES-256)
  y en tránsito (TLS 1.2 o superior). La app no tiene un servidor propio: habla con la
  base por HTTPS, y la base aplica todas las reglas de acceso.
- **Archivos.** Fotos de cédula, anexos clínicos, capturas de soporte y respaldos van en
  buckets privados. Cada descarga usa un enlace firmado y temporal.
- **Claves de terceros.** El certificado de la DGII, los usuarios de SENASA y de los
  laboratorios y los tokens de WhatsApp se guardan en Supabase Vault, cifrados. Solo el
  servidor los descifra, y nunca se devuelven a la pantalla.
- **En la PC.** No se guarda historia clínica, pacientes ni finanzas. La copia sin
  conexión solo cubre datos operativos, como la agenda del día, dura 24 horas y se
  borra al cerrar sesión.

## 2. Separación entre hospitales

Varios hospitales comparten la plataforma, y ninguno puede ver los datos de otro:

- Toda tabla con datos del negocio lleva el identificador del hospital, y Postgres filtra
  cada consulta según las membresías de quien pregunta (Row Level Security). No depende
  de la app: aunque alguien modificara el programa, la base no le entregaría esos datos.
- Las relaciones entre tablas incluyen el hospital, así que Postgres rechaza mezclar
  registros de dos hospitales.
- Antes de cada versión corre una batería automática que intenta leer y escribir entre
  hospitales con distintos roles. Hoy son 91 pruebas, y todas deben pasar.

## 3. Quién ve qué

- **Roles.** Administración, gerencia, contabilidad, médico, enfermería, psicología,
  nutrición, terapia, recepción, caja, farmacia, laboratorio, auditoría y quiosco. Cada
  módulo define qué roles leen y escriben, y el administrador puede afinarlo por persona.
- **Médicos.** Quien solo tiene un rol clínico ve únicamente sus citas y sus pacientes.
- **Soporte de MEDORA.** El personal de soporte no ve historia clínica ni finanzas de un
  hospital, salvo que el hospital le dé una membresía. Sus acciones quedan registradas
  como «Soporte MEDORA».
- **Dinero y existencias.** Los totales los calcula el servidor. La pantalla no puede
  mandar un total inventado.

## 4. Acceso a las cuentas

- Se entra con nombre de usuario. El correo nunca llega al navegador.
- Las contraseñas se guardan con hash, nunca en texto plano.
- Los intentos de entrada tienen límite por usuario y por equipo. Después de varios
  fallos, el sistema pide esperar unos minutos.
- **Verificación en dos pasos (TOTP).** Es opcional por cuenta y obligatoria para las
  funciones de administración de la plataforma.
- La sesión se bloquea por inactividad (15, 25 o 30 minutos) y vuelve a pedir la
  contraseña.
- **Contraseñas temporales.** Cuando un administrador asigna una, es distinta para cada
  persona y obliga a cambiarla en el primer acceso.

## 5. Trazabilidad

- **Auditoría.** Los cambios en dinero, permisos, personal y datos clínicos quedan
  registrados con quién los hizo, cuándo y qué cambió. En lo clínico se registra la
  acción, no el contenido.
- **Accesos a expedientes.** Las aperturas de un expediente se registran (una por
  persona cada 10 minutos), y la administración, la gerencia y la auditoría pueden
  consultarlas.
- **Historial que no se modifica.** La historia clínica, los cobros, las anulaciones, la
  contabilidad, los inventarios y la auditoría no se pueden editar ni borrar. Las
  correcciones son registros nuevos: adendas, anulaciones o notas de crédito.

## 6. Continuidad

- **Respaldos.** Respaldo completo cada madrugada, cifrado con AES-256-GCM y una clave
  que no está en el código. Se conservan los últimos 30.
- **Vigilancia.** Si un respaldo, el cierre diario o el envío de e-CF a la DGII no
  corren, el soporte de MEDORA recibe un aviso.
- **Actualizaciones.** El programa de Windows comprueba la huella SHA-256 de cada
  actualización antes de instalarla, y nunca bloquea el arranque por la red. Cuando el
  instalador está firmado digitalmente, también exige esa firma.

## 7. Ley 172-13: derechos de los titulares

| Derecho | Cómo se ejerce en MEDORA |
|---|---|
| Acceso | El hospital consulta e imprime los datos del paciente desde su ficha y su expediente |
| Rectificación | Los datos personales se corrigen en la ficha. Lo clínico se corrige con una adenda, sin borrar lo anterior |
| Cancelación | Los datos no clínicos (teléfono, correo, foto) se pueden quitar. La historia clínica y los comprobantes fiscales se guardan el plazo legal (ver `retencion-datos.md`) |
| Oposición | Los avisos por WhatsApp se pueden desactivar por persona |

Responsabilidades: el hospital es el responsable del tratamiento de los datos de sus
pacientes y su personal. MEDORA actúa como encargado del tratamiento: los procesa solo
para prestar el servicio y no los vende ni los cede.

## 8. Inteligencia artificial

MEDORA usa IA (Claude, de Anthropic) solo donde el hospital la activa, y nunca le envía
historia clínica. En «Pregúntale a MEDORA», la IA solo elige qué consulta correr. La
consulta se ejecuta con los permisos de quien pregunta, y los datos no salen hacia la IA.
Cada uso registra tokens y costo, no el contenido.

## 9. Monitoreo de errores

Los errores de la app se registran sin datos de pacientes. Antes de enviarlos se borran
las cédulas, los teléfonos y los correos, y solo se guarda el identificador del usuario,
el hospital y la versión.

## 10. Pendiente

- Prueba de penetración por un tercero independiente.
- Firma digital del instalador de Windows: el soporte ya está listo y falta el
  certificado.
- Procedimiento escrito de respuesta a incidentes, con plazos para notificar al hospital.
- Prueba de restauración de respaldos programada y documentada, una vez al mes.

Contacto de seguridad: soporte de MEDORA, desde Ayuda dentro de la app.
