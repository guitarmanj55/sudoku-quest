"""Draws the app icons (no dependencies): a red rising sun over a gold-lined 3x3 board on ink black."""
import math, struct, zlib

def png(w, h, rows):
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

STAR = []
for k in range(10):
    ang = -math.pi / 2 + k * math.pi / 5
    r = 0.105 if k % 2 == 0 else 0.045
    STAR.append((0.5 + r * math.cos(ang), 0.5 + r * math.sin(ang)))

def in_star(x, y):
    inside, j = False, len(STAR) - 1
    for i in range(len(STAR)):
        xi, yi = STAR[i]; xj, yj = STAR[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside

def color(u, v):
    d = math.hypot(u - 0.5, v - 0.28)
    c = lerp((92, 22, 16), (20, 13, 11), min(1, d / 0.85))
    b0, b1 = 0.2, 0.8
    if b0 <= u <= b1 and b0 <= v <= b1:
        cell = (b1 - b0) / 3
        lu, lv = (u - b0) / cell, (v - b0) / cell
        edge = min(abs(lu - round(lu)), abs(lv - round(lv))) * cell
        if edge < 0.011:
            return (214, 172, 88)
        cu, cv = int(min(lu, 2.999)), int(min(lv, 2.999))
        c = (30, 20, 17)
        if (cu, cv) == (1, 1):
            c = (192, 48, 36)
        elif (cu + cv) % 2 == 1:
            c = (40, 27, 22)
        if in_star(u, v):
            return (250, 236, 210)
    return c

def make(size, path):
    ss = 3
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = color((x + (sx + .5) / ss) / size, (y + (sy + .5) / ss) / size)
                    for i in range(3):
                        acc[i] += c[i]
            row.extend(int(a / (ss * ss)) for a in acc)
        rows.append(row)
    with open(path, 'wb') as f:
        f.write(png(size, size, rows))

for s in (180, 192, 512):
    make(s, f'icon-{s}.png')
print('icons written')
