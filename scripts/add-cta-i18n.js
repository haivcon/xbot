const fs = require('fs');

let content = fs.readFileSync('dashboard/src/i18n/index.js', 'utf8');

const additions = {
    en: { listYourToken: 'Want to feature your token & community here? Apply on X' },
    vi: { listYourToken: 'Muốn hiển thị token & cộng đồng của bạn tại đây? Đăng ký trên X' },
    zh: { listYourToken: '想在这里展示您的代币和社区？在 X 上申请' },
    ko: { listYourToken: '여기에 귀하의 토큰과 커뮤니티를 소개하고 싶으신가요? X에서 신청하세요' },
    ru: { listYourToken: 'Хотите разместить свой токен и сообщество здесь? Подайте заявку в X' },
    id: { listYourToken: 'Ingin menampilkan token & komunitas Anda di sini? Daftar di X' }
};

for (const lang in additions) {
    const rx = new RegExp(`(${lang}: \\{[\\s\\S]*?landing: \\{.*?)(?=,\\s*badge:)`, 'g');
    content = content.replace(rx, (m, p1) => {
        return p1 + `, listYourToken: '${additions[lang].listYourToken}'`;
    });
}

fs.writeFileSync('dashboard/src/i18n/index.js', content, 'utf8');
console.log('Update translations done!');
