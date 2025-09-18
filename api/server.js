const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');

// Import database functions
const { initDatabase, saveConfiguration, getConfiguration, deleteConfiguration } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:8080'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Initialize database
initDatabase();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Save a planet configuration and get a short ID
app.post('/api/share', async (req, res) => {
  try {
    const { data, metadata = {} } = req.body;
    
    if (!data) {
      return res.status(400).json({ 
        error: 'Configuration data is required' 
      });
    }

    // Generate a short, URL-safe ID
    const id = nanoid(8); // 8 characters should be enough for uniqueness
    
    // Add metadata
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

    // Save to database
    const success = await saveConfiguration(configData);
    
    if (!success) {
      return res.status(500).json({ 
        error: 'Failed to save configuration' 
      });
    }

    res.json({
      id,
      url: `${req.protocol}://${req.get('host')}/api/share/${id}`,
      shortUrl: `${req.protocol}://${req.get('host')}/${id}`,
      message: 'Configuration saved successfully'
    });

  } catch (error) {
    console.error('Error saving configuration:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// Get a planet configuration by ID
app.get('/api/share/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || id.length < 3) {
      return res.status(400).json({ 
        error: 'Invalid configuration ID' 
      });
    }

    const config = await getConfiguration(id);
    
    if (!config) {
      return res.status(404).json({ 
        error: 'Configuration not found' 
      });
    }

    res.json({
      id: config.id,
      data: config.data,
      metadata: config.metadata,
      createdAt: config.metadata.createdAt
    });

  } catch (error) {
    console.error('Error retrieving configuration:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// Short URL redirect (for easy sharing)
app.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Skip if it's a static file request
    if (req.path.includes('.')) {
      return res.status(404).send('Not found');
    }
    
    const config = await getConfiguration(id);
    
    if (!config) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Configuration Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1 class="error">Configuration Not Found</h1>
          <p>The configuration with ID "${id}" could not be found.</p>
          <p><a href="/">← Back to Planet Cooker</a></p>
        </body>
        </html>
      `);
    }

    // Redirect to the main app with the configuration
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}?config=${id}`);

  } catch (error) {
    console.error('Error handling short URL:', error);
    res.status(500).send('Internal server error');
  }
});

// Delete a configuration (optional cleanup)
app.delete('/api/share/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const success = await deleteConfiguration(id);
    
    if (!success) {
      return res.status(404).json({ 
        error: 'Configuration not found' 
      });
    }

    res.json({ 
      message: 'Configuration deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting configuration:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// List recent configurations (for admin/debugging)
app.get('/api/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const recent = await getRecentConfigurations(limit);
    
    res.json({
      configurations: recent,
      count: recent.length
    });

  } catch (error) {
    console.error('Error getting recent configurations:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error' 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Planet Cooker API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Share endpoint: http://localhost:${PORT}/api/share`);
  console.log(`📥 Load endpoint: http://localhost:${PORT}/api/share/:id`);
});

module.exports = app;
