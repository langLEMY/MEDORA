import { assert, assertEquals, assertMatch, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import forge from "npm:node-forge@1.3.1";
import { SignedXml } from "npm:xml-crypto@6.1.2";
import { type DatosComprobante, estadoMedora, fechaFirmaDeXml, firmar, leerCertificado, urlQr, xmlEcf, xmlResumen } from "./dgii.ts";

/** .p12 de prueba (RSA 2048, autofirmado) en base64, como lo guarda la integración. */
function p12DePrueba(clave: string): string {
  const llaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = llaves.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2026-01-01T00:00:00Z");
  cert.validity.notAfter = new Date("2028-01-01T00:00:00Z");
  const nombre = [{ shortName: "CN", value: "FUNDACION DE PRUEBA" }];
  cert.setSubject(nombre);
  cert.setIssuer(nombre);
  cert.sign(llaves.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(llaves.privateKey, [cert], clave, { algorithm: "3des" });
  return forge.util.encode64(forge.asn1.toDer(asn1).getBytes());
}

const P12 = p12DePrueba("clave-p12");

const base: DatosComprobante = {
  tipo: "E32",
  encf: "E320000000001",
  venceSecuencia: "2027-12-31",
  // 15:05:09 en Santo Domingo.
  fecha: new Date("2026-10-28T19:05:09Z"),
  emisor: { rnc: "401000001", razonSocial: "Fundación <Prueba> & Cía", direccion: "" },
  comprador: { rnc: null, nombre: null },
  items: [
    { descripcion: "Consulta general", cantidad: 1, precio: 1500, monto: 1500 },
    { descripcion: "Línea en cero", cantidad: 1, precio: 0, monto: 0 },
  ],
  descuento: 0,
  total: 1500,
  credito: 0,
  pagos: [{ metodo: "efectivo", monto: 1000 }, { metodo: "tarjeta", monto: 500 }],
};

Deno.test("leerCertificado abre el .p12 y saca titular y vigencia", () => {
  const c = leerCertificado(P12, "clave-p12");
  assertEquals(c.titular, "FUNDACION DE PRUEBA");
  assertEquals(c.hasta.toISOString(), "2028-01-01T00:00:00.000Z");
  assertStringIncludes(c.llavePem, "PRIVATE KEY");
});

Deno.test("leerCertificado con clave equivocada da un mensaje claro", () => {
  assertThrows(() => leerCertificado(P12, "otra"), Error, "revisa el archivo .p12 y su clave");
});

Deno.test("xmlEcf: fecha de Santo Domingo, escapes, formas de pago y sin líneas en cero", () => {
  const xml = xmlEcf(base);
  assertStringIncludes(xml, "<FechaEmision>28-10-2026</FechaEmision>");
  assertStringIncludes(xml, "<FechaHoraFirma>28-10-2026 15:05:09</FechaHoraFirma>");
  assertStringIncludes(xml, "Fundación &lt;Prueba&gt; &amp; Cía");
  assertStringIncludes(xml, "<DireccionEmisor>-</DireccionEmisor>");
  assertStringIncludes(xml, "<FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia>");
  assertStringIncludes(xml, "<FormaPago>1</FormaPago><MontoPago>1000.00</MontoPago>");
  assertStringIncludes(xml, "<FormaPago>3</FormaPago><MontoPago>500.00</MontoPago>");
  assertEquals(xml.match(/<Item>/g)?.length, 1);
  assertStringIncludes(xml, "<MontoTotal>1500.00</MontoTotal>");
});

Deno.test("xmlEcf: nota de crédito E34 lleva InformacionReferencia y no formas de pago", () => {
  const xml = xmlEcf({
    ...base,
    tipo: "E34",
    encf: "E340000000001",
    referencia: { encf: "E320000000001", fecha: new Date("2026-09-01T15:00:00Z"), codigo: 1, razon: "Cobro duplicado" },
  });
  assertStringIncludes(xml, "<TipoeCF>34</TipoeCF>");
  assertStringIncludes(xml, "<IndicadorNotaCredito>1</IndicadorNotaCredito>"); // más de 30 días
  assertStringIncludes(xml, "<NCFModificado>E320000000001</NCFModificado><FechaNCFModificado>01-09-2026</FechaNCFModificado>");
  assert(!xml.includes("<TablaFormasPago>"));
  assert(!xml.includes("<FechaVencimientoSecuencia>"));
});

Deno.test("firmar: XMLDSig RSA-SHA256 válido y código de seguridad de la firma", () => {
  const c = leerCertificado(P12, "clave-p12");
  const { xml, firma } = firmar(xmlEcf(base), c);
  assertMatch(firma, /^[A-Za-z0-9+/=]{300,}$/);
  assertStringIncludes(xml, "</Signature></ECF>"); // firma envuelta, al final de la raíz

  const verificador = new SignedXml({ publicCert: c.certPem });
  const nodo = /<Signature[\s\S]*<\/Signature>/.exec(xml)![0];
  verificador.loadSignature(nodo);
  assert(verificador.checkSignature(xml), "la firma debe verificar con el certificado");

  // Cualquier cambio en el comprobante invalida la firma.
  const alterado = xml.replace("<MontoTotal>1500.00</MontoTotal>", "<MontoTotal>150.00</MontoTotal>");
  const otro = new SignedXml({ publicCert: c.certPem });
  otro.loadSignature(nodo);
  let valida = true;
  try {
    valida = otro.checkSignature(alterado);
  } catch {
    valida = false;
  }
  assert(!valida, "un XML alterado no debe verificar");
});

Deno.test("xmlResumen y urlQr del consumo (RFCE)", () => {
  const xml = xmlResumen(base, "ABC123");
  assertStringIncludes(xml, "<CodigoSeguridadeCF>ABC123</CodigoSeguridadeCF>");
  assert(!xml.includes("<FechaVencimientoSecuencia>"));
  const url = new URL(urlQr({ ecf: "https://ecf.dgii.gov.do/testecf", fc: "https://fc.dgii.gov.do/testecf" }, base, "ABC123", base.fecha, true));
  assertEquals(url.pathname, "/testecf/ConsultaTimbreFC");
  assertEquals(url.searchParams.get("MontoTotal"), "1500.00");
});

Deno.test("fechaFirmaDeXml devuelve la misma hora con que se firmó", () => {
  assertEquals(fechaFirmaDeXml(xmlEcf(base), new Date(0)).toISOString(), base.fecha.toISOString());
  assertEquals(fechaFirmaDeXml("<ECF/>", new Date(0)).getTime(), 0);
});

Deno.test("estadoMedora traduce las respuestas de la DGII", () => {
  assertEquals(estadoMedora("Aceptado Condicional"), "aceptado_condicional");
  assertEquals(estadoMedora("Aceptado"), "aceptado");
  assertEquals(estadoMedora("Rechazado"), "rechazado");
  assertEquals(estadoMedora("En Proceso"), "enviado");
  assertEquals(estadoMedora(undefined), "enviado");
});
