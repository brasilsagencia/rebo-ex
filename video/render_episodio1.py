"""Episódio 1: Chegada em Vice City — renderização procedural (synthwave/neon).

Gera 40 s de vídeo 1280x720 @ 24 fps com trilha e efeitos sonoros sintetizados.
Uso: python3 render_episodio1.py  -> episodio1_chegada.mp4
"""
import math
import os
import random
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS, DUR = 1280, 720, 24, 40
N = FPS * DUR
SR = 44100
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

PINK = (255, 46, 151)
CYAN = (0, 229, 255)
PURPLE = (120, 40, 200)
ORANGE = (255, 140, 60)
YELLOW = (255, 220, 90)

rng = random.Random(7)


def font(size, bold=True):
    return ImageFont.truetype(FONT_B if bold else FONT_R, size)


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def lerp_col(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def gradient(top, bottom, h=H, w=W):
    t = np.linspace(0, 1, h)[:, None]
    arr = np.array(top)[None, :] * (1 - t) + np.array(bottom)[None, :] * t
    arr = np.repeat(arr[:, None, :], w, axis=1)
    return Image.fromarray(arr.astype(np.uint8), "RGB")


SKY_SUNSET = gradient((40, 10, 70), (255, 120, 90))
SKY_DUSK = gradient((20, 5, 50), (200, 60, 120))
SKY_NIGHT = gradient((5, 3, 20), (40, 10, 60))

# Skyline (gerada uma vez, desenhada com deslocamento)
BUILDINGS = []
x = -200
while x < W * 2:
    bw = rng.randint(40, 110)
    bh = rng.randint(120, 380)
    BUILDINGS.append((x, bw, bh, rng.random()))
    x += bw + rng.randint(4, 20)
WINDOWS = {i: [(rng.randint(0, 1000), rng.randint(0, 1000), rng.random()) for _ in range(30)]
           for i in range(len(BUILDINGS))}


def draw_sun(d, cx, cy, r):
    for i in range(r, 0, -2):
        t = i / r
        d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=lerp_col(YELLOW, PINK, t))
    # listras synthwave
    for k in range(6):
        y = cy + int(r * (0.15 + k * 0.15))
        hgt = 2 + k * 2
        d.rectangle([cx - r, y, cx + r, y + hgt], fill=None)


def sun_stripes(img, cx, cy, r, sky):
    d = ImageDraw.Draw(img)
    for k in range(6):
        y = cy + int(r * (0.12 + k * 0.15))
        hgt = 2 + k * 2
        strip = sky.crop((cx - r, y, cx + r, y + hgt))
        img.paste(strip, (cx - r, y))
    return d


