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

// --- Config ---
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN;

// --- จัดการ API Keys (Multi-Key System) ---
const apiKeys = (process.env.YOUTUBE_API_KEY || '').split(',');
let currentKeyIndex = 0;

let keyHealth = apiKeys.map((key, index) => ({
    id: index + 1,
    mask: key ? (key.substring(0, 8) + '...') : 'No Key', 
    status: 'unknown', 
    usage: 0,
    lastError: null
}));

// --- Setup Express ---
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));

// ตัวแปรเก็บข้อมูลห้อง
let rooms = {};

// --- เก็บรายการรูปภาพ Screensaver ---
let screensaverImages = [
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=1920',
    'https://images.unsplash.com/photo-1470229722913-7c092bb21b01?q=80&w=1920'
];

// --- Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
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

    // เมื่อมีคนเข้าเว็บ ให้ส่งรูปภาพ Screensaver ปัจจุบันไปให้ทันที
    socket.emit('updateScreensaver', screensaverImages);

    // 1. Join Room
    socket.on('joinRoom', (roomName) => {
        const room = roomName || 'default';
        socket.join(room);
        socket.roomName = room;

        if (!rooms[room]) rooms[room] = [];

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

        if (rooms[room].length >= 50) return;

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

    // --- Effect System ---
    socket.on('sendEffect', (data) => {
        const room = socket.roomName;
        if (room) {
            io.to(room).emit('showEffect', data);
        }
    });

    socket.on('deleteSong', (index) => {
        const room = socket.roomName;
        if (rooms[room] && index >= 0 && index < rooms[room].length) {
            rooms[room].splice(index, 1);
            io.to(room).emit('updateQueue', rooms[room]);
        }
    });

    socket.on('prioritizeSong', (index) => {
        const room = socket.roomName;
        if (rooms[room] && index >= 0 && index < rooms[room].length) {
            const songToMove = rooms[room].splice(index, 1)[0];
            rooms[room].splice(0, 0, songToMove);
            io.to(room).emit('updateQueue', rooms[room]);
        }
    });

    // 4. Search Song (Multi-Key Rotation)
    socket.on('searchSong', async (query) => {
        let attempts = 0;
        let success = false;

        while (attempts < apiKeys.length && !success) {
            const currentKey = apiKeys[currentKeyIndex];
            
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
                        q: query + ' karaoke คาราโอเกะ',
                        type: 'video',
                        videoEmbeddable: 'true', 
                        regionCode: 'TH',        
                        key: currentKey.trim(),
                        maxResults: 10
                    },
                    headers: { 'Referer': DOMAIN || `http://localhost:${PORT}/` }
                });
                
                socket.emit('searchResults', response.data.items);
                success = true;

                if (keyHealth[currentKeyIndex]) {
                    keyHealth[currentKeyIndex].status = 'good';
                    keyHealth[currentKeyIndex].usage++;
                    keyHealth[currentKeyIndex].lastError = null;
                }

            } catch (error) {
                const status = error.response ? error.response.status : 'network';
                console.error(`Key #${currentKeyIndex + 1} Failed: ${status}`);
                
                if (keyHealth[currentKeyIndex]) {
                    keyHealth[currentKeyIndex].lastError = status;
                }

                if (status === 403 || status === 429) {
                    if (keyHealth[currentKeyIndex]) keyHealth[currentKeyIndex].status = 'dead'; 
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

    // 5. Dashboard Stats 
    socket.on('getDashboardStats', () => {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        
        const stats = {
            roomCount: Object.keys(rooms).length,
            userCount: io.engine.clientsCount,
            uptime: process.uptime(),
            memory: Math.round(used * 100) / 100,
            keys: keyHealth,
            currentKeyIndex: currentKeyIndex
        };

        socket.emit('dashboardData', {
            stats: stats,
            rooms: rooms
        });
    });

    // รับคำสั่งจากหน้า Dashboard เพื่ออัปเดตชุดรูปภาพใหม่
    socket.on('saveScreensaver', (images) => {
        screensaverImages = images;
        io.emit('updateScreensaver', screensaverImages);
    });

    // 6. Cleanup (ลบห้องเมื่อไม่มีคนอยู่)
    socket.on('disconnect', () => {
        const room = socket.roomName;
        if (room && rooms[room]) {
            const socketsInRoom = io.sockets.adapter.rooms.get(room);
            if (!socketsInRoom || socketsInRoom.size === 0) {
                delete rooms[room];
            }
        }
    });

}); 

// --- Start Server ---
http.listen(PORT, () => {
    console.log(`----------------------------------------`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔑 Loaded ${apiKeys.length} API Keys`);
    console.log(`----------------------------------------`);
});