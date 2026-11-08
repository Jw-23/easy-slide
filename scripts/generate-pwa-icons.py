"""Generate install icons from the application's existing layered-slide mark."""
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]/'public'/'icons'
root.mkdir(parents=True,exist_ok=True)
scale=4
for name,size,maskable in [('icon-192.png',192,False),('icon-512.png',512,False),('maskable-512.png',512,True),('apple-touch-icon.png',180,True)]:
    canvas=Image.new('RGBA',(512*scale,512*scale),(0,0,0,0))
    draw=ImageDraw.Draw(canvas)
    draw.rounded_rectangle((0,0,512*scale,512*scale),radius=(0 if maskable else 108*scale),fill='#23786b')
    paths=[[(140,208),(256,150),(372,208),(256,266),(140,208)],[(140,263),(256,321),(372,263)],[(140,318),(256,376),(372,318)]]
    for points in paths:
        scaled=[(x*scale,y*scale) for x,y in points]
        draw.line(scaled,fill='#ffffff',width=18*scale,joint='curve')
        for x,y in [scaled[0],scaled[-1]]:draw.ellipse((x-9*scale,y-9*scale,x+9*scale,y+9*scale),fill='#ffffff')
    canvas.resize((size,size),Image.Resampling.LANCZOS).save(root/name,optimize=True)
(root.parent/'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#23786b"/><g fill="none" stroke="white" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="m17.5 26 14.5-7.25L46.5 26 32 33.25Z"/><path d="m17.5 33 14.5 7.25L46.5 33M17.5 40 32 47.25 46.5 40"/></g></svg>')
