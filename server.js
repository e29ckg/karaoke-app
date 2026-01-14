require('dotenv').config();
const express = require('express');
const compression = require('compression');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" },
    pingTimeout: 60000
});
const path = require('path');
const axios = require('axios');
const os = require('os');

// Config
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN;

// --- จัดการ API Keys (Multi-Key System) ---
// ดึงคีย์มาจาก .env แล้วแยกด้วยเครื่องหมาย ,
const apiKeys = (process.env.YOUTUBE_API_KEY || '').split(',');
let currentKeyIndex = 0;

// สร้างตัวแปรเก็บสุขภาพของคีย์ (Health Check)
let keyHealth = apiKeys.map((key, index) => ({
    id: index + 1,
    mask: key ? (key.substring(0, 8) + '...') : 'No Key', 
    status: 'unknown', // good, dead, warning, unknown, missing
    usage: 0,
    lastError: null
}));

// Setup Express
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));

// ตัวแปรเก็บข้อมูลห้อง
let rooms = {};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Helper: หา IP เครื่อง
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

// --- Socket Logic ---
io.on('connection', (socket) => {

    // 1. Join Room
    socket.on('joinRoom', (roomName) => {
        const room = roomName || 'default';
        socket.join(room);
        socket.roomName = room;

        if (!rooms[room]) rooms[room] = [];

        // console.log(`Socket ${socket.id} joined room: ${room}`);

        socket.emit('updateQueue', rooms[room]);

        let baseUrl = DOMAIN || `http://${getLocalIpAddress()}:${PORT}`;
        socket.emit('serverDomain', `${baseUrl}/admin.html?room=${room}`);

        if (rooms[room].length > 0) {
            socket.emit('playSong', rooms[room][0]); 
        }
    });

    // 2. Add Song
    socket.on('addSong', (data) => {
        const room = socket.roomName;
        if (!room || !rooms[room]) return;

        // กัน Memory เต็ม: จำกัด 50 เพลงต่อห้อง
        if (rooms[room].length >= 50) {
            // socket.emit('error', 'คิวเต็มแล้วครับ'); 
            return;
        }

        let song = {
            id: data.id,
            title: data.title,
            requester: data.requester || 'ไม่ระบุ',
            thumbnail: data.thumbnail || ''
        };

        rooms[room].push(song);
        io.to(room).emit('updateQueue', rooms[room]);

        if (rooms[room].length === 1) {
            io.to(room).emit('playSong', rooms[room][0]);
        }
    });

    // Helper: Play Next
    const playNextOrStop = (room) => {
        if (rooms[room].length > 0) {
            io.to(room).emit('playSong', rooms[room][0]);
        } else {
            io.to(room).emit('stopPlayer');
        }
    };

    // 3. Controls
    socket.on('replaySong', () => {
        const room = socket.roomName;
        if(room) io.to(room).emit('replaySong');
    });

    socket.on('songEnded', () => {
        const room = socket.roomName;
        if (rooms[room]) {
            rooms[room].shift();
            io.to(room).emit('updateQueue', rooms[room]);
            playNextOrStop(room);
        }
    });

    socket.on('skipSong', () => {
        const room = socket.roomName;
        if (rooms[room] && rooms[room].length > 0) {
            rooms[room].shift();
            io.to(room).emit('updateQueue', rooms[room]);
            playNextOrStop(room);
        }
    });

    socket.on('deleteSong', (index) => {
        const room = socket.roomName;
        if (rooms[room] && index > 0 && index < rooms[room].length) {
            rooms[room].splice(index, 1);
            io.to(room).emit('updateQueue', rooms[room]);
        }
    });

    socket.on('prioritizeSong', (index) => {
        const room = socket.roomName;
        if (rooms[room] && index > 1 && index < rooms[room].length) {
            const songToMove = rooms[room].splice(index, 1)[0];
            rooms[room].splice(1, 0, songToMove);
            io.to(room).emit('updateQueue', rooms[room]);
        }
    });

    // 4. Search Song (Multi-Key Rotation + Monitoring)
    socket.on('searchSong', async (query) => {
        let attempts = 0;
        let success = false;

        // วนลูปหาคีย์ที่ใช้ได้
        while (attempts < apiKeys.length && !success) {
            const currentKey = apiKeys[currentKeyIndex];
            
            // เช็คว่ามีคีย์ไหม
            if (!currentKey || currentKey.trim() === '') {
                if (keyHealth[currentKeyIndex]) keyHealth[currentKeyIndex].status = 'missing';
                currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
                attempts++;
                continue;
            }

            try {
                const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                    params: {
                        part: 'snippet',
                        q: query + ' karaoke คาราโอเกะ -cover',
                        type: 'video',
                        key: currentKey.trim(),
                        maxResults: 10
                    },
                    headers: { 'Referer': DOMAIN || `http://localhost:${PORT}/` }
                });
                
                socket.emit('searchResults', response.data.items);
                success = true;

                // [Monitor] บันทึกความสำเร็จ
                if (keyHealth[currentKeyIndex]) {
                    keyHealth[currentKeyIndex].status = 'good';
                    keyHealth[currentKeyIndex].usage++;
                    keyHealth[currentKeyIndex].lastError = null;
                }

            } catch (error) {
                const status = error.response ? error.response.status : 'network';
                console.error(`Key #${currentKeyIndex + 1} Failed: ${status}`);
                
                // [Monitor] บันทึก Error
                if (keyHealth[currentKeyIndex]) {
                    keyHealth[currentKeyIndex].lastError = status;
                }

                if (status === 403 || status === 429) {
                    if (keyHealth[currentKeyIndex]) keyHealth[currentKeyIndex].status = 'dead'; // คีย์ตาย
                    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length; 
                    attempts++;
                } else {
                    if (keyHealth[currentKeyIndex]) keyHealth[currentKeyIndex].status = 'warning';
                    socket.emit('searchResults', []);
                    break;
                }
            }
        }

        if (!success) {
            console.log("All API Keys failed or Network Error.");
            socket.emit('searchResults', []);
        }
    });

    // 5. Dashboard Stats (ส่งข้อมูลกลับไปหน้าเว็บ Monitor)
    socket.on('getDashboardStats', () => {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        
        const stats = {
            roomCount: Object.keys(rooms).length,
            userCount: io.engine.clientsCount,
            uptime: process.uptime(),
            memory: Math.round(used * 100) / 100,
            
            // ส่งข้อมูล Key Health Check ไปด้วย
            keys: keyHealth,
            currentKeyIndex: currentKeyIndex
        };

        socket.emit('dashboardData', {
            stats: stats,
            rooms: rooms
        });
    });

    // 6. Cleanup (ลบห้องเมื่อไม่มีคนอยู่)
    socket.on('disconnect', () => {
        const room = socket.roomName;
        if (room && rooms[room]) {
            const socketsInRoom = io.sockets.adapter.rooms.get(room);
            if (!socketsInRoom || socketsInRoom.size === 0) {
                // console.log(`Cleaning room: ${room}`);
                delete rooms[room];
            }
        }
    });

}); // <--- ปีกกาปิด io.on (ที่หายไปของคุณน่าจะคือตัวนี้)

// Start Server
http.listen(PORT, () => {
    console.log(`----------------------------------------`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔑 Loaded ${apiKeys.length} API Keys`);
    console.log(`----------------------------------------`);
});