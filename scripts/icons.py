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
