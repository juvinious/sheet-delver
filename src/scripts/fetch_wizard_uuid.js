
const fetch = require('node-fetch');

(async () => {
    try {
        const res = await fetch('http://localhost:3000/api/system/data');
        const json = await res.json();
        const wiz = json.classes.find(c => c.name === 'Wizard');
        if (wiz) {
            console.log(wiz.uuid);
        } else {
            console.log('Wizard not found');
        }
    } catch (e) {
        console.error(e);
    }
})();
