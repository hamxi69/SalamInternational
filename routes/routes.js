import { promises as fs, createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { routes } from './route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const precompiledRoutes = Object.keys(routes).map(key => ({
    regex: new RegExp('^' + routes[key].path.replace(/:[^\s/]+/g, '([\\w-]+)') + '$'),
    component: routes[key].component
}));

const pageCache = new Map();
const staticCache = new Map();
let cached404Page = null;

const precacheFiles = async () => {
    try {
        cached404Page = await fs.readFile(join(__dirname, '../views/notfound.html'));
    } catch (err) {
        console.error("Error caching 404 page:", err);
    }
};
precacheFiles();

async function handleRoute(req, res) {
    const { url } = req;
    const [pathName, queryString] = url.split('?');

    if (/^\/(css|img|js|vendor)\//.test(pathName)) {
        await serveStaticFile(pathName, req, res);
        return;
    }

    // Handle dynamic routes
    for (const { regex, component } of precompiledRoutes) {
        const match = pathName.match(regex);
        if (match) {
            await servePage(component, res, 200, queryString);
            return;
        }
    }

    // Handle the root path redirection
    if (pathName === '/') {
        res.writeHead(302, { 'Location': '/home' });
        res.end();
    } else {
        await serveStaticFile(pathName, req, res);
    }
}

async function servePage(pageName, res, statusCode = 200) {
    const filePath = join(__dirname, '../views', pageName);

    if (pageCache.has(filePath)) {
        res.writeHead(statusCode, { 'Content-Type': 'text/html' });
        res.end(pageCache.get(filePath));
        return;
    }

    try {
        const data = await fs.readFile(filePath);
        pageCache.set(filePath, data); // Cache the page
        res.writeHead(statusCode, { 'Content-Type': 'text/html' });
        res.end(data);
    } catch (err) {
        await serveNotFoundPage(res);
    }
}

const contentTypeMap = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.jpg': 'image/jpeg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
};

async function serveStaticFile(url, req, res) {
    const filePath = join(__dirname, '../public', url);
    const contentType = contentTypeMap[extname(url)] || 'application/octet-stream';

    if (staticCache.has(filePath)) {
        const cachedContent = staticCache.get(filePath);
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
            'Content-Length': cachedContent.length
        });
        res.end(cachedContent);
        return;
    }

    try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
            const readStream = createReadStream(filePath);
            const chunks = [];

            readStream.on('data', chunk => chunks.push(chunk));
            readStream.on('end', () => {
                const cachedContent = Buffer.concat(chunks);
                staticCache.set(filePath, cachedContent); // Cache the content

                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600',
                    'Content-Length': cachedContent.length
                });
                res.end(cachedContent);
            });
            readStream.on('error', () => serveNotFoundPage(res));
        } else {
            await serveNotFoundPage(res);
        }
    } catch (err) {
        if (err.code === 'ENOENT') {
            await serveNotFoundPage(res);
        } else {
            console.error('Error serving static file:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    }
}

async function serveNotFoundPage(res) {
    if (!cached404Page) {
        try {
            cached404Page = await fs.readFile(join(__dirname, '../views/notfound.html'));
        } catch (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
    }

    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(cached404Page);
}

export { handleRoute };
