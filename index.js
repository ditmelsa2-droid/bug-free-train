const mc = require('minecraft-protocol');
const http = require('http');
const https = require('https');

// ================= CẤU HÌNH CLUSTER 30 BOTS (TÊN THẬT 100% KHÔNG DẤU GẠCH DƯỚI) =================
const CONFIG = {
    host: 'play.healthrecords.id.vn',
    port: 25641,
    version: '1.21.1',
    auth: 'offline',
    password: 'Password123@',
    geminiKey: 'AIzaSyA-Xg4cZ569NEgAwywdLsvR3b_1oFhy5zA',
    geminiModel: 'gemini-2.0-flash',
    bots: [
        'BearSamurai', 'DucAnhGaming', 'ThanhProPvP', 'Tung01k2', 'KaDiHaaDn',
        'PhongPvP', 'HuyBeo199', 'VietProMC', 'HoangMiner', 'LinhBuilder',
        'NamRedstone', 'MinhSurvival', 'TuanFarmer', 'SonPvPer', 'TrungExplorer',
        'AnCrafter', 'KhoaArcher', 'DuyWarrior', 'HieuAlchemist', 'LongHunter',
        'HaiBlacksmith', 'BachTrader', 'QuangGuard', 'DatAdventurer', 'ThangKnight',
        'CuongScout', 'KhanhRanger', 'HungChampion', 'LocWanderer', 'TriEnchanter'
    ]
};

const activeClients = new Map();

