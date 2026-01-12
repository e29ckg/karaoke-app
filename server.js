// 1. เรียกใช้ dotenv บรรทัดแรกสุด
require('dotenv').config();

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const axios = require('axios');
const os = require('os');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// 2. รับค่าจาก .env
const PORT = process.env.PORT || 3000;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// เช็คว่าใส่ Key หรือยัง
if (!YOUTUBE_API_KEY) {
    console.error("❌ ERROR: กรุณาใส่ YOUTUBE_API_KEY ในไฟล์ .env");
    process.exit(1);
}

let songQueue = [];

// ฟังก์ชันหา Local IP (ใช้กรณีไม่ได้ตั้งค่า DOMAIN)
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

    socket.emit('updateQueue', songQueue);

    // 3. Logic การส่งที่อยู่ Server (ฉลาดขึ้น)
    // ถ้าใน .env มีค่า DOMAIN ให้ใช้ค่าคนั้น
    // ถ้าไม่มี ให้สร้าง URL จาก IP เครื่อง (สำหรับเล่น Local)
    let serverUrl;
    if (process.env.DOMAIN) {
        serverUrl = process.env.DOMAIN;
    } else {
        const ip = getLocalIpAddress();
        serverUrl = `http://${ip}:${PORT}`;
    }
    
    // ส่งไปให้หน้าจอสร้าง QR Code
    socket.emit('serverDomain', serverUrl);

    // --- ส่วน Logic เดิม (addSong, searchSong ฯลฯ) ไม่ต้องเปลี่ยน ---
    
// รับเพลงใหม่ พร้อมชื่อคนร้อง
    socket.on('addSong', (data) => {
        let song;

        if (typeof data === 'object') {
            song = {
                id: data.id,
                title: data.title,
                // เพิ่มบรรทัดนี้: รับชื่อคนร้อง ถ้าไม่มีให้ใส่ว่า "ไม่ระบุตัวตน"
                requester: data.requester || 'ไม่ระบุตัวตน' 
            };
        } else {
            // กรณีเผื่อไว้ (Legacy)
            song = {
                id: data,
                title: `Song ID: ${data}`,
                requester: 'Admin'
            };
        }

        console.log(`Adding song: ${song.title} by ${song.requester}`); // เช็ค Log

        songQueue.push(song);
        io.emit('updateQueue', songQueue);

        if (songQueue.length === 1) {
            io.emit('playSong', songQueue[0]);
        }
    });

    socket.on('songEnded', () => {
        songQueue.shift();
        io.emit('updateQueue', songQueue);
        if (songQueue.length > 0) {
            io.emit('playSong', songQueue[0]);
        } else {
            io.emit('stopPlayer');
        }
    });

    socket.on('skipSong', () => {
        if (songQueue.length > 0) songQueue.shift();
        io.emit('updateQueue', songQueue);
        if (songQueue.length > 0) {
            io.emit('playSong', songQueue[0]);
        } else {
            io.emit('stopPlayer');
        }
    });

    socket.on('deleteSong', (index) => {
        if (index > 0 && index < songQueue.length) {
            songQueue.splice(index, 1);
            io.emit('updateQueue', songQueue);
        }
    });

    socket.on('prioritizeSong', (index) => {
        if (index > 1 && index < songQueue.length) {
            const songToMove = songQueue.splice(index, 1)[0];
            songQueue.splice(1, 0, songToMove);
            io.emit('updateQueue', songQueue);
        }
    });

    socket.on('searchSong', async (query) => {
        try {
            const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                    part: 'snippet',
                    q: query + ' karaoke',
                    type: 'video',
                    key: YOUTUBE_API_KEY, // ใช้ตัวแปรจาก .env
                    maxResults: 5
                },
                // headers: { 'Referer': 'http://localhost:3000/' } // เปิดใช้ถ้า API Key ล็อก Referer
            });
            socket.emit('searchResults', response.data.items);
        } catch (error) {
            console.error("Search Error:", error.message);
        }
    });
});

http.listen(PORT, () => {
    console.log(`----------------------------------------`);
    console.log(`🎤 Karaoke Server Running!`);
    if (process.env.DOMAIN) {
        console.log(`🌍 Domain Mode: ${process.env.DOMAIN}`);
    } else {
        const ip = getLocalIpAddress();
        console.log(`🏠 Local Mode:  http://${ip}:${PORT}`);
    }
    console.log(`----------------------------------------`);
});