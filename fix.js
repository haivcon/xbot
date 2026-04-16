const fs = require('fs');
let content = fs.readFileSync('dashboard/src/pages/user/SmartCopyPage.jsx', 'utf8');
content = content.replace(/\\`/g, '`');
content = content.replace(/\\\${/g, '${');
fs.writeFileSync('dashboard/src/pages/user/SmartCopyPage.jsx', content);
