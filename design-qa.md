# Design QA — ม่านทอง Three.js

- Source visual truth: `/Users/wachiravit/Downloads/INTRO_AINORA_.mp4`
- Source: H.264, 1280×720, 23.682 วินาที; ใช้เฟรม 5.5 วินาทีและ 8.25 วินาทีเป็นจุดเทียบ
- Implementation: `http://127.0.0.1:4173/?preview=1&deck=intro&sync=0&kiosk=1`
- Implementation screenshots:
  - `docs/qa/curtain-three-closed-comparison.jpg`
  - `docs/qa/curtain-three-mid-comparison.jpg`
  - `docs/qa/curtain-three-wide-mid.png`
- Viewport 16:9: 1280×720 CSS px, capture 1280×720 px, density normalization 1:1
- Viewport 48:9: 1500×281 CSS px, capture 1500×281 px
- States: ม่านปิด และ 1.70 วินาทีหลังสั่งเปิด; ตรวจเพิ่มช่วงต้น 1.0 วินาทีและช่วงปลาย 2.8 วินาที
- Primary interactions: ตั้งม่าน, เปิดม่าน, ตั้งม่านซ้ำระหว่างเปิด, เปิดแบบ 16:9 และ 48:9
- Browser console: ไม่พบ warning หรือ error ในรอบสุดท้าย

## Full-view comparison evidence

- เฟรมปิดใช้ texture ที่ถอดจากวิดีโอโดยตรง สีทอง ตำแหน่งลอน แสงบนผ้า และ vignette ตรงกับต้นฉบับ
- เฟรมช่วงกลางมีความกว้างช่องเปิดด้านบน/ล่างและแนวชายผ้าใกล้กับเฟรมอ้างอิง โดยส่วนบนแยกก่อนและชายล่างลากตาม
- ช่วงท้ายชายผ้าเร่งตามแรงดึงและเก็บเข้าขอบก่อนม่านถูกซ่อน
- โหมด 48:9 รักษาความหนาแน่นของลอนและเปิดจากกึ่งกลางผนังเป็นผืนเดียว ไม่ยืด texture 16:9 เป็นสามเท่า

## Focused comparison evidence

- Image quality: texture ยังรักษารายละเอียด highlight/shadow ของผ้าต้นฉบับ และใช้ sRGB output conversion ถูกต้อง
- Spacing/layout rhythm: เปรียบเทียบขอบในของผ้าบริเวณบน กลาง และล่างที่เวลาเดียวกัน; ช่องเปิดช่วงกลางตรงกันในระดับที่ไม่มีความต่างเชิงโครงสร้าง
- Colors/tokens: สีมาจาก source plate ไม่ได้ประมาณด้วย CSS gradient ในเส้นทาง WebGL
- Fonts/typography: ไม่มีข้อความบนม่าน ส่วนข้อความที่เห็นผ่านช่องเปิดเป็นเนื้อหาสไลด์จริงและตั้งใจให้ต่างจากฉากกระดาษในวิดีโอ
- Copy/content: ไม่มี copy ใหม่ใน overlay ม่าน
- ไม่ต้องใช้ focused crop เพิ่ม เพราะพื้นผิวและขอบผ้ามีขนาดใหญ่และอ่านความต่างได้ชัดในภาพเทียบเต็มเฟรม

## Comparison history

1. P1 — output แรกมืดกว่าต้นฉบับ เพราะ custom shader ยังไม่แปลง linear color เป็น output color space
   - Fix: เพิ่ม Three.js `colorspace_fragment`; ภาพปิดหลังแก้ตรงกับ source plate
2. P1 — ช่องเปิดช่วงกลางเป็นช่องเกือบสี่เหลี่ยม ต่างจากรูปทรงในวิดีโอ
   - Fix: ใช้ค่าเปิดแยกตามความสูงของผ้า ส่วนบนเคลื่อนก่อนและชายล่างหน่วงด้วย exponent curve
3. P2 — ชายล่างยังตามช้าเกินไปในช่วงปลาย
   - Fix: เพิ่ม catch-up curve หลัง progress 0.55 ให้ชายผ้าเร่งเก็บเข้าขอบเหมือนเฟรม 9 วินาที
4. P2 — WebGL และวิดีโอหน้าแรกทำงานพร้อมกันระหว่างเปิดม่าน
   - Fix: หยุดวิดีโอไว้ตลอด 3.4 วินาที และเริ่มเล่นหลังม่านพ้นจอ

## Findings

- P3 — การเปลี่ยนรูปของลอนระหว่างเคลื่อนไหวยังเป็น shader simulation จึงไม่สามารถตรงทุกพิกเซลกับงาน compositing ที่ render มาในวิดีโอได้ แต่สี รูปทรงช่องเปิด ทิศทางแรงดึง และเวลาอยู่ในกรอบอ้างอิง
- Expected deviation — ฉากที่เห็นหลังม่านเป็นสไลด์หน้าแรกของนิทรรศการ ไม่ใช่ภาพสเก็ตช์ที่ฝังอยู่ในวิดีโอต้นฉบับ เพื่อให้ overlay ใช้กับเนื้อหาจริงได้

## Implementation checklist

- [x] Three.js และ texture เป็นไฟล์ local ใช้งานออฟไลน์ได้
- [x] รองรับ state และคำสั่ง `/control` เดิม
- [x] รองรับ 16:9, 48:9 และ panel crop
- [x] มี CSS fallback เมื่อ WebGL ใช้ไม่ได้
- [x] จำกัด backing buffer บน ARM และไม่เล่นวิดีโอพร้อม WebGL
- [x] ผ่าน automated state, deck, control และ animation checks

## Follow-up polish

- ทดสอบ fps และอุณหภูมิบน Raspberry Pi ตัวจริง เพราะ CPU throttling บนเครื่องพัฒนาไม่จำลองแบนด์วิดท์ GPU ของ Pi ได้ครบ

final result: passed