def draw_skyline(d, base_y, scale=1.0, offset=0, night=False, glass=True):
    for i, (bx, bw, bh, s) in enumerate(BUILDINGS):
        x0 = int((bx - offset) * scale + (1 - scale) * W / 2)
        w = int(bw * scale)
        h = int(bh * scale)
        if x0 > W or x0 + w < 0:
            continue
        top = base_y - h
        col = lerp_col((30, 15, 60), (70, 30, 110), s) if not night else lerp_col((10, 8, 30), (25, 15, 55), s)
        d.rectangle([x0, top, x0 + w, base_y], fill=col)
        if glass:
            # reflexo espelhado do pôr do sol
            d.rectangle([x0 + 2, top + 2, x0 + max(3, w // 4), base_y],
                        fill=lerp_col(col, (255, 120, 140) if not night else (60, 40, 120), 0.35))
        for (wx, wy, wl) in WINDOWS[i]:
            px = x0 + 4 + (wx % max(1, w - 8))
            py = top + 6 + (wy % max(1, h - 12))
            if wl > (0.55 if not night else 0.3):
                c = YELLOW if wl > 0.85 else (CYAN if wl > 0.7 else (255, 180, 220))
                d.rectangle([px, py, px + max(2, int(4 * scale)), py + max(2, int(5 * scale))], fill=c)


def draw_palm(d, x, base_y, height, sway=0.0, col=(15, 5, 25)):
    # tronco curvo
    pts = []
    for k in range(21):
        t = k / 20
        pts.append((x + math.sin(t * 1.4) * height * 0.12 + sway * t * t * height * 0.1,
                    base_y - t * height))
    for k in range(20):
        w = int(lerp(height * 0.05, height * 0.025, k / 20))
        d.line([pts[k], pts[k + 1]], fill=col, width=max(2, w))
    tx, ty = pts[-1]
    for a in range(9):
        ang = math.pi * (a / 8) + math.pi + sway * 0.15
        ln = height * 0.45
        prev = (tx, ty)
        for s in range(1, 9):
            t = s / 8
            px = tx + math.cos(ang) * ln * t
            py = ty + math.sin(ang) * ln * t * 0.6 + (ln * 0.35) * t * t
            d.line([prev, (px, py)], fill=col, width=max(2, int(height * 0.03 * (1 - t) + 2)))
            prev = (px, py)


def draw_convertible(d, x, y, s=1.0, col=PINK, people=True, hair_t=0.0, facing=1):
    """Conversível clássico visto de lado. (x,y) = ponto inferior central."""
    def P(px, py):
        return (x + px * s * facing, y + py * s)
    body = [P(-170, -20), P(-165, -55), P(-110, -62), P(-60, -66), P(-30, -95), P(30, -95),
            P(55, -68), P(150, -64), P(175, -50), P(178, -22), P(-170, -20)]
    # pessoas (atrás do para-brisa)
    if people:
        # ele (motorista)
        d.ellipse([*P(-5, -150), *P(25, -120)] if facing > 0 else [*P(25, -150), *P(-5, -120)], fill=(30, 15, 25))
        d.rectangle([*P(-8, -122), *P(28, -80)] if facing > 0 else [*P(28, -122), *P(-8, -80)], fill=(255, 120, 60))
        # ela
        hx = -60
        d.ellipse([*P(hx - 15, -145), *P(hx + 15, -115)] if facing > 0 else [*P(hx + 15, -145), *P(hx - 15, -115)],
                  fill=(40, 20, 30))
        for k in range(6):  # cabelo ao vento
            wv = math.sin(hair_t * 9 + k) * 6
            d.line([P(hx - 8, -138 + k * 3), P(hx - 55 - k * 4, -132 + k * 4 + wv)], fill=(90, 40, 30), width=max(2, int(4 * s)))
        d.rectangle([*P(hx - 10, -133), *P(hx + 14, -127)] if facing > 0 else [*P(hx + 14, -133), *P(hx - 10, -127)],
                    fill=(10, 10, 10))  # óculos
        d.rectangle([*P(hx - 14, -117), *P(hx + 16, -80)] if facing > 0 else [*P(hx + 16, -117), *P(hx - 14, -80)],
                    fill=(0, 200, 220))
    d.polygon(body, fill=col)
    d.line([P(-165, -45), P(175, -42)], fill=(255, 255, 255), width=max(1, int(2 * s)))
    # para-brisa
    d.line([P(40, -66), P(15, -110)], fill=(200, 240, 255), width=max(2, int(4 * s)))
    for wx in (-115, 115):
        cx, cy = P(wx, -20)
        r = 28 * s
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(15, 10, 20))
        d.ellipse([cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5], fill=(200, 200, 210))
    # farol
    hx, hy = P(172, -46)
    d.ellipse([hx - 6 * s, hy - 6 * s, hx + 6 * s, hy + 6 * s], fill=(255, 250, 200))


def draw_car_rear(d, cx, by, s=1.0, col=PINK, brake=False):
    """Conversível visto de trás (perseguição)."""
    w, h = 220 * s, 70 * s
    d.rounded_rectangle([cx - w / 2, by - h, cx + w / 2, by], radius=int(14 * s), fill=col)
    d.rectangle([cx - w / 2 + 8 * s, by - h - 10 * s, cx + w / 2 - 8 * s, by - h + 6 * s], fill=lerp_col(col, (0, 0, 0), 0.3))
    # cabeças
    for hx, c in ((-40, (40, 20, 30)), (40, (30, 15, 25))):
        d.ellipse([cx + hx * s - 16 * s, by - h - 48 * s, cx + hx * s + 16 * s, by - h - 14 * s], fill=c)
    lc = (255, 40, 40) if brake else (180, 20, 30)
    for side in (-1, 1):
        x0 = cx + side * (w / 2 - 30 * s)
        d.rectangle([x0 - 22 * s, by - h + 18 * s, x0 + 22 * s, by - h + 34 * s], fill=lc)
    d.rectangle([cx - 30 * s, by - 26 * s, cx + 30 * s, by - 12 * s], fill=(250, 250, 250))
    for side in (-1, 1):
        d.rectangle([cx + side * (w / 2 - 34 * s) - 18 * s, by - 6 * s, cx + side * (w / 2 - 34 * s) + 18 * s, by + 16 * s],
                    fill=(10, 8, 12))


def person(d, x, y, s=1.0, col=(20, 10, 30), step=0.0, accent=None):
    """Silhueta simples andando. (x,y)=pés."""
    d.ellipse([x - 9 * s, y - 92 * s, x + 9 * s, y - 74 * s], fill=col)
    d.rectangle([x - 10 * s, y - 74 * s, x + 10 * s, y - 38 * s], fill=accent or col)
    a = math.sin(step) * 12 * s
    d.line([(x, y - 38 * s), (x + a, y)], fill=col, width=max(2, int(6 * s)))
    d.line([(x, y - 38 * s), (x - a, y)], fill=col, width=max(2, int(6 * s)))
    d.line([(x, y - 70 * s), (x - a * 0.8, y - 42 * s)], fill=col, width=max(2, int(5 * s)))
    d.line([(x, y - 70 * s), (x + a * 0.8, y - 42 * s)], fill=col, width=max(2, int(5 * s)))


def glow_text(img, text, xy, size, col, anchor="mm", blur=8, bold=True):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    f = font(size, bold)
    ld.text(xy, text, font=f, fill=col + (255,), anchor=anchor)
    g = layer.filter(ImageFilter.GaussianBlur(blur))
    img.paste(Image.new("RGB", img.size, col), (0, 0), g)
    img.paste(Image.new("RGB", img.size, col), (0, 0), g)
    ImageDraw.Draw(img).text(xy, text, font=f, fill=lerp_col(col, (255, 255, 255), 0.6), anchor=anchor)


def subtitle(img, text, alpha=1.0):
    if alpha <= 0:
        return
    f = font(30, False)
    d = ImageDraw.Draw(img, "RGBA")
    bbox = d.textbbox((W / 2, H - 70), text, font=f, anchor="mm")
    d.rectangle([bbox[0] - 16, bbox[1] - 10, bbox[2] + 16, bbox[3] + 10], fill=(0, 0, 0, int(150 * alpha)))
    d.text((W / 2, H - 70), text, font=f, fill=(255, 255, 255, int(255 * alpha)), anchor="mm")


def vignette_and_grain(img, t, strength=0.55):
    arr = np.asarray(img).astype(np.float32)
    arr *= VIGNETTE[..., None]
    noise = np.random.default_rng(int(t * 1000)).normal(0, 6, (H // 4, W // 4))
    noise = np.kron(noise, np.ones((4, 4)))[:H, :W]
    arr += noise[..., None]
    # scanlines leves
    arr[::3] *= 0.94
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


yy, xx = np.mgrid[0:H, 0:W]
VIGNETTE = 1 - 0.55 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) ** 1.4 * 0.6
VIGNETTE = np.clip(VIGNETTE, 0.35, 1).astype(np.float32)


def letterbox(img):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 54], fill=(0, 0, 0))
    d.rectangle([0, H - 54, W, H], fill=(0, 0, 0))


