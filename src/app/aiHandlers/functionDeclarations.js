/**
 * Function Declarations for AI Function Calling
 * Contains schemas for Gemini tool/function declarations
 */

const { Type } = require('@google/genai');

// ========================================================================
// USER LEVEL FUNCTIONS
// ========================================================================
const getUserInfoDeclaration = {
    name: 'get_user_info',
    description: 'Get information about a user including their ID, username, and full name.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            chat_id: { type: Type.STRING, description: 'The Telegram chat/group ID' },
            user_identifier: { type: Type.STRING, description: 'User ID or username to look up' }
        },
        required: ['chat_id']
    }
};

const getMemberCountDeclaration = {
    name: 'get_member_count',
    description: 'Retrieves the total number of members in a Telegram group.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            chat_id: { type: Type.STRING, description: 'The Telegram group ID' }
        },
        required: ['chat_id']
    }
};

// ========================================================================
// ADMIN LEVEL FUNCTIONS
// ========================================================================
const banMemberDeclaration = {
    name: 'ban_member',
    description: 'Ban a user from the Telegram group permanently.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            chat_id: { type: Type.STRING, description: 'The Telegram group ID' },
            user_id: { type: Type.STRING, description: 'The user ID to ban' },
            reason: { type: Type.STRING, description: 'Reason for banning' },
            revoke_messages: { type: Type.BOOLEAN, description: 'Delete user messages. Default: true' }
        },
        required: ['chat_id', 'user_id']
    }
};

const kickMemberDeclaration = {
    name: 'kick_member',
    description: 'Kick a user from the group temporarily.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            chat_id: { type: Type.STRING, description: 'The Telegram group ID' },
            user_id: { type: Type.STRING, description: 'The user ID to kick' },
            reason: { type: Type.STRING, description: 'Reason for kicking' }
        },
        required: ['chat_id', 'user_id']
    }
};

const muteMemberDeclaration = {
    name: 'mute_member',
    description: 'Mute a user in the group.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            chat_id: { type: Type.STRING, description: 'The Telegram group ID' },
            user_id: { type: Type.STRING, description: 'The user ID to mute' },
            duration_seconds: { type: Type.NUMBER, description: 'Mute duration in seconds. Default: 3600' },
            reason: { type: Type.STRING, description: 'Reason for muting' }
        },
        required: ['chat_id', 'user_id']
    }
};

const unmuteMemberDeclaration = {
    name: 'unmute_member',
    description: 'Unmute a previously muted user.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            chat_id: { type: Type.STRING, description: 'The Telegram group ID' },
            user_id: { type: Type.STRING, description: 'The user ID to unmute' }
        },
        required: ['chat_id', 'user_id']
    }
};

const warnMemberDeclaration = {
    name: 'warn_member',
    description: 'Issue a warning to a user.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            chat_id: { type: Type.STRING, description: 'The Telegram group ID' },
            user_id: { type: Type.STRING, description: 'The user ID to warn' },
            reason: { type: Type.STRING, description: 'Reason for warning' }
        },
        required: ['chat_id', 'user_id', 'reason']
    }
};

// ========================================================================
// GAMING FUNCTIONS
// ========================================================================
const playDiceDeclaration = {
    name: 'play_dice',
    description: 'Roll dice using notation like "2d6"',
    parameters: {
        type: Type.OBJECT,
        properties: {
            notation: { type: Type.STRING, description: 'Dice notation (e.g., "2d6", "1d20")' }
        },
        required: ['notation']
    }
};

const playRpsDeclaration = {
    name: 'play_rps',
    description: 'Play rock-paper-scissors with the bot.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            choice: { type: Type.STRING, description: 'rock, paper, or scissors' }
        },
        required: ['choice']
    }
};

const generateRandomNumberDeclaration = {
    name: 'generate_random_number',
    description: 'Generate a random number in range.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            min: { type: Type.NUMBER, description: 'Minimum value. Default: 1' },
            max: { type: Type.NUMBER, description: 'Maximum value. Default: 1000' }
        },
        required: []
    }
};

