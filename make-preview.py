#!/usr/bin/env python3
"""
สร้าง preview-full.html — ไฟล์เดียวจบ ส่งให้ใครก็เปิดดูสไลด์ได้ทันที

ต่างจาก standalone.html ตรงที่ฝัง "ภาพ" ใน assets/ ลงไฟล์ด้วย
(standalone.html ฝังแค่ฟอนต์กับโลโก้ ยังต้องมีโฟลเดอร์ assets/ วางข้าง ๆ)

วิธีใช้:
    python3 make-standalone.py && python3 make-preview.py

กลไก: index.html อ่านภาพผ่าน cmp()/res() ซึ่งเช็ก window.__INLINE ก่อนเสมอ
สคริปต์นี้จึงแค่ยัด <script>window.__INLINE={...}</script> ไว้หน้าสคริปต์หลัก
โดยคีย์เป็น "ชื่อไฟล์เปล่า" ไม่ใช่พาธ เพราะ CONFIG.DIR_* ถูกต่อตอนรันไทม์
ทำให้ค้นหาพาธเต็มในไฟล์ไม่เจอ (เคยพลาดตรงนี้มาแล้ว)

วิดีโอไม่ฝัง — ใหญ่เกินไป ในไฟล์พรีวิวจะเห็นเป็นกรอบว่างแทน
"""
import base64, io, json, pathlib, sys
from PIL import Image

HERE = pathlib.Path(__file__).parent
SRC = HERE / "standalone.html"
OUT = HERE / "preview-full.html"

# โฟลเดอร์ที่ cmp()/res() ไปหยิบภาพ · twin = ลงทะเบียนนามสกุลฝาแฝดด้วยหรือไม่
#
# assets/compare ต้องมีฝาแฝด เพราะตาราง PAIRS อ้างชื่อเป็น .png แต่ไฟล์จริงเป็น .jpg
# assets/restore ไม่ต้อง เพราะ MASTERS อ้างชื่อตรงกับไฟล์อยู่แล้ว — ถ้าใส่ฝาแฝดไปด้วย
# JSON จะเก็บ base64 ก้อนเดิมซ้ำสองรอบ ไฟล์พรีวิวโตขึ้นเท่าตัวฟรี ๆ
DIRS = [("assets/compare", True), ("assets/restore", False), ("assets/team", False)]
MAX_W = 1200      # กว้างพอสำหรับดูบนจอคอม ไม่ใช่ความละเอียดงานพิมพ์
QUALITY = 72


def encode(path: pathlib.Path) -> str:
    im = Image.open(path)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def main() -> int:
    if not SRC.exists():
        print("ไม่พบ standalone.html — รัน make-standalone.py ก่อน", file=sys.stderr)
        return 1

    inline: dict[str, str] = {}
    for d, twin in DIRS:
        folder = HERE / d
        if not folder.is_dir():
            print(f"ข้าม {d} (ไม่มีโฟลเดอร์)")
            continue
        for f in sorted(folder.iterdir()):
            if f.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                continue
            uri = encode(f)
            inline[f.name] = uri
            if twin:
                inline[f.with_suffix(".jpg").name] = uri
                inline[f.with_suffix(".png").name] = uri

    html = SRC.read_text(encoding="utf-8")
    i = html.find("<script")
    if i < 0:
        print("ไม่พบ <script> ใน standalone.html", file=sys.stderr)
        return 1

    tag = "<script>window.__INLINE=" + json.dumps(inline, ensure_ascii=False) + ";</script>\n\n"
    OUT.write_text(html[:i] + tag + html[i:], encoding="utf-8")
    print(f"เขียน preview-full.html แล้ว ({OUT.stat().st_size // 1024:,} KB · ฝังภาพ {len(inline):,} คีย์)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
