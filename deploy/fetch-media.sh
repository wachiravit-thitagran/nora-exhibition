#!/bin/sh
# เติมสื่อลง assets/ ก่อน docker build — ทุกอย่างต้องอยู่ในอิมเมจ
#
# สองโหมด
#   1) ก็อปจากโฟลเดอร์ในเครื่อง (จับคู่ด้วยชื่อลำดับท่าที่อยู่ในชื่อไฟล์)
#      ใส่ได้หลายโฟลเดอร์ คั่นด้วย : จะไล่หาตามลำดับที่ใส่
#        N="$HOME/Documents/Nora"
#        FROM_DIR="$N/web_ainora_video_output_9x16_logo_v2:$N/web_ainora_video_output" \
#          sh deploy/fetch-media.sh
#      (ชุด 9x16_logo_v2 มี 20 คลิป ขาดคลิปที่ 19 กับ 21 จึงต่อท้ายด้วยชุดเดิม)
#   2) ดึงผ่าน HTTP จากแอป ainora (ใช้ใน Jenkins ที่ไม่มีโฟลเดอร์นั้น)
#        sh deploy/fetch-media.sh
#        AINORA=http://ainora-app:8000 sh deploy/fetch-media.sh
#
# ปลายทางคือ assets/videos/<videoId>.mp4 ตามที่ index.html เรียกหา
# ไฟล์ที่มีอยู่แล้วและขนาดไม่เป็น 0 จะข้ามไป รันซ้ำได้
# ถ้าได้ไม่ครบ 22 คลิป สคริปต์จบด้วย exit 1 ให้บิลด์ล้มตรงนี้
# ไม่ปล่อยให้ได้อิมเมจที่วิดีโอหายไปเงียบ ๆ แล้วไปรู้ตอนขึ้นจอหน้างาน

set -eu

AINORA="${AINORA:-https://ainora.psu.ac.th}"
HERE="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VID_DIR="$HERE/assets/videos"
BG_DIR="$HERE/assets/static"

mkdir -p "$VID_DIR" "$BG_DIR"

have=0; got=0; fail=0

