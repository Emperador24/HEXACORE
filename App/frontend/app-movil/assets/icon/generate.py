import math
from PIL import Image, ImageDraw, ImageChops

ACCENT = (0x2F, 0x6B, 0xFF)
GLOW = (0x7F, 0xA6, 0xFF)
BG = (0x0B, 0x0F, 0x1A)
SIZE = 1024


def hexagon_points(cx, cy, r, offset_deg=0.0):
    pts = []
    for k in range(6):
        theta = math.radians(60 * k + offset_deg)
        x = cx + r * math.cos(theta)
        y = cy - r * math.sin(theta)
        pts.append((x, y))
    return pts


def inset(pt, cx, cy, factor=0.985):
    return (cx + (pt[0] - cx) * factor, cy + (pt[1] - cy) * factor)


def make_icon(path, hex_radius, transparent):
    cx = cy = SIZE / 2
    pts = hexagon_points(cx, cy, hex_radius)

    # Todo el contenido del hexágono (relleno + resplandor + brillo) se dibuja en
    # una capa aparte y se recorta a la silueta exacta del hexágono al final, para
    # que nada (ni el trazo del resplandor) se salga del borde hacia el fondo.
    # ImageDraw SOBREESCRIBE los píxeles en vez de mezclarlos con lo que ya había
    # debajo, así que cada capa semitransparente (resplandor, brillo) se dibuja en
    # su propio lienzo transparente y se funde con `alpha_composite` en orden,
    # para que sí se mezclen con el relleno azul en vez de con lo que venga después.
    hex_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(hex_layer).polygon(pts, fill=ACCENT + (255,))

    # Resplandor en el borde superior (60deg->120deg) y superior-izquierdo (120deg->180deg).
    glow_pts = [inset(pts[1], cx, cy), inset(pts[2], cx, cy), inset(pts[3], cx, cy)]
    glow_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(glow_layer).line(glow_pts, fill=GLOW + (220,), width=14, joint="curve")
    hex_layer = Image.alpha_composite(hex_layer, glow_layer)

    # Brillo suave tipo vidrio cerca de la esquina superior.
    ow, oh = hex_radius * 0.9, hex_radius * 0.55
    ox, oy = cx - hex_radius * 0.28, cy - hex_radius * 0.55
    shine_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(shine_layer).ellipse(
        [ox - ow / 2, oy - oh / 2, ox + ow / 2, oy + oh / 2], fill=(255, 255, 255, 38)
    )
    hex_layer = Image.alpha_composite(hex_layer, shine_layer)

    hex_mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(hex_mask).polygon(pts, fill=255)
    hex_layer.putalpha(ImageChops.multiply(hex_layer.split()[3], hex_mask))

    if transparent:
        img = hex_layer
    else:
        img = Image.new("RGBA", (SIZE, SIZE), BG + (255,))
        img = Image.alpha_composite(img, hex_layer)

    if transparent:
        img.save(path)
    else:
        img.convert("RGB").save(path)


make_icon("assets/icon/icon.png", hex_radius=340, transparent=False)
make_icon("assets/icon/icon_foreground.png", hex_radius=230, transparent=True)
print("generated icon.png + icon_foreground.png")
