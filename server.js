require('dotenv').config();
const express = require('express');
const compression = require('compression');
const session = require('express-session'); // [NEW] ระบบ Session สำหรับ Login
const sqlite3 = require('sqlite3').verbose(); // [NEW] ระบบฐานข้อมูล
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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234'; // รหัสผ่านตั้งต้นคือ 1234

// --- ฐานข้อมูล SQLite Setup ---
const db = new sqlite3.Database('./karaoke.db', (err) => {
    if (err) console.error('❌ DB Error:', err.message);
    else console.log('✅ Connected to SQLite database.');
});

let screensaverImages = [];

db.serialize(() => {
    // สร้างตารางเก็บเพลงสำหรับการค้นหา
    db.run(`CREATE TABLE IF NOT EXISTS songs (id TEXT PRIMARY KEY, title TEXT, thumbnail TEXT)`);
    // สร้างตารางเก็บภาพสไลด์โชว์
    db.run(`CREATE TABLE IF NOT EXISTS screensavers (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT)`);
    
    // โหลดภาพ Screensaver จากฐานข้อมูลเข้า Memory ตอนเปิดเซิร์ฟเวอร์
    db.all(`SELECT url FROM screensavers`, (err, rows) => {
        if (!err && rows.length > 0) {
            screensaverImages = rows.map(r => r.url);
        } else {
            // ถ้าไม่มีรูปในฐานข้อมูล ให้ใช้รูปพื้นฐาน
            screensaverImages = [
                'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=1920',
                'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=1920'
            ];
        }
    });
});

// --- จัดการ API Keys ---
const apiKeys = (process.env.YOUTUBE_API_KEY || '').split(',');
let currentKeyIndex = 0;
let keyHealth = apiKeys.map((key, index) => ({
    id: index + 1,
    mask: key ? (key.substring(0, 8) + '...') : 'No Key', 
    status: 'unknown', 
    usage: 0,
    lastError: null
}));

// --- Setup Express & Middlewares ---
app.use(compression());
app.use(express.urlencoded({ extended: true })); // สำหรับอ่านค่าฟอร์ม Login
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ตั้งค่า Session
app.use(session({
    secret: 'karaoke-secret-safe-key',
    resave: false,
    saveUninitialized: true
}));

// ตัวแปรเก็บข้อมูลห้อง
let rooms = {};