# ---------------------------------------------------------------- CENAS

def scene_aerial(t):  # 0–4 s: descida aérea por palmeiras e prédios espelhados
    p = ease(t / 4)
    img = SKY_SUNSET.copy()
    d = ImageDraw.Draw(img)
    horizon = int(lerp(620, 470, p))
    sun_y = horizon - int(lerp(90, 40, p))
    draw_sun(d, W // 2, sun_y, 120)
    sun_stripes(img, W // 2, sun_y, 120, SKY_SUNSET)
    d = ImageDraw.Draw(img)
    # mar
    d.rectangle([0, horizon, W, H], fill=(30, 20, 80))
    for k in range(40):
        yk = horizon + int((k / 40) ** 1.6 * (H - horizon))
        shim = (math.sin(k * 1.7 + t * 3) + 1) / 2
        d.line([(W / 2 - 60 - k * 6 * shim, yk), (W / 2 + 60 + k * 6 * shim, yk)], fill=(255, 150, 120), width=1)
    # skyline à beira-mar, cresce enquanto a câmera desce
    scale = lerp(0.8, 1.6, p)
    draw_skyline(d, horizon + 4, scale=scale, offset=200 + t * 30)
    # avenida / calçadão
    d.rectangle([0, horizon + 4, W, horizon + 20], fill=(255, 90, 170))
    # palmeiras passando rápido pela câmera (descida)
    for i, px in enumerate([80, 300, 980, 1200]):
        hgt = lerp(300, 900, p) * (1 + 0.15 * i % 2)
        base = horizon + 200 + lerp(400, 0, p)
        draw_palm(d, px, base, hgt, sway=math.sin(t * 2 + i))
    letterbox(img)
    if t < 3.5:
        a = clamp(t / 0.8) * clamp((3.5 - t) / 0.6)
        if a > 0:
            layer = img.copy()
            glow_text(layer, "EPISÓDIO 1", (W / 2, 250), 40, CYAN, blur=6)
            glow_text(layer, "CHEGADA EM VICE CITY", (W / 2, 310), 68, PINK, blur=10)
            img = Image.blend(img, layer, a)
    return img


BRIDGE_POSTS = list(range(0, 4000, 140))


def scene_bridge(t):  # 4–8 s: conversível na ponte
    lt = t - 4
    img = SKY_SUNSET.copy()
    d = ImageDraw.Draw(img)
    draw_sun(d, 900, 360, 110)
    sun_stripes(img, 900, 360, 110, SKY_SUNSET)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 430, W, H], fill=(35, 20, 85))
    draw_skyline(d, 432, scale=0.7, offset=lt * 20 + 400)
    # água com reflexos
    for k in range(25):
        yk = 440 + k * 6
        d.line([(820 - k * 3, yk), (980 + k * 3, yk)], fill=(255, 140, 110), width=1)
    # tabuleiro da ponte
    deck = 560
    d.rectangle([0, deck, W, deck + 30], fill=(40, 25, 60))
    d.rectangle([0, deck + 30, W, H], fill=(25, 15, 45))
    off = (lt * 900) % 140
    for bx in BRIDGE_POSTS[:12]:
        x0 = bx - off
        d.rectangle([x0, deck - 70, x0 + 8, deck], fill=(70, 50, 100))
    d.line([(0, deck - 70), (W, deck - 70)], fill=(255, 90, 170), width=4)
    d.line([(0, deck - 35), (W, deck - 35)], fill=(120, 80, 150), width=3)
    bounce = math.sin(lt * 18) * 2
    draw_convertible(d, 600, deck + 26 + bounce, s=1.4, col=PINK, hair_t=lt)
    # linhas de velocidade
    for k in range(14):
        yk = 470 + (k * 37) % 230
        xk = W - ((lt * 1800 + k * 300) % (W + 400))
        d.line([(xk, yk), (xk + 160, yk)], fill=(255, 220, 230), width=2)
    letterbox(img)
    a = clamp((lt - 0.3) / 0.3) * clamp((3.9 - lt) / 0.3)
    subtitle(img, "ELA: “Esquece tudo o que a gente deixou para trás.", a * clamp((2.2 - lt) / 0.2 + 1))
    if lt > 2.0:
        subtitle(img, "A partir de hoje, essa cidade é nossa.”", a)
    return img


