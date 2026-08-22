#!/usr/bin/env python3
"""
รวม index.html + โลโก้ + ฟอนต์ ให้เป็นไฟล์เดียว (standalone.html)

ใช้เมื่อ:
  - อยากเปิดสไลด์จากไฟล์เดียวโดยไม่ต้องมี web server (double-click เปิดได้เลย)
  - อยากอัดวิดีโอแบบ offline โดยไม่พึ่งโฟลเดอร์ brand/

วิธีใช้:
    python3 make-standalone.py                      # วิดีโอใช้ไฟล์ใน assets/videos/
    python3 make-standalone.py --remote-videos      # วิดีโอดึงจาก ainora.psu.ac.th

หมายเหตุ: ภาพและวิดีโอใน assets/ ยัง "ไม่" ถูกฝังลงไฟล์ (ใหญ่เกินไป)
ต้องวางโฟลเดอร์ assets/ ไว้ข้าง standalone.html เหมือนเดิม
"""
import base64, pathlib, re, sys

HERE = pathlib.Path(__file__).parent
SRC = HERE / "index.html"
OUT = HERE / "standalone.html"


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def main() -> int:
    if not SRC.exists():
        print("ไม่พบ index.html", file=sys.stderr)
        return 1

    html = SRC.read_text(encoding="utf-8")

    # 1) ฝังฟอนต์ Anuphan
    font = HERE / "brand" / "Anuphan-var.woff2"
    if font.exists():
        uri = data_uri(font, "font/woff2")
        html = re.sub(
            r"src:url\('brand/Anuphan-var\.woff2'\) format\('woff2-variations'\),\s*"
            r"url\('brand/Anuphan-var\.woff2'\) format\('woff2'\);",
            f"src:url('{uri}') format('woff2');",
            html,
        )
    else:
        print("เตือน: ไม่พบ brand/Anuphan-var.woff2 — ข้ามการฝังฟอนต์")

    # 2) ฝังโลโก้ — ทั้งที่เขียน src="brand/..." ตรง ๆ ใน HTML
    #    และที่อยู่ในอาร์เรย์ SPONSORS ในสคริปต์ (file:'brand/...')
    for name in ("logo-dark.png", "logo-light.png",
                 "logo-ocac.png", "logo-moc.png", "logo-psu.png"):
        p = HERE / "brand" / name
        if p.exists():
            uri = data_uri(p, "image/png")
            html = html.replace(f'src="brand/{name}"', f'src="{uri}"')
            html = html.replace(f"file:'brand/{name}'", f"file:'{uri}'")
        else:
            print(f"เตือน: ไม่พบ brand/{name} — ข้ามการฝังโลโก้")

    # 3) วิดีโอ: ค่าปกติของโปรเจกต์คือเล่นจากไฟล์ใน assets/videos/ ซึ่งใช้ได้ทั้ง
    #    ตอนเปิดจาก file:// และตอนอยู่ในคอนเทนเนอร์ จึงไม่ต้องแก้อะไร
    #    ใส่ --remote-videos ถ้าจะให้ดึงจากโดเมนจริงแทน (ต้องมีเน็ต)
    if "--remote-videos" in sys.argv:
        html = re.sub(r"USE_LOCAL_VIDEOS: true,", "USE_LOCAL_VIDEOS: false,", html, count=1)
        html = re.sub(
            r"AINORA_BASE\s*: '[^']*',",
            "AINORA_BASE     : 'https://ainora.psu.ac.th',",
            html,
            count=1,
        )

    OUT.write_text(html, encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"เขียน {OUT.name} แล้ว ({kb:,.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
