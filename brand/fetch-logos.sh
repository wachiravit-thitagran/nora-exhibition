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

echo
echo "เสร็จแล้ว:"
ls -la logo-ocac.png logo-moc.png logo-psu.png
echo
echo "หมายเหตุ: logo-psu.png จริง ๆ เป็นไฟล์ WebP (เบราว์เซอร์อ่านได้ปกติ)"
echo "ถ้าต้องการ PNG จริง ให้แปลงด้วย:  sips -s format png logo-psu.png --out logo-psu.png"
