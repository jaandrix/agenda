"""Genera los carteles en blanco y negro: un PDF A4 por modelo con 4 copias A6.

Uso:  py marketing/carteles-bn/generar.py
Necesita: pip install qrcode opencv-python-headless pillow, y Google Chrome.
Cada QR lleva corrección de errores máxima (H, 30 %) para que la "b." del
centro no impida leerlo, y al final se comprueba con OpenCV que las 4 copias
de cada folio se leen y llevan a la dirección correcta.
"""
import os, subprocess, tempfile
import cv2, qrcode, qrcode.image.svg

AQUI = os.path.dirname(os.path.abspath(__file__))
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
MODELOS = ['no-cambia', 'donde', 'examen', 'pizza', 'manana', 'sin-anuncios', 'anuncio', 'semana', 'cuatri-1', 'cuatri-2', 'examenes', 'habitos', 'cuentas']


def url_de(m):
    return f'https://appbitacora.es/?utm_source=cartel-bn-{m}'


def qr_svg(m):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=2, box_size=10, image_factory=qrcode.image.svg.SvgPathImage)
    q.add_data(url_de(m))
    return q.make_image().to_string(encoding='unicode').replace('\n', '')


def comprobar(png, m):
    img = cv2.imread(png)
    det = cv2.QRCodeDetector()
    h, w = img.shape[:2]
    leidos = []
    for fila in range(2):
        for col in range(2):
            # Solo la esquina inferior derecha de cada copia, donde está el QR:
            # como lo encuadra una cámara, sin el grano del resto del cartel.
            x0, y0 = col * w // 2 + w // 4, fila * h // 2 + h // 4
            trozo = img[y0:(fila + 1) * h // 2, x0:(col + 1) * w // 2]
            texto, _, _ = det.detectAndDecode(trozo)
            leidos.append(texto == url_de(m))
    return leidos


def main():
    plantilla = open(os.path.join(AQUI, 'carteles-bn.html'), encoding='utf-8').read()
    perfil = os.path.join(tempfile.gettempdir(), 'bitacora-carteles-chrome')
    for carpeta in ('pdf', 'png'):
        os.makedirs(os.path.join(AQUI, carpeta), exist_ok=True)
    for m in MODELOS:
        html = plantilla.replace("const qr = window.QR || '';", 'const qr = `' + qr_svg(m) + '`;')
        tmp = os.path.join(AQUI, f'_tmp_{m}.html')
        open(tmp, 'w', encoding='utf-8').write(html)
        url = 'file:///' + tmp.replace('\\', '/') + f'?m={m}'
        comun = [CHROME, '--headless=new', f'--user-data-dir={perfil}', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=8000']
        subprocess.run(comun + ['--no-pdf-header-footer', f'--print-to-pdf={os.path.join(AQUI, "pdf", m + ".pdf")}', url], capture_output=True, timeout=90)
        png = os.path.join(AQUI, 'png', m + '.png')
        subprocess.run(comun + ['--force-device-scale-factor=2', '--window-size=794,1123', f'--screenshot={png}', url], capture_output=True, timeout=90)
        # La comprobación se hace a 5x: a 2x cada módulo del QR mide menos de
        # 3 píxeles, mucho menos de lo que ve una cámara sobre el papel.
        prueba = os.path.join(tempfile.gettempdir(), f'bitacora-qr-{m}.png')
        subprocess.run(comun + ['--force-device-scale-factor=5', '--window-size=794,1123', f'--screenshot={prueba}', url], capture_output=True, timeout=120)
        os.remove(tmp)
        print(m, 'QR leídos:', sum(comprobar(prueba, m)), 'de 4')
        os.remove(prueba)


if __name__ == '__main__':
    main()