// --- ระบบ Authentication (Login) ---
// ฟังก์ชันเช็คว่าล็อกอินหรือยัง
const requireLogin = (req, res, next) => {
    if (req.session.loggedIn) return next();
    res.redirect('/login');
};

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/login', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        req.session.loggedIn = true;
        res.redirect('/dashboard');
    } else {
        res.redirect('/login?error=1');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
// [UPDATE] ป้องกันหน้า Dashboard ด้วย requireLogin
app.get('/dashboard', requireLogin, (req, res) => {
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

    socket.emit('updateScreensaver', screensaverImages);

    socket.on('joinRoom', (roomName) => {
        const room = roomName || 'default';
        socket.join(room);
        socket.roomName = room;
        if (!rooms[room]) rooms[room] = [];
        socket.emit('updateQueue', rooms[room]);
        let baseUrl = DOMAIN || `http://${getLocalIpAddress()}:${PORT}`;
        socket.emit('serverDomain', `${baseUrl}/admin.html?room=${room}`);
        if (rooms[room].length > 0) socket.emit('playSong', rooms[room][0]); 
    });

    // 2. Add Song & Auto-Save
    socket.on('addSong', (data) => {
        const room = socket.roomName;
        if (!room || !rooms[room] || rooms[room].length >= 50) return;

        let song = { 
            id: data.id, 
            title: data.title, 
            requester: data.requester || 'ไม่ระบุ', 
            thumbnail: data.thumbnail || '' 
        };

        // 1. เพิ่มเพลงเข้าคิวของห้อง
        rooms[room].push(song);
        io.to(room).emit('updateQueue', rooms[room]);

        if (rooms[room].length === 1) {
            io.to(room).emit('playSong', rooms[room][0]);
        }

        // 2. [NEW] Auto-Save บันทึกลงฐานข้อมูลอัตโนมัติ
        if (song.id && song.title) {
            const thumbUrl = song.thumbnail || `https://img.youtube.com/vi/${song.id}/hqdefault.jpg`;
            
            // ใช้ INSERT OR IGNORE เพื่อป้องกันการบันทึกเพลงที่ id ซ้ำกัน
            db.run(`INSERT OR IGNORE INTO songs (id, title, thumbnail) VALUES (?, ?, ?)`, 
                [song.id, song.title, thumbUrl], 
                function(err) {
                    if (err) {
                        console.error("❌ Auto-Save Error:", err.message);
                    } else if (this.changes > 0) {
                        // this.changes > 0 หมายถึงเพิ่งถูกเพิ่มเข้าไปใหม่จริงๆ
                        console.log(`💾 บันทึกเพลงใหม่เข้าฐานข้อมูลอัตโนมัติ: ${song.title}`);
                        
                        // สั่งให้ทุก Dashboard อัปเดตตารางคลังเพลง (ถ้าเปิดหน้า Dashboard ทิ้งไว้)
                        io.emit('deleteSongSuccess'); 
                    }
            });
        }
    });

    const playNextOrStop = (room) => {
        if (rooms[room].length > 0) io.to(room).emit('playSong', rooms[room][0]);
        else io.to(room).emit('stopPlayer');
    };

    socket.on('replaySong', () => { if(socket.roomName) io.to(socket.roomName).emit('replaySong'); });
    
    socket.on('songEnded', () => {
        const room = socket.roomName;
        if (rooms[room]) { rooms[room].shift(); io.to(room).emit('updateQueue', rooms[room]); playNextOrStop(room); }
    });

    socket.on('skipSong', () => {
        const room = socket.roomName;
        if (rooms[room] && rooms[room].length > 0) { rooms[room].shift(); io.to(room).emit('updateQueue', rooms[room]); playNextOrStop(room); }
    });

    socket.on('sendEffect', (data) => { if (socket.roomName) io.to(socket.roomName).emit('showEffect', data); });
    socket.on('deleteSong', (index) => {
        const room = socket.roomName;
        if (rooms[room] && index >= 0 && index < rooms[room].length) { rooms[room].splice(index, 1); io.to(room).emit('updateQueue', rooms[room]); }
    });
    socket.on('prioritizeSong', (index) => {
        const room = socket.roomName;
        if (rooms[room] && index > 0 && index < rooms[room].length) {
            const songToMove = rooms[room].splice(index, 1)[0];
            rooms[room].splice(1, 0, songToMove); io.to(room).emit('updateQueue', rooms[room]);
        }
    });

    // --- [NEW] Search Song (ดึงจากฐานข้อมูล SQLite แทน YouTube API) ---
    // 4. Search Song (Database -> Fallback to YouTube API)
    socket.on('searchSong', (query) => {
        const searchQuery = `%${query}%`; 
        
        // ขั้นที่ 1: ค้นหาในฐานข้อมูล SQLite ก่อน
        db.all(`SELECT * FROM songs WHERE title LIKE ? LIMIT 15`, [searchQuery], async (err, rows) => {
            if (err) {
                console.error("Database Search Error:", err.message);
                return socket.emit('searchResults', []);
            }

            if (rows.length > 0) {
                // กรณีที่ 1: เจอเพลงในฐานข้อมูล (แปลงข้อมูลให้ตรงกับรูปแบบหน้าเว็บ)
                console.log(`🔍 ค้นพบ "${query}" ในฐานข้อมูล (${rows.length} เพลง)`);
                const formattedResults = rows.map(row => ({
                    id: { videoId: row.id },
                    snippet: {
                        title: row.title,
                        thumbnails: { default: { url: row.thumbnail } }
                    }
                }));
                socket.emit('searchResults', formattedResults);
                
            } else {
                // กรณีที่ 2: ไม่เจอในฐานข้อมูล -> สลับไปใช้ YouTube API
                console.log(`🌐 ไม่พบในฐานข้อมูล กำลังค้นหา "${query}" ผ่าน YouTube API...`);
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
                                maxResults: 15
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
                        
                        if (keyHealth[currentKeyIndex]) keyHealth[currentKeyIndex].lastError = status;

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
            }
        });
    });
    // --- [NEW] บังคับค้นหาผ่าน YouTube API โดยตรง ---
    socket.on('searchSongYouTube', async (query) => {
        console.log(`🌐 ผู้ใช้บังคับค้นหา "${query}" ผ่าน YouTube API...`);
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
                        maxResults: 15
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
                
                if (keyHealth[currentKeyIndex]) keyHealth[currentKeyIndex].lastError = status;

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

    socket.on('getDashboardStats', () => {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        socket.emit('dashboardData', {
            stats: {
                roomCount: Object.keys(rooms).length,
                userCount: io.engine.clientsCount,
                uptime: process.uptime(),
                memory: Math.round(used * 100) / 100,
                keys: keyHealth,
                currentKeyIndex: currentKeyIndex
            },
            rooms: rooms
        });
    });

    // [UPDATE] บันทึก Screensaver ลงฐานข้อมูล
    socket.on('saveScreensaver', (images) => {
        screensaverImages = images;
        io.emit('updateScreensaver', screensaverImages);
        
        // เซฟลง SQLite
        db.serialize(() => {
            db.run(`DELETE FROM screensavers`); // ลบของเก่าออก
            const stmt = db.prepare(`INSERT INTO screensavers (url) VALUES (?)`);
            images.forEach(url => stmt.run(url));
            stmt.finalize();
        });
    });

    socket.on('disconnect', () => {
        const room = socket.roomName;
        if (room && rooms[room]) {
            const socketsInRoom = io.sockets.adapter.rooms.get(room);
            if (!socketsInRoom || socketsInRoom.size === 0) delete rooms[room];
        }
    });
    // --- [NEW] รับคำสั่งเพิ่มเพลงลงฐานข้อมูลจาก Dashboard ---
    socket.on('addSongToDB', (songData) => {
        // songData จะมีหน้าตาแบบนี้ { id: 'dQw4w9WgXcQ', title: 'ชื่อเพลง' }
        
        // ตรวจสอบว่ามีข้อมูลครบหรือไม่
        if (!songData || !songData.id || !songData.title) {
            socket.emit('addSongResult', { success: false, message: 'ข้อมูลไม่ครบถ้วน' });
            return;
        }

        // สร้าง URL สำหรับรูปภาพ Thumbnail อัตโนมัติ
        const thumbnailUrl = `https://img.youtube.com/vi/${songData.id}/hqdefault.jpg`;
        
        // คำสั่ง SQL สำหรับเพิ่มข้อมูล
        const sql = `INSERT INTO songs (id, title, thumbnail) VALUES (?, ?, ?)`;
        
        db.run(sql, [songData.id, songData.title, thumbnailUrl], function(err) {
            if (err) {
                console.error("❌ Add Song Error:", err.message);
                // สาเหตุหลักที่ Error มักเกิดจาก id ซ้ำกัน (เพราะเราตั้ง id เป็น PRIMARY KEY)
                socket.emit('addSongResult', { success: false, message: 'เพิ่มเพลงไม่สำเร็จ (รหัสวิดีโอนี้อาจมีอยู่ในระบบแล้ว)' });
            } else {
                console.log(`✅ แอดมินเพิ่มเพลงใหม่: ${songData.title}`);
                // แจ้งกลับไปยัง Dashboard ว่าบันทึกสำเร็จ
                socket.emit('addSongResult', { success: true, message: 'บันทึกเพลงลงฐานข้อมูลเรียบร้อยแล้ว!' });
            }
        });
    });

    // --- [NEW] ดึงรายการเพลงทั้งหมดจากฐานข้อมูล ---
    socket.on('requestSongList', () => {
        // ใช้คำสั่ง SELECT เพื่อดึงข้อมูลทั้งหมด และเรียงตามชื่อเพลง (ASC)
        db.all(`SELECT * FROM songs ORDER BY title ASC`, [], (err, rows) => {
            if (err) {
                console.error("❌ Fetch Song Error:", err.message);
                return;
            }
            // ส่งข้อมูลกลับไปให้ Dashboard
            socket.emit('songListResult', rows);
        });
    });

    // --- [NEW] ลบเพลงออกจากฐานข้อมูล ---
    socket.on('deleteSongFromDB', (id) => {
        // ใช้คำสั่ง DELETE โดยอ้างอิงจาก id 
        db.run(`DELETE FROM songs WHERE id = ?`, [id], function(err) {
            if (err) {
                console.error("❌ Delete Song Error:", err.message);
            } else {
                console.log(`🗑️ ลบเพลงรหัส ${id} ออกจากระบบแล้ว`);
                // ส่งสัญญาณบอก Dashboard ว่าลบสำเร็จ เพื่อให้ Dashboard ดึงข้อมูลใหม่
                socket.emit('deleteSongSuccess');
            }
        });
    });
}); 

http.listen(PORT, () => {
    console.log(`----------------------------------------`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔑 Admin Password is set to: ${ADMIN_PASSWORD}`);
    console.log(`----------------------------------------`);
});