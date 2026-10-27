"""Corre un .sql de pruebas contra Postgres y guarda el último resultado con filas como JSON.

Uso: python3 scripts/correr-bateria.py <dsn> <archivo.sql> <salida.json>

`supabase db query --local` usa sentencias preparadas y no acepta archivos con varias
sentencias; con psycopg (protocolo simple) sí. La salida tiene la misma forma que
`supabase db query --output-format json` ({"rows": [...]}), la que lee verificar-baterias.py.
"""
import json
import sys

import psycopg


def main():
    dsn, archivo, salida = sys.argv[1:4]
    with open(archivo, encoding="utf-8") as f:
        sql = f.read()
    filas = []
    with psycopg.connect(dsn, autocommit=True) as conexion:
        cursor = conexion.cursor()
        cursor.execute(sql)
        while True:
            if cursor.description:
                columnas = [c.name for c in cursor.description]
                filas = [dict(zip(columnas, fila)) for fila in cursor.fetchall()]
            if not cursor.nextset():
                break
    with open(salida, "w", encoding="utf-8") as f:
        json.dump({"rows": filas}, f, ensure_ascii=False, default=str)
    print(f"{archivo}: {len(filas)} filas")


if __name__ == "__main__":
    main()
