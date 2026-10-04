// Facturación electrónica con la DGII (e-CF, Ley 32-23), directo y sin intermediario.
//
//   1. Certificado digital del emisor (.p12 en base64 + clave, en Vault).
//   2. Autenticación: semilla → semilla firmada → token (vigencia ~1 h).
//   3. e-CF: XML del comprobante firmado (XMLDSig, RSA-SHA256, firma envuelta al
//      final del documento). Código de seguridad = 6 primeros caracteres de la firma.
//   4. Envío: e-CF completo a "recepción" (devuelve trackId y luego se consulta),
//      o, para consumo (E32) < RD$250,000, el Resumen de Factura de Consumo (RFCE)
//      a fc.dgii.gov.do (respuesta inmediata).
//
// Rutas y estructura según la documentación técnica de la DGII. Las URL base se
// pueden reemplazar desde la integración (config.url_ecf / config.url_fc) si la
// DGII las cambia, sin publicar otra versión.
import forge from "npm:node-forge@1.3.1";
import { SignedXml } from "npm:xml-crypto@6.1.2";

export type Ambiente = "pruebas" | "certificacion" | "produccion";
const SEGMENTO: Record<Ambiente, string> = { pruebas: "testecf", certificacion: "certecf", produccion: "ecf" };
const ESPERA_MS = 20_000;

export interface ConfigDgii {
  ambiente?: string;
  url_ecf?: string;
  url_fc?: string;
}

export function urls(config: ConfigDgii) {
  const amb = (config.ambiente as Ambiente) in SEGMENTO ? (config.ambiente as Ambiente) : "pruebas";
  const seg = SEGMENTO[amb];
  return {
    ambiente: amb,
    segmento: seg,
    ecf: (config.url_ecf || `https://ecf.dgii.gov.do/${seg}`).replace(/\/+$/, ""),
    fc: (config.url_fc || `https://fc.dgii.gov.do/${seg}`).replace(/\/+$/, ""),
  };
}

// ---------------------------------------------------------------------------
// Certificado
// ---------------------------------------------------------------------------
export interface Certificado {
  llavePem: string;
  certPem: string;
  titular: string;
  emisor: string;
  desde: Date;
  hasta: Date;
}

export function leerCertificado(p12Base64: string, clave: string): Certificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const der = forge.util.decode64(p12Base64.replace(/\s+/g, ""));
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, clave);
  } catch {
    throw new Error("No se pudo abrir el certificado: revisa el archivo .p12 y su clave.");
  }
  const llaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const llave = llaves[0]?.key;
  // El certificado del emisor es el que corresponde a la llave privada (no las CA de la cadena).
  const cert =
    certs.map((b) => b.cert).find((c) => c && llave && (c.publicKey as forge.pki.rsa.PublicKey).n.equals((llave as forge.pki.rsa.PrivateKey).n)) ??
    certs[0]?.cert;
  if (!llave || !cert) throw new Error("El .p12 no trae la llave privada y el certificado.");
  const nombre = (a: forge.pki.CertificateField[]) =>
    a.find((x) => x.shortName === "CN")?.value?.toString() ?? a.map((x) => x.value).join(", ");
  return {
    llavePem: forge.pki.privateKeyToPem(llave),
    certPem: forge.pki.certificateToPem(cert),
    titular: nombre(cert.subject.attributes),
    emisor: nombre(cert.issuer.attributes),
    desde: cert.validity.notBefore,
    hasta: cert.validity.notAfter,
  };
}

// ---------------------------------------------------------------------------
// Firma XMLDSig (envuelta, al final del elemento raíz)
// ---------------------------------------------------------------------------
export function firmar(xml: string, c: Certificado): { xml: string; firma: string } {
  const sig = new SignedXml({
    privateKey: c.llavePem,
    publicCert: c.certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });
  sig.addReference({
    xpath: "/*",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    isEmptyUri: true,
  });
  sig.computeSignature(xml, { location: { reference: "/*", action: "append" } });
  const firmado = sig.getSignedXml();
  const firma = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(firmado)?.[1]?.replace(/\s+/g, "") ?? "";
  return { xml: firmado, firma };
}

