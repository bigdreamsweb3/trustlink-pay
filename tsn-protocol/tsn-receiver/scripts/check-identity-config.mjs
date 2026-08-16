import fetch from 'node-fetch';

const apiKey = 'AIzaSyBvcDNcexxi0VH3XzmRya_4m0XjSRy_ofE';
const projectId = 'tsn-epoch-record';
const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/config?key=${apiKey}`;

(async () => {
    try {
        const res = await fetch(url, { method: 'GET' });
        console.log('status', res.status);
        const text = await res.text();
        console.log('body', text);
    } catch (err) {
        console.error('ERROR', err.message || err);
        process.exit(1);
    }
})();
