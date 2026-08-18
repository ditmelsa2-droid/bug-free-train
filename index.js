process.on('uncaughtException', (err) => console.error('[UncaughtException]', err.message));
process.on('unhandledRejection', (reason) => console.error('[UnhandledRejection]', reason));

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const autoEat = require('mineflayer-auto-eat').default;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const mcData = require('minecraft-data');
const https = require('https');

// ================= CẤU HÌNH CLUSTER 30 BOTS =================
const CONFIG = {
    host: 'play.healthrecords.id.vn',
    port: 25641,
    version: '1.21.1',
    auth: 'offline',
    password: 'Password123@',
    geminiKey: 'AIzaSyA-Xg4cZ569NEgAwywdLsvR3b_1oFhy5zA',
    geminiModel: 'gemini-2.0-flash',
    bots: [
        'Bear_Samurai', 'duc_anh_gaming', 'thanhpro_pvp', 'tung01k2', 'kadihaadn',
        'phong_pvp', 'huy_beo_199', 'viet_pro_mc', 'hoang_miner', 'linh_builder',
        'nam_redstone', 'minh_survival', 'tuan_farmer', 'son_pvper', 'trung_explorer',
        'an_crafter', 'khoa_archer', 'duy_warrior', 'hieu_alchemist', 'long_hunter',
        'hai_blacksmith', 'bach_trader', 'quang_guard', 'dat_adventurer', 'thang_knight',
        'cuong_scout', 'khanh_ranger', 'hung_champion', 'loc_wanderer', 'tri_enchanter'
    ]
};

const activeBots = new Map();

// ================= GEMINI AI CHAT ENGINE =================
async function askGemini(botName, senderName, message, isBotToBot = false) {
    let prompt = '';
    if (isBotToBot) {
        prompt = `Bạn là bot game thủ '${botName}' trong Minecraft sinh tồn Việt Nam.
Đồng đội '${senderName}' vừa nói: "${message}".
Hãy đáp lại siêu tự nhiên, ngắn gọn, hài hước, đúng chất game thủ VN (1 câu 3-10 từ, không dùng ngoặc kép).`;
    } else {
        prompt = `Bạn là bot đồng hành '${botName}' trong Minecraft Việt Nam.
Người chơi '${senderName}' vừa nói: "${message}".
Hãy đáp lại ngắn gọn, thân thiện, dí dỏm, đúng chất game thủ VN (1 câu 3-10 từ, không dùng ngoặc kép).`;
    }

    const payload = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 60, temperature: 0.85 }
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

