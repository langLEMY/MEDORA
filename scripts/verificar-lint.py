"""Falla si `supabase db lint --level error` encuentra algo real.

plpgsql_check revisa cada función sin ejecutarla, así que no ve las tablas temporales
que la propia función crea al correr (create temp table _x ... / pg_temp.x) y las da por
inexistentes (42P01). Solo esos avisos se ignoran; cualquier otro error rompe el CI.

    supabase db lint --local --level error > lint.txt
    python3 scripts/verificar-lint.py lint.txt
"""
import json
import re
import sys

TEMPORAL = re.compile(r'relation "(pg_temp\.\w+|_\w+)" does not exist')


def leer(ruta: str) -> list[dict]:
    texto = open(ruta, encoding="utf-8").read()
    # La salida trae líneas de progreso ("Linting schema: …") antes del JSON.
    inicio = re.search(r"^\[", texto, re.M)
    if not inicio:
        return []
    datos, _ = json.JSONDecoder().raw_decode(texto[inicio.start():])
    return datos


def main() -> int:
    reales, ignorados = [], 0
    for funcion in leer(sys.argv[1]):
        for aviso in funcion.get("issues", []):
            if aviso.get("sqlState") == "42P01" and TEMPORAL.search(aviso.get("message", "")):
                ignorados += 1
                continue
            reales.append((funcion.get("function"), aviso.get("message")))
    for nombre, mensaje in reales:
        print(f"::error::{nombre}: {mensaje}")
    print(f"Lint de funciones: {len(reales)} errores, {ignorados} tablas temporales ignoradas.")
    return 1 if reales else 0


if __name__ == "__main__":
    sys.exit(main())
