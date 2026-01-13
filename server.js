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

// --- ส่วนจัดการ API Keys (ไว้ข้างนอก io.on เพื่อให้ใช้ร่วมกันทุกคน) ---
// ดึงคีย์มาแยกด้วยเครื่องหมาย ,
const apiKeys = (process.env.YOUTUBE_API_KEY || '').split(',');
let currentKeyIndex = 0; // ตัวนับว่าจะใช้คีย์ตัวที่เท่าไหร่

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

// --- เริ่มต้นการเชื่อมต่อ Socket ---
io.on('connection', (socket) => {

    // 1. Join Room
    socket.on('joinRoom', (roomName) => {
        const room = roomName || 'default';
        socket.join(room);
        socket.roomName = room;

        if (!rooms[room]) rooms[room] = [];

        console.log(`Socket ${socket.id} joined room: ${room}`);

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

    // 4. Search Song (ระบบ Multi-Key Rotation)
    // *** ต้องอยู่ภายใน io.on('connection', ...) เท่านั้น ***
    socket.on('searchSong', async (query) => {
        let attempts = 0;
        let success = false;

        // วนลูปหาคีย์ที่ใช้ได้
        while (attempts < apiKeys.length && !success) {
            const currentKey = apiKeys[currentKeyIndex];
            
            // เช็คว่ามีคีย์จริงๆ ไหม (เผื่อใน .env ว่างเปล่า)
            if (!currentKey || currentKey.trim() === '') {
                console.error("API Key is empty/missing at index", currentKeyIndex);
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
                        key: currentKey.trim(), // trim ตัดช่องว่างเผื่อมี
                        maxResults: 10
                    },
                    headers: {
                        'Referer': DOMAIN || `http://localhost:${PORT}/` 
                    }
                });
                
                socket.emit('searchResults', response.data.items);
                success = true;

            } catch (error) {
                console.error(`Key #${currentKeyIndex + 1} Failed: ${error.response ? error.response.status : error.message}`);
                
                // ถ้า Error 403 (โควต้าเต็ม/Forbidden) หรือ 429 (Too Many Requests) ให้สลับคีย์
                if (error.response && (error.response.status === 403 || error.response.status === 429)) {
                    console.log(`Swapping Key... (Current was #${currentKeyIndex + 1})`);
                    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length; 
                    attempts++;
                } else {
                    // ถ้า Error อื่นๆ (เช่น เน็ตหลุด) หยุดเลย
                    socket.emit('searchResults', []);
                    break;
                }
            }
        }

        if (!success) {
            console.log("All API Keys failed.");
            socket.emit('searchResults', []);
        }
    });

    // 5. Cleanup
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
    console.log(`🔑 Loaded ${apiKeys.length} API Key(s)`);
    console.log(`🌍 Mode: ${DOMAIN ? 'Production' : 'Local'}`);
    console.log(`----------------------------------------`);
});