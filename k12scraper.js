const puppeteer = require('puppeteer-core');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const BASE_URL = 'https://evrensel.k12net.com';

// Tek browser instance - sürekli açık
let browserInstance = null;
let pageInstance = null;
let isLoggedIn = false;

async function getBrowser() {
    if (browserInstance) return browserInstance;
    browserInstance = await puppeteer.launch({
        executablePath: EXECUTABLE_PATH,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ],
        headless: true
    });
    browserInstance.on('disconnected', () => {
        browserInstance = null;
        pageInstance = null;
        isLoggedIn = false;
    });
    return browserInstance;
}

async function getPage() {
    const browser = await getBrowser();
    if (pageInstance) return pageInstance;
    pageInstance = await browser.newPage();
    await pageInstance.setViewport({ width: 1280, height: 800 });
    return pageInstance;
}

async function ensureLoggedIn(page) {
    if (isLoggedIn) return;

    await page.goto(`${BASE_URL}/Login.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.waitForSelector('#username', { timeout: 10000 });
    await page.click('#username', { clickCount: 3 });
    await page.type('#username', process.env.K12_USERNAME || '');
    await page.click('#password', { clickCount: 3 });
    await page.type('#password', process.env.K12_PASSWORD || '');

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click('#loginButton')
    ]);

    if (page.url().includes('Login.aspx')) {
        throw new Error('Giriş başarısız.');
    }

    isLoggedIn = true;
    console.log('K12 login başarılı.');
}

async function getOdevler() {
    try {
        const page = await getPage();
        await ensureLoggedIn(page);

        await page.goto(`${BASE_URL}/SPTS.Web/WebParts/Assignment/#/`, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 4000));

        // Session süresi dolmuşsa tekrar login
        if (page.url().includes('Login.aspx')) {
            isLoggedIn = false;
            await ensureLoggedIn(page);
            await page.goto(`${BASE_URL}/SPTS.Web/WebParts/Assignment/#/`, { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(r => setTimeout(r, 4000));
        }

        const odevCount = await page.evaluate(() =>
            document.querySelectorAll('li .homework-title').length
        );

        const odevler = [];
        for (let i = 0; i < odevCount; i++) {
            await page.evaluate((index) => {
                const items = document.querySelectorAll('li .homework-title');
                if (items[index]) items[index].click();
            }, i);
            await new Promise(r => setTimeout(r, 1500));

            const detay = await page.evaluate(() => {
                const modal = document.querySelector('.modal, [class*="modal"], [class*="detail"]');
                if (!modal) return null;
                const text = modal.innerText;

                const get = (key) => {
                    const regex = new RegExp(key + '\\s*\\n([^\\n]+)');
                    const match = text.match(regex);
                    return match ? match[1].trim() : '';
                };

                return {
                    baslik: get('Başlık'),
                    ders: get('Ders'),
                    aciklama: (() => {
                        const m = text.match(/Açıklama\s*\n([\s\S]*?)\nBaşlama Tarihi/);
                        return m ? m[1].replace(/\n+/g, ' ').trim() : '';
                    })(),
                    sonTarih: get('Son Tarih'),
                    ogretmen: get('Öğretmen')
                };
            });

            if (detay) odevler.push(detay);

            await page.evaluate(() => {
                const kapat = Array.from(document.querySelectorAll('button'))
                    .find(el => el.innerText?.trim() === 'Kapat');
                if (kapat) kapat.click();
            });
            await new Promise(r => setTimeout(r, 800));
        }

        return odevler.map(o =>
            `Ders: ${o.ders} | Başlık: ${o.baslik} | Açıklama: ${o.aciklama} | Son Tarih: ${o.sonTarih} | Öğretmen: ${o.ogretmen}`
        );
    } catch (e) {
        console.error('K12 ödev hatası:', e.message);
        // Hata durumunda browser'i sıfırla
        browserInstance = null;
        pageInstance = null;
        isLoggedIn = false;
        return [`Hata: ${e.message}`];
    }
}

async function getMesajlar() {
    try {
        const page = await getPage();
        await ensureLoggedIn(page);

        await page.goto(`${BASE_URL}/SPTS.Web/`, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        if (page.url().includes('Login.aspx')) {
            isLoggedIn = false;
            await ensureLoggedIn(page);
            await page.goto(`${BASE_URL}/SPTS.Web/`, { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(r => setTimeout(r, 3000));
        }

        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a, button, div'));
            const mesaj = links.find(el => el.innerText?.trim() === 'Mesajlar');
            if (mesaj) mesaj.click();
        });
        await new Promise(r => setTimeout(r, 3000));

        const mesajlar = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('table tr, .list-item, [class*="mesaj"]').forEach(row => {
                const text = row.innerText?.trim();
                if (text && text.length > 10) results.push(text);
            });
            return results.slice(0, 20);
        });

        return mesajlar.length > 0 ? mesajlar : ['Mesaj bulunamadı.'];
    } catch (e) {
        console.error('K12 mesaj hatası:', e.message);
        browserInstance = null;
        pageInstance = null;
        isLoggedIn = false;
        return [`Hata: ${e.message}`];
    }
}

module.exports = { getOdevler, getMesajlar };
