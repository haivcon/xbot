const fs = require('fs');

let content = fs.readFileSync('dashboard/src/i18n/index.js', 'utf8');

const additions = {
    en: { ecosystemTokens: 'XLayer Ecosystem Tokens', registeredCommunities: 'Registered Communities', members: '{{count}} members', supergroup: 'Supergroup', group: 'Group' },
    vi: { ecosystemTokens: 'Hệ Sinh Thái Token XLayer', registeredCommunities: 'Cộng Đồng XLayer', members: '{{count}} thành viên', supergroup: 'Siêu nhóm', group: 'Nhóm' },
    zh: { ecosystemTokens: 'XLayer 生态代币', registeredCommunities: '已注册社区', members: '{{count}} 个成员', supergroup: '超级群组', group: '群组' },
    ko: { ecosystemTokens: 'XLayer 생태계 토큰', registeredCommunities: '등록된 커뮤니티', members: '{{count}} 명의 회원', supergroup: '슈퍼그룹', group: '그룹' },
    ru: { ecosystemTokens: 'Экосистемные токены XLayer', registeredCommunities: 'Зарегистрированные сообщества', members: '{{count}} участников', supergroup: 'Супергруппа', group: 'Группа' },
    id: { ecosystemTokens: 'Token Ekosistem XLayer', registeredCommunities: 'Komunitas Terdaftar', members: '{{count}} anggota', supergroup: 'Grup Super', group: 'Grup' }
};

for (const lang in additions) {
    const rx = new RegExp(`(${lang}: \\{[\\s\\S]*?landing: \\{.*?)(?=,\\s*badge:)`, 'g');
    content = content.replace(rx, (m, p1) => {
        return p1 + `, ecosystemTokens: '${additions[lang].ecosystemTokens}', registeredCommunities: '${additions[lang].registeredCommunities}', members: '${additions[lang].members}', supergroup: '${additions[lang].supergroup}', group: '${additions[lang].group}'`;
    });
}

fs.writeFileSync('dashboard/src/i18n/index.js', content, 'utf8');
console.log('Done');
