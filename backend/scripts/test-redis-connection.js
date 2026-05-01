const Redis = require('ioredis');

const redisUrl = 'redis://default:xi3wX2Qd1Cgq7Tmq8JhLrdEaKiCCw9NK@redis-14417.c281.us-east-1-2.ec2.cloud.redislabs.com:14417';

console.log('Testing Redis connection...');
console.log('URL:', redisUrl);

const redis = new Redis(redisUrl);

redis.on('connect', () => {
  console.log('✓ Connected successfully!');
  redis.ping().then(result => {
    console.log('✓ PING response:', result);
    redis.disconnect();
    process.exit(0);
  });
});

redis.on('error', (error) => {
  console.error('✗ Connection error:', error.message);
  redis.disconnect();
  process.exit(1);
});

setTimeout(() => {
  console.error('✗ Connection timeout');
  redis.disconnect();
  process.exit(1);
}, 5000);
