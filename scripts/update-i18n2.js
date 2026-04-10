const fs = require('fs');

let content = fs.readFileSync('dashboard/src/i18n/index.js', 'utf8');

const additions = {
    en: { autoListInstruction: 'Or simply add @XlayerAi_bot as an Admin to your Telegram Group to list it automatically.' },
    vi: { autoListInstruction: 'Hoặc đơn giản thêm @XlayerAi_bot vào làm Quản trị viên (Admin) của nhóm Telegram để tự động hiển thị cộng đồng của bạn lên Xlayer Ecosystem Hub.' },
    zh: { autoListInstruction: '或者只需将 @XlayerAi_bot 添加为您的 Telegram 群组管理员，即可自动列出该群组。' },
    ko: { autoListInstruction: '또는 @XlayerAi_bot을 Telegram 그룹의 관리자로 추가하면 그룹이 자동으로 등록됩니다.' },
    ru: { autoListInstruction: 'Или просто добавьте @XlayerAi_bot в качестве администратора в свою группу Telegram, чтобы сообщество появилось здесь автоматически.' },
    id: { autoListInstruction: 'Atau cukup tambahkan @XlayerAi_bot sebagai Admin ke Grup Telegram Anda agar komunitas Anda terdaftar secara otomatis.' }
};

for (const lang in additions) {
    const rx = new RegExp(`(${lang}: \\{[\\s\\S]*?landing: \\{.*?)(?=,\\s*badge:)`, 'g');
    content = content.replace(rx, (m, p1) => {
        return p1 + `, autoListInstruction: '${additions[lang].autoListInstruction}'`;
    });
}

fs.writeFileSync('dashboard/src/i18n/index.js', content, 'utf8');
console.log('Update translations done!');
