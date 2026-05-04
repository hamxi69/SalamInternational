import { handleRoute } from './routes/routes.js';

export default async function (req, res) {
    try {
        handleRoute(req, res);
    } catch (error) {
        console.error('Error handling request:', error);
        res.statusCode = 500;
        res.end('Internal Server Error');
    }
}
