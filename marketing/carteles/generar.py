"""Genera los carteles en PDF (para imprimir) y PNG (para verlos) con Chrome headless.

Uso:  py marketing/carteles/generar.py
Necesita: pip install qrcode, y Google Chrome instalado. Cada diseño lleva su
propio QR con ?utm_source=cartel-<diseño>, que GoatCounter enseña como origen
de la visita: así se sabe qué cartel funciona.
"""
import os, subprocess, tempfile
import qrcode, qrcode.image.svg

AQUI = os.path.dirname(os.path.abspath(__file__))
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
PX = {'A3': (1123, 1587), 'A4': (794, 1123), 'A5': (559, 794), 'tarjeta': (321, 208), 'posit': (287, 287)}
CARTELES = [(c, t) for c in ['pregunta', 'lista', 'catorce', 'universidad', 'amigos'] for t in ['A3', 'A4', 'A5']]
CARTELES += [('tiras', 'A4'), ('tarjeta', 'tarjeta'), ('posit', 'posit')]


def qr_svg(diseno):
    url = f'https://appbitacora.es/?utm_source=cartel-{diseno}'
    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, border=1, box_size=10)
    return img.to_string(encoding='unicode').replace('\n', '')


def main():
    plantilla = open(os.path.join(AQUI, 'carteles.html'), encoding='utf-8').read()
    perfil = os.path.join(tempfile.gettempdir(), 'bitacora-carteles-chrome')
    for carpeta in ('pdf', 'png'):
        os.makedirs(os.path.join(AQUI, carpeta), exist_ok=True)
    for diseno, tam in CARTELES:
        html = plantilla.replace("const qr = window.QR || '';", 'const qr = `' + qr_svg(diseno) + '`;')
        tmp = os.path.join(AQUI, f'_tmp_{diseno}_{tam}.html')
        open(tmp, 'w', encoding='utf-8').write(html)
        url = 'file:///' + tmp.replace('\\', '/') + f'?c={diseno}&tam={tam}'
        nombre = f'{diseno}-{tam}'.lower()
        comun = [CHROME, '--headless=new', f'--user-data-dir={perfil}', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=8000']
        subprocess.run(comun + ['--no-pdf-header-footer', f'--print-to-pdf={os.path.join(AQUI, "pdf", nombre + ".pdf")}', url], capture_output=True, timeout=90)
        w, h = PX[tam]
        escala = 1 if tam in ('tarjeta', 'posit') else 2
        if escala == 1: w, h = w * 2, h * 2
        subprocess.run(comun + [f'--force-device-scale-factor={escala}', f'--window-size={w},{h}', f'--screenshot={os.path.join(AQUI, "png", nombre + ".png")}', url], capture_output=True, timeout=90)
        os.remove(tmp)
        print('ok', nombre)


if __name__ == '__main__':
    main()
