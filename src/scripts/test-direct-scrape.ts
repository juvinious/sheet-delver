import { DirectScraper } from '../core/foundry/DirectScraper';
import path from 'path';

async function main() {
    // Use CLI arg or generic default
    const inputPath = process.argv[2] || 'temp/test-world';
    const worldPath = path.resolve(process.cwd(), inputPath);
    console.log(`Testing DirectScraper on: ${worldPath}`);

    try {
        const data = await DirectScraper.scrape(worldPath);
        console.log('--- SCRAPE SUCCESS ---');
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('--- SCRAPE FAILED ---');
        console.error(err);
    }
}

main();
