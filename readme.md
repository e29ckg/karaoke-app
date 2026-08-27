# 🎤 Smart Karaoke System

ระบบคาราโอเกะแบบ Real-time ที่ออกแบบมาเพื่อการใช้งานร่วมกับ Android TV และสมาร์ทโฟน มาพร้อมกับระบบคิวเพลงอัจฉริยะ การค้นหาที่รวดเร็วผ่านฐานข้อมูลและ YouTube API รวมถึงหน้า Dashboard สไตล์ "Genesis" สำหรับผู้ดูแลระบบ

## ✨ Features (ความสามารถเด่น)

- **📺 TV Player Autoplay:** ออกแบบมาเพื่อรันบน WebView ของ Android TV พร้อมระบบเล่นวิดีโอต่อเนื่องและข้ามเพลงอัตโนมัติ
- **📱 Smart Remote:** ผู้ใช้สามารถสแกน QR Code เพื่อใช้สมาร์ทโฟนเป็นรีโมทค้นหาเพลง จัดการคิว และส่ง Effect (Emoji) ขึ้นหน้าจอได้
- **⚡ Hybrid Search System:** ค้นหาเพลงอย่างรวดเร็วจากฐานข้อมูล (SQLite) หากไม่พบระบบจะสลับไปค้นหาผ่าน YouTube API อัตโนมัติ
- **💾 Auto-Save Catalog:** เมื่อมีการเลือกเพลงใหม่จาก YouTube API ระบบจะบันทึกลงฐานข้อมูลทันทีเพื่อการเรียกใช้ในครั้งต่อไป
- **🖼️ Dynamic Screensaver:** ระบบภาพพักหน้าจอเมื่อไม่มีคิวเพลง สามารถเพิ่ม/ลบ URL รูปภาพได้แบบ Real-time ผ่าน Dashboard
- **📊 Admin Dashboard:** หน้าควบคุมสำหรับผู้ดูแลระบบ (ป้องกันด้วยรหัสผ่าน) เพื่อดูสถิติระบบ (RAM, Uptime), จัดการคลังเพลง, ดูแล API Key และตรวจสอบสถานะห้อง

## 🛠️ Tech Stack (เทคโนโลยีที่ใช้)

- **Backend:** Node.js, Express.js
- **Real-time Communication:** Socket.io
- **Database:** SQLite3 (Local File Database)
- **Frontend (Dashboard):** Vue.js 3, Bootstrap 5, FontAwesome
- **Design Theme:** Genesis Style (General Sans & DM Sans Typography)
- **External API:** YouTube Data API v3

## 📂 Project Structure (โครงสร้างไฟล์)

```text
/
├── server.js              # ไฟล์หลักของฝั่ง Server (Node.js)
├── import_songs.js        # สคริปต์สำหรับนำเข้าข้อมูลเพลงเบื้องต้น
├── karaoke.db             # ไฟล์ฐานข้อมูล SQLite (สร้างอัตโนมัติเมื่อรัน)
├── .env                   # ไฟล์เก็บการตั้งค่าและ API Keys
├── package.json           # รายการไลบรารีที่จำเป็น
└── public/                # ไฟล์ฝั่ง Frontend
    ├── player.html        # หน้าจอหลักสำหรับแสดงผลบนทีวี
    ├── admin.html         # หน้าจอรีโมทสำหรับผู้ใช้ทั่วไป
    ├── dashboard.html     # หน้าจอควบคุมสำหรับผู้ดูแลระบบ
    └── login.html         # หน้าล็อกอินเข้าสู่ Dashboard

```

## 🚀 Installation & Setup (วิธีการติดตั้ง)

1. **โคลนโปรเจกต์และติดตั้งไลบรารี:**
```bash
npm install

```


*(ไลบรารีหลักที่ใช้: express, socket.io, sqlite3, express-session, axios, dotenv, compression)*
2. **ตั้งค่า Environment Variables:**
สร้างไฟล์ `.env` ไว้ในโฟลเดอร์หลัก และกำหนดค่าดังนี้:
```env
PORT=3000
DOMAIN=[http://your-domain.com](http://your-domain.com)  # หรือเว้นไว้เพื่อใช้ IP เครื่อง
ADMIN_PASSWORD=1234            # รหัสผ่านสำหรับเข้า Dashboard
YOUTUBE_API_KEY=key1,key2,key3 # รองรับระบบ Multi-key คั่นด้วยเครื่องหมายจุลภาค

```


3. **นำเข้าข้อมูลเพลงตั้งต้น (Optional):**
หากต้องการเพิ่มเพลงตั้งต้นลงในฐานข้อมูล ให้รันสคริปต์:
```bash
node import_songs.js

```


4. **เริ่มต้นการทำงานของเซิร์ฟเวอร์:**
```bash
node server.js

```



## 🎮 Usage (การใช้งาน)

* **หน้าจอทีวี (TV Player):** เปิดเบราว์เซอร์หรือแอป WebView ไปที่ `http://localhost:3000/`
* **หน้ารีโมท (User Remote):** เปิดมือถือไปที่ `http://localhost:3000/admin` (หรือสแกน QR Code จากหน้าจอทีวี)
* **หน้าผู้ดูแลระบบ (Dashboard):** เปิดไปที่ `http://localhost:3000/dashboard` (เข้าสู่ระบบด้วยรหัสผ่านที่ตั้งไว้ใน `.env`)

---

*Developed with ❤️ by Phayao Sonplai (Pawisweewiew)*

