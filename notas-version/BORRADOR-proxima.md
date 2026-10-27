## ✨ MEDORA 1.9.0 — Pago de comisiones, notas de crédito y un arranque más rápido

<!-- BORRADOR: renombrar a v1.9.0.md al publicar. Antes, aplicar las migraciones 20261027090000 a 20261027130000. -->

Ahora el pago a los médicos queda registrado con su asiento, los cobros con factura electrónica se pueden anular con nota de crédito y MEDORA abre más rápido. También llegan Laboratorio, Farmacia e Internamiento para las sedes que los usan.

> **Actualización recomendada para todos los equipos.** Se instala sola desde el launcher de Windows; tus datos no se tocan.

---

### ✨ Novedades

- **🤝 Pago de comisiones a los médicos.** En **Comisiones → Liquidaciones y pagos** registras cuándo y cómo se le pagó a cada médico (transferencia, cheque o efectivo de tu turno de caja). MEDORA hace el egreso y el asiento contable, y una liquidación no se puede pagar dos veces.
- **🧾 Nota de crédito electrónica (E34).** Un cobro cuya factura electrónica ya aceptó la DGII se anula ahora desde **Contabilidad → Comprobantes fiscales → Nota de crédito**: se emite la E34, se envía a la DGII y el cobro queda anulado.
- **🏥 Laboratorio, Farmacia e Internamiento.** Las sedes de tipo laboratorio, farmacia o clínica ven sus módulos: órdenes y resultados, lotes y vencimientos con libro de controlados, y camas. Si el hospital tiene varias sedes, se elige la sede en el menú.
- **📤 Exportar el expediente (FHIR).** En la ficha del paciente, **Exportar (FHIR)** descarga el expediente completo en el formato internacional HL7 FHIR, para enviarlo a otro centro o entregárselo al paciente. Cada exportación queda en la auditoría.

### ⚡ Rendimiento

- **🚀 MEDORA abre más rápido.** El Inicio ya no carga la librería de gráficos (unos 400 KB menos al arrancar); los gráficos de Finanzas y Estadísticas se cargan al abrirlos.
- **🗂️ 21 índices nuevos en la base de datos** para que las búsquedas y los borrados entre tablas relacionadas no recorran tablas completas.
- **🧹 Limpieza automática** de registros técnicos que crecían sin límite (historial de tareas programadas, errores viejos y contadores de intentos). Los datos de pacientes, cobros y contabilidad no se tocan.

### 🔐 Seguridad

- **✍️ Actualizaciones con firma digital.** El instalador queda preparado para firmarse con un certificado de código. Una vez firmado, MEDORA solo acepta actualizaciones firmadas por el mismo titular, además de comprobar su huella.
- **🩺 Vigilancia de las tareas automáticas.** Si el respaldo de la madrugada, el cierre diario o el envío de facturas electrónicas no corren, soporte recibe un aviso.

### 🛠️ Correcciones

- **«Comisiones por pagar» ya no crece para siempre**: el pago al médico ahora la descuenta.
- El aviso al liquidar comisiones ya no dice «asiento generado»: el asiento se genera al pagar.

### 📥 Descargas

- **Windows**: se actualiza solo. Instalador nuevo: `MEDORA-1.9.0-Setup-x64.exe`.
- **Linux y macOS**: `.AppImage`, `.deb`, `.rpm` y `.dmg` en la página de la versión.
