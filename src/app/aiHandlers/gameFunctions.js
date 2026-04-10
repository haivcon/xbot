/**
 * Game Functions for AI Function Calling
 * Contains implementations for gaming/random functions
 */

/**
 * Create game function handlers with deps injection
 */
function createGameFunctions(deps) {
    const { t, getLang } = deps;

    // Bot self-introduction
    async function get_bot_introduction({ }, context) {
        try {
            const { msg } = context;
            const lang = await getLang(msg);
            const introduction = t(lang, 'aib_bot_introduction') ||
                "I'm Xlayer Bot AI, a virtual assistant helping OKX's Xlayer community. Developed by DOREMON (x.com/haivcon_X)";
            return { success: true, introduction, message: introduction };
        } catch (error) {
            return { success: false, error: `Failed to get introduction: ${error.message}` };
        }
    }

    // Roll dice
    async function play_dice({ notation }, context) {
        try {
            const match = /^([1-9]\d*)d([1-9]\d*)$/i.exec((notation || '').trim());
            if (!match) {
                return { success: false, error: 'Invalid dice notation. Use format like "2d6"' };
            }
            const count = Math.min(10, Math.max(1, parseInt(match[1])));
            const faces = Math.min(100, Math.max(2, parseInt(match[2])));
            const rolls = [];
            for (let i = 0; i < count; i++) {
                rolls.push(Math.floor(Math.random() * faces) + 1);
            }
            const total = rolls.reduce((sum, val) => sum + val, 0);
            return {
                success: true,
                notation: `${count}d${faces}`,
                rolls,
                total,
                message: `Rolled ${count}d${faces}: [${rolls.join(', ')}] = ${total}`
            };
        } catch (error) {
            return { success: false, error: `Failed to roll dice: ${error.message}` };
        }
    }

    // Rock-Paper-Scissors
    async function play_rps({ choice }, context) {
        try {
            const choices = ['rock', 'paper', 'scissors'];
            const icons = { rock: '🪨', paper: '📄', scissors: '✂️' };
            const languageMap = {
                'búa': 'rock', 'bao': 'paper', 'kéo': 'scissors',
                '石头': 'rock', '布': 'paper', '剪刀': 'scissors',
                '바위': 'rock', '보': 'paper', '가위': 'scissors',
                'камень': 'rock', 'бумага': 'paper', 'ножницы': 'scissors',
                'batu': 'rock', 'kertas': 'paper', 'gunting': 'scissors'
            };
            let userChoice = (choice || '').toLowerCase().trim();
            if (languageMap[userChoice]) userChoice = languageMap[userChoice];
            if (!choices.includes(userChoice)) {
                return { success: false, error: 'Invalid choice. Must be rock/paper/scissors' };
            }
            const botChoice = choices[Math.floor(Math.random() * 3)];
            let outcome = 'draw';
            if (
                (userChoice === 'rock' && botChoice === 'scissors') ||
                (userChoice === 'paper' && botChoice === 'rock') ||
                (userChoice === 'scissors' && botChoice === 'paper')
            ) {
                outcome = 'win';
            } else if (userChoice !== botChoice) {
                outcome = 'lose';
            }
            return {
                success: true,
                your_choice: userChoice,
                bot_choice: botChoice,
                outcome,
                message: `You: ${icons[userChoice]} | Bot: ${icons[botChoice]} → ${outcome.toUpperCase()}!`
            };
        } catch (error) {
            return { success: false, error: `Failed to play RPS: ${error.message}` };
        }
    }

    // Random number
    async function generate_random_number({ min = 1, max = 1000 }, context) {
        try {
            const minVal = Math.floor(Math.min(min, max));
            const maxVal = Math.floor(Math.max(min, max));
            const result = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
            return {
                success: true,
                min: minVal,
                max: maxVal,
                result,
                message: `Random: ${result} (${minVal}-${maxVal})`
            };
        } catch (error) {
            return { success: false, error: `Failed: ${error.message}` };
        }
    }

    // Long/Short generator
    async function generate_longshort({ }, context) {
        try {
            const isLong = Math.random() > 0.5;
            const leverage = Math.floor(Math.random() * 100) + 1;
            const position = isLong ? 'LONG' : 'SHORT';
            const icon = isLong ? '📈' : '📉';
            return {
                success: true,
                position,
                leverage,
                message: `${icon} ${position} ${leverage}x`
            };
        } catch (error) {
            return { success: false, error: `Failed: ${error.message}` };
        }
    }

    // Random choice
    async function random_choice({ options }, context) {
        try {
            if (!Array.isArray(options) || options.length < 2) {
                return { success: false, error: 'Provide at least 2 options' };
            }
            const index = Math.floor(Math.random() * options.length);
            const chosen = options[index];
            return {
                success: true,
                options,
                chosen,
                message: `Choice: ${chosen}`
            };
        } catch (error) {
            return { success: false, error: `Failed: ${error.message}` };
        }
    }

    // Fortune
    async function get_fortune({ topic_code }, context) {
        try {
            const fortunes = [
                "Good luck will come your way soon",
                "A pleasant surprise is in store for you",
                "Your hard work will pay off",
                "An exciting opportunity is coming",
                "Trust your instincts",
                "A new friendship will bring joy",
                "Your creativity will flourish",
                "Patience will bring rewards",
                "A journey awaits you",
                "Success is on the horizon"
            ];
            const index = topic_code ? (topic_code - 1) % fortunes.length : Math.floor(Math.random() * fortunes.length);
            return {
                success: true,
                fortune: fortunes[index],
                message: `🔮 ${fortunes[index]}`
            };
        } catch (error) {
            return { success: false, error: `Failed: ${error.message}` };
        }
    }

    // Quiz
    async function create_quiz({ }, context) {
        try {
            const num1 = Math.floor(Math.random() * 10) + 1;
            const num2 = Math.floor(Math.random() * 10) + 1;
            const operators = ['+', '-', '*'];
            const operator = operators[Math.floor(Math.random() * operators.length)];
            let answer;
            switch (operator) {
                case '+': answer = num1 + num2; break;
                case '-': answer = num1 - num2; break;
                case '*': answer = num1 * num2; break;
            }
            const options = [
                answer,
                answer + Math.floor(Math.random() * 5) + 1,
                answer - Math.floor(Math.random() * 5) - 1,
                answer + Math.floor(Math.random() * 10) + 5
            ].sort(() => Math.random() - 0.5);
            return {
                success: true,
                question: `${num1} ${operator} ${num2} = ?`,
                options,
                correct_answer: answer,
                message: `Quiz: ${num1} ${operator} ${num2} = ?`
            };
        } catch (error) {
            return { success: false, error: `Failed: ${error.message}` };
        }
    }

    return {
        get_bot_introduction,
        play_dice,
        play_rps,
        generate_random_number,
        generate_longshort,
        random_choice,
        get_fortune,
        create_quiz
    };
}

module.exports = { createGameFunctions };