// Generate an opening banter topic for Bot-to-Bot chat
async function generateBotTopic(botName) {
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

// ================= BOT LIFECYCLE & AI CONTROLLER =================
function createBot(username, delayMs) {
    setTimeout(() => {
        console.log(`[${username}] Đang kết nối tới ${CONFIG.host}:${CONFIG.port}...`);

        const bot = mineflayer.createBot({
            host: CONFIG.host,
            port: CONFIG.port,
            username: username,
            version: CONFIG.version,
            auth: CONFIG.auth,
            viewDistance: 'tiny',
            checkTimeoutInterval: 60000
        });

        bot.loadPlugin(pathfinder);
        bot.loadPlugin(pvp);
        bot.loadPlugin(autoEat);
        bot.loadPlugin(armorManager);

        let defaultMovements = null;
        let followingPlayer = null;

        bot.once('spawn', () => {
            console.log(`[${username}] -> Đã online thành công! (${activeBots.size + 1}/${CONFIG.bots.length})`);
            activeBots.set(username, bot);

            try {
                const mcData = require('minecraft-data')(bot.version);
                defaultMovements = new Movements(bot, mcData);
                defaultMovements.canDig = true;
                defaultMovements.allow1by1towers = false;
                defaultMovements.scafoldingBlocks = [];
                bot.pathfinder.setMovements(defaultMovements);
            } catch (e) {}

            // Auto Login / Register
            setTimeout(() => {
                bot.chat(`/register ${CONFIG.password} ${CONFIG.password}`);
                bot.chat(`/login ${CONFIG.password}`);
            }, 1200);

            // Autonomous movement loop (Water check, Anti-clumping, Exploring)
            setInterval(() => {
                if (!bot.entity) return;

                // 1. Water Evacuation: Swim up and find dry land
                if (bot.entity.isInWater) {
                    bot.setControlState('jump', true);
                    const land = bot.findBlock({
                        matching: (block) => block.name !== 'water' && block.name !== 'lava' && block.name !== 'seagrass' && block.boundingBox === 'block',
                        maxDistance: 30
                    });
                    if (land && defaultMovements) {
                        bot.pathfinder.setGoal(new goals.GoalNear(land.position.x, land.position.y, land.position.z, 1));
                    }
                } else {
                    bot.setControlState('jump', false);
                }

                // 2. Auto Defend: Attack hostile monsters within 5 blocks
                const hostile = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'hostile') && e.position.distanceTo(bot.entity.position) < 5);
                if (hostile && !followingPlayer) {
                    bot.pvp.attack(hostile);
                }

                // 3. Autonomous wandering: Roam around terrain naturally
                if (!followingPlayer && !bot.pathfinder.isMoving() && Math.random() < 0.25) {
                    const rx = bot.entity.position.x + (Math.random() * 24 - 12);
                    const rz = bot.entity.position.z + (Math.random() * 24 - 12);
                    bot.pathfinder.setGoal(new goals.GoalXZ(rx, rz));
                }
            }, 3500);
        });

        // Chat Interaction Listener
        bot.on('chat', async (sender, message) => {
            if (sender === username || sender === 'Server' || sender === 'Console') return;

            const cleanMsg = message.trim().toLowerCase();
            const isSenderBot = CONFIG.bots.includes(sender);

            // Real player commands
            if (!isSenderBot) {
                if (cleanMsg.includes('theo') || cleanMsg.includes('follow') || cleanMsg.includes('lại đây')) {
                    const target = bot.players[sender]?.entity;
                    if (target && bot.entity.position.distanceTo(target.position) < 30) {
                        followingPlayer = sender;
                        bot.chat(`Ok ${sender}, tôi đi theo hỗ trợ ông nè!`);
                        bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
                        return;
                    }
                }

                if (cleanMsg.includes('dừng') || cleanMsg.includes('đứng lại') || cleanMsg.includes('stop')) {
                    if (followingPlayer === sender) {
                        followingPlayer = null;
                        bot.pathfinder.stop();
                        bot.chat(`Ok tôi đứng đây canh chừng nhé.`);
                        return;
                    }
                }

                if (cleanMsg.includes('chặt cây') || cleanMsg.includes('chặt gỗ')) {
                    const treeLog = bot.findBlock({
                        matching: (block) => block.name.endsWith('_log') || block.name.endsWith('_wood'),
                        maxDistance: 20
                    });
                    if (treeLog) {
                        bot.chat(`Để tôi đi chặt mấy cây gỗ quanh đây.`);
                        bot.pathfinder.setGoal(new goals.GoalLookAtBlock(treeLog.position, bot.world));
                        try {
                            await bot.dig(treeLog);
                            bot.chat(`Đã chặt xong khúc gỗ!`);
                        } catch (e) {}
                        return;
                    }
                }
            }

            // Conversational Response
            const isMentioned = cleanMsg.includes(username.toLowerCase()) || cleanMsg.includes('ê') || cleanMsg.includes('alo') || cleanMsg.includes('ai ');
            if (isMentioned && Math.random() < 0.85) {
                const reply = await askGemini(username, sender, message, isSenderBot);
                if (reply) {
                    setTimeout(() => bot.chat(reply), 1200 + Math.random() * 1800);
                }
            }
        });

        // Auto-reconnect
        bot.on('end', (reason) => {
            activeBots.delete(username);
            console.log(`[${username}] Ngắt kết nối (${reason}). Kết nối lại sau 5s...`);
            setTimeout(() => createBot(username, 0), 5000);
        });

        bot.on('error', (err) => {
            console.error(`[${username}] Lỗi: ${err.message}`);
        });

    }, delayMs);
}

// ================= BOT-TO-BOT AUTONOMOUS CONVERSATION LOOP =================
// Cứ mỗi 35 - 70 giây, 1 bot ngẫu nhiên sẽ mở lời hỏi han, và 1 bot khác sẽ đáp lại!
setInterval(async () => {
    const botList = Array.from(activeBots.keys());
    if (botList.length < 2) return;

    const botA = botList[Math.floor(Math.random() * botList.length)];
    let botB = botList[Math.floor(Math.random() * botList.length)];
    while (botB === botA) {
        botB = botList[Math.floor(Math.random() * botList.length)];
    }

    const botInstanceA = activeBots.get(botA);
    const botInstanceB = activeBots.get(botB);
    if (!botInstanceA || !botInstanceB) return;

    // Bot A hỏi
    const topic = await generateBotTopic(botA);
    botInstanceA.chat(topic);

    // Bot B đáp lại sau 2.5 - 4.5 giây
    setTimeout(async () => {
        const reply = await askGemini(botB, botA, topic, true);
        if (reply && botInstanceB) {
            botInstanceB.chat(reply);
        }
    }, 2500 + Math.random() * 2000);

}, 45000);

// ================= KHỞI CHẠY TẤT CẢ 30 BOTS =================
console.log('================================================================');
console.log('   DEAHADES 30 AI COMPANIONS & 24/7 UPTIME BOT CLUSTER');
console.log(`   Target Server: ${CONFIG.host}:${CONFIG.port}`);
console.log(`   Total Bots: ${CONFIG.bots.length}`);
console.log('================================================================');

// ================= HTTP HEALTH MONITOR (CHO CLOUD 24/7) =================
const http = require('http');
const PORT = process.env.PORT || 7860;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h2>🟢 DeaHades 30 AI Bots Uptime Cluster</h2><p>Active Bots: ${activeBots.size}/${CONFIG.bots.length}</p><p>Server: ${CONFIG.host}:${CONFIG.port}</p>`);
}).listen(PORT, () => {
    console.log(`[Health Monitor] Web server đang lắng nghe tại cổng ${PORT} để giữ Space chạy 24/7!`);
});

CONFIG.bots.forEach((botName, index) => {
    createBot(botName, index * 3500); // Khởi động so le cách nhau 3.5 giây
});
