# นิทรรศการทั้งงานอยู่ในอิมเมจเดียว คอนเทนเนอร์เดียว
#
# ข้างในมีสองอย่าง
#   nginx  เสิร์ฟสไลด์และไฟล์สื่อทั้งหมด (ฝังลงอิมเมจแล้ว ไม่ต้อง mount)
#   node   รีเลย์คำสั่งจากมือถือ ฟังที่ 127.0.0.1:10097 ไม่เปิดออกนอก
#
# ทำไมไม่แยกเป็นสองคอนเทนเนอร์
#   เคยแยก แล้วเจอปัญหาที่ล้วนมาจากการแยกทั้งนั้น — bind mount ไฟล์ต้นทาง
#   ที่พังเมื่อ CI agent รันในคอนเทนเนอร์ · ต้องอยู่ network เดียวกันเพื่อให้
#   nginx resolve ชื่อ service เจอ · ต้อง compose เท่านั้น ใช้ docker run ไม่ได้ ·
#   ต้องดูแลอีกแท็กใน registry ทั้งที่โค้ดมีไฟล์เดียว 160 บรรทัด
#   งานขนาดนี้ไม่คุ้มกับราคานั้น รวมเป็นก้อนเดียวแล้วทุกข้อหายไปพร้อมกัน
#
# ก่อน build ต้องเติมสื่อเข้า assets/ ก่อน (วิดีโอ 22 คลิป + ภาพพื้นหลัง)
#     sh deploy/fetch-media.sh
FROM nginx:1.27-alpine

# nodejs อย่างเดียว ไม่เอา npm — รีเลย์ไม่มี dependency ให้ติดตั้ง
RUN apk add --no-cache nodejs

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# รีเลย์คำสั่ง + สคริปต์ที่สั่งให้มันขึ้นมาพร้อม nginx
# ไฟล์ใน /docker-entrypoint.d/ ถูกรันโดย entrypoint ของอิมเมจ nginx
# ก่อนที่มันจะ exec nginx ตัวจริง
COPY control/server.mjs        /app/server.mjs
COPY deploy/40-relay.sh        /docker-entrypoint.d/40-relay.sh
RUN chmod +x /docker-entrypoint.d/40-relay.sh

# service ตอบเฉพาะ /exhibition/* ไฟล์ทั้งหมดจึงอยู่ใต้โฟลเดอร์ exhibition
WORKDIR /usr/share/nginx/html/exhibition

COPY index.html         ./
COPY control.html       ./
COPY frame-picker.html  ./tools/
COPY brand/             ./brand/
# ภาพเปรียบเทียบ · วิดีโอ · เฟรมท่า · ภาพพื้นหลัง — เท่าที่มีในโฟลเดอร์ตอน build
COPY assets/            ./assets/

# ตรวจแค่สไลด์ ไม่รวมรีเลย์ — รีเลย์เป็นของเสริม ถ้ามันล่มสไลด์ยังต้องถือว่าปกติ
# (สถานะรีเลย์ดูได้ที่ /exhibition/api/healthz)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/exhibition/healthz || exit 1
