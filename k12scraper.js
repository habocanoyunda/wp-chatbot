const puppeteer = require('puppeteer-core');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const BASE_URL = 'https://evrensel.k12net.com';

async function createBrowser() {
    return await puppeteer.launch({
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
}

async function login(page) {
    await page.goto(`${BASE_URL}/Login.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Tum input alanlarini bul
    const inputs = await page.$$('input[type="text"], input[type="password"]');
    if (inputs.length < 2) throw new Error('Login formu bulunamadı.');

    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type(process.env.K12_USERNAME || '');
    await new Promise(r => setTimeout(r, 500));
    await inputs[1].click({ clickCount: 3 });
    await inputs[1].type(process.env.K12_PASSWORD || '');
    await new Promise(r => setTimeout(r, 500));

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click('input[type="submit"], button[type="submit"]')
    ]);

    if (page.url().includes('Login.aspx')) {
        throw new Error('Giriş başarısız.');
    }
}

async function getOdevler() {
    let browser;
    try {
        browser = await createBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await login(page);

        await page.goto(`${BASE_URL}/SPTS.Web/`, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        // Sayfadaki tum metin icerigini al, odev bolumunu bul
        const odevler = await page.evaluate(() => {
            const results = [];

            // Odev satirlarini bul - K12Net'in kullandigi yapilar
            const selectors = [
                '.odev-list tr', '.homework-list tr',
                '[class*="odev"] tr', '[id*="odev"] tr',
                '.panel-body tr', '.list-group-item'
            ];

            for (const sel of selectors) {
                const rows = document.querySelectorAll(sel);
                if (rows.length > 0) {
                    rows.forEach(row => {
                        const text = row.innerText?.trim();
                        if (text && text.length > 10) results.push(text);
                    });
                    if (results.length > 0) break;
                }
            }

            // Hic bulamazsa odev bolumunun ham metnini al
            if (results.length === 0) {
                const odevDiv = document.querySelector('#divOdevler, #odevler, [class*="odev-container"]');
                if (odevDiv) results.push(odevDiv.innerText);
            }

            return results;
        });

        return odevler.length > 0 ? odevler : ['Ödev bilgisi alınamadı.'];
    } catch (e) {
        console.error('K12 ödev hatası:', e.message);
        return [`Hata: ${e.message}`];
    } finally {
        if (browser) await browser.close();
    }
}

async function getMesajlar() {
    let browser;
    try {
        browser = await createBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await login(page);

        await page.goto(`${BASE_URL}/SPTS.Web/`, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        // Mesajlar butonuna tikla
        const clicked = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a, button, .menu-item'));
            const mesajLink = links.find(el => el.innerText?.includes('Mesaj') || el.href?.includes('mesaj'));
            if (mesajLink) { mesajLink.click(); return true; }
            return false;
        });

        if (clicked) await new Promise(r => setTimeout(r, 3000));

        const mesajlar = await page.evaluate(() => {
            const results = [];
            const selectors = [
                '.mesaj-list tr', '.message-list tr',
                '[class*="mesaj"] tr', '[id*="mesaj"] tr',
                '.list-group-item', '.panel-body tr'
            ];

            for (const sel of selectors) {
                const rows = document.querySelectorAll(sel);
                if (rows.length > 0) {
                    rows.forEach(row => {
                        const text = row.innerText?.trim();
                        if (text && text.length > 10) results.push(text);
                    });
                    if (results.length > 0) break;
                }
            }

            if (results.length === 0) {
                const mesajDiv = document.querySelector('#divMesajlar, #mesajlar, [class*="mesaj-container"]');
                if (mesajDiv) results.push(mesajDiv.innerText);
            }

            return results;
        });

        return mesajlar.length > 0 ? mesajlar : ['Mesaj bilgisi alınamadı.'];
    } catch (e) {
        console.error('K12 mesaj hatası:', e.message);
        return [`Hata: ${e.message}`];
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { getOdevler, getMesajlar };