const generateLongShortDeclaration = {
    name: 'generate_longshort',
    description: 'Generate LONG/SHORT trading signal with leverage.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
};

const randomChoiceDeclaration = {
    name: 'random_choice',
    description: 'Randomly choose from options.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            options: { type: Type.ARRAY, description: 'Options to choose from', items: { type: Type.STRING } }
        },
        required: ['options']
    }
};

const getFortuneDeclaration = {
    name: 'get_fortune',
    description: 'Get a random fortune.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            topic_code: { type: Type.NUMBER, description: 'Optional topic code' }
        },
        required: []
    }
};

const createQuizDeclaration = {
    name: 'create_quiz',
    description: 'Generate a quiz question.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
};

// ========================================================================
// BOT UTILITY FUNCTIONS
// ========================================================================
const getBotIntroductionDeclaration = {
    name: 'get_bot_introduction',
    description: 'Get bot self-introduction.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
};

const checkWalletBalanceDeclaration = {
    name: 'check_wallet_balance',
    description: 'Check wallet balance and portfolio.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            address: { type: Type.STRING, description: 'Wallet address to check' }
        },
        required: []
    }
};

const getTokenInfoDeclaration = {
    name: 'get_token_info',
    description: 'Get token price and info.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            token: { type: Type.STRING, description: 'Token symbol or address' }
        },
        required: []
    }
};

const doCheckinDeclaration = {
    name: 'do_checkin',
    description: 'Perform daily check-in.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
};

const generateImageDeclaration = {
    name: 'generate_image',
    description: 'Generate an image from text prompt.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            prompt: { type: Type.STRING, description: 'Image description' }
        },
        required: ['prompt']
    }
};

const textToSpeechDeclaration = {
    name: 'text_to_speech',
    description: 'Convert text to speech audio.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            text: { type: Type.STRING, description: 'Text to convert' }
        },
        required: ['text']
    }
};

// ========================================================================
// EXPORT ALL DECLARATIONS
// ========================================================================

// User level declarations
const userDeclarations = [
    getUserInfoDeclaration,
    getMemberCountDeclaration,
    getBotIntroductionDeclaration,
    playDiceDeclaration,
    playRpsDeclaration,
    generateRandomNumberDeclaration,
    generateLongShortDeclaration,
    randomChoiceDeclaration,
    getFortuneDeclaration,
    createQuizDeclaration,
    checkWalletBalanceDeclaration,
    getTokenInfoDeclaration,
    doCheckinDeclaration,
    generateImageDeclaration,
    textToSpeechDeclaration
];

// Admin level declarations
const adminDeclarations = [
    banMemberDeclaration,
    kickMemberDeclaration,
    muteMemberDeclaration,
    unmuteMemberDeclaration,
    warnMemberDeclaration
];

// Get all declarations by permission level
function getDeclarationsByLevel(level) {
    if (level === 'admin') return [...userDeclarations, ...adminDeclarations];
    return userDeclarations;
}

module.exports = {
    // Individual declarations
    getUserInfoDeclaration,
    getMemberCountDeclaration,
    banMemberDeclaration,
    kickMemberDeclaration,
    muteMemberDeclaration,
    unmuteMemberDeclaration,
    warnMemberDeclaration,
    playDiceDeclaration,
    playRpsDeclaration,
    generateRandomNumberDeclaration,
    generateLongShortDeclaration,
    randomChoiceDeclaration,
    getFortuneDeclaration,
    createQuizDeclaration,
    getBotIntroductionDeclaration,
    checkWalletBalanceDeclaration,
    getTokenInfoDeclaration,
    doCheckinDeclaration,
    generateImageDeclaration,
    textToSpeechDeclaration,
    // Grouped declarations
    userDeclarations,
    adminDeclarations,
    getDeclarationsByLevel
};
