/**
 * Live Audio Tools - Function declarations for Live API tool calling
 * These functions can be called by the AI during voice conversations
 * 
 * Safe functions only - no destructive operations
 */

// Function declarations for Live API
const LIVE_AUDIO_FUNCTION_DECLARATIONS = [
    {
        name: 'get_fortune',
        description: 'Get a random fortune/horoscope reading for the user. Use when user asks for fortune, luck, horoscope, or daily prediction.',
        parameters: {
            type: 'object',
            properties: {
                category: {
                    type: 'string',
                    description: 'Category of fortune: love, career, health, money, general',
                    enum: ['love', 'career', 'health', 'money', 'general']
                }
            },
            required: []
        }
    },
    {
        name: 'roll_dice',
        description: 'Roll dice and return the result. Use when user asks to roll dice, random number, or gambling.',
        parameters: {
            type: 'object',
            properties: {
                sides: {
                    type: 'integer',
                    description: 'Number of sides on the dice (default 6)',
                    minimum: 2,
                    maximum: 100
                },
                count: {
                    type: 'integer',
                    description: 'Number of dice to roll (default 1)',
                    minimum: 1,
                    maximum: 10
                }
            },
            required: []
        }
    },
    {
        name: 'get_current_time',
        description: 'Get the current date and time. Use when user asks about time, date, day of week, or timezone.',
        parameters: {
            type: 'object',
            properties: {
                timezone: {
                    type: 'string',
                    description: 'Timezone like Asia/Ho_Chi_Minh, Asia/Shanghai, etc. Default is Asia/Ho_Chi_Minh',
                }
            },
            required: []
        }
    },
    {
        name: 'flip_coin',
        description: 'Flip a coin and return heads or tails. Use for coin flip, yes/no decisions.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    }
];

// Fortune data by category
const FORTUNE_DATA = {
    general: [
        'Today is your lucky day! Great opportunities await.',
        'Be patient, good things take time.',
        'A surprise is coming your way soon.',
        'Trust your instincts, they will guide you well.',
        'New beginnings are on the horizon.',
        'Your hard work will pay off soon.',
        'Stay positive, the universe is working in your favor.',
        'An important message will arrive today.',
        'Good fortune follows those who are kind.'
    ],
    love: [
        'Love is in the air! Keep your heart open.',
        'A special connection is forming.',
        'Past relationships taught you valuable lessons.',
        'Romance may bloom where you least expect it.',
        'Your soulmate is thinking of you.',
        'Express your feelings honestly today.',
        'A meaningful conversation will strengthen bonds.'
    ],
    career: [
        'A promotion or recognition is coming.',
        'New career opportunities are emerging.',
        'Your skills are being noticed by the right people.',
        'Take on new challenges with confidence.',
        'Collaboration will lead to success.',
        'Your creativity will open new doors.',
        'Financial growth is on the way.'
    ],
    health: [
        'Energy and vitality are increasing.',
        'Take time for self-care today.',
        'A healthy change will benefit you greatly.',
        'Rest and relaxation will restore balance.',
        'Your body is healing and strengthening.'
    ],
    money: [
        'Financial luck is smiling upon you.',
        'A profitable opportunity is approaching.',
        'Wise investments will pay off.',
        'Unexpected income is on the way.',
        'Save wisely, spend joyfully.',
        'Abundance is flowing into your life.'
    ]
};

/**
 * Execute a function call from Live API
 * @param {string} name - Function name
 * @param {object} args - Function arguments
 * @returns {object} - Result to send back to API
 */
function executeFunctionCall(name, args = {}) {
    switch (name) {
        case 'get_fortune': {
            const category = args.category || 'general';
            const fortunes = FORTUNE_DATA[category] || FORTUNE_DATA.general;
            const fortune = fortunes[Math.floor(Math.random() * fortunes.length)];
            return {
                success: true,
                fortune: fortune,
                category: category
            };
        }

        case 'roll_dice': {
            const sides = Math.min(100, Math.max(2, args.sides || 6));
            const count = Math.min(10, Math.max(1, args.count || 1));
            const results = [];
            let total = 0;
            for (let i = 0; i < count; i++) {
                const roll = Math.floor(Math.random() * sides) + 1;
                results.push(roll);
                total += roll;
            }
            return {
                success: true,
                dice: `${count}d${sides}`,
                results: results,
                total: total
            };
        }

        case 'get_current_time': {
            const timezone = args.timezone || 'Asia/Ho_Chi_Minh';
            try {
                const now = new Date();
                const formatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: timezone,
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                return {
                    success: true,
                    datetime: formatter.format(now),
                    timezone: timezone,
                    timestamp: now.toISOString()
                };
            } catch (e) {
                return {
                    success: false,
                    error: 'Invalid timezone'
                };
            }
        }

        case 'flip_coin': {
            const result = Math.random() < 0.5 ? 'heads' : 'tails';
            return {
                success: true,
                result: result
            };
        }

        default:
            return {
                success: false,
                error: `Unknown function: ${name}`
            };
    }
}

/**
 * Build tools config for Live API
 * @param {boolean} enableSearch - Enable Google Search grounding
 * @param {boolean} enableFunctions - Enable function calling
 * @returns {Array} - Tools array for Live API config
 */
function buildLiveTools(enableSearch = true, enableFunctions = true) {
    const tools = [];

    if (enableSearch) {
        tools.push({ googleSearch: {} });
    }

    if (enableFunctions) {
        tools.push({
            functionDeclarations: LIVE_AUDIO_FUNCTION_DECLARATIONS
        });
    }

    return tools.length > 0 ? tools : null;
}

module.exports = {
    LIVE_AUDIO_FUNCTION_DECLARATIONS,
    executeFunctionCall,
    buildLiveTools
};
