from PIL import Image, ImageDraw
def make(size, path, maskable=False):
    s=size*4
    im=Image.new('RGB',(s,s),'#F6F7F8')
    d=ImageDraw.Draw(im)
    # calm ring with a small dot: "слово дано"
    r=s*(0.26 if maskable else 0.34)
    c=s/2
    w=s*0.045
    d.ellipse([c-r,c-r,c+r,c+r],outline='#2F7A55',width=int(w))
    dr=s*0.06
    d.ellipse([c-dr,c-dr,c+dr,c+dr],fill='#2F7A55')
    im.resize((size,size),Image.LANCZOS).save(path)
make(192,'public/icons/icon-192.png')
make(512,'public/icons/icon-512.png')
make(512,'public/icons/maskable-512.png',True)
make(180,'public/icons/apple-touch-icon.png')

# --- Android (обёртка TWA): адаптивная иконка и PNG для API 24-25
import os
def ring(size, scale):
    s = size * 4
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r, c, w, dr = s * scale, s / 2, s * 0.045 * (scale / 0.34), s * 0.06 * (scale / 0.34)
    d.ellipse([c - r, c - r, c + r, c + r], outline='#2F7A55', width=int(w))
    d.ellipse([c - dr, c - dr, c + dr, c + dr], fill='#2F7A55')
    return im.resize((size, size), Image.LANCZOS)
res = 'android/app/src/main/res/'
# слой переднего плана 108dp * 4 = 432px, значимая часть в центральных 66%
ring(432, 0.22).save(res + 'drawable-nodpi/ic_launcher_foreground.png')
for name, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    bg = Image.new('RGBA', (px, px), '#F6F7F8')
    bg.alpha_composite(ring(px, 0.34))
    bg.convert('RGB').save(res + f'mipmap-{name}/ic_launcher.png')