// ================= GEMINI AI CHAT ENGINE =================
async function askGemini(botName, senderName, message, isBotToBot = false) {
    let prompt = '';
    if (isBotToBot) {
        prompt = `Bạn là game thủ '${botName}' trong Minecraft sinh tồn Việt Nam. Đồng đội '${senderName}' vừa nói: "${message}". Hãy đáp lại tự nhiên, dí dỏm, chuẩn gamer VN (1 câu 3-10 từ, không dùng ngoặc kép hay tiền tố).`;
    } else {
        prompt = `Bạn là người chơi '${botName}' trong Minecraft Việt Nam. Bạn '${senderName}' vừa nói: "${message}". Hãy đáp lại ngắn gọn, thân thiện, hài hước, chuẩn gamer VN (1 câu 3-10 từ, không dùng ngoặc kép hay tiền tố).`;
    }

    const payload = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 50, temperature: 0.85 }
    });

    return new Promise((resolve) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiKey}`;
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 3500
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    resolve(text || null);
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(payload);
        req.end();
    });
}

function generateBotTopic(botName) {
    const topics = [
        "Có ai đi đào kim cương cùng tôi không?",
        "Ê nãy vừa thấy con creeper nổ suýt chết anh em ơi.",
        "Ai có thừa ít bánh mì hoặc thịt bò cho xin với, đói quá.",
        "Mọi người đang xây nhà ở tọa độ nào thế?",
        "Khu này nhiều quái ghê, chuẩn bị làm tí giáp sắt đi săn boss thôi.",
        "Trời mưa to thế này ai có chỗ trú không cho ké với.",
        "Vừa tìm thấy cái hang to đùng nhiều quặng sắt dã man.",
        "Server này đông vui phết nhỉ anh em."
    ];
    return topics[Math.floor(Math.random() * topics.length)];
}

// ================= ULTRA-STABLE BOT CLIENT CONTROLLER =================
function createBotClient(username, delayMs) {
    setTimeout(() => {
        console.log(`[${username}] Đang kết nối tới ${CONFIG.host}:${CONFIG.port}...`);

        let client;
        let playerPos = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
        let keepAliveTimer = null;

        try {
            client = mc.createClient({
                host: CONFIG.host,
                port: CONFIG.port,
                username: username,
                auth: CONFIG.auth,
                version: CONFIG.version,
                checkTimeoutInterval: 120000,
                keepAlive: true,
                hideErrors: true
            });
        } catch (e) {
            console.error(`[${username}] Không thể tạo client:`, e.message);
            setTimeout(() => createBotClient(username, 0), 10000);
            return;
        }

        // Tự động chấp nhận Resource Pack từ server
        client.on('resource_pack_send', (packet) => {
            try {
                client.write('resource_pack_receive', { uuid: packet.uuid, result: 3 }); // ACCEPTED
                client.write('resource_pack_receive', { uuid: packet.uuid, result: 0 }); // SUCCESSFULLY_LOADED
            } catch (e) {}
        });

        // Xử lý vị trí Spawn & Xác nhận dịch chuyển (Chống bị server kick do đứng im)
        client.on('position', (packet) => {
            playerPos.x = packet.x;
            playerPos.y = packet.y;
            playerPos.z = packet.z;
            playerPos.yaw = packet.yaw;
            playerPos.pitch = packet.pitch;

            try {
                // Xác nhận teleport với server
                client.write('teleport_confirm', { teleportId: packet.teleportId });
                client.write('position_look', {
                    x: playerPos.x,
                    y: playerPos.y,
                    z: playerPos.z,
                    yaw: playerPos.yaw,
                    pitch: playerPos.pitch,
                    onGround: true
                });
            } catch (e) {}
        });

        // Đăng nhập thành công vào thế giới
        client.on('login', (packet) => {
            console.log(`[${username}] -> ĐÃ VÀO SERVER VÀ HOẠT ĐỘNG! (${activeClients.size + 1}/${CONFIG.bots.length})`);
            activeClients.set(username, client);

            // Gửi lệnh /register và /login 3 lần liên tiếp cách nhau để đảm bảo vào 100%
            setTimeout(() => {
                try {
                    client.write('chat_command', { command: `register ${CONFIG.password} ${CONFIG.password}` });
                    client.write('chat_command', { command: `login ${CONFIG.password}` });
                } catch (e) {}
            }, 800);

            setTimeout(() => {
                try {
                    client.write('chat_command', { command: `login ${CONFIG.password}` });
                } catch (e) {}
            }, 2000);

            setTimeout(() => {
                try {
                    client.write('chat_command', { command: `login ${CONFIG.password}` });
                } catch (e) {}
            }, 4000);

            // Vòng lặp gửi vị trí định kỳ mỗi 1.5 giây để duy trì trạng thái Online vĩnh viễn (Chống AFK Timeout)
            if (keepAliveTimer) clearInterval(keepAliveTimer);
            keepAliveTimer = setInterval(() => {
                if (playerPos.y !== 0) {
                    try {
                        client.write('position', {
                            x: playerPos.x,
                            y: playerPos.y,
                            z: playerPos.z,
                            onGround: true
                        });
                    } catch (e) {}
                }
            }, 1500);
        });

        // Lắng nghe thông báo chat để tự động gõ lại mật khẩu nếu server yêu cầu
        client.on('system_chat', (packet) => {
            const text = JSON.stringify(packet.content || '').toLowerCase();
            if (text.includes('register') || text.includes('đăng ký')) {
                try { client.write('chat_command', { command: `register ${CONFIG.password} ${CONFIG.password}` }); } catch (e) {}
            } else if (text.includes('login') || text.includes('đăng nhập')) {
                try { client.write('chat_command', { command: `login ${CONFIG.password}` }); } catch (e) {}
            }
        });

        // Lắng nghe người chơi chat
        client.on('player_chat', async (packet) => {
            const rawMsg = packet.plainMessage || packet.formattedMessage || '';
            const sender = packet.senderName || '';
            if (!rawMsg || sender === username) return;

            const cleanMsg = rawMsg.toLowerCase();
            const isSenderBot = CONFIG.bots.includes(sender);

            const isMentioned = cleanMsg.includes(username.toLowerCase()) || cleanMsg.includes('ê') || cleanMsg.includes('alo') || cleanMsg.includes('ai ');
            if (isMentioned && Math.random() < 0.75) {
                const reply = await askGemini(username, sender, rawMsg, isSenderBot);
                if (reply && activeClients.has(username)) {
                    setTimeout(() => {
                        try {
                            client.write('chat_message', { message: reply, timestamp: BigInt(Date.now()) });
                        } catch (e) {}
                    }, 1500 + Math.random() * 2000);
                }
            }
        });

        // Tự động kết nối lại khi bị ngắt kết nối
        client.on('end', (reason) => {
            activeClients.delete(username);
            if (keepAliveTimer) clearInterval(keepAliveTimer);
            console.log(`[${username}] Ngắt kết nối (${reason}). Tự kết nối lại sau 8s...`);
            setTimeout(() => createBotClient(username, 0), 8000 + Math.random() * 4000);
        });

        client.on('kicked', (reason) => {
            activeClients.delete(username);
            if (keepAliveTimer) clearInterval(keepAliveTimer);
            console.log(`[${username}] Kicked:`, JSON.stringify(reason));
        });

        client.on('error', (err) => {
            // Bỏ qua lỗi packet tùy chỉnh không nghiêm trọng
        });

    }, delayMs);
}

// ================= BOT-TO-BOT CHAT BANTER LOOP =================
setInterval(async () => {
    const botList = Array.from(activeClients.keys());
    if (botList.length < 2) return;

    const botA = botList[Math.floor(Math.random() * botList.length)];
    let botB = botList[Math.floor(Math.random() * botList.length)];
    while (botB === botA) {
        botB = botList[Math.floor(Math.random() * botList.length)];
    }

    const clientA = activeClients.get(botA);
    const clientB = activeClients.get(botB);
    if (!clientA || !clientB) return;

    const topic = await generateBotTopic(botA);
    try {
        clientA.write('chat_message', { message: topic, timestamp: BigInt(Date.now()) });
    } catch (e) {}

    setTimeout(async () => {
        const reply = await askGemini(botB, botA, topic, true);
        if (reply && activeClients.has(botB)) {
            try {
                clientB.write('chat_message', { message: reply, timestamp: BigInt(Date.now()) });
            } catch (e) {}
        }
    }, 3000 + Math.random() * 2000);

}, 50000);

// ================= KHỞI CHẠY TẤT CẢ 30 BOTS =================
console.log('================================================================');
console.log('   DEAHADES 30 AI COMPANIONS & 24/7 UPTIME BOT CLUSTER');
console.log(`   Target Server: ${CONFIG.host}:${CONFIG.port}`);
console.log(`   Total Bots: ${CONFIG.bots.length}`);
console.log('================================================================');

// ================= HTTP HEALTH MONITOR (CHO RENDER & CLOUD 24/7) =================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h2>🟢 DeaHades 30 AI Bots Uptime Cluster</h2><p>Active Bots: ${activeClients.size}/${CONFIG.bots.length}</p><p>Server: ${CONFIG.host}:${CONFIG.port}</p>`);
}).listen(PORT, '0.0.0.0', () => {
    console.log(`[Render Health] Web server đang lắng nghe tại 0.0.0.0:${PORT} - Sẵn sàng 24/7!`);
});

CONFIG.bots.forEach((botName, index) => {
    createBotClient(botName, index * 4000); // Khởi động so le cách nhau 4 giây
});
