/**
 * Emoji Library - Bộ sưu tập emoji phong phú
 * Sử dụng để thêm emoji 
 */

// 😃 1. Mặt Cười & Cảm Xúc (Smileys & Emotion)
const EMOJI_FACES = {
    happy: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '🥳', '🤩', '😎'],
    love: ['🥰', '😍', '😘', '😗', '😙', '😚', '💕', '💖', '💗', '💓', '💞', '❤️'],
    sad: ['😢', '😭', '😿', '😞', '😔', '😩', '😫', '🥺', '😥', '😰'],
    angry: ['😠', '😡', '🤬', '😤', '👿', '💢'],
    surprised: ['😮', '😯', '😲', '😳', '🤯', '😱', '🙀'],
    thinking: ['🤔', '🧐', '🤨', '😐', '😑', '🫤'],
    sick: ['🤒', '🤕', '🤢', '🤮', '🤧', '😷', '🥴'],
    cool: ['😎', '🤓', '🥸', '🤠', '🧔'],
    sleep: ['😴', '🥱', '😪', '💤'],
    misc: ['🙄', '😬', '😏', '🤫', '🤭', '🤥', '😇', '🥹', '🫠']
};

// ✋ 2. Cử Chỉ Tay (Hand Gestures)
const EMOJI_HANDS = {
    wave: ['👋', '🤚', '🖐', '✋', '🖖'],
    point: ['👈', '👉', '👆', '👇', '☝️', '🫵'],
    thumbs: ['👍', '👎'],
    fist: ['✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    other: ['✌️', '🤞', '🤟', '🤘', '🤙', '🤏', '✍️', '💅', '🤳', '💪']
};

// ❤️ 3. Trái Tim & Cảm Xúc (Hearts)
const EMOJI_HEARTS = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'];

// 🐻 4. Động Vật (Animals)
const EMOJI_ANIMALS = {
    pets: ['🐶', '🐕', '🐩', '🐈', '🐱', '🐰', '🐹', '🐭', '🐀', '🐁'],
    farm: ['🐮', '🐷', '🐗', '🐴', '🐎', '🐑', '🐐', '🐔', '🐓', '🐣', '🐤', '🐥', '🦆', '🦢'],
    wild: ['🦁', '🐯', '🐆', '🐅', '🦊', '🐺', '🐻', '🐼', '🐨', '🦝', '🦨', '🦡', '🐘', '🦏', '🦛', '🦒', '🦓', '🐪', '🦘'],
    sea: ['🐳', '🐋', '🐬', '🦈', '🐟', '🐠', '🐡', '🐙', '🦑', '🦐', '🦀', '🦞', '🦪'],
    bugs: ['🦋', '🐛', '🐜', '🐝', '🐞', '🦗', '🦟', '🕷', '🦂'],
    birds: ['🦃', '🐔', '🐦', '🐧', '🕊', '🦅', '🦆', '🦢', '🦉', '🦩', '🦚', '🦜'],
    reptiles: ['🐸', '🐊', '🐢', '🐍', '🦎', '🦕', '🦖'],
    misc: ['🐒', '🦍', '🦧', '🦌', '🐾', '🦔', '🦇', '🦥', '🦦']
};

// 🌸 5. Thực Vật & Thiên Nhiên (Nature)
const EMOJI_NATURE = {
    flowers: ['💐', '🌸', '🌷', '🌹', '🥀', '🌺', '🌻', '🌼', '🪻', '🪷'],
    plants: ['🌱', '🌲', '🌳', '🌴', '🌵', '🍄', '🍁', '🍂', '🍃', '🌾', '🌿', '☘️', '🍀', '🪴'],
    weather: ['☀️', '🌤', '⛅️', '🌥', '☁️', '🌦', '🌧', '⛈', '🌩', '🌨', '❄️', '💨', '🌪', '🌫', '🌈', '💧', '💦', '🌊'],
    sky: ['🌍', '🌎', '🌏', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘', '🌙', '🌚', '🌝', '🌞', '🪐', '⭐️', '🌟', '✨', '💫', '☄️']
};

// 🍔 6. Thực Phẩm & Đồ Uống (Food & Drink)
const EMOJI_FOOD = {
    fruits: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🥝', '🍒', '🍑', '🥭', '🍍', '🥥'],
    vegetables: ['🍅', '🫒', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶', '🥒', '🥬', '🥦', '🧄', '🧅', '🥜', '🌰'],
    meals: ['🍞', '🥐', '🥖', '🥨', '🥯', '🥞', '🧇', '🧀', '🥩', '🍗', '🍖', '🍤', '🥚', '🍳', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆', '🥘', '🍜', '🍝', '🍛', '🍚', '🍣', '🍱', '🥟', '🥠', '🥡'],
    sweets: ['🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯'],
    drinks: ['☕️', '🍵', '🫖', '🥛', '🍼', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊', '💧']
};

// 🚗 7. Phương Tiện & Du Lịch (Transport & Travel)
const EMOJI_TRANSPORT = {
    land: ['🚗', '🚕', '🚙', '🚌', '🏎', '🚓', '🚑', '🚒', '🚚', '🚛', '🚜', '🛴', '🛵', '🚲', '🏍', '🛺', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚊', '🚝', '🚎', '🚋', '🚞'],
    air: ['✈️', '🛩', '🚁', '🚀', '🛸', '🛰', '🪂'],
    water: ['⛵️', '🚤', '🛥', '🛳', '🚢', '⚓️', '🛶', '⛴'],
    misc: ['🚟', '🚠', '🚡', '🛻', '🛼', '🛞']
};

// 🏠 8. Địa Điểm (Places)
const EMOJI_PLACES = {
    buildings: ['🏘', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏯', '🏰', '🏛', '⛪️', '🕌', '🛕', '⛩️', '🕍', '🕋'],
    landmarks: ['🗼', '🗽', '🌉', '🗿', '🗺', '🧭'],
    nature_place: ['🏞', '🏕', '🏖', '🏜', '🌋', '🏔', '⛰', '🏝', '🏗'],
    misc_place: ['⛲️', '⛺️', '🎠', '🎡', '🎢', '🎪', '💈', '🏟']
};

// ⚽ 9. Hoạt Động & Thể Thao (Activities)
const EMOJI_ACTIVITIES = {
    sports: ['⚽️', '🏀', '🏈', '⚾️', '🥎', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🏒', '🏑', '⛳️', '🏹', '🎣', '🥊', '🥋', '⛸', '🛷', '🛹', '🛼', '🥌', '🎳', '♟️'],
    entertainment: ['🎨', '🧵', '🧶', '🎭', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🎻', '🎲', '🎯', '🎰', '🧩', '🎮', '🕹'],
    celebration: ['🎈', '🎉', '🎊', '🎁', '🎀', '🎗', '🎫', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖'],
    misc_activity: ['🎃', '🎄', '🎋', '🎍', '🎎', '🎏', '🎑', '🎐', '🧧']
};

// 💻 10. Vật Phẩm & Điện Tử (Objects)
const EMOJI_OBJECTS = {
    electronics: ['⌚️', '📱', '📲', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🕹', '💾', '💿', '📀', '📸', '📷', '📹', '🎥', '📺', '📻', '📡', '🔦', '💡', '🕯', '🔌', '🔋', '🪫'],
    office: ['📰', '📚', '📖', '📒', '📓', '📔', '📕', '📗', '📘', '📙', '📜', '📄', '📃', '📑', '🔖', '📁', '📂', '🗂', '📋', '📌', '📍', '📎', '🖇', '📏', '📐', '✂️', '🖊', '🖋', '✒️', '✏️', '🖍', '🖌'],
    money: ['💰', '💴', '💵', '💶', '💷', '💸', '💳', '🧾', '💎', '💍'],
    tools: ['🔨', '🪓', '⛏', '🔧', '🔩', '⚙️', '🗜', '🪚', '🪛', '🪜', '🔬', '🔭', '📡', '💉', '💊', '🩹', '🩺', '🌡'],
    misc_objects: ['🚬', '⚰️', '⚱️', '🏺', '🪄', '🪅', '🎈', '🎉', '🔔', '📢', '📣', '🗑']
};

// 👕 11. Quần Áo (Clothing)
const EMOJI_CLOTHING = ['👑', '🎩', '👒', '🎓', '⛑️', '🪖', '📿', '💄', '💍', '💎', '🧣', '🧤', '🧥', '🧦', '👗', '👘', '🥻', '🩱', '👙', '👚', '👛', '👜', '👝', '🛍', '🎒', '🩴', '👞', '👟', '🥾', '🥿', '👠', '👡', '🩰', '👢', '👕', '👖', '🩲', '🩳', '👔', '🩴'];

// 🔢 12. Số & Biểu Tượng (Numbers & Symbols)
const EMOJI_NUMBERS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '💯', '🔢', '📊', '📈', '📉'];
const EMOJI_SYMBOLS = {
    check: ['✅', '☑️', '✔️', '❌', '❎', '✖️'],
    arrows: ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️', '↕️', '↔️', '↩️', '↪️', '⤴️', '⤵️', '🔃', '🔄', '🔙', '🔚', '🔛', '🔜', '🔝'],
    shapes: ['🟪', '🟥', '🟧', '🟨', '🟩', '🟦', '🟫', '⬜️', '⬛️', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '◻️', '◼️', '◽️', '◾️', '🔘', '🔲', '🔳'],
    misc_symbols: ['⭐️', '🌟', '💫', '✨', '⚡️', '🔥', '💥', '💢', '💬', '💭', '🗯', '💤', '💯', '🎯', '🔮', '🧿', '🪬', '📍', '🔗', '🔒', '🔓', '🔐', '🔑', '🗝']
};

// 🏳️ 13. Cờ (Flags)
const EMOJI_FLAGS = ['🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏳️‍⚧️', '🇻🇳', '🇺🇸', '🇬🇧', '🇨🇳', '🇯🇵', '🇰🇷', '🇫🇷', '🇩🇪', '🇮🇹', '🇪🇸', '🇷🇺', '🇧🇷', '🇮🇳', '🇮🇩', '🇹🇭', '🇸🇬', '🇦🇺', '🇨🇦'];

// =========================================
// KEYWORD TO EMOJI MAPPING
// =========================================

const KEYWORD_EMOJI_MAP = {
    // Emotions
    'vui': '😊', 'happy': '😊', 'hạnh phúc': '😊', 'cười': '😄', 'laugh': '😂',
    'buồn': '😢', 'sad': '😢', 'khóc': '😭', 'cry': '😭',
    'yêu': '❤️', 'love': '❤️', 'thích': '💕', 'like': '👍',
    'giận': '😠', 'angry': '😡', 'tức': '😤',
    'sợ': '😨', 'fear': '😱', 'scared': '😰',
    'ngạc nhiên': '😮', 'surprise': '😲', 'wow': '🤩',
    'nghĩ': '🤔', 'think': '🤔', 'suy nghĩ': '💭',
    'ok': '👌', 'được': '✅', 'yes': '✅', 'vâng': '✅', 'có': '✅',
    'không': '❌', 'no': '❌', 'sai': '❌',

    // People
    'người': '👤', 'person': '👤', 'user': '👤',
    'bạn': '🧑', 'friend': '🤝', 'bạn bè': '👥',
    'gia đình': '👨‍👩‍👧‍👦', 'family': '👨‍👩‍👧‍👦',
    'em bé': '👶', 'baby': '👶', 'trẻ em': '🧒', 'child': '🧒',
    'đàn ông': '👨', 'man': '👨', 'phụ nữ': '👩', 'woman': '👩',

    // Animals
    'chó': '🐕', 'dog': '🐕', 'cún': '🐶',
    'mèo': '🐱', 'cat': '🐱',
    'chim': '🐦', 'bird': '🐦',
    'cá': '🐟', 'fish': '🐟',
    'bò': '🐮', 'cow': '🐮',
    'lợn': '🐷', 'pig': '🐷',
    'gấu': '🐻', 'bear': '🐻',
    'khỉ': '🐵', 'monkey': '🐵',
    'thỏ': '🐰', 'rabbit': '🐰',

    // Food
    'ăn': '🍽️', 'eat': '🍽️', 'thức ăn': '🍕', 'food': '🍔',
    'pizza': '🍕', 'burger': '🍔', 'hamburger': '🍔',
    'cơm': '🍚', 'rice': '🍚',
    'phở': '🍜', 'mì': '🍜', 'noodle': '🍜',
    'sushi': '🍣',
    'bánh': '🍰', 'cake': '🎂',
    'kem': '🍦', 'ice cream': '🍦',
    'cà phê': '☕', 'coffee': '☕',
    'trà': '🍵', 'tea': '🍵',
    'bia': '🍺', 'beer': '🍺',
    'rượu': '🍷', 'wine': '🍷',
    'nước': '💧', 'water': '💧',
    'trái cây': '🍎', 'fruit': '🍇',

    // Places
    'nhà': '🏠', 'home': '🏠', 'house': '🏡',
    'trường': '🏫', 'school': '🏫',
    'bệnh viện': '🏥', 'hospital': '🏥',
    'công ty': '🏢', 'office': '🏢', 'company': '🏢',
    'ngân hàng': '🏦', 'bank': '🏦',
    'khách sạn': '🏨', 'hotel': '🏨',
    'nhà hàng': '🍽️', 'restaurant': '🍽️',
    'biển': '🏖️', 'beach': '🏖️', 'sea': '🌊',
    'núi': '⛰️', 'mountain': '🏔️',
    'thành phố': '🏙️', 'city': '🌆',

    // Transport
    'xe': '🚗', 'car': '🚗', 'ô tô': '🚙',
    'xe máy': '🏍️', 'motorcycle': '🏍️', 'xe đạp': '🚲', 'bike': '🚲',
    'xe buýt': '🚌', 'bus': '🚌',
    'tàu': '🚂', 'train': '🚄',
    'máy bay': '✈️', 'plane': '✈️', 'airplane': '✈️',
    'tàu thủy': '🚢', 'ship': '🚢',
    'tên lửa': '🚀', 'rocket': '🚀',

    // Tech & Objects
    'điện thoại': '📱', 'phone': '📱', 'mobile': '📱',
    'máy tính': '💻', 'computer': '💻', 'laptop': '💻',
    'email': '📧', 'mail': '📧',
    'tin nhắn': '💬', 'message': '💬',
    'ảnh': '📷', 'photo': '📸', 'image': '🖼️',
    'video': '📹', 'film': '🎬',
    'nhạc': '🎵', 'music': '🎶',
    'game': '🎮', 'trò chơi': '🎮',
    'sách': '📚', 'book': '📖',
    'tiền': '💰', 'money': '💵', 'đô la': '💲',
    'thẻ': '💳', 'card': '💳',

    // Actions
    'chạy': '🏃', 'run': '🏃',
    'đi': '🚶', 'walk': '🚶',
    'ngủ': '😴', 'sleep': '💤',
    'làm việc': '💼', 'work': '💪',
    'học': '📖', 'study': '📚', 'learn': '🎓',
    'chơi': '🎮', 'play': '🎯',
    'nói': '🗣️', 'speak': '💬', 'talk': '💬',
    'viết': '✍️', 'write': '📝',
    'đọc': '📖', 'read': '📖',
    'xem': '👀', 'watch': '👁️', 'see': '👀',
    'nghe': '👂', 'listen': '🎧', 'hear': '👂',
    'tìm': '🔍', 'search': '🔎', 'find': '🔍',
    'mua': '🛒', 'buy': '🛍️', 'shop': '🛒',
    'bán': '💰', 'sell': '💵',
    'gửi': '📤', 'send': '📨',
    'nhận': '📥', 'receive': '📩',
    'đặt': '📦', 'order': '📦',
    'tải': '⬇️', 'download': '⬇️', 'upload': '⬆️',
    'bắt đầu': '🚀', 'start': '▶️', 'begin': '🏁',
    'kết thúc': '🏁', 'end': '🔚', 'finish': '✅',
    'hoàn thành': '✅', 'done': '✅', 'complete': '☑️',
    'thất bại': '❌', 'fail': '❌', 'error': '⚠️',
    'cảnh báo': '⚠️', 'warning': '⚠️',
    'thông báo': '📢', 'notify': '🔔', 'alert': '🚨',

    // Time
    'giờ': '🕐', 'time': '⏰', 'clock': '🕰️',
    'ngày': '📅', 'day': '☀️', 'date': '📆',
    'tuần': '📅', 'week': '📆',
    'tháng': '📆', 'month': '🗓️',
    'năm': '📅', 'year': '🗓️',
    'sáng': '🌅', 'morning': '🌄',
    'trưa': '☀️', 'noon': '🌞',
    'chiều': '🌇', 'afternoon': '🌆',
    'tối': '🌙', 'evening': '🌃', 'night': '🌃',

    // Weather
    'nắng': '☀️', 'sunny': '🌞',
    'mưa': '🌧️', 'rain': '☔',
    'tuyết': '❄️', 'snow': '⛄',
    'gió': '💨', 'wind': '🌬️',
    'nóng': '🔥', 'hot': '🥵',
    'lạnh': '❄️', 'cold': '🥶',

    // Numbers
    'một': '1️⃣', 'one': '1️⃣', '1': '1️⃣',
    'hai': '2️⃣', 'two': '2️⃣', '2': '2️⃣',
    'ba': '3️⃣', 'three': '3️⃣', '3': '3️⃣',
    'bốn': '4️⃣', 'four': '4️⃣', '4': '4️⃣',
    'năm': '5️⃣', 'five': '5️⃣', '5': '5️⃣',
    'sáu': '6️⃣', 'six': '6️⃣', '6': '6️⃣',
    'bảy': '7️⃣', 'seven': '7️⃣', '7': '7️⃣',
    'tám': '8️⃣', 'eight': '8️⃣', '8': '8️⃣',
    'chín': '9️⃣', 'nine': '9️⃣', '9': '9️⃣',
    'mười': '🔟', 'ten': '🔟', '10': '🔟',
    'trăm': '💯', 'hundred': '💯', '100': '💯',
    'phần trăm': '📊', 'percent': '📈',

    // Status
    'mới': '🆕', 'new': '✨',
    'cũ': '📦', 'old': '🗃️',
    'tốt': '👍', 'good': '✅', 'great': '🔥',
    'xấu': '👎', 'bad': '❌',
    'nhanh': '⚡', 'fast': '🚀', 'quick': '💨',
    'chậm': '🐢', 'slow': '🐌',
    'lớn': '🔝', 'big': '⬆️', 'large': '📈',
    'nhỏ': '🔻', 'small': '⬇️', 'little': '📉',
    'quan trọng': '⭐', 'important': '❗', 'priority': '🔴',
    'miễn phí': '🆓', 'free': '🎁',
    'hot': '🔥', 'trending': '📈', 'popular': '⭐',

    // Misc
    'câu hỏi': '❓', 'question': '❔',
    'trả lời': '💬', 'answer': '✅', 'reply': '↩️',
    'giúp': '🤝', 'help': '🆘',
    'cảm ơn': '🙏', 'thanks': '🙏', 'thank': '🙏',
    'xin lỗi': '🙇', 'sorry': '😔',
    'chào': '👋', 'hello': '👋', 'hi': '✋',
    'tạm biệt': '👋', 'bye': '👋', 'goodbye': '🙋',
    'chúc mừng': '🎉', 'congrats': '🎊', 'congratulations': '🎉',
    'sinh nhật': '🎂', 'birthday': '🎈',
    'lễ': '🎉', 'holiday': '🎊', 'party': '🥳',
    'quà': '🎁', 'gift': '🎀', 'present': '🎁',
    'ngôi sao': '⭐', 'star': '🌟',
    'trái tim': '❤️', 'heart': '💖',
    'lửa': '🔥', 'fire': '🔥',
    'nước': '💧', 'water': '🌊',
    'đất': '🌍', 'earth': '🌎',
    'không khí': '💨', 'air': '🌬️'
};

// =========================================
// 📊 STATUS MESSAGES - Format đẹp cho thông báo bot
// =========================================

const STATUS_EMOJI = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    loading: '⏳',
    done: '🎉',
    pending: '🔄',
    cancelled: '🚫',
    tip: '💡',
    notice: '📢',
    question: '❓',
    check: '☑️',
    star: '⭐',
    fire: '🔥',
    rocket: '🚀',
    trophy: '🏆',
    gift: '🎁',
    lock: '🔒',
    unlock: '🔓',
    key: '🔑',
    settings: '⚙️',
    user: '👤',
    group: '👥',
    admin: '👑',
    bot: '🤖',
    time: '⏰',
    calendar: '📅',
    money: '💰',
    chart: '📊',
    link: '🔗',
    pin: '📌',
    search: '🔍',
    edit: '✏️',
    delete: '🗑️',
    save: '💾',
    refresh: '🔄',
    new: '🆕',
    hot: '🔥',
    cool: '❄️'
};

// Rank emojis cho leaderboard
const RANK_EMOJI = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Format status message với emoji phù hợp
 * @param {string} type - Loại status (success, error, warning, info, etc.)
 * @param {string} message - Nội dung message
 * @returns {string} Message có emoji
 */
function formatStatus(type, message) {
    const emoji = STATUS_EMOJI[type] || STATUS_EMOJI.info;
    return `${emoji} ${message}`;
}

/**
 * Get random emoji từ array
 * @param {Array} emojiArray - Mảng emoji
 * @returns {string} Random emoji
 */
function getRandomEmoji(emojiArray) {
    if (!Array.isArray(emojiArray) || emojiArray.length === 0) return '';
    return emojiArray[Math.floor(Math.random() * emojiArray.length)];
}

/**
 * Get rank emoji theo vị trí
 * @param {number} position - Vị trí (1-based)
 * @returns {string} Emoji rank
 */
function getRankEmoji(position) {
    if (position < 1) return '';
    if (position <= RANK_EMOJI.length) return RANK_EMOJI[position - 1];
    return `${position}.`;
}

/**
 * Format list với emoji bullets
 * @param {Array<string>} items - Danh sách items
 * @param {string} bulletEmoji - Emoji dùng làm bullet (mặc định: ▸)
 * @returns {string} Formatted list
 */
function formatEmojiList(items, bulletEmoji = '▸') {
    return items.map(item => `${bulletEmoji} ${item}`).join('\n');
}

/**
 * Format numbered list với emoji numbers
 * @param {Array<string>} items - Danh sách items
 * @returns {string} Formatted numbered list
 */
function formatNumberedList(items) {
    return items.map((item, i) => {
        const num = i + 1;
        const numEmoji = num <= 10 ? EMOJI_NUMBERS[num] : `${num}.`;
        return `${numEmoji} ${item}`;
    }).join('\n');
}

module.exports = {
    // Emoji collections
    EMOJI_FACES,
    EMOJI_HANDS,
    EMOJI_HEARTS,
    EMOJI_ANIMALS,
    EMOJI_NATURE,
    EMOJI_FOOD,
    EMOJI_TRANSPORT,
    EMOJI_PLACES,
    EMOJI_ACTIVITIES,
    EMOJI_OBJECTS,
    EMOJI_CLOTHING,
    EMOJI_NUMBERS,
    EMOJI_SYMBOLS,
    EMOJI_FLAGS,

    // Keyword mapping
    KEYWORD_EMOJI_MAP,

    // Status emojis
    STATUS_EMOJI,
    RANK_EMOJI,

    // Utility functions
    formatStatus,
    getRandomEmoji,
    getRankEmoji,
    formatEmojiList,
    formatNumberedList
};
