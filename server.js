const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Bot korumasını aş
puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3000;

// Ana scraping fonksiyonu
async function scrapeMDServis(plaka) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920x1080'
            ]
        });

        const page = await browser.newPage();
        
        // Gerçek kullanıcı gibi ayarlar
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'tr-TR,tr;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });

        // Sayfaya git
        console.log(`🔍 Plaka sorgulanıyor: ${plaka}`);
        await page.goto('https://mdservis.com.tr/sorgula/', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // İnsan gibi rastgele bekle
        await page.waitForTimeout(1000 + Math.random() * 1500);

        // Form alanını bul
        await page.waitForSelector('input[name="plaka"]', { timeout: 10000 });
        
        // İnsan gibi yavaşça yaz
        await page.type('input[name="plaka"]', plaka, { 
            delay: 80 + Math.random() * 40 
        });
        
        await page.waitForTimeout(500 + Math.random() * 500);

        // Formu gönder ve yanıtı bekle
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
            page.click('button[type="submit"]')
        ]);

        // Sonuçların yüklenmesini bekle
        await page.waitForSelector('.accordion-item', { timeout: 10000 });

        // Verileri çek
        const bakimlar = await page.evaluate(() => {
            const results = [];
            const accordionItems = document.querySelectorAll('.accordion-item');

            accordionItems.forEach(item => {
                const table = item.querySelector('table.table-striped');
                if (table) {
                    const bakimVerisi = {};
                    const rows = table.querySelectorAll('tr');

                    rows.forEach(row => {
                        const th = row.querySelector('th');
                        const td = row.querySelector('td');

                        if (th && td) {
                            let key = th.textContent.trim();
                            const value = td.textContent.trim();

                            // Key'i temizle ve İngilizce karakterlere çevir
                            key = key.toLowerCase()
                                .replace(/\s+/g, '_')
                                .replace(/ı/g, 'i')
                                .replace(/ğ/g, 'g')
                                .replace(/ü/g, 'u')
                                .replace(/ş/g, 's')
                                .replace(/ö/g, 'o')
                                .replace(/ç/g, 'c');

                            bakimVerisi[key] = value;
                        }
                    });

                    if (Object.keys(bakimVerisi).length > 0) {
                        results.push(bakimVerisi);
                    }
                }
            });

            return results;
        });

        await browser.close();
        console.log(`✅ ${bakimlar.length} kayıt bulundu`);
        return { success: true, data: bakimlar };

    } catch (error) {
        if (browser) await browser.close();
        console.error('❌ Hata:', error.message);
        return { success: false, error: error.message };
    }
}

// API Endpoint - Sadece plaka parametresi
app.get('/api/sorgula', async (req, res) => {
    const { plaka } = req.query;

    // Plaka kontrolü
    if (!plaka) {
        return res.json({
            status: false,
            message: 'plaka parametresi zorunludur.'
        });
    }

    console.log(`\n📋 Yeni sorgu: ${plaka}`);

    // Scraping işlemi
    const result = await scrapeMDServis(plaka);

    // Hata kontrolü
    if (!result.success) {
        return res.json({
            status: false,
            message: 'Veri çekilemedi.',
            error: result.error
        });
    }

    // Veri bulunamadı
    if (result.data.length === 0) {
        return res.json({
            status: false,
            message: 'Bu plakaya ait bakım kaydı bulunamadı.',
            plaka: plaka.toUpperCase()
        });
    }

    // Tarihe göre sırala (en yeniden eskiye)
    const bakimlar = result.data.sort((a, b) => {
        if (!a.tarih || !b.tarih) return 0;
        
        const [dayA, monthA, yearA] = a.tarih.split('/');
        const [dayB, monthB, yearB] = b.tarih.split('/');
        
        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);
        
        return dateB - dateA;
    });

    // Başarılı sonuç
    res.json({
        status: true,
        plaka: plaka.toUpperCase(),
        kayit_sayisi: bakimlar.length,
        bakim_gecmisi: bakimlar
    });
});

// Ana sayfa
app.get('/', (req, res) => {
    res.send(`
        <h1>🚗 MD Servis API</h1>
        <p>Kullanım: <code>/api/sorgula?plaka=06MD5050</code></p>
        <p>Örnek: <a href="/api/sorgula?plaka=06MD5050">/api/sorgula?plaka=06MD5050</a></p>
    `);
});

// Sunucuyu başlat
app.listen(PORT, () => {
    console.log(`\n🚀 Sunucu başlatıldı: http://localhost:${PORT}`);
    console.log(`📡 API Endpoint: http://localhost:${PORT}/api/sorgula?plaka=PLAKA`);
    console.log(`\n✨ Bot koruması aşma aktif!`);
});