# <videoId> TAB <ลำดับท่า>  — ตรงกับอาร์เรย์ VIDEOS ใน index.html
# โหมด FROM_DIR หาไฟล์ที่ลงท้ายด้วย "<ลำดับท่า>.mp4" จึงรองรับชื่อที่มีเลขนำหน้า
# อย่าง "02 ท่าพรหมสี่หน้า → ท่าเทวดา → ท่าใหม่ (A).mp4"
while IFS='	' read -r id title; do
    [ -n "$id" ] || continue
    out="$VID_DIR/$id.mp4"

    if [ -s "$out" ]; then
        have=$((have + 1))
        continue
    fi

    if [ -n "${FROM_DIR:-}" ]; then
        src=""
        OLDIFS="$IFS"; IFS=':'
        for d in $FROM_DIR; do
            IFS="$OLDIFS"
            if [ -d "$d" ]; then
                # หาไฟล์ที่ลงท้ายด้วยชื่อลำดับท่า เช่น "10 ท่าย่างสามขุม → ท่าลงฉากน้อย.mp4"
                for f in "$d"/*"$title".mp4; do
                    if [ -f "$f" ]; then src="$f"; break; fi
                done
                # เผื่อบางโฟลเดอร์ตั้งชื่อด้วย videoId อยู่แล้ว
                if [ -z "$src" ]; then
                    for f in "$d"/"$id"*; do
                        if [ -f "$f" ]; then src="$f"; break; fi
                    done
                fi
            fi
            IFS=':'
            if [ -n "$src" ]; then break; fi
        done
        IFS="$OLDIFS"
        if [ -n "$src" ]; then
            cp "$src" "$out"
            printf 'ก็อป  %s  <-  %s/%s\n' "$id" "$(basename "$(dirname "$src")")" "$(basename "$src")"
            got=$((got + 1))
        else
            printf 'ไม่พบ %s  (%s)\n' "$id" "$title" >&2
            fail=$((fail + 1))
        fi
        continue
    fi

    printf 'ดึง %s ... ' "$id"
    if curl -fsS --retry 2 --retry-delay 2 --max-time 300 \
            -o "$out.part" "$AINORA/videos/$id/file"; then
        mv "$out.part" "$out"
        printf 'ได้ %s\n' "$(du -h "$out" | cut -f1)"
        got=$((got + 1))
    else
        rm -f "$out.part"
        echo 'ไม่สำเร็จ' >&2
        fail=$((fail + 1))
    fi
done <<'IDS'
6a7b4e69a8615dbe0af2672e	ท่าพรหมสี่หน้า → ท่าเทวดา → ท่าใหม่ (A)
6a791869a8615dbe0af2670b	ท่าใหม่ (B) → ท่าใหม่ (C) → เขาควาย → ท่าใหม่ (C) → ท่าใหม่ (B)
6a6d8a98e8c21f9b2fa12ae4	ท่าขุนศรัทธา → ท่าพรหมสี่หน้า
6a6d8ae44e74c6635728add3	ท่าครู → ท่าพรหมสี่หน้า
6a6d8b34c262c1cc3e46a496	ท่าครู → ท่าเหาะเหิน
6a6d8b704e74c6635728adda	ท่าซัดหวางอก → ท่าขี้หนอน
6a6d8ba1e8c21f9b2fa12ae9	ท่าพรหมสี่หน้า → ท่าเทวดา
6a6d8bdec262c1cc3e46a49e	ท่าย่างสามขุม → ท่าขี้หนอน
6a7488164e74c6635728adf4	ท่าย่างสามขุม → ท่าลงฉากน้อย
6a6d8d43eab1361e29e3045e	ท่าขุนศรัทธา → ท่าครู
6a6d8d9dc262c1cc3e46a4a6	ท่าขุนศรัทธา → ท่าพรหมสี่หน้า → ท่าเทวดา
6a6d8dfce8c21f9b2fa12af4	ท่าจีบปรกหน้า → ท่าเทวดา → ท่าเขาควาย
6a6d8e374e74c6635728ade0	ท่าย่างสามขุม → ท่าย่างสามขุม
6a6d8e6fc262c1cc3e46a4ab	ท่าเขาควาย → ท่าจีบหน้า → ท่าพนมมือ → ท่าเขาควาย
6a6d8eadc262c1cc3e46a4bc	ท่าขุนศรัทธา → ท่าเขาควาย → ท่าใหม่ (D)
6a6d8ef1eab1361e29e30466	ท่าย่างสามขุม → ท่าใหม่ (D)
6a6d8f23e8c21f9b2fa12afb	ท่าเขาควาย → ท่าใหม่ (A)
6a74a210e8c21f9b2fa12b24	ท่าเขาควาย → ท่าใหม่ (C) → ท่าใหม่ (C) → ท่าเขาควาย → ท่าใหม่ (C) → ท่าใหม่ (C) → ท่าเขาควาย
6a74c9cac262c1cc3e46a4ce	ท่าใหม่ (A) → ท่าเขาควาย → ท่าขุนศรัทธา
6a74d6c5eab1361e29e304e5	ท่าเขาควาย → ท่าใหม่ (C) → ท่าใหม่ (C) → ท่าเขาควาย → ท่าใหม่ (C) → ท่าใหม่ (C) → ท่าเขาควาย → ท่าขุนศรัทธา
6a77fb5aeab1361e29e304fe	ท่าจีบหน้า → ท่าใหม่ (E)
6a783c54e8c21f9b2fa12b3c	ท่าใหม่ (F) → ท่าใหม่ (G) → ท่าเขาควาย
IDS

# ภาพพื้นหลังลายไทย (ไม่มีก็ได้ จะเหลือแค่พื้นไล่สี)
bg="$BG_DIR/background.png"
if [ ! -s "$bg" ]; then
    printf 'ภาพพื้นหลัง ... '
    if [ -n "${FROM_DIR:-}" ] && [ -f "$FROM_DIR/background.png" ]; then
        cp "$FROM_DIR/background.png" "$bg"; echo 'ก็อปจากโฟลเดอร์'
    elif curl -fsS --max-time 60 -o "$bg.part" "$AINORA/static/images/background.png"; then
        mv "$bg.part" "$bg"; echo 'ได้'
    else
        rm -f "$bg.part"; echo 'ไม่ได้ (ข้ามไป ไม่ถือเป็นข้อผิดพลาด)' >&2
    fi
fi

echo '----'
echo "วิดีโอ: มีอยู่แล้ว $have · ได้ใหม่ $got · ไม่ได้ $fail"
du -sh "$HERE/assets"/* 2>/dev/null | sort -h || true
[ "$fail" -eq 0 ] || { echo "ยังขาด $fail คลิป — หยุดก่อน build" >&2; exit 1; }
