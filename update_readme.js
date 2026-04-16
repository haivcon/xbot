const fs = require('fs');
let content = fs.readFileSync('README.md', 'utf8');

// Replace everything from `### 🚀 What's New in v...` up to `--- \n\n### 🌟 Features at a Glance`
const regex = /### 🚀 What's New in v[\s\S]*?(?=---\n\n### 🌟 Features at a Glance)/;
const newSection = `### 🚀 What's New in v1.2.9 (Smart Copy-Trader Revamp & Treasury Deprecation)
- **Treasury Feature Deprecation**: Successfully removed the experimental 'Treasury & Pet' feature from the entire ecosystem (UI routing, sidebars, internal APIs) to streamline the Web Dashboard experience.
- **Smart Copy-Trader UI Overhaul**: Completely modernized the Smart Copy-Trader interface using scalable Tailwind CSS and beautiful glassmorphism gradients. Eliminated rigid inline styles, integrated dynamic budget bars, and upgraded the UI to feature an elegant top-traders leaderboard.
- **Universal Localized i18n Integration**: Fully decoupled hardcoded strings from the Smart Copy-Trader module. Injected the deep \`smartCopyPage\` namespace across all 6 core language dictionaries (English, Vietnamese, Chinese, Korean, Russian, Indonesian), ensuring native translation parity for every interactive element.
- **OnchainOS API Backend Alignment**: Refactored the core background \`discoverLeaders\` algorithm in \`smartCopyEngine.js\`. Aligned the parser to dynamically digest comma-separated address payloads (\`triggerWalletAddress\`) and accurately cross-reference decoupled API traits (\`buyTxCount\`, \`sellTxCount\`, \`realizedPnlUsd\`), fixing systemic leader scoring errors.
- **Critical Process Stabilization**: Patched an unclosed syntax block inside \`dashboardRoutes.js\` that was inducing continuous backend PM2 crash loops, significantly boosting system uptime.

`;

content = content.replace(regex, newSection);
fs.writeFileSync('README.md', content);
console.log('README.md updated.');

// Check .gitignore
if (!fs.existsSync('.gitignore')) {
    fs.writeFileSync('.gitignore', `node_modules/
.env
.pm2/
dist/
build/
.vscode/
npm-debug.log
.DS_Store
`);
    console.log('Created .gitignore');
} else {
    console.log('.gitignore already exists');
}
