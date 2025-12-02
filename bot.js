const { Telegraf, Markup } = require('telegraf');

// Bot configuration
const BOT_TOKEN = process.env.BOT_TOKEN || '8389541552:AAFrzMsztke1dK68PJREs7OIpQFtRLTsXCw';
const bot = new Telegraf(BOT_TOKEN);

// Advent calendar content for each day (December 1-24)
const ADVENT_CONTENT = {
    1: { message: '🎄 Day 1: Welcome to the Advent Calendar!', image: null },
    2: { message: '❄️ Day 2: Let it snow!', image: null },
    3: { message: '🎅 Day 3: Santa is preparing his sleigh!', image: null },
    4: { message: '⭐ Day 4: The first star shines bright!', image: null },
    5: { message: '🕯️ Day 5: Light a candle and make a wish!', image: null },
    6: { message: '🎁 Day 6: Time to wrap some presents!', image: null },
    7: { message: '🔔 Day 7: Jingle bells, jingle bells!', image: null },
    8: { message: '☃️ Day 8: Build a snowman today!', image: null },
    9: { message: '🍪 Day 9: Baking cookies time!', image: null },
    10: { message: '🎵 Day 10: Sing your favorite Christmas carol!', image: null },
    11: { message: '🌟 Day 11: Eleven stars twinkling!', image: null },
    12: { message: '🎿 Day 12: Winter sports season!', image: null },
    13: { message: '🦌 Day 13: Rudolph\'s nose is glowing!', image: null },
    14: { message: '🧦 Day 14: Hang your stockings!', image: null },
    15: { message: '🎨 Day 15: Make some decorations!', image: null },
    16: { message: '📬 Day 16: Write letters to Santa!', image: null },
    17: { message: '🌲 Day 17: Decorate the Christmas tree!', image: null },
    18: { message: '🎬 Day 18: Watch a Christmas movie!', image: null },
    19: { message: '🍫 Day 19: Hot chocolate weather!', image: null },
    20: { message: '🎪 Day 20: The elves are working hard!', image: null },
    21: { message: '🌙 Day 21: The longest night of the year!', image: null },
    22: { message: '🎺 Day 22: Christmas music fills the air!', image: null },
    23: { message: '✨ Day 23: Magic is in the air!', image: null },
    24: { message: '🎉 Day 24: Christmas Eve! Santa is coming tonight!', image: null },
};

// Store user data (in production, use a database)
const userData = {};

function loadUserData(userId) {
    if (!userData[userId]) {
        userData[userId] = { openedDays: [] };
    }
    return userData[userId];
}

function saveOpenedDay(userId, day) {
    const data = loadUserData(userId);
    if (!data.openedDays.includes(day)) {
        data.openedDays.push(day);
    }
}

function createCalendarKeyboard(userId) {
    const now = new Date();
    const currentDay = now.getMonth() === 11 ? now.getDate() : 0; // 11 = December (0-indexed)
    const userOpened = loadUserData(userId).openedDays;
    
    const keyboard = [];
    let row = [];
    
    for (let day = 1; day <= 24; day++) {
        let buttonText, callbackData;
        
        if (userOpened.includes(day)) {
            buttonText = `✓ ${day}`;
            callbackData = `opened_${day}`;
        } else if (day <= currentDay) {
            buttonText = `🎁 ${day}`;
            callbackData = `open_${day}`;
        } else {
            buttonText = `🔒 ${day}`;
            callbackData = `locked_${day}`;
        }
        
        row.push(Markup.button.callback(buttonText, callbackData));
        
        // Create rows of 6 buttons
        if (row.length === 6) {
            keyboard.push(row);
            row = [];
        }
    }
    
    if (row.length > 0) {
        keyboard.push(row);
    }
    
    return Markup.inlineKeyboard(keyboard);
}

// Start command
bot.command('start', (ctx) => {
    const welcomeMessage = 
        `🎄 Welcome to the Advent Calendar, ${ctx.from.first_name}! 🎄\n\n` +
        'Open a new door each day from December 1st to 24th!\n' +
        'Each day reveals a special surprise! 🎁\n\n' +
        'Click on a gift box to open today\'s door!';
    
    return ctx.reply(welcomeMessage, createCalendarKeyboard(ctx.from.id));
});

// Calendar command
bot.command('calendar', (ctx) => {
    const message = 
        '🎄 Your Advent Calendar 🎄\n\n' +
        '🎁 = Available to open\n' +
        '✓ = Already opened\n' +
        '🔒 = Coming soon';
    
    return ctx.reply(message, createCalendarKeyboard(ctx.from.id));
});

// Progress command
bot.command('progress', (ctx) => {
    const userId = ctx.from.id;
    const openedDays = loadUserData(userId).openedDays;
    
    const now = new Date();
    const currentDay = now.getMonth() === 11 ? now.getDate() : 0;
    
    let progressText = 
        '📊 Your Progress:\n\n' +
        `Opened: ${openedDays.length}/24 days\n` +
        `Available: ${Math.min(currentDay, 24)} days\n\n`;
    
    if (openedDays.length > 0) {
        progressText += 'Days you\'ve opened: ' + openedDays.sort((a, b) => a - b).join(', ');
    } else {
        progressText += 'You haven\'t opened any days yet! Use /calendar to start! 🎁';
    }
    
    return ctx.reply(progressText);
});

// Handle button clicks
bot.action(/.*/, (ctx) => {
    const userId = ctx.from.id;
    const callbackData = ctx.callbackQuery.data;
    
    if (callbackData.startsWith('open_')) {
        const day = parseInt(callbackData.split('_')[1]);
        saveOpenedDay(userId, day);
        
        const content = ADVENT_CONTENT[day] || { message: `Day ${day}!`, image: null };
        
        const message = 
            `${content.message}\n\n` +
            `You've opened day ${day}! 🎉\n\n` +
            'Use /calendar to see the full calendar.';
        
        return ctx.editMessageText(
            message,
            Markup.inlineKeyboard([[
                Markup.button.callback('« Back to Calendar', 'back_to_calendar')
            ]])
        );
    }
    
    if (callbackData.startsWith('opened_')) {
        const day = parseInt(callbackData.split('_')[1]);
        const content = ADVENT_CONTENT[day] || { message: `Day ${day}!`, image: null };
        
        const message = 
            `${content.message}\n\n` +
            `You already opened day ${day}! ✓\n\n` +
            'Use /calendar to see the full calendar.';
        
        return ctx.editMessageText(
            message,
            Markup.inlineKeyboard([[
                Markup.button.callback('« Back to Calendar', 'back_to_calendar')
            ]])
        );
    }
    
    if (callbackData.startsWith('locked_')) {
        const day = parseInt(callbackData.split('_')[1]);
        return ctx.answerCbQuery(`Day ${day} is still locked! Come back on December ${day}! 🔒`, { show_alert: true });
    }
    
    if (callbackData === 'back_to_calendar') {
        const message = 
            '🎄 Your Advent Calendar 🎄\n\n' +
            '🎁 = Available to open\n' +
            '✓ = Already opened\n' +
            '🔒 = Coming soon';
        
        return ctx.editMessageText(message, createCalendarKeyboard(userId));
    }
});

// Error handling
bot.catch((err, ctx) => {
    console.error('Error occurred:', err);
});

// Start the bot
bot.launch().then(() => {
    console.log('Bot is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));