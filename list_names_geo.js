const fs = require('fs');
const content = fs.readFileSync('debug_geo_real.html', 'utf8');
const names = content.match(/name="([^"]+)"/g);
const uniqueNames = [...new Set(names)].sort();
console.log(uniqueNames.join('\n'));
