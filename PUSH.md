# วิธี push ขึ้น GitHub

ประวัติ git ทั้ง 16 commit ถูกห่อไว้ในไฟล์ `nora-history.bundle`
(แซนด์บ็อกซ์ที่สร้างโค้ดไม่มี credential GitHub ของคุณ จึง push จากตรงนั้นไม่ได้
และแซนด์บ็อกซ์จะถูกลบเมื่อจบ session — ประวัติจริงอยู่ในไฟล์ bundle นี้)

## 1. กู้ประวัติเข้าโฟลเดอร์ที่มีอยู่แล้ว

วาง `nora-history.bundle` ไว้ที่ `~/Documents/Nora/` แล้วรัน

```sh
cd ~/Documents/Nora/exhibition_web
git init -b main
git fetch ../nora-history.bundle main
git reset --mixed FETCH_HEAD
```

`git log --oneline` ต้องได้ 16 commit และ `git status` ต้องขึ้นว่าไม่มีอะไรเปลี่ยน
(ไฟล์ในโฟลเดอร์ตรงกับ commit สุดท้ายพอดี — ตรวจแล้วว่าลำดับคำสั่งนี้ใช้ได้จริง)

ถ้าขึ้น `refusing to fetch into branch` แปลว่าพิมพ์ `main:main` แทน `main` — ใช้ตามด้านบน

## 2. สร้าง repo แล้ว push

**ถ้ามี gh CLI**

```sh
gh repo create nora-exhibition --private --source=. --remote=origin --push
```

**ถ้าไม่มี** — สร้าง repo เปล่าชื่อ `nora-exhibition` แบบ Private ที่ github.com
(อย่าติ๊ก README / .gitignore) แล้ว

```sh
git remote add origin git@github.com:<ชื่อผู้ใช้>/nora-exhibition.git
git push -u origin main
```

## 3. สิ่งที่ไม่ได้เก็บใน git (ตั้งใจ)

| ไม่เก็บ | เหตุผล |
|---|---|
| `assets/**` (ภาพ/วิดีโอ) | ไฟล์สื่อขนาดใหญ่ — ชุด compare 6.1 MB, วิดีโออีกหลายร้อย MB |
| `standalone.html` | สร้างใหม่ได้ด้วย `python3 make-standalone.py` |
| `preview-full.html` | ไฟล์พรีวิวก้อนเดียว ~3.4 MB สร้างใหม่ได้ |

ถ้าต้องการเก็บไฟล์สื่อใน git ด้วย ให้ลบบรรทัดที่เกี่ยวข้องใน `.gitignore`
และพิจารณาใช้ Git LFS (ชุด compare 6.1 MB พอเก็บตรง ๆ ได้ แต่วิดีโอไม่ควร)
