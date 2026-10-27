"""Revisa la salida JSON de las baterías SQL (supabase db query --output-format json).

Uso: python3 scripts/verificar-baterias.py <funcional_roles.json> <rls_aislamiento.json>
Sale con código 1 si alguna prueba falla o si una batería no devolvió resultados.
"""
import json
import sys


def filas(ruta):
    with open(ruta, encoding="utf-8-sig") as f:
        texto = f.read()
    datos = json.loads(texto)
    # El CLI devuelve {"rows": [...]} (o una lista de resultados si hubo varias sentencias).
    resultados = datos if isinstance(datos, list) else [datos]
    salida = []
    for r in resultados:
        salida.extend(r.get("rows", []) if isinstance(r, dict) else [])
    return salida


def main():
    fallas = 0
    funcional = [f for f in filas(sys.argv[1]) if "resultado" in f]
    if not funcional:
        print("::error::funcional_roles.sql no devolvió pruebas")
        fallas += 1
    for f in funcional:
        estado = f["resultado"]
        print(f"{estado:5}  {f.get('area', '')} · {f.get('prueba', '')}")
        if estado != "OK":
            print(f"::error::{f.get('area')} · {f.get('prueba')}: {f.get('detalle')}")
            fallas += 1

    esperado = {
        "A ve pacientes": lambda v: v == "1",
        "A ve sistemas": lambda v: v == "Sistema A",
        "A cobro": lambda v: '"total": 1500' in v.replace('"total":1500', '"total": 1500'),
        "B ve pacientes": lambda v: v == "Beto",
        "B ve cobros": lambda v: v == "0",
        "B ve auditoria": lambda v: v == "0",
        "B inserta en A": lambda v: v.startswith("bloqueado"),
        "B se hace superadmin": lambda v: v.startswith("bloqueado"),
    }
    rls = {f.get("t"): str(f.get("v")) for f in filas(sys.argv[2])}
    for prueba, cumple in esperado.items():
        v = rls.get(prueba)
        ok = v is not None and cumple(v)
        print(f"{'OK' if ok else 'FALLA':5}  RLS · {prueba} → {v}")
        if not ok:
            print(f"::error::RLS · {prueba}: {v}")
            fallas += 1

    print(f"\n{len(funcional) + len(esperado) - fallas} OK, {fallas} con falla")
    sys.exit(1 if fallas else 0)


if __name__ == "__main__":
    main()
