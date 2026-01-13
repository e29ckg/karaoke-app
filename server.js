// เตรียมตัวแปร Keys (แยกด้วยเครื่องหมาย ,)
    const apiKeys = (process.env.YOUTUBE_API_KEY || '').split(',');
    let currentKeyIndex = 0;

    // 4. ค้นหาเพลง (ระบบหลาย Key)
    socket.on('searchSong', async (query) => {
        let attempts = 0;
        let success = false;

        // วนลูปจนกว่าจะเจอคีย์ที่ใช้ได้ หรือลองครบทุกคีย์แล้ว
        while (attempts < apiKeys.length && !success) {
            const currentKey = apiKeys[currentKeyIndex];
            
            try {
                const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                    params: {
                        part: 'snippet',
                        q: query + ' karaoke คาราโอเกะ -cover',
                        type: 'video',
                        key: currentKey, // ใช้คีย์ปัจจุบัน
                        maxResults: 10
                    },
                    headers: {
                        'Referer': DOMAIN || `http://localhost:${PORT}/` 
                    }
                });
                
                // ถ้าสำเร็จ ส่งผลลัพธ์กลับไป
                socket.emit('searchResults', response.data.items);
                success = true;
                // console.log(`Search success with Key #${currentKeyIndex + 1}`);

            } catch (error) {
                console.error(`Key #${currentKeyIndex + 1} Failed: ${error.response ? error.response.status : error.message}`);
                
                // ถ้า Error 403 (โควต้าเต็ม หรือ Forbidden) ให้ลองคีย์ถัดไป
                if (error.response && error.response.status === 403) {
                    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length; // ขยับไปคีย์ถัดไป (วนกลับมา 0 ถ้าหมด)
                    attempts++;
                    console.log(`Swapping to Key #${currentKeyIndex + 1}...`);
                } else {
                    // ถ้าเป็น Error อื่น (เช่น เน็ตหลุด) ให้หยุดเลย ไม่ต้องลองต่อ
                    socket.emit('searchResults', []);
                    break;
                }
            }
        }

        if (!success) {
            console.log("All API Keys failed.");
            socket.emit('searchResults', []); // ส่งผลว่างกลับไปถ้าพังทุกคีย์
        }
    });