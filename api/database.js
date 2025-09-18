const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

// Initialize database connection
function initDatabase() {
  const dbPath = path.join(__dirname, 'planet_configs.db');
  
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      return;
    }
    console.log('📁 Connected to SQLite database');
  });

  // Create tables if they don't exist
  createTables();
}

// Create database tables
function createTables() {
  const createConfigsTable = `
    CREATE TABLE IF NOT EXISTS configurations (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      access_count INTEGER DEFAULT 0
    )
  `;

  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_created_at ON configurations(created_at);
    CREATE INDEX IF NOT EXISTS idx_last_accessed ON configurations(last_accessed);
  `;

  db.serialize(() => {
    db.run(createConfigsTable, (err) => {
      if (err) {
        console.error('Error creating configurations table:', err.message);
      } else {
        console.log('✅ Configurations table ready');
      }
    });

    db.run(createIndexes, (err) => {
      if (err) {
        console.error('Error creating indexes:', err.message);
      } else {
        console.log('✅ Database indexes ready');
      }
    });
  });
}

// Save a configuration
function saveConfiguration(configData) {
  return new Promise((resolve, reject) => {
    const { id, data, metadata } = configData;
    
    const sql = `
      INSERT OR REPLACE INTO configurations (id, data, metadata, created_at)
      VALUES (?, ?, ?, ?)
    `;
    
    const params = [
      id,
      JSON.stringify(data),
      JSON.stringify(metadata),
      new Date().toISOString()
    ];

    db.run(sql, params, function(err) {
      if (err) {
        console.error('Error saving configuration:', err.message);
        reject(err);
      } else {
        console.log(`💾 Saved configuration: ${id}`);
        resolve(true);
      }
    });
  });
}

// Get a configuration by ID
function getConfiguration(id) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id, data, metadata, created_at, access_count
      FROM configurations 
      WHERE id = ?
    `;

    db.get(sql, [id], (err, row) => {
      if (err) {
        console.error('Error retrieving configuration:', err.message);
        reject(err);
      } else if (!row) {
        resolve(null);
      } else {
        // Update access count and last accessed time
        updateAccessStats(id);
        
        const config = {
          id: row.id,
          data: JSON.parse(row.data),
          metadata: JSON.parse(row.metadata),
          createdAt: row.created_at,
          accessCount: row.access_count
        };
        
        console.log(`📥 Retrieved configuration: ${id} (accessed ${row.access_count + 1} times)`);
        resolve(config);
      }
    });
  });
}

// Update access statistics
function updateAccessStats(id) {
  const sql = `
    UPDATE configurations 
    SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(sql, [id], (err) => {
    if (err) {
      console.error('Error updating access stats:', err.message);
    }
  });
}

// Delete a configuration
function deleteConfiguration(id) {
  return new Promise((resolve, reject) => {
    const sql = `DELETE FROM configurations WHERE id = ?`;

    db.run(sql, [id], function(err) {
      if (err) {
        console.error('Error deleting configuration:', err.message);
        reject(err);
      } else if (this.changes === 0) {
        resolve(false); // No rows deleted
      } else {
        console.log(`🗑️ Deleted configuration: ${id}`);
        resolve(true);
      }
    });
  });
}

// Get recent configurations
function getRecentConfigurations(limit = 10) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id, metadata, created_at, access_count
      FROM configurations 
      ORDER BY created_at DESC 
      LIMIT ?
    `;

    db.all(sql, [limit], (err, rows) => {
      if (err) {
        console.error('Error getting recent configurations:', err.message);
        reject(err);
      } else {
        const configs = rows.map(row => ({
          id: row.id,
          metadata: JSON.parse(row.metadata),
          createdAt: row.created_at,
          accessCount: row.access_count
        }));
        resolve(configs);
      }
    });
  });
}

// Get database statistics
function getDatabaseStats() {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        COUNT(*) as total_configs,
        COUNT(CASE WHEN created_at > datetime('now', '-1 day') THEN 1 END) as configs_today,
        COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as configs_this_week,
        AVG(access_count) as avg_access_count,
        MAX(created_at) as last_created
      FROM configurations
    `;

    db.get(sql, [], (err, row) => {
      if (err) {
        console.error('Error getting database stats:', err.message);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Clean up old configurations (optional maintenance)
function cleanupOldConfigurations(daysOld = 30) {
  return new Promise((resolve, reject) => {
    const sql = `
      DELETE FROM configurations 
      WHERE created_at < datetime('now', '-${daysOld} days')
    `;

    db.run(sql, [], function(err) {
      if (err) {
        console.error('Error cleaning up old configurations:', err.message);
        reject(err);
      } else {
        console.log(`🧹 Cleaned up ${this.changes} old configurations`);
        resolve(this.changes);
      }
    });
  });
}

// Close database connection
function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('📁 Database connection closed');
      }
    });
  }
}

module.exports = {
  initDatabase,
  saveConfiguration,
  getConfiguration,
  deleteConfiguration,
  getRecentConfigurations,
  getDatabaseStats,
  cleanupOldConfigurations,
  closeDatabase
};
