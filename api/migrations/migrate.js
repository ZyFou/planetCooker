const { initDatabase, getDatabaseStats, cleanupOldConfigurations } = require('../database');

console.log('🔄 Starting database migration...');

// Initialize database (creates tables if they don't exist)
initDatabase();

// Wait a moment for database to initialize
setTimeout(async () => {
  try {
    // Get database statistics
    const stats = await getDatabaseStats();
    console.log('📊 Database Statistics:');
    console.log(`   Total configurations: ${stats.total_configs}`);
    console.log(`   Created today: ${stats.configs_today}`);
    console.log(`   Created this week: ${stats.configs_this_week}`);
    console.log(`   Average access count: ${Math.round(stats.avg_access_count || 0)}`);
    console.log(`   Last created: ${stats.last_created || 'Never'}`);
    
    // Optional: Clean up old configurations (older than 90 days)
    console.log('\n🧹 Cleaning up old configurations (older than 90 days)...');
    const cleaned = await cleanupOldConfigurations(90);
    console.log(`   Removed ${cleaned} old configurations`);
    
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}, 1000);
