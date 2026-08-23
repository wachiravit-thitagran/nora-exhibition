# สไลด์นิทรรศการเป็น static ทั้งหมด — ไม่มี build step ไม่มี runtime
# ทุกอย่างที่ต้องใช้ถูกฝังลงอิมเมจ: สไลด์ ฟอนต์ โลโก้ ภาพ และวิดีโอ
# คอนเทนเนอร์ที่รันขึ้นมาจึงไม่ต้องต่อออกไปที่ไหนเลย ไม่ต้อง mount อะไรเพิ่ม
#
# ก่อน build ต้องเติมสื่อเข้า assets/ ก่อน (วิดีโอ 22 คลิป + ภาพพื้นหลัง)
#     sh deploy/fetch-media.sh
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# service ตอบเฉพาะ /exhibition/* ไฟล์ทั้งหมดจึงอยู่ใต้โฟลเดอร์ exhibition
WORKDIR /usr/share/nginx/html/exhibition

COPY index.html         ./
COPY control.html       ./
COPY frame-picker.html  ./tools/
COPY brand/             ./brand/
# ภาพเปรียบเทียบ · วิดีโอ · เฟรมท่า · ภาพพื้นหลัง — เท่าที่มีในโฟลเดอร์ตอน build
COPY assets/            ./assets/

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/exhibition/healthz || exit 1
