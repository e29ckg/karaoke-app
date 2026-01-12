const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const axios = require('axios');
const os = require('os');

const YOUTUBE_API_KEY = 'AIzaSyA5D1utXNTHkuHYx9k8U0qR-nu60tJ4MoM';

// ให้บริการไฟล์ Static (HTML, CSS)
app.use(express.static(path.join(__dirname, 'public')));

// ตัวแปรเก็บคิวเพลง (ในหน่วยความจำ)
let songQueue = [];

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

io.on('connection', (socket) => {
    console.log('User connected');

    // เมื่อ Admin หรือ Player เข้ามา ให้ส่งคิวปัจจุบันไปให้ดู
    socket.emit('updateQueue', songQueue);

    socket.emit('serverIp', getLocalIpAddress());

    // 1. รับเพลงใหม่จาก Admin (แก้ใหม่)
    socket.on('addSong', (data) => {
        let song;

        // เช็คว่าส่งมาแบบไหน (ถ้ามาจากหน้าค้นหา จะส่งมาเป็น Object {id, title})
        if (typeof data === 'object') {
            song = {
                id: data.id,
                title: data.title
            };
        } else {
            // กรณีเผื่อไว้: ถ้าส่งมาแต่ ID (เช่น พิมพ์ลิงก์เอง)
            song = {
                id: data,
                title: `Song ID: ${data}` 
            };
        }

        console.log("Adding song:", song.title); // เช็คใน Terminal ดูว่าชื่อมาไหม

        songQueue.push(song);
        io.emit('updateQueue', songQueue);

        if (songQueue.length === 1) {
            io.emit('playSong', songQueue[0]);
        }
    });

    // 2. เมื่อเพลงจบ (Player แจ้งมา)
    socket.on('songEnded', () => {
        songQueue.shift(); // เอาเพลงที่จบแล้วออกจากคิว
        io.emit('updateQueue', songQueue); // อัปเดตคิวใหม่

        if (songQueue.length > 0) {
            // เล่นเพลงถัดไป
            io.emit('playSong', songQueue[0]);
        }
    });

    // 3. รับคำสั่ง "ตัดเพลง" จาก Admin (เพิ่มส่วนนี้)
    socket.on('skipSong', () => {
        console.log("Skipping song...");
        
        // ลบเพลงปัจจุบันออกจากคิว
        if (songQueue.length > 0) {
            songQueue.shift(); 
        }

        // อัปเดตรายการคิวให้ทุกหน้าจอรู้
        io.emit('updateQueue', songQueue);

        // ตรวจสอบว่ายังมีเพลงเหลือไหม
        if (songQueue.length > 0) {
            // มีเพลงต่อ -> สั่งให้เล่นเพลงถัดไปทันที
            io.emit('playSong', songQueue[0]);
        } else {
            // ไม่มีเพลงแล้ว -> สั่งให้ Player หยุด
            io.emit('stopPlayer');
        }
    });

    // 4. ระบบค้นหาเพลง (เพิ่มใหม่)
    socket.on('searchSong', async (query) => {
            console.log("Searching for:", query);
            try {
                const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                    params: {
                        part: 'snippet',
                        q: query + ' karaoke คาราโอเกะ',
                        type: 'video',
                        key: YOUTUBE_API_KEY,
                        maxResults: 5
                    },
                    // เพิ่มส่วน headers นี้เข้าไปครับ
                    headers: {
                        'Referer': 'http://localhost:3000/' 
                    }
                });
                socket.emit('searchResults', response.data.items);

            } catch (error) {
                // *** แก้ไขตรงนี้ครับ ***
                if (error.response) {
                    console.log("========= รายละเอียด ERROR (Google บอกมาว่า) =========");
                    // ปริ้นท์รายละเอียดออกมาดู
                    console.log(JSON.stringify(error.response.data, null, 2)); 
                    console.log("==================================================");
                } else {
                    console.error("Error Message:", error.message);
                }
            }
        });

        // 5. ลบเพลงออกจากคิว (เฉพาะเพลงที่รออยู่)
    socket.on('deleteSong', (index) => {
        // ห้ามลบเพลงที่ 0 (กำลังเล่น) ให้ใช้ปุ่ม Skip แทน
        if (index > 0 && index < songQueue.length) {
            console.log(`Deleting song at index ${index}`);
            songQueue.splice(index, 1); // ลบออก 1 ตัว
            io.emit('updateQueue', songQueue); // อัปเดตหน้าจอทุกคน
        }
    });

    // 6. ลัดคิว (ย้ายมาเป็นเพลงถัดไป)
    socket.on('prioritizeSong', (index) => {
        // ต้องเป็นเพลงลำดับที่ 2 ขึ้นไป (index > 1) ถึงจะย้ายได้
        // เพราะ index 0 คือกำลังเล่น, index 1 คือเพลงถัดไปอยู่แล้ว
        if (index > 1 && index < songQueue.length) {
            console.log(`Moving song at index ${index} to top`);
            
            // ดึงเพลงนั้นออกมา (splice คืนค่าเป็น array เลยต้องเอาตัวที่ [0])
            const songToMove = songQueue.splice(index, 1)[0];
            
            // แทรกกลับเข้าไปที่ตำแหน่งที่ 1 (ต่อจากเพลงที่เล่นอยู่)
            songQueue.splice(1, 0, songToMove);
            
            io.emit('updateQueue', songQueue);
        }
    });
});

// เริ่ม Server ที่ Port 3000
http.listen(3000, () => {
    const ip = getLocalIpAddress();
    console.log(`Karaoke Server running on:`);
    console.log(`- Local:   http://localhost:3000`);
    console.log(`- Network: http://${ip}:3000 (ใช้มือถือเข้าลิงก์นี้)`);
});