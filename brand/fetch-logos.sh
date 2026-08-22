#!/usr/bin/env sh
# ดาวน์โหลดโลโก้ผู้สนับสนุน 3 อันมาเก็บไว้ในเครื่อง
# รันครั้งเดียวจากในโฟลเดอร์โปรเจกต์:   sh brand/fetch-logos.sh
#
# สไลด์ใช้ไฟล์ในเครื่องก่อน ถ้าไม่มีจะดึงจากเว็บต้นทางให้เอง
# แต่ควรเก็บไว้ในเครื่อง เพื่อให้เปิดหน้างานได้แม้เน็ตหลุด และอัดวิดีโอ offline ได้
set -e
cd "$(dirname "$0")"

echo "→ สำนักงานศิลปวัฒนธรรมร่วมสมัย"
curl -fsSL -o logo-ocac.png \
  "https://www.ocac.go.th/wp-content/uploads/2021/03/web-logo-ocac2.png"

echo "→ กระทรวงวัฒนธรรม"
curl -fsSL -o logo-moc.png \
  "https://www.m-culture.go.th/_nuxt/img/logo.be79a18.png"

echo "→ มหาวิทยาลัยสงขลานครินทร์"
curl -fsSL -o logo-psu.png \
  "https://www.psu.ac.th/img/logos/psu_th.webp"

# --- อีกสองอันนี้ต้องแปลงก่อนใช้ จึง commit ไฟล์สำเร็จรูปไว้ใน repo แล้ว ---
#
# PSU DiiS — ต้นทางเป็น GIF เคลื่อนไหว 46 เฟรม ขนาด 1080x1080
#   https://diis.psu.ac.th/images/banner/pic/DiiSLogo.gif
#   ใช้เฟรมที่โลโก้ใหญ่ที่สุด ตัดขอบโปร่งใสออก แล้วย่อให้สูงไม่เกิน 700px
#
# มหาวิทยาลัยทักษิณ — ตราสัญลักษณ์ทางการ (หน้าดาวน์โหลด tsu.ac.th/home/download_emblem.php)
#   https://www.tsu.ac.th/emblem/color/TSU-LOGO-color-for-monitor4.png
#   ต้นฉบับ 1911x3332 · 1.8 MB ตัดขอบโปร่งใสแล้วย่อเหลือสูง 700px
#
# ทำใหม่ได้ด้วย (ต้องมี Pillow):
#   python3 - <<'EOF'
#   from PIL import Image
#   def trim(im, pad=8):
#       a = im.convert('RGBA'); bb = a.split()[-1].getbbox()
#       if bb: a = a.crop(bb)
#       o = Image.new('RGBA', (a.width+2*pad, a.height+2*pad), (0,0,0,0)); o.paste(a,(pad,pad)); return o
#   g = Image.open('DiiSLogo.gif'); best=None; area=0
#   for i in range(g.n_frames):
#       g.seek(i); f = g.convert('RGBA'); bb = f.split()[-1].getbbox()
#       if bb and (bb[2]-bb[0])*(bb[3]-bb[1]) > area: area=(bb[2]-bb[0])*(bb[3]-bb[1]); best=f.copy()
#   d = trim(best); d.thumbnail((700,700), Image.LANCZOS); d.save('logo-diis.png', optimize=True)
#   t = trim(Image.open('TSU-LOGO-color-for-monitor4.png')); t.thumbnail((700,700), Image.LANCZOS)
#   t.save('logo-tsu.png', optimize=True)
#   EOF

echo
echo "เสร็จแล้ว:"
ls -la logo-ocac.png logo-moc.png logo-psu.png
echo
echo "หมายเหตุ: logo-psu.png จริง ๆ เป็นไฟล์ WebP (เบราว์เซอร์อ่านได้ปกติ)"
echo "ถ้าต้องการ PNG จริง ให้แปลงด้วย:  sips -s format png logo-psu.png --out logo-psu.png"