// ---------------------------------------------------------------------------
// Comunicación con la DGII
// ---------------------------------------------------------------------------
function multipart(xml: string, nombre: string): FormData {
  const fd = new FormData();
  fd.append("xml", new Blob([xml], { type: "text/xml" }), nombre);
  return fd;
}

async function leerRespuesta(res: Response): Promise<Record<string, unknown>> {
  const texto = await res.text();
  try {
    return JSON.parse(texto);
  } catch {
    return { mensaje: texto.slice(0, 500) };
  }
}

/** semilla → firmar → token. `base` es la URL de ecf o de fc según a dónde se enviará. */
export async function obtenerToken(base: string, c: Certificado): Promise<string> {
  const r1 = await fetch(`${base}/autenticacion/api/autenticacion/semilla`, { signal: AbortSignal.timeout(ESPERA_MS) });
  if (!r1.ok) throw new Error(`La DGII no entregó la semilla (HTTP ${r1.status}).`);
  const semilla = await r1.text();
  const { xml } = firmar(semilla, c);
  const r2 = await fetch(`${base}/autenticacion/api/autenticacion/validarsemilla`, {
    method: "POST",
    body: multipart(xml, "semilla.xml"),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  const j = await leerRespuesta(r2);
  const token = (j.token ?? j.Token) as string | undefined;
  if (!r2.ok || !token) throw new Error(`La DGII rechazó el certificado: ${String(j.mensaje ?? j.message ?? `HTTP ${r2.status}`)}`);
  return token;
}

export interface Envio {
  trackId?: string;
  estado?: string;
  mensajes?: unknown;
  crudo: Record<string, unknown>;
}

export async function enviarEcf(base: string, token: string, xml: string, nombre: string): Promise<Envio> {
  const res = await fetch(`${base}/recepcion/api/facturaselectronicas`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: multipart(xml, nombre),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  const j = await leerRespuesta(res);
  if (!res.ok && !j.trackId) throw new Error(`La DGII no recibió el e-CF: ${String(j.mensaje ?? j.error ?? `HTTP ${res.status}`)}`);
  return { trackId: (j.trackId ?? j.TrackId) as string | undefined, crudo: j };
}

export async function enviarResumen(baseFc: string, token: string, xml: string, nombre: string): Promise<Envio> {
  const res = await fetch(`${baseFc}/recepcionfc/api/recepcion/ecf`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: multipart(xml, nombre),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  const j = await leerRespuesta(res);
  if (!res.ok && !j.estado) throw new Error(`La DGII no recibió el resumen: ${String(j.mensaje ?? j.error ?? `HTTP ${res.status}`)}`);
  return { estado: j.estado as string | undefined, mensajes: j.mensajes, crudo: j };
}

export async function consultarEstado(base: string, token: string, trackId: string): Promise<Envio> {
  const res = await fetch(`${base}/consultaresultado/api/consultas/estado?trackid=${encodeURIComponent(trackId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  const j = await leerRespuesta(res);
  if (!res.ok) throw new Error(`No se pudo consultar el estado: ${String(j.mensaje ?? `HTTP ${res.status}`)}`);
  return { trackId, estado: j.estado as string | undefined, mensajes: j.mensajes, crudo: j };
}

/** "Aceptado", "Aceptado Condicional", "Rechazado", "En Proceso" → estado de MEDORA. */
export function estadoMedora(estadoDgii: string | undefined): "aceptado" | "aceptado_condicional" | "rechazado" | "enviado" {
  const e = (estadoDgii ?? "").toLowerCase();
  if (e.includes("condicional")) return "aceptado_condicional";
  if (e.includes("aceptado")) return "aceptado";
  if (e.includes("rechazado")) return "rechazado";
  return "enviado";
}

// ---------------------------------------------------------------------------
// XML del e-CF y del resumen (RFCE)
// ---------------------------------------------------------------------------
export interface DatosComprobante {
  tipo: string; // E31, E32, E44, E45
  encf: string;
  venceSecuencia: string | null; // yyyy-mm-dd
  fecha: Date;
  emisor: { rnc: string; razonSocial: string; direccion: string };
  comprador: { rnc: string | null; nombre: string | null };
  items: { descripcion: string; cantidad: number; precio: number; monto: number }[];
  descuento: number;
  total: number;
  credito: number;
  pagos: { metodo: string; monto: number }[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const m2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const dosDig = (n: number) => String(n).padStart(2, "0");

/** Fecha y hora en Santo Domingo (UTC−4, sin horario de verano). */
function rd(fecha: Date) {
  const d = new Date(fecha.getTime() - 4 * 3600_000);
  return {
    dia: `${dosDig(d.getUTCDate())}-${dosDig(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`,
    hora: `${dosDig(d.getUTCHours())}:${dosDig(d.getUTCMinutes())}:${dosDig(d.getUTCSeconds())}`,
  };
}

const FORMA_PAGO: Record<string, number> = { efectivo: 1, cheque: 2, transferencia: 2, tarjeta: 3, anticipo: 8, otro: 8 };

function formasPago(d: DatosComprobante): string {
  const lineas = d.pagos.filter((p) => p.monto > 0).map((p) => ({ forma: FORMA_PAGO[p.metodo] ?? 8, monto: p.monto }));
  if (d.credito > 0) lineas.push({ forma: 4, monto: d.credito });
  if (lineas.length === 0) return "";
  return `<TablaFormasPago>${lineas.map((l) => `<FormaDePago><FormaPago>${l.forma}</FormaPago><MontoPago>${m2(l.monto)}</MontoPago></FormaDePago>`).join("")}</TablaFormasPago>`;
}

function idDoc(d: DatosComprobante, resumen: boolean): string {
  const tipo = d.tipo.slice(1);
  const vence = d.venceSecuencia && !resumen ? (() => {
    const [a, m, dd] = d.venceSecuencia.split("-");
    return `<FechaVencimientoSecuencia>${dd}-${m}-${a}</FechaVencimientoSecuencia>`;
  })() : "";
  return (
    `<IdDoc><TipoeCF>${tipo}</TipoeCF><eNCF>${d.encf}</eNCF>${vence}` +
    `<TipoIngresos>01</TipoIngresos><TipoPago>${d.credito > 0 ? 2 : 1}</TipoPago>${formasPago(d)}</IdDoc>`
  );
}

function comprador(d: DatosComprobante): string {
  if (!d.comprador.rnc) return "";
  const rnc = d.comprador.rnc.replace(/\D/g, "");
  return `<Comprador><RNCComprador>${rnc}</RNCComprador>${d.comprador.nombre ? `<RazonSocialComprador>${esc(d.comprador.nombre.slice(0, 150))}</RazonSocialComprador>` : ""}</Comprador>`;
}

/** Servicios de salud: exentos de ITBIS (IndicadorFacturacion 4). */
export function xmlEcf(d: DatosComprobante): string {
  const f = rd(d.fecha);
  const items = d.items
    .filter((i) => i.monto > 0)
    .map(
      (i, n) =>
        `<Item><NumeroLinea>${n + 1}</NumeroLinea><IndicadorFacturacion>4</IndicadorFacturacion>` +
        `<NombreItem>${esc(i.descripcion.slice(0, 80))}</NombreItem><IndicadorBienoServicio>2</IndicadorBienoServicio>` +
        `<CantidadItem>${m2(i.cantidad)}</CantidadItem><PrecioUnitarioItem>${m2(i.monto / i.cantidad)}</PrecioUnitarioItem>` +
        `<MontoItem>${m2(i.monto)}</MontoItem></Item>`,
    )
    .join("");
  const descuento =
    d.descuento > 0
      ? `<DescuentosORecargos><DescuentoORecargo><NumeroLinea>1</NumeroLinea><TipoAjuste>D</TipoAjuste>` +
        `<DescripcionDescuentooRecargo>Descuento</DescripcionDescuentooRecargo><TipoValor>$</TipoValor>` +
        `<MontoDescuentooRecargo>${m2(d.descuento)}</MontoDescuentooRecargo>` +
        `<IndicadorFacturacionDescuentooRecargo>4</IndicadorFacturacionDescuentooRecargo></DescuentoORecargo></DescuentosORecargos>`
      : "";
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<ECF><Encabezado><Version>1.0</Version>${idDoc(d, false)}` +
    `<Emisor><RNCEmisor>${d.emisor.rnc}</RNCEmisor><RazonSocialEmisor>${esc(d.emisor.razonSocial.slice(0, 150))}</RazonSocialEmisor>` +
    `<DireccionEmisor>${esc((d.emisor.direccion || "-").slice(0, 100))}</DireccionEmisor><FechaEmision>${f.dia}</FechaEmision></Emisor>` +
    comprador(d) +
    `<Totales><MontoExento>${m2(d.total)}</MontoExento><MontoTotal>${m2(d.total)}</MontoTotal></Totales></Encabezado>` +
    `<DetallesItems>${items}</DetallesItems>${descuento}` +
    `<FechaHoraFirma>${f.dia} ${f.hora}</FechaHoraFirma></ECF>`
  );
}

/** Resumen de Factura de Consumo (E32 < RD$250,000): lleva el código de seguridad del e-CF. */
export function xmlResumen(d: DatosComprobante, codigoSeguridad: string): string {
  const f = rd(d.fecha);
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<RFCE><Encabezado><Version>1.0</Version>${idDoc(d, true)}` +
    `<Emisor><RNCEmisor>${d.emisor.rnc}</RNCEmisor><RazonSocialEmisor>${esc(d.emisor.razonSocial.slice(0, 150))}</RazonSocialEmisor>` +
    `<FechaEmision>${f.dia}</FechaEmision></Emisor>` +
    comprador(d) +
    `<Totales><MontoExento>${m2(d.total)}</MontoExento><MontoTotal>${m2(d.total)}</MontoTotal></Totales>` +
    `<CodigoSeguridadeCF>${codigoSeguridad}</CodigoSeguridadeCF></Encabezado></RFCE>`
  );
}

/** URL del QR del comprobante impreso (consulta del timbre en la DGII). */
export function urlQr(base: { ecf: string; fc: string }, d: DatosComprobante, codigo: string, fechaFirma: Date, resumen: boolean): string {
  const f = rd(d.fecha);
  const firma = rd(fechaFirma);
  const p = new URLSearchParams();
  p.set("RncEmisor", d.emisor.rnc);
  if (resumen) {
    p.set("ENCF", d.encf);
    p.set("MontoTotal", m2(d.total));
    p.set("CodigoSeguridad", codigo);
    return `${base.fc}/ConsultaTimbreFC?${p}`;
  }
  if (d.comprador.rnc) p.set("RncComprador", d.comprador.rnc.replace(/\D/g, ""));
  p.set("ENCF", d.encf);
  p.set("FechaEmision", f.dia);
  p.set("MontoTotal", m2(d.total));
  p.set("FechaFirma", `${firma.dia} ${firma.hora}`);
  p.set("CodigoSeguridad", codigo);
  return `${base.ecf}/ConsultaTimbre?${p}`;
}

export function fechaFirmaDeXml(xml: string, respaldo: Date): Date {
  const m = /<FechaHoraFirma>(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})<\/FechaHoraFirma>/.exec(xml);
  if (!m) return respaldo;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] + 4, +m[5], +m[6]));
}
