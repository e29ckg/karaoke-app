# 🎤 Karaoke Party Web App (2 Screens)

ระบบคาราโอเกะออนไลน์ ใช้งานง่ายผ่านเว็บเบราว์เซอร์ รองรับการทำงาน 2 หน้าจอ (จอทีวีสำหรับเล่นเพลง + จอมือถือสำหรับสั่งเพลง) เชื่อมต่อกันแบบ Real-time ด้วย Socket.io และใช้แหล่งข้อมูลเพลงจาก YouTube

## ✨ ฟีเจอร์หลัก (Features)

* **2 Screen System:** แยกหน้าจอระหว่าง **Player** (แสดง MV) และ **Admin/Remote** (ค้นหาและสั่งเพลง)
* **Real-time Queue:** อัปเดตคิวเพลงทันทีทั้ง 2 หน้าจอโดยไม่ต้องรีเฟรช
* **YouTube Search:** ค้นหาเพลงผ่าน YouTube Data API v3 พร้อมกรองเฉพาะวิดีโอคาราโอเกะ
* **Smart Queue:**
    * ✅ เพิ่มเพลงเข้าคิว
    * ❌ ลบเพลงออกจากคิว
    * 🔼 ลัดคิว (Prioritize) ย้ายเพลงมาต่อคิวเป็นเพลงถัดไป
    * ⏭️ ข้ามเพลง (Skip)
* **Requester Name:** ระบุชื่อคนร้องได้ เพื่อให้รู้ว่าคิวต่อไปเป็นของใคร
* **QR Code Connect:** สแกน QR Code จากหน้าจอทีวีเพื่อเข้าหน้าสั่งเพลงได้ทันที
* **Mobile Friendly:** หน้าสั่งเพลงรองรับการใช้งานบนมือถือ (Responsive)

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

* **Backend:** Node.js, Express
* **Real-time:** Socket.io
* **Frontend:** HTML5, CSS3, Bootstrap 5
* **API:** YouTube Data API v3, YouTube IFrame Player API

## ⚙️ การติดตั้ง (Installation)

1.  **Clone โปรเจกต์**
    ```bash
    git clone https://github.com/e29ckg/karaoke-app.git
    cd karaoke-app
    ```

2.  **ติดตั้ง dependencies**
    ```bash
    npm install
    ```

3.  **ตั้งค่า Environment Variables**
    สร้างไฟล์ `.env` ที่ root folder และกำหนดค่าดังนี้:
    ```env
    PORT=3000
    YOUTUBE_API_KEY=YOUR_GOOGLE_API_KEY_HERE
    # DOMAIN=https://your-domain.com (ใส่เมื่อนำขึ้น Server จริง ถ้าเล่น Local ให้ปิดไว้)
    ```

4.  **วิธีขอ API Key**
    * ไปที่ https://console.cloud.google.com
    * สร้างโปรเจกต์ใหม่ และ Enable **"YouTube Data API v3"**
    * สร้าง Credentials แบบ **API Key**
    * นำ Key มาใส่ในไฟล์ `.env`

## 🚀 การใช้งาน (Usage)

### แบบ Local (เล่นเครื่องเดียว หรือวง LAN)
1.  รัน Server:
    ```bash
    node server.js
    # หรือ
    npm start
    ```
2.  เปิด Browser บน PC (สำหรับเป็นจอทีวี): `http://localhost:3000`
3.  ใช้มือถือสแกน QR Code บนจอ หรือเข้าผ่าน IP เครื่องคอม เช่น `http://192.168.1.x:3000/admin.html`

### แบบ Server จริง (Production / Cloud)
แนะนำให้ใช้ PM2 ในการรันเพื่อให้ทำงานเบื้องหลังตลอดเวลา
```bash
pm2 start server.js --name "karaoke-web"

```

## 📂 โครงสร้างไฟล์ (Project Structure)

```
karaoke-app/
├── public/             # ไฟล์ Frontend
│   ├── admin.html      # หน้าจอสั่งเพลง (มือถือ)
│   ├── player.html     # หน้าจอเล่นเพลง (ทีวี)
│   └── css/            # (ถ้ามี)
├── .env                # เก็บค่า Config และ API Key (ห้ามเอาขึ้น Git)
├── .gitignore          # ไฟล์ที่ Git จะข้ามไป
├── package.json        # รายชื่อ Library ที่ใช้
├── server.js           # โค้ดหลักฝั่ง Server (Node.js)
└── README.md           # คู่มือการใช้งาน

```

## ⚠️ ข้อควรระวัง (Troubleshooting)

* **Error 403 (Forbidden):** ตรวจสอบว่าเปิดใช้งาน YouTube Data API v3 ใน Google Console แล้วหรือยัง และเช็คการตั้งค่า Referrer restrictions ของ API Key
* **Error 400 (Bad Request):** API Key ไม่ถูกต้อง หรือ Copy มาไม่ครบ
* **QR Code ไม่ขึ้น:** ตรวจสอบว่า Server สามารถเข้าถึง Internet ได้ หรือตั้งค่า `DOMAIN` ใน `.env` ถูกต้องหรือไม่

## 🤝 ผู้พัฒนา (Author)

* **E29CKG** - *Initial work*

