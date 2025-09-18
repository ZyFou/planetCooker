// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { nanoid } = require('nanoid');

// DB
const { initDatabase, saveConfiguration, getConfiguration, deleteConfiguration } = require('./database');

const app = express();

// ---- Config ----
const PORT = process.env.PORT || 5014;
const BASE_PATH = process.env.BASE_PATH || '';            // << ex: "/planetApi"
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://zyfod.dev/planetCooker/';

app.set('trust proxy', 1);

// ---- Middleware global ----
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:8080',
    'https://zyfod.dev'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// ---- Router monté sous BASE_PATH ----
const router = express.Router();

// Rate limit uniquement sous /api
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  message: 'Too many requests from this IP, please try again later.'
});
router.use('/api', limiter);

// Init DB
initDatabase();

// Health
router.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Save
router.post('/api/share', async (req, res) => {
  try {
    const { data, metadata = {} } = req.body;
    if (!data) return res.status(400).json({ error: 'Configuration data is required' });

    const id = nanoid(8);
    const configData = {
      id,
      data,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    };

    const success = await saveConfiguration(configData);
    if (!success) return res.status(500).json({ error: 'Failed to save configuration' });

    const host = `${req.protocol}://${req.get('host')}${BASE_PATH}`;
    res.json({
      id,
      url: `${host}/api/share/${id}`,
      shortUrl: `${host}/${id}`,
      message: 'Configuration saved successfully'
    });
  } catch (e) {
    console.error('Error saving configuration:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Load by id
router.get('/api/share/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id.length < 3) return res.status(400).json({ error: 'Invalid configuration ID' });

    const config = await getConfiguration(id);
    if (!config) return res.status(404).json({ error: 'Configuration not found' });

    res.json({
      id: config.id,
      data: config.data,
      metadata: config.metadata,
      createdAt: config.metadata.createdAt
    });
  } catch (e) {
    console.error('Error retrieving configuration:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Short URL redirect (placer APRÈS les routes /api/*)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (req.path.includes('.')) return res.status(404).send('Not found');

    const config = await getConfiguration(id);
    if (!config) {
      return res.status(404).send(`<!DOCTYPE html><html><head><title>Configuration Not Found</title>
        <style>body{font-family:Arial,sans-serif;text-align:center;padding:50px}.error{color:#e74c3c}</style>
        </head><body><h1 class="error">Configuration Not Found</h1>
        <p>The configuration with ID "${id}" could not be found.</p>
        <p><a href="${BASE_PATH || '/'}">← Back to Planet Cooker</a></p></body></html>`);
    }

    const frontend = FRONTEND_URL.endsWith('/') ? FRONTEND_URL : FRONTEND_URL + '/';
    res.redirect(`${frontend}#${id}`);
  } catch (e) {
    console.error('Error handling short URL:', e);
    res.status(500).send('Internal server error');
  }
});

// Delete
router.delete('/api/share/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await deleteConfiguration(id);
    if (!success) return res.status(404).json({ error: 'Configuration not found' });
    res.json({ message: 'Configuration deleted successfully' });
  } catch (e) {
    console.error('Error deleting configuration:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Recent (stub)
router.get('/api/recent', async (req, res) => {
  try {
    res.json({ configurations: [], count: 0 });
  } catch (e) {
    console.error('Error getting recent configurations:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 sous le BASE_PATH
router.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// Monter le router sous le préfixe
app.use(BASE_PATH, router);

// Error handler global
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
app.listen(PORT, () => {
  console.log(`🚀 Planet Cooker API on ${PORT}`);
  console.log(`➡️  Base path: "${BASE_PATH || '/'}"`);
});