def scene_hotel(lt):  # casal saindo do carro em frente ao hotel art déco
    img = SKY_DUSK.copy()
    d = ImageDraw.Draw(img)
    # fachada art déco
    d.rectangle([280, 120, 1000, 600], fill=(240, 225, 215))
    d.polygon([(560, 60), (720, 60), (760, 120), (520, 120)], fill=(240, 225, 215))
    d.rectangle([600, 20, 680, 60], fill=(240, 225, 215))
    for k in range(3):
        y = 200 + k * 120
        d.rectangle([280, y, 1000, y + 10], fill=(120, 230, 230))
    for c in range(6):
        for r in range(3):
            d.rectangle([320 + c * 110, 230 + r * 120, 380 + c * 110, 300 + r * 120], fill=(70, 120, 160))
    flick = 1 if (int(lt * 12) % 7) else 0.4
    glow_text(img, "HOTEL", (640, 165), 64, lerp_col((40, 0, 20), PINK, flick), blur=12)
    d = ImageDraw.Draw(img)
    d.line([(280, 598), (1000, 598)], fill=CYAN, width=6)
    d.line([(285, 120), (285, 600)], fill=CYAN, width=5)
    d.line([(995, 120), (995, 600)], fill=CYAN, width=5)
    d.rectangle([0, 600, W, H], fill=(50, 30, 70))
    draw_convertible(d, 520, 690, s=1.2, col=PINK, people=False)
    # casal saindo
    p = clamp(lt / 2)
    person(d, 700 + p * 80, 690, 1.5, accent=(255, 120, 60), step=lt * 8)
    person(d, 760 + p * 90, 690, 1.45, accent=(0, 200, 220), step=lt * 8 + 1)
    return img


def scene_boardwalk(lt):  # calçadão movimentado
    img = SKY_DUSK.copy()
    d = ImageDraw.Draw(img)
    d.rectangle([0, 380, W, 450], fill=(40, 30, 110))
    for k in range(10):
        d.line([(0, 390 + k * 6), (W, 390 + k * 6)], fill=(255, 120, 150), width=1)
    for i, px in enumerate(range(-50, W + 200, 260)):
        draw_palm(d, px - (lt * 120) % 260, 460, 300, sway=math.sin(lt * 2 + i))
    d.rectangle([0, 450, W, H], fill=(230, 180, 160))
    d.rectangle([0, 450, W, 470], fill=(255, 90, 170))
    # skatistas e artistas cruzando
    for k in range(5):
        sx = (W + 200) - ((lt * 500 + k * 330) % (W + 400))
        person(d, sx, 650, 1.2, step=lt * 10 + k, accent=[PINK, CYAN, ORANGE, PURPLE, YELLOW][k])
        if k % 2 == 0:
            d.rectangle([sx - 30, 652, sx + 30, 660], fill=(30, 30, 30))
    # carro rebaixado na avenida ao fundo com caixa de som
    cx = (lt * 400) % (W + 400) - 200
    draw_convertible(d, cx, 470, s=0.6, col=CYAN, people=False)
    # casal caminhando
    person(d, 600, 690, 1.6, accent=(255, 120, 60), step=lt * 7)
    person(d, 660, 690, 1.55, accent=(0, 200, 220), step=lt * 7 + 1)
    return img


def scene_kiosk(lt):  # quiosque + foto com celular
    img = SKY_DUSK.copy()
    d = ImageDraw.Draw(img)
    d.rectangle([0, 420, W, H], fill=(230, 190, 160))
    d.rectangle([0, 400, W, 420], fill=(40, 30, 110))
    # quiosque
    d.rectangle([150, 300, 560, 620], fill=(250, 240, 220))
    for k in range(8):
        d.polygon([(150 + k * 52, 240), (202 + k * 52, 240), (202 + k * 52, 300), (150 + k * 52, 300)],
                  fill=PINK if k % 2 else (255, 255, 255))
    glow_text(img, "DRINKS", (355, 340), 40, CYAN, blur=8)
    d = ImageDraw.Draw(img)
    # ele pegando duas bebidas
    person(d, 620, 690, 1.6, accent=(255, 120, 60))
    for k in range(2):
        d.rectangle([640 + k * 22, 560 - k * 4, 656 + k * 22, 590 - k * 4], fill=(255, 160, 60))
        d.line([(648 + k * 22, 560), (652 + k * 22, 540)], fill=CYAN, width=3)
    # ela fotografando
    person(d, 960, 690, 1.6, accent=(0, 200, 220))
    d.rectangle([985, 560, 1005, 595], fill=(20, 20, 30))
    if 0.9 < lt < 1.05:  # flash
        flash = Image.new("RGB", img.size, (255, 255, 255))
        img = Image.blend(img, flash, 0.7)
    return img


