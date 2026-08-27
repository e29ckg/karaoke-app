// นำเข้าไลบรารี SQLite
const sqlite3 = require('sqlite3').verbose();

// 1. เชื่อมต่อกับฐานข้อมูลเดิมของเรา
const db = new sqlite3.Database('./karaoke.db', (err) => {
    if (err) {
        console.error('❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้:', err.message);
        return;
    }
    console.log('✅ เชื่อมต่อฐานข้อมูล karaoke.db สำเร็จ');
});

// 2. เตรียมรายการเพลงที่ต้องการเพิ่ม (คุณสามารถนำเพลงของคุณมาใส่เพิ่มต่อท้ายได้เลย)
// อธิบาย: 
// - id คือรหัสวิดีโอ YouTube (ตัวอักษร 11 ตัวหลัง v=)
// - title คือชื่อเพลงที่จะให้ผู้ใช้ค้นหาเจอ
const newSongs = [
    { id: '3JZ_D3ELwOQ', title: 'ไกลแค่ไหน คือ ใกล้ - getsunova (Karaoke)' },
    { id: 'kJQP7kiw5Fk', title: 'Despacito - Luis Fonsi (Karaoke Version)' },
    { id: 'rYEDA3JcQqw', title: 'Rolling in the Deep - Adele (Karaoke)' },
    { id: 'L3wKzyIN1yk', title: 'ซ่อนกลิ่น - Palmy (คาราโอเกะ)' },
    // วิธีเพิ่ม: { id: 'รหัสวิดีโอ', title: 'ชื่อเพลง' },
];

// 3. เริ่มกระบวนการบันทึกข้อมูล
console.log(`⏳ กำลังนำเข้าเพลงทั้งหมด ${newSongs.length} เพลง...`);

db.serialize(() => {
    // ใช้คำสั่ง INSERT OR IGNORE เพื่อป้องกันการเพิ่มเพลงซ้ำ (ดูจากรหัส id)
    const stmt = db.prepare(`INSERT OR IGNORE INTO songs (id, title, thumbnail) VALUES (?, ?, ?)`);
    
    let insertedCount = 0;

    newSongs.forEach(song => {
        // สร้าง URL สำหรับภาพหน้าปก (Thumbnail) อัตโนมัติจาก YouTube ID
        const thumbnailUrl = `https://img.youtube.com/vi/${song.id}/hqdefault.jpg`;
        
        // สั่งบันทึกลงฐานข้อมูล
        stmt.run(song.id, song.title, thumbnailUrl, function(err) {
            if (err) {
                console.error(`❌ เกิดข้อผิดพลาดกับเพลง ${song.title}:`, err.message);
            } else if (this.changes > 0) {
                // this.changes จะบอกว่ามีแถวถูกเพิ่มเข้าไปจริงๆ หรือไม่ (ถ้าซ้ำจะเป็น 0)
                insertedCount++;
            }
        });
    });

    // 4. สรุปผลและปิดการเชื่อมต่อ
    stmt.finalize(() => {
        console.log(`🎉 นำเข้าข้อมูลเสร็จสิ้น!`);
        console.log(`📌 เพลงใหม่ที่ถูกเพิ่ม: ${insertedCount} เพลง (ไม่นับเพลงที่ซ้ำ)`);
        db.close();
    });
});