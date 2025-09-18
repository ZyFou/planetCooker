# Planet Cooker API

A simple Node.js API for sharing Planet Cooker configurations with short, memorable IDs.

## Features

- 🚀 **Short Share Codes**: Generate tiny IDs like `abc123` instead of huge base64 strings
- 💾 **SQLite Database**: Lightweight, file-based database (no external dependencies)
- 🔒 **Rate Limiting**: Prevent abuse with built-in rate limiting
- 📊 **Analytics**: Track configuration usage and access counts
- 🧹 **Auto Cleanup**: Automatically remove old configurations
- 🌐 **CORS Support**: Ready for web frontend integration

## Quick Start

1. **Install Dependencies**
   ```bash
   cd api
   npm install
   ```

2. **Run Database Migration**
   ```bash
   npm run migrate
   ```

3. **Start the API**
   ```bash
   npm start
   # or for development:
   npm run dev
   ```

4. **Test the API**
   ```bash
   # Health check
   curl http://localhost:3001/api/health
   
   # Save a configuration
   curl -X POST http://localhost:3001/api/share \
     -H "Content-Type: application/json" \
     -d '{"data": {"seed": "test", "radius": 1.5}}'
   
   # Load a configuration
   curl http://localhost:3001/api/share/abc123
   ```

## API Endpoints

### `POST /api/share`
Save a planet configuration and get a short ID.

**Request:**
```json
{
  "data": {
    "seed": "my-planet",
    "radius": 1.5,
    "moonCount": 2,
    // ... all your planet parameters
  },
  "metadata": {
    "name": "My Awesome Planet",
    "description": "A beautiful planet with two moons"
  }
}
```

**Response:**
```json
{
  "id": "abc123",
  "url": "http://localhost:3001/api/share/abc123",
  "shortUrl": "http://localhost:3001/abc123",
  "message": "Configuration saved successfully"
}
```

### `GET /api/share/:id`
Load a planet configuration by ID.

**Response:**
```json
{
  "id": "abc123",
  "data": {
    "seed": "my-planet",
    "radius": 1.5,
    // ... all planet parameters
  },
  "metadata": {
    "name": "My Awesome Planet",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

### `GET /:id`
Short URL redirect. Redirects to the frontend with the configuration ID.

### `DELETE /api/share/:id`
Delete a configuration (optional cleanup).

### `GET /api/recent?limit=10`
Get recent configurations (for admin/debugging).

### `GET /api/health`
Health check endpoint.

## Environment Variables

Copy `env.example` to `.env` and configure:

```bash
cp env.example .env
```

- `PORT`: API server port (default: 3001)
- `FRONTEND_URL`: Frontend URL for CORS and redirects
- `NODE_ENV`: Environment (development/production)

## Database

The API uses SQLite for simplicity. The database file `planet_configs.db` will be created automatically.

### Schema
```sql
CREATE TABLE configurations (
  id TEXT PRIMARY KEY,           -- Short ID (8 characters)
  data TEXT NOT NULL,            -- JSON configuration data
  metadata TEXT NOT NULL,        -- JSON metadata (creation time, etc.)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER DEFAULT 0
);
```

## Integration with Frontend

Update your frontend to use the API:

```javascript
// Save configuration
async function saveConfiguration(configData) {
  const response = await fetch('http://localhost:3001/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: configData })
  });
  return await response.json();
}

// Load configuration
async function loadConfiguration(id) {
  const response = await fetch(`http://localhost:3001/api/share/${id}`);
  return await response.json();
}
```

## Deployment

The API is ready for deployment on any Node.js hosting service:

- **Heroku**: Add `"start": "node server.js"` to package.json
- **Vercel**: Use the Vercel CLI or dashboard
- **Railway**: Connect your GitHub repo
- **DigitalOcean App Platform**: Deploy from GitHub

## Maintenance

The API includes automatic cleanup of old configurations (older than 90 days by default). You can also run manual cleanup:

```bash
node -e "require('./database').cleanupOldConfigurations(30)"
```

## License

MIT License - feel free to use and modify!
