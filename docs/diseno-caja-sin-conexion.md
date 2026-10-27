# Diseño: cobrar sin conexión

Estado: propuesta. Necesita las decisiones de la sección 5 antes de programarse.

## 1. Problema

Sin internet, Caja no puede cobrar: `registrar_cobro` corre en el servidor y la app
falla al instante. En RD los cortes de luz e internet son frecuentes, y un hospital no
puede dejar de atender por eso.

## 2. Qué ya existe y sirve

- **`p_idempotencia` en `registrar_cobro`.** El mismo cobro reenviado no se cobra dos
  veces. Es la base de una cola que reintenta.
- **`lib/sinConexion.ts`.** Copia local de datos operativos (servicios, tarifas, médicos
  del día) por 24 horas.
- **El launcher.** Proceso de escritorio con disco local, donde se puede guardar la cola
  cifrada.

## 3. Propuesta

1. **Cola local de cobros.** Sin conexión, el cobro se arma con los precios de la copia
   local y se guarda en IndexedDB, cifrado con una llave derivada de la sesión, con su
   clave de idempotencia. Se imprime un recibo marcado «PROVISIONAL · pendiente de
   sincronizar».
2. **Envío al volver.** Al recuperar la red se envía cada cobro en orden con su clave de
   idempotencia. El servidor recalcula el total, como siempre. Si difiere del provisional
   (por ejemplo, cambió una tarifa), el cobro queda en «revisar» y no se aplica solo.
3. **Comprobantes fiscales.** Este es el punto difícil. Un NCF o e-NCF no se puede
   inventar sin conexión. Hay dos opciones:
   - **A. Rango reservado por equipo.** Cada caja reserva, con conexión, un bloque de NCF
     (por ejemplo 50) en una tabla `reservas_ncf`. Sin conexión toma el siguiente de su
     bloque. Así no hay duplicados entre cajas. La DGII permite emitir e-CF en
     contingencia y enviarlos después (dentro de su plazo).
   - **B. Sin comprobante sin conexión.** El recibo provisional no lleva NCF, y el
     comprobante se emite al sincronizar. Es más simple, pero el cliente que necesita
     crédito fiscal debe volver por él.
4. **Límites.** Solo efectivo y tarjeta con voucher manual; nada de anticipos (el saldo
   no se puede verificar sin conexión). Un tope de horas o de cobros pendientes por
   equipo. Aviso fijo en la barra mientras haya cola.
5. **Turno de caja.** Los cobros en cola cuentan en el arqueo como «pendientes de
   sincronizar». El turno no se cierra con cola pendiente.

## 4. Riesgos

- **Tarifas viejas.** Si la copia local tiene precios desactualizados, aparecen
  diferencias. Se mitiga marcando «revisar» en vez de aplicar a ciegas.
- **Pérdida de la PC antes de sincronizar.** Se mitiga con la cola cifrada y el aviso de
  pendientes; no se elimina del todo.
- **Comisiones y asientos.** Se generan al sincronizar, no en la hora real del cobro.
  `creado_en` debe aceptar la hora original del cobro para que el cuadre del día cuadre.

## 5. Decisiones que necesito de ti

1. ¿Comprobantes sin conexión con la opción A (rango por equipo) o la B (sin NCF hasta
   sincronizar)?
2. ¿Cuántas horas o cobros máximos en cola por equipo?
3. ¿Se permite tarjeta sin conexión (voucher manual del POS) o solo efectivo?

Estimado: 2 versiones (cola y sincronización; después los comprobantes).
