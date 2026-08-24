#!/usr/bin/env python3
"""ครอปภาพทีมทำงานให้เป็นวงกลมเรียงกันแล้วดูเป็นชุดเดียวกัน

ปัญหาที่สคริปต์นี้แก้
  ภาพที่แต่ละคนส่งมาถ่ายกันคนละระยะ คนหนึ่งครึ่งตัว อีกคนเต็มตัว
  ถ้าครอปกลางภาพเฉย ๆ แล้วตัดเป็นวงกลม หัวจะลอยสูงต่ำไม่เท่ากัน
  บางคนหัวชนขอบ บางคนตัวลอยกลางวง เรียงกันแล้วดูไม่เป็นชุด

  สคริปต์นี้จึงหา "ใบหน้า" ก่อน แล้ววางกรอบให้ใบหน้าอยู่ตำแหน่งเดียวกัน
  ทุกคน — ขนาดหน้าเท่ากัน ระดับตาเท่ากัน ผลคือวงกลมทั้งสี่ดูเป็นชุดเดียวกัน

ใช้
    python3 deploy/make-team-photos.py ต้นฉบับ/ajarn.png ... → assets/team/

หมายเหตุ
  haar cascade หาใบหน้าที่ "เอียง" ไม่เจอ (คนที่เอียงหัวถ่ายรูป)
  จึงลองหมุนภาพทีละ 5 องศาแล้วหาซ้ำ เจอที่มุมไหนก็ครอปบนภาพที่หมุนแล้วเลย
  ได้ผลพลอยได้คือภาพที่ออกมาหัวตั้งตรงพอดี
"""
import sys, pathlib
import cv2, numpy as np
from PIL import Image, ImageFilter, ImageDraw

OUT_DIR   = pathlib.Path('assets/team')
OUT_SIZE  = 900     # ด้านละกี่พิกเซล (วงกลมบนจอ 4K ใหญ่สุดราว 430px จึงเหลือเฟือ)
FACE_FRAC = 0.34    # ความกว้างใบหน้า : ความกว้างกรอบ
FACE_Y    = 0.40    # ศูนย์กลางใบหน้าอยู่สูงจากขอบบนกี่ส่วนของกรอบ
ROT_RANGE = range(-40, 41, 5)

_det = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')


def find_face(im):
    """คืน (มุมที่ต้องหมุน, กล่องใบหน้าบนภาพที่หมุนแล้ว) หรือ None"""
    best = None
    for ang in ROT_RANGE:
        rot = im.rotate(ang, resample=Image.BILINEAR, expand=True, fillcolor=(255, 255, 255))
        gray = cv2.cvtColor(np.array(rot), cv2.COLOR_RGB2GRAY)
        for (x, y, w, h) in _det.detectMultiScale(gray, 1.08, 6, minSize=(80, 80)):
            if best is None or w * h > best[0]:
                best = (w * h, ang, x, y, w, h)
    return None if best is None else (best[1], best[2:])


def soften_background(im, strength=0.022):
    """เบลอฉากหลังให้จมลง ใช้กับภาพที่ถ่ายในฉากรก
       เป็นมาสก์วงรีขอบนุ่ม ไม่ใช่การตัดพื้นหลังทิ้ง — ตัดจริงขอบผมจะแหว่ง"""
    w, h = im.size
    blur = im.filter(ImageFilter.GaussianBlur(radius=w * strength))
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).ellipse((w * 0.13, h * 0.02, w * 0.87, h * 1.15), fill=255)
    return Image.composite(im, blur.filter(ImageFilter.GaussianBlur(0)),
                           mask.filter(ImageFilter.GaussianBlur(radius=w * 0.05)))


def crop_one(src, dst, soften=False):
    im = Image.open(src).convert('RGB')
    found = find_face(im)
    if found is None:
        print(f'  {dst.name}: ไม่เจอใบหน้า — ใช้กรอบกลางบนแทน', file=sys.stderr)
        side = min(im.size)
        box = ((im.width - side) // 2, 0, (im.width + side) // 2, side)
        work = im
    else:
        ang, (x, y, w, h) = found
        work = im.rotate(ang, resample=Image.BICUBIC, expand=True, fillcolor=(255, 255, 255))
        cx, cy = x + w / 2, y + h / 2
        side = min(w / FACE_FRAC, min(work.size))
        left = max(0, min(cx - side / 2, work.width - side))
        top  = max(0, min(cy - side * FACE_Y, work.height - side))
        box = (int(left), int(top), int(left + side), int(top + side))
        print(f'  {dst.name}: หมุน {ang}° · ใบหน้า {w}x{h} · กรอบ {box}')
    out = work.crop(box).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    if soften:
        out = soften_background(out)
    out.save(dst, quality=90)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for arg in argv[1:]:
        # ใส่ :soften ต่อท้ายชื่อไฟล์ถ้าภาพนั้นฉากหลังรก
        soften = arg.endswith(':soften')
        path = pathlib.Path(arg[:-7] if soften else arg)
        crop_one(path, OUT_DIR / (path.stem + '.jpg'), soften)
    print(f'เขียนลง {OUT_DIR}/ แล้ว')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
