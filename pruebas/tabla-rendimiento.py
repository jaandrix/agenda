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
print('| medida | antes (fin de la 0.22) | este commit |')
print('|---|---:|---:|')
for k in sorted(set(antes) | set(ahora)):
    celda = lambda v: f'{v[0]} ({v[1]}–{v[2]})' if v else ''
    print(f'| {k} | {celda(antes.get(k))} | {celda(ahora.get(k))} |')

# La misma tabla en una anotación «notice» (se lee con la API pública sin sesión; el resumen no).
if '--anotacion' in sys.argv:
    filas = [f'{k}: {(antes.get(k) or ("-",))[0]} -> {(ahora.get(k) or ("-",))[0]}' for k in sorted(set(antes) | set(ahora))]
    print('::notice title=Rendimiento (ms, antes -> este commit)::' + '%0A'.join(filas), file=sys.stderr)

# 0.23 (auditoría): puerta de rendimiento. Con --umbral N, falla si alguna medida que está en los dos registros empeora
# más de un N % y más de 5 ms (por debajo, el ruido del simulador del runner lo decide todo).
if '--umbral' in sys.argv:
    umbral = float(sys.argv[sys.argv.index('--umbral') + 1])
    peores = []
    for k in sorted(set(antes) & set(ahora)):
        a, b = float(antes[k][0]), float(ahora[k][0])
        if b - a > 5 and b > a * (1 + umbral / 100):
            peores.append(f'{k}: {a:.1f} -> {b:.1f} ms')
    for p in peores:
        print(f'::error title=Rendimiento peor que el umbral ({umbral:g} %)::{p}', file=sys.stderr)
    if peores:
        sys.exit(1)
