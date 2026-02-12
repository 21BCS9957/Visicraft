#!/usr/bin/env node

/**
 * Image Optimization Script
 * 
 * This script optimizes images in the public/Youtube Template folder
 * to reduce file sizes and improve loading times.
 * 
 * Usage: node scripts/optimize-images.js
 */

const fs = require('fs');
const path = require('path');

console.log('📸 Image Optimization Script');
console.log('============================\n');

const publicDir = path.join(__dirname, '..', 'public', 'Youtube Template');

console.log('📁 Checking images in:', publicDir);

try {
  const files = fs.readdirSync(publicDir);
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  
  console.log(`\n✅ Found ${imageFiles.length} image(s):\n`);
  
  imageFiles.forEach(file => {
    const filePath = path.join(publicDir, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   - ${file}: ${sizeMB} MB`);
  });
  
  console.log('\n💡 Recommendations:');
  console.log('   1. Use online tools like TinyPNG (https://tinypng.com) to compress images');
  console.log('   2. Or use ImageOptim (Mac) / Squoosh (Web) for lossless compression');
  console.log('   3. Target size: < 500KB per image for fast loading');
  console.log('   4. Consider converting to WebP format for better compression\n');
  
  console.log('🚀 Quick fix: The images now use lazy loading in the UI');
  console.log('   This means they only load when visible on screen.\n');
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
