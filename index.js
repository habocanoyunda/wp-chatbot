const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ],
    }
});

const conversationHistory = {};

const SYSTEM_PROMPT = `Sen bir okul asistanısın. Öğrencilere sınav tarihleri, konular ve genel okul bilgileri hakkında yardımcı oluyorsun. Türkçe konuş. Kısa ve net cevaplar ver.`;

client.on('qr', async (qr) => {
    console.log('QR kodunu tara:');
    qrcode.generate(qr, { small: true });
    try {
        await QRCode.toFile('/tmp/qr.png', qr, { width: 400 });
        console.log('QR resim olarak kaydedildi: /tmp/qr.png');
        const qrBase64 = await QRCode.toDataURL(qr, { width: 400 });
        console.log('QR_BASE64_START');
        console.log(qrBase64);
        console.log('QR_BASE64_END');
    } catch (e) {
        console.log('QR resim hatası:', e);
    }
});

client.on('ready', () => {
    console.log('Bot hazır!');
});

client.on('message', async (message) => {
    if (message.isGroupMsg) return;
    
    const userId = message.from;
    const userMessage = message.body;

    if (!conversationHistory[userId]) {
        conversationHistory[userId] = [];
    }

    conversationHistory[userId].push({
        role: 'user',
        content: userMessage
    });

    // Son 10 mesajı tut
    if (conversationHistory[userId].length > 10) {
        conversationHistory[userId] = conversationHistory[userId].slice(-10);
    }

    try {
        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: conversationHistory[userId]
        });

        const botReply = response.content[0].text;

        conversationHistory[userId].push({
            role: 'assistant',
            content: botReply
        });

        await message.reply(botReply);
    } catch (error) {
        console.error('Hata:', error);
        await message.reply('Üzgünüm, bir hata oluştu. Lütfen tekrar dene.');
    }
});

client.initialize();
