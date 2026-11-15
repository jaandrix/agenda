# Junta las líneas «MEDIDA|nombre|mediana|mín|máx» de dos registros de RendimientoAppTests (antes y ahora) en una tabla
# Markdown para el resumen del workflow ios-nativa.yml.
import re
import sys


def leer(nombre):
    r = {}
    try:
        texto = open(nombre, encoding='utf-8', errors='replace').read()
    except OSError:
        return r
    for m in re.finditer(r'MEDIDA\|([^|\n]+)\|([0-9.]+)\|([0-9.]+)\|([0-9.]+)', texto):
        r[m.group(1)] = (m.group(2), m.group(3), m.group(4))
    return r


antes, ahora = leer(sys.argv[1]), leer(sys.argv[2])
print('## Rendimiento (Release, simulador del runner)\n')
print('Documento de prueba: 6.000 movimientos, 745 entradas, unas 520 tareas y la despensa llena. '
      'Mediana de 7 vueltas en ms (entre paréntesis, mín.–máx.).\n')
print('| medida | 0.21 (antes) | este commit |')
print('|---|---:|---:|')
for k in sorted(set(antes) | set(ahora)):
    celda = lambda v: f'{v[0]} ({v[1]}–{v[2]})' if v else ''
    print(f'| {k} | {celda(antes.get(k))} | {celda(ahora.get(k))} |')
