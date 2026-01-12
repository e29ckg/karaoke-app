require('dotenv').config();
const express = require('express');
const compression = require('compression'); // บีบอัดข้อมูลให้เบาลง
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" },
    pingTimeout: 60000 // ป้องกันการหลุดบ่อย
});
const path = require('path');
const axios = require('axios');
const os = require('os');

// Config
const PORT = process.env.PORT || 3000;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DOMAIN = process.env.DOMAIN;

// ใช้ Compression
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));

// ตัวแปรเก็บข้อมูลห้อง
let rooms = {};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Helper: Get IP
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

// Socket Logic
io.on('connection', (socket) => {

    // 1. Join Room
    socket.on('joinRoom', (roomName) => {
        const room = roomName || 'default';
        socket.join(room);
        socket.roomName = room;

        if (!rooms[room]) rooms[room] = [];

        console.log(`Socket ${socket.id} joined room: ${room}`);

        // ส่งข้อมูลคิวปัจจุบัน
        socket.emit('updateQueue', rooms[room]);

        let baseUrl = DOMAIN || `http://${getLocalIpAddress()}:${PORT}`;
        socket.emit('serverDomain', `${baseUrl}/admin.html?room=${room}`);

        // Sync เพลงให้จอทีวีที่เพิ่งมาใหม่ (ถ้ามีเพลงเล่นอยู่แล้ว)
        if (rooms[room].length > 0) {
            socket.emit('playSong', rooms[room][0]); 
        }
    });

    // 2. Add Song
    socket.on('addSong', (data) => {
        const room = socket.roomName;
        if (!room || !rooms[room]) return;

        let song = {
            id: data.id,
            title: data.title,
            requester: data.requester || 'ไม่ระบุ',
            thumbnail: data.thumbnail || '' // เก็บรูปปกไว้โชว์สวยๆ
        };

        rooms[room].push(song);
        io.to(room).emit('updateQueue', rooms[room]);

        // ถ้าเป็นเพลงแรก ให้เริ่มเล่นเลย
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

    // 4. Search (API)
    socket.on('searchSong', async (query) => {
        try {
            const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                    part: 'snippet',
                    q: query + ' karaoke คาราโอเกะ -cover', // ลบคำว่า cover ช่วยให้เจอต้นฉบับง่ายขึ้น
                    type: 'video',
                    key: YOUTUBE_API_KEY,
                    maxResults: 10
                },
                headers: { 'Referer': DOMAIN || `http://localhost:${PORT}/` }
            });
            socket.emit('searchResults', response.data.items);
        } catch (error) {
            console.error("Search Error:", error.message);
            socket.emit('searchResults', []);
        }
    });

    // 5. Cleanup (ลบห้องเมื่อไม่มีคนอยู่)
    socket.on('disconnect', () => {
        const room = socket.roomName;
        if (room && rooms[room]) {
            const socketsInRoom = io.sockets.adapter.rooms.get(room);
            if (!socketsInRoom || socketsInRoom.size === 0) {
                console.log(`Cleaning room: ${room}`);
                delete rooms[room];
            }
        }
    });
});

http.listen(PORT, () => {
    console.log(`----------------------------------------`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Mode: ${DOMAIN ? 'Production' : 'Local'}`);
    console.log(`----------------------------------------`);
});