def scene_montage(t):  # 8–18 s
    lt = t - 8
    idx = int(lt // 2)
    sub = lt - idx * 2
    scenes = [scene_hotel, scene_boardwalk, scene_kiosk, scene_boardwalk, scene_hotel]
    img = scenes[idx](sub + idx * 0.7)
    letterbox(img)
    if sub < 0.12:  # corte com flash rápido
        img = Image.blend(img, Image.new("RGB", img.size, (255, 200, 240)), 0.5 * (1 - sub / 0.12))
    return img


def scene_alley(t):  # 18–28 s
    lt = t - 18
    img = SKY_NIGHT.copy()
    d = ImageDraw.Draw(img)
    # paredes em perspectiva
    d.polygon([(0, 0), (380, 160), (380, 560), (0, H)], fill=(25, 18, 35))
    d.polygon([(W, 0), (900, 160), (900, 560), (W, H)], fill=(22, 15, 32))
    d.rectangle([380, 160, 900, 560], fill=(12, 8, 22))
    d.polygon([(0, H), (380, 560), (900, 560), (W, H)], fill=(18, 14, 24))
    # poça refletindo
    d.ellipse([500, 620, 820, 680], fill=(30, 20, 50))
    # letreiros piscando
    f1 = 1 if (int(lt * 10) % 9) > 1 else 0.2
    f2 = 1 if (int(lt * 7 + 3) % 11) > 2 else 0.15
    glow_text(img, "BAR", (180, 260), 56, lerp_col((20, 0, 10), PINK, f1), blur=14)
    glow_text(img, "OPEN 24H", (1090, 300), 40, lerp_col((0, 10, 20), CYAN, f2), blur=12)
    d = ImageDraw.Draw(img)
    # moto esportiva + contato misterioso
    mx = 760
    d.ellipse([mx - 60, 500, mx - 10, 550], fill=(5, 5, 8))
    d.ellipse([mx + 70, 500, mx + 120, 550], fill=(5, 5, 8))
    d.polygon([(mx - 40, 515), (mx + 10, 470), (mx + 90, 470), (mx + 110, 515)], fill=(60, 10, 30))
    d.line([(mx - 40, 515), (mx + 110, 515)], fill=PINK, width=2)
    person(d, mx + 30, 555, 1.25, col=(8, 6, 12))
    # casal entrando / troca
    p = ease(clamp(lt / 2.5))
    hx = lerp(420, 620, p)
    person(d, hx, 600, 1.45, accent=(255, 120, 60), step=lt * 6 if p < 1 else 0)
    person(d, hx - 60, 600, 1.4, accent=(0, 200, 220), step=lt * 6 + 1 if p < 1 else 0)
    if 2.5 < lt < 4.5:  # mochila -> envelope
        q = ease((lt - 2.5) / 2)
        bx = lerp(hx + 20, mx + 20, q)
        d.rectangle([bx - 14, 500, bx + 14, 530], fill=(150, 90, 40))
        ex = lerp(mx + 10, hx + 10, q)
        d.rectangle([ex - 16, 470, ex + 16, 484], fill=(235, 225, 190))
    elif lt >= 4.5:
        d.rectangle([hx, 520, hx + 32, 534], fill=(235, 225, 190))
    # sirenes iluminando a parede
    if lt > 4.0:
        on = (int(lt * 6) % 2)
        col = (255, 20, 40) if on else (30, 80, 255)
        inten = clamp((lt - 4) / 2) * 0.55
        wash = Image.new("RGB", img.size, col)
        mask = Image.new("L", img.size, 0)
        md = ImageDraw.Draw(mask)
        if on:
            md.polygon([(0, 0), (380, 160), (380, 560), (0, H)], fill=int(255 * inten))
        else:
            md.polygon([(W, 0), (900, 160), (900, 560), (W, H)], fill=int(255 * inten))
        md.rectangle([380, 160, 900, 560], fill=int(160 * inten))
        img.paste(wash, (0, 0), mask.filter(ImageFilter.GaussianBlur(30)))
    # câmera treme quando ele grita
    if lt > 6.5:
        sh = int(math.sin(lt * 50) * 6)
        img = img.transform(img.size, Image.AFFINE, (1, 0, sh, 0, 1, sh // 2))
    letterbox(img)
    if 6.6 < lt < 9.6:
        subtitle(img, "ELE: “Sabia que era fácil demais. Corre!”", clamp((lt - 6.6) / 0.2))
    return img


TRAFFIC = [(rng.choice([-1, 0, 1]), rng.uniform(0, 1), rng.choice([CYAN, YELLOW, ORANGE, (200, 200, 220), PURPLE]))
           for _ in range(14)]


def scene_chase(t):  # 28–36 s
    lt = t - 28
    img = SKY_NIGHT.copy()
    d = ImageDraw.Draw(img)
    hz = 300
    draw_skyline(d, hz, scale=0.6, offset=600, night=True)
    # estrada synthwave em perspectiva
    d.polygon([(W / 2 - 40, hz), (W / 2 + 40, hz), (W + 400, H), (-400, H)], fill=(20, 10, 35))
    for k in range(18):
        z = ((k / 18) + lt * 1.6) % 1
        y = hz + (H - hz) * z ** 2.2
        d.line([(0, y), (W, y)], fill=lerp_col((60, 0, 80), PINK, z), width=1 + int(z * 3))
    for lane in (-1, 1):
        d.line([(W / 2 + lane * 13, hz), (W / 2 + lane * 600, H)], fill=CYAN, width=3)
    # trânsito que o carro costura
    weave = math.sin(lt * 2.4) * 180
    for lane, ph, col in TRAFFIC:
        z = (ph + lt * 0.55) % 1
        if z < 0.05:
            continue
        sz = z ** 2.2
        y = hz + (H - hz) * sz
        x = W / 2 + lane * 380 * sz - weave * sz * 0.4
        draw_car_rear(d, x, y, s=max(0.05, sz * 1.1), col=col)
    # nosso carro: cavalo de pau no início
    spin = clamp((1.5 - lt) / 1.5)
    cx = W / 2 + weave * 0.6
    if spin > 0:
        img_car = Image.new("RGBA", (500, 300), (0, 0, 0, 0))
        dc = ImageDraw.Draw(img_car)
        draw_car_rear(dc, 250, 230, s=1.3, col=PINK, brake=True)
        img_car = img_car.rotate(spin * 200, resample=Image.BICUBIC)
        img.paste(img_car, (int(cx - 250), 420), img_car)
        # fumaça
        for k in range(12):
            r = 30 + k * 8
            sx = cx + math.sin(k) * 120
            d.ellipse([sx - r, 640 - r / 2, sx + r, 640 + r / 2], fill=(90, 80, 110))
    else:
        draw_car_rear(d, cx, 650, s=1.3, col=PINK, brake=(int(lt * 3) % 4 == 0))
    # viaturas no retrovisor: luzes nos cantos
    on = int(lt * 8) % 2
    for side, col in ((0, (255, 20, 40)), (1, (30, 80, 255))):
        if (on + side) % 2:
            glow = Image.new("RGB", img.size, col)
            mask = Image.new("L", img.size, 0)
            md = ImageDraw.Draw(mask)
            cxs = 0 if side == 0 else W
            md.ellipse([cxs - 300, H - 300, cxs + 300, H + 300], fill=150)
            img.paste(glow, (0, 0), mask.filter(ImageFilter.GaussianBlur(60)))
    d = ImageDraw.Draw(img)
    # retrovisor com duas viaturas
    if lt > 2:
        d.rounded_rectangle([W / 2 - 150, 70, W / 2 + 150, 140], radius=20, fill=(10, 10, 20), outline=(180, 180, 200), width=3)
        for k in (-1, 1):
            vx = W / 2 + k * 60
            d.rectangle([vx - 30, 100, vx + 30, 125], fill=(240, 240, 240))
            d.rectangle([vx - 20, 92, vx, 100], fill=(255, 20, 40) if on else (60, 0, 0))
            d.rectangle([vx, 92, vx + 20, 100], fill=(30, 80, 255) if not on else (0, 0, 60))
    # linhas de velocidade radiais
    for k in range(24):
        ang = k / 24 * math.tau + lt
        r1 = 260 + ((lt * 900 + k * 97) % 500)
        x1, y1 = W / 2 + math.cos(ang) * r1, 360 + math.sin(ang) * r1 * 0.6
        x2, y2 = W / 2 + math.cos(ang) * (r1 + 120), 360 + math.sin(ang) * (r1 + 120) * 0.6
        d.line([(x1, y1), (x2, y2)], fill=(255, 255, 255), width=2)
    sh = int(math.sin(lt * 70) * 3)
    img = img.transform(img.size, Image.AFFINE, (1, 0, sh, 0, 1, 0))
    letterbox(img)
    return img


FREEZE_T = 37.4


def scene_jump(t):  # 36–40 s
    tt = min(t, FREEZE_T)
    lt = tt - 36
    img = SKY_NIGHT.copy()
    d = ImageDraw.Draw(img)
    # horizonte neon
    draw_skyline(d, 560, scale=1.0, offset=300, night=True)
    d.line([(0, 560), (W, 560)], fill=PINK, width=3)
    d.rectangle([0, 562, W, H], fill=(10, 8, 40))
    for k in range(12):
        d.line([(0, 575 + k * 12), (W, 575 + k * 12)], fill=(60, 30, 120), width=1)
    # ponte levadiça subindo
    ang = lerp(8, 24, ease(lt / 1.4))
    for side, sx in ((-1, 0), (1, W)):
        a = math.radians(ang)
        L = 520
        ex = sx - side * L * math.cos(a)
        ey = 600 - L * math.sin(a)
        d.polygon([(sx, 600), (ex, ey), (ex, ey + 30), (sx, 630)], fill=(55, 40, 80))
        d.line([(sx, 600), (ex, ey)], fill=CYAN, width=4)
    # holofotes dos helicópteros
    for k, hx in enumerate((260, 1040)):
        hy = 90 + math.sin(tt * 2 + k) * 10
        sweep = math.sin(tt * 1.2 + k * 2) * 80
        beam = Image.new("L", img.size, 0)
        bd = ImageDraw.Draw(beam)
        bd.polygon([(hx, hy), (W / 2 + sweep - 140, 520), (W / 2 + sweep + 140, 520)], fill=90)
        img.paste(Image.new("RGB", img.size, (230, 240, 255)), (0, 0), beam.filter(ImageFilter.GaussianBlur(20)))
        d = ImageDraw.Draw(img)
        d.ellipse([hx - 40, hy - 14, hx + 40, hy + 14], fill=(15, 15, 25))
        d.line([(hx - 60, hy - 20), (hx + 60, hy - 20)], fill=(70, 70, 90), width=3)
        d.line([(hx + 40, hy), (hx + 90, hy - 6)], fill=(15, 15, 25), width=5)
        if int(tt * 4) % 2:
            d.ellipse([hx - 4, hy + 10, hx + 4, hy + 18], fill=(255, 30, 40))
    d = ImageDraw.Draw(img)
    # carro no ar
    p = clamp(lt / 1.4)
    cx = lerp(120, 640, p)
    cy = 560 - math.sin(p * math.pi * 0.9) * 230
    car = Image.new("RGBA", (520, 300), (0, 0, 0, 0))
    draw_convertible(ImageDraw.Draw(car), 260, 230, s=1.25, col=PINK, hair_t=tt)
    car = car.rotate(lerp(12, -4, p), resample=Image.BICUBIC)
    img.paste(car, (int(cx - 260), int(cy - 230)), car)
    letterbox(img)
    if t >= FREEZE_T:
        # congela: dessatura levemente + flash de impacto
        ft = t - FREEZE_T
        if ft < 0.15:
            img = Image.blend(img, Image.new("RGB", img.size, (255, 255, 255)), 0.8 * (1 - ft / 0.15))
        arr = np.asarray(img).astype(np.float32)
        gray = arr.mean(axis=2, keepdims=True)
        arr = arr * 0.75 + gray * 0.25
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        # glitch + escurecer
        if ft > 0.7:
            g = clamp((ft - 0.7) / 0.9)
            img = glitch(img, g, seed=int(t * FPS))
            img = Image.blend(img, Image.new("RGB", img.size, (0, 0, 0)), ease(g))
        if ft > 1.3:
            a = clamp((ft - 1.3) / 0.4)
            layer = img.copy()
            glow_text(layer, "CONTINUA NO EPISÓDIO 2...", (W / 2, H / 2), 60, PINK, blur=12)
            layer = glitch(layer, 0.25 if int(t * FPS) % 6 == 0 else 0.0, seed=int(t * FPS) + 3)
            img = Image.blend(img, layer, a)
    return img


def glitch(img, amount, seed=0):
    if amount <= 0:
        return img
    r = np.random.default_rng(seed)
    arr = np.asarray(img).copy()
    for _ in range(int(4 + amount * 20)):
        y = r.integers(0, H - 10)
        hgt = r.integers(4, 40)
        shift = int(r.integers(-80, 80) * amount)
        arr[y:y + hgt] = np.roll(arr[y:y + hgt], shift, axis=1)
    s = int(10 * amount) + 1
    arr[..., 0] = np.roll(arr[..., 0], s, axis=1)
    arr[..., 2] = np.roll(arr[..., 2], -s, axis=1)
    return Image.fromarray(arr)


def frame(t):
    if t < 4:
        img = scene_aerial(t)
    elif t < 8:
        img = scene_bridge(t)
    elif t < 18:
        img = scene_montage(t)
    elif t < 28:
        img = scene_alley(t)
    elif t < 36:
        img = scene_chase(t)
    else:
        img = scene_jump(t)
    # transições curtas entre blocos
    for edge in (4, 8, 28, 36):
        if edge - 0.08 < t < edge + 0.08:
            img = glitch(img, 0.5, seed=int(t * FPS))
    if 18 <= t < 18.25:  # corte abrupto para a noite
        img = Image.blend(img, Image.new("RGB", img.size, (0, 0, 0)), 1 - (t - 18) / 0.25)
    if t < 0.5:
        img = Image.blend(Image.new("RGB", img.size, (0, 0, 0)), img, t / 0.5)
    return vignette_and_grain(img, t)


# ---------------------------------------------------------------- ÁUDIO

def build_audio():
    n = SR * DUR
    tt = np.arange(n) / SR
    out = np.zeros(n)
    nr = np.random.default_rng(1)

    def seg(a, b):
        return slice(int(a * SR), int(b * SR))

    def env_ramp(a, b, v0, v1):
        e = np.zeros(n)
        s = seg(a, b)
        e[s] = np.linspace(v0, v1, s.stop - s.start)
        return e

    def saw(f, t):
        return 2 * ((t * f) % 1) - 1

    def lowpass(x, alpha):
        y = np.zeros_like(x)
        acc = 0.0
        # filtro de 1 polo vetorizado por blocos
        from scipy.signal import lfilter  # noqa
        return lfilter([alpha], [1, alpha - 1], x)

    # --- música synthwave (0–18 e 28–37.4)
    def synthwave(a, b, bpm, vol_env, frantic=False):
        beat = 60 / bpm
        s = seg(a, b)
        t = tt[s] - a
        chords = [(55.0, 65.41, 82.41), (43.65, 55.0, 65.41), (49.0, 61.74, 73.42), (41.2, 49.0, 61.74)]
        bar = (t // (beat * 4)).astype(int) % 4
        root = np.array([c[0] for c in chords])[bar]
        # baixo em colcheias
        eighth = (t % (beat / 2)) / (beat / 2)
        bass = saw(root, t) * np.exp(-eighth * 3) * 0.35
        # arpejo
        step = (t // (beat / (4 if frantic else 2))).astype(int) % 3
        arp_f = np.array([[c[k] * 4 for k in range(3)] for c in chords])[bar, step]
        sub = (t % (beat / (4 if frantic else 2))) / (beat / (4 if frantic else 2))
        arp = np.sign(np.sin(2 * np.pi * arp_f * t)) * np.exp(-sub * 4) * 0.08
        # pad
        pad = sum(np.sin(2 * np.pi * np.array([c[k] * 2 for c in chords])[bar] * t) for k in range(3)) * 0.05
        # bateria
        bt = t % beat
        kick = np.sin(2 * np.pi * (50 + 120 * np.exp(-bt * 30)) * bt) * np.exp(-bt * 9) * 0.6
        half = (t % (beat * 2)) - beat
        snare = np.where(half >= 0, nr.normal(0, 1, len(t)) * np.exp(-np.clip(half, 0, None) * 18) * 0.25, 0)
        hh_t = t % (beat / 2 if not frantic else beat / 4)
        hat = nr.normal(0, 1, len(t)) * np.exp(-hh_t * 80) * 0.06
        hat = hat - lowpass(hat, 0.3)
        mix = bass + arp + pad + kick + snare + hat
        out[s] += mix * vol_env[s]

    synthwave(0, 18, 108, env_ramp(0, 18, 0.25, 1.0) + 0 * tt)
    vol = np.ones(n) * 1.1
    synthwave(28.2, FREEZE_T, 140, vol, frantic=True)

    # --- motor V8 (0–8 e 28–37.4)
    def engine(a, b, base, rise, vol):
        s = seg(a, b)
        t = tt[s] - a
        f = base + rise * (t / (b - a))
        phase = np.cumsum(f) / SR
        rumble = (np.sign(np.sin(2 * np.pi * phase)) * 0.5 + np.sin(2 * np.pi * phase * 0.5)) * 0.5
        noise = lowpass(nr.normal(0, 1, len(t)), 0.05) * 2
        out[s] += lowpass(rumble + noise, 0.08) * vol

    engine(0, 8, 38, 20, 0.35)
    engine(28.0, FREEZE_T, 70, 60, 0.4)

    # --- sons urbanos 8–18: ondas, buzinas, risadas (ruído modulado)
    s = seg(8, 18)
    t = tt[s] - 8
    waves = lowpass(nr.normal(0, 1, len(t)), 0.02) * (0.6 + 0.4 * np.sin(2 * np.pi * t / 3.5)) * 1.5
    out[s] += waves * 0.5
    for hx in (9.3, 12.1, 15.6, 16.2):
        hs = seg(hx, hx + 0.35)
        ht = tt[hs]
        out[hs] += (np.sign(np.sin(2 * np.pi * 420 * ht)) + np.sign(np.sin(2 * np.pi * 530 * ht))) * 0.05
    for lx in (10.5, 13.4):  # "risadas" curtas
        for k in range(5):
            ls = seg(lx + k * 0.12, lx + k * 0.12 + 0.08)
            lt_ = tt[ls] - (lx + k * 0.12)
            out[ls] += np.sin(2 * np.pi * (300 + 40 * k) * lt_) * np.sin(np.pi * lt_ / 0.08) * 0.06

    # --- 18–28: grave tenso (drone + pulso)
    s = seg(18, 28.2)
    t = tt[s] - 18
    drone = (np.sin(2 * np.pi * 41.2 * t) + 0.5 * np.sin(2 * np.pi * 43.65 * t) + 0.3 * saw(82.4, t)) * 0.25
    pulse = np.sin(2 * np.pi * 50 * (t % 0.75)) * np.exp(-(t % 0.75) * 12) * 0.5
    out[s] += lowpass(drone, 0.1) * 2 + pulse * np.clip(t / 6, 0.3, 1)

    # --- sirenes (21.5–37.4), aproximando
    s = seg(21.5, FREEZE_T)
    t = tt[s] - 21.5
    vol = np.clip(t / 6, 0.05, 1) * 0.18
    wail = 750 + 450 * np.sin(2 * np.pi * t / 1.6)
    yelp = np.where((t // 0.35) % 2 == 0, 650, 950)
    f = np.where(tt[s] < 28, wail, yelp)
    siren = np.sin(2 * np.pi * np.cumsum(f) / SR)
    siren2 = np.sin(2 * np.pi * np.cumsum(f * 1.07) / SR) * np.clip((tt[s] - 29) / 2, 0, 1)
    out[s] += (siren + siren2 * 0.7) * vol

    # --- canto de pneus 28.0–29.8
    s = seg(28.0, 29.8)
    t = tt[s] - 28
    sq = nr.normal(0, 1, len(t))
    sq = sq - lowpass(sq, 0.6)
    out[s] += (sq * 0.3 + np.sin(2 * np.pi * (1800 + 300 * np.sin(t * 30)) * t) * 0.08) * np.sin(np.pi * t / 1.8)

    # --- impacto no congelamento + silêncio súbito
    fs = int(FREEZE_T * SR)
    out[fs:] = 0
    s = seg(FREEZE_T, FREEZE_T + 1.6)
    t = tt[s] - FREEZE_T
    boom = np.sin(2 * np.pi * (35 + 90 * np.exp(-t * 6)) * t) * np.exp(-t * 2.5) * 1.2
    boom += lowpass(nr.normal(0, 1, len(t)), 0.1) * np.exp(-t * 6) * 2
    out[s] += boom

    out = np.tanh(out * 0.9)
    out /= np.max(np.abs(out)) + 1e-9
    out *= 0.9
    # estéreo leve (sirene e arpejo abertos via delay)
    left = out
    right = np.roll(out, 220)
    st = np.stack([left, right], axis=1)
    path = os.path.join(OUT_DIR, "episodio1_audio.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())
    return path


def main():
    audio = build_audio()
    out = os.path.join(OUT_DIR, "episodio1_chegada.mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", audio, "-c:v", "libx264", "-preset", "medium", "-crf", "19",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(N):
        proc.stdin.write(frame(i / FPS).tobytes())
        if i % 120 == 0:
            print(f"frame {i}/{N}", flush=True)
    proc.stdin.close()
    proc.wait()
    print("ok:", out)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        for ts in map(float, sys.argv[2:]):
            frame(ts).save(os.path.join(OUT_DIR, f"preview_{ts:05.1f}.png"))
    else:
        main()
