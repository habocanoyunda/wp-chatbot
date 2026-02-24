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
        throw new Error('Giriş başarısız - kullanıcı adı veya şifre hatalı.');
    }
    console.log('K12 login başarılı, URL:', page.url());
}

async function getOdevler() {
    let browser;
    try {
        browser = await createBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await login(page);

        await page.goto(`${BASE_URL}/SPTS.Web/`, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 4000));

        const odevler = await page.evaluate(() => {
            const results = [];

            const containers = document.querySelectorAll('[class*="odev"], [id*="odev"], [class*="Odev"], [id*="Odev"]');
            containers.forEach(c => {
                const rows = c.querySelectorAll('tr, .item, li');
                if (rows.length > 0) {
                    rows.forEach(row => {
                        const text = row.innerText?.trim();
                        if (text && text.length > 10) results.push(text);
                    });
                } else {
                    const text = c.innerText?.trim();
                    if (text && text.length > 20) results.push(text);
                }
            });

            if (results.length === 0) {
                document.querySelectorAll('table tr').forEach(row => {
                    const text = row.innerText?.trim();
                    if (text && text.length > 15) results.push(text);
                });
            }

            return results.slice(0, 30);
        });

        return odevler.length > 0 ? odevler : ['Ödev bilgisi bulunamadı.'];
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

        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a, button, div'));
            const mesaj = links.find(el => el.innerText?.trim() === 'Mesajlar' || el.innerText?.trim() === 'Mesaj');
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

        return mesajlar.length > 0 ? mesajlar : ['Mesaj bilgisi bulunamadı.'];
    } catch (e) {
        console.error('K12 mesaj hatası:', e.message);
        return [`Hata: ${e.message}`];
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { getOdevler, getMesajlar };
