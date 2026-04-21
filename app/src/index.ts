import express from 'express';
import { join } from 'path';
import shopline from './shopline';
import { readFileSync } from 'fs';
import serveStatic from 'serve-static';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { webhooksController } from './controller/webhook';
import createProductController from './controller/product/create';

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT, 10);
const PYTHON_BACKEND = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8000';

const STATIC_PATH =
  process.env.NODE_ENV === 'production'
    ? `${process.cwd()}/../web/dist`
    : `${process.cwd()}/../web`;

const app = express();

// Proxy /api/imagelingo/* to Python FastAPI backend
// Must be BEFORE Shopline SDK auth routes
app.use('/api/imagelingo', createProxyMiddleware({
  target: PYTHON_BACKEND,
  changeOrigin: true,
  pathRewrite: function(_path: string, req: any) { return req.originalUrl; },
}));

app.post('/api/webhooks', express.text({ type: '*/*' }), webhooksController());

// Shopline session validation for other /api/* routes
app.use('/api/*', express.text({ type: '*/*' }), shopline.validateAuthentication());

app.get('/api/products/create', createProductController);

app.use(express.json());

app.use(shopline.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use('/*', shopline.confirmInstallationStatus(), async (_req, res, _next) => {
  return res
    .status(200)
    .set('Content-Type', 'text/html')
    .send(readFileSync(join(STATIC_PATH, 'index.html')));
});

app.listen(PORT);
console.log(PORT);
