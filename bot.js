const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const credentials = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));


const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });
// Bot configuration
const BOT_TOKEN = process.env.BOT_TOKEN || '8389541552:AAFrzMsztke1dK68PJREs7OIpQFtRLTsXCw';
const bot = new Telegraf(BOT_TOKEN);

async function saveUserToSheet(userId, firstName) {
    const spreadsheetId = '1Sa4eOSmt4sxYq2ksmLqOGH3n4yod0lJmGJqW8ZXQgiE';
    const sheetName = 'Users';

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:A`
        });

        const existingIds = (response.data.values || []).flat();

        if (!existingIds.includes(userId.toString())) {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: sheetName,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[userId, firstName, new Date().toLocaleString()]]
                }
            });
        }
    } catch (err) {
        console.error('Error saving user:', err);
    }
}


async function saveAnswerToSheet(day, userName, answer) {
  const spreadsheetId = '1Sa4eOSmt4sxYq2ksmLqOGH3n4yod0lJmGJqW8ZXQgiE'; // replace with your Google Sheet ID
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1', // Columns: Date, Day, Student, Answer
    valueInputOption: 'RAW',
    requestBody: {
      values: [[new Date().toLocaleString(), day, userName, answer]]
    }
  });
}

// List of teacher/admin Telegram user IDs (can view all responses)
const TEACHER_IDS = [
    1763838753,  // Replace with your actual Telegram user ID
    // Add more teacher IDs here
];

function isTeacher(userId) {
    return TEACHER_IDS.includes(userId);
}

// Advent calendar content for each day (December 1-24)
const ADVENT_CONTENT = {
    1: { 
        message: '🎄 Day 1: "Break the ice"\n\n',
        image: 'https://ibb.co/hRTWbLpc',
        question: 'How do you prefer to break the ice when you first meet someone?'
    },
    2: { 
        message: '❄️ Day 2: "Snowed under"\n\n',
        image: 'https://ibb.co/ym77zhmH',
      question: 'Do you feel snowed under at the moment? Why?'
    },
    3: { 
        message: '🎅 Day 3: "In the dead of winter"\n\n',
        image: 'https://ibb.co/qYqK4K9Z',
      question: 'What do you like to do in the dead of winter?'
    },
    4: { 
        message: '⭐ Day 4: "The more the merrier"\n\n' +
                 '📖 Meaning: The more people join, the more fun it will be.\n\n' +
                 '💬 Example: "Can I bring my sister to the Christmas dinner?" "Sure! The more the merrier!"\n\n' +
                 '🎄 Christmas connection: Christmas is about gathering together!',
        image: null 
    },
    5: { 
        message: '🕯️ Day 5: "To give someone the cold shoulder"\n\n' +
                 '📖 Meaning: To ignore someone or be unfriendly toward them.\n\n' +
                 '💬 Example: "After our argument, she gave me the cold shoulder at the party."\n\n' +
                 '❄️ Winter connection: "Cold" reflects the unfriendly behavior!',
        image: null 
    },
    6: { 
        message: '🎁 Day 6: "Wrap up"\n\n' +
                 '📖 Meaning: To finish something or to dress warmly.\n\n' +
                 '💬 Example: "Let\'s wrap up this meeting before lunch." OR "Wrap up warm, it\'s freezing outside!"\n\n' +
                 '🎁 Christmas connection: Also means wrapping presents!',
        image: null 
    },
    7: { 
        message: '🔔 Day 7: "Ring in the new year"\n\n' +
                 '📖 Meaning: To celebrate the beginning of a new year.\n\n' +
                 '💬 Example: "We\'re going to ring in the new year with fireworks!"\n\n' +
                 '🔔 Winter connection: Church bells traditionally ring at midnight on New Year\'s Eve.',
        image: null 
    },
    8: { 
        message: '☃️ Day 8: "A snowball\'s chance in hell"\n\n' +
                 '📖 Meaning: No chance at all, impossible.\n\n' +
                 '💬 Example: "He has a snowball\'s chance in hell of finishing all that work by tomorrow."\n\n' +
                 '❄️ Winter connection: A snowball would melt instantly in hell!',
        image: null 
    },
    9: { 
        message: '🍪 Day 9: "Bundle up"\n\n' +
                 '📖 Meaning: To dress in warm clothes.\n\n' +
                 '💬 Example: "It\'s -10°C outside! You need to bundle up before going out."\n\n' +
                 '❄️ Winter connection: Essential winter advice!',
        image: null 
    },
    10: { 
        message: '🎵 Day 10: "Spread Christmas cheer"\n\n' +
                 '📖 Meaning: To make others happy and joyful during the holiday season.\n\n' +
                 '💬 Example: "We sang carols at the nursing home to spread Christmas cheer."\n\n' +
                 '🎄 Christmas connection: From the movie "Elf" - a classic Christmas phrase!',
        image: null 
    },
    11: { 
        message: '🌟 Day 11: "Left out in the cold"\n\n' +
                 '📖 Meaning: To be excluded or ignored.\n\n' +
                 '💬 Example: "I felt left out in the cold when they didn\'t invite me to the party."\n\n' +
                 '❄️ Winter connection: Like being left outside in freezing weather!',
        image: null 
    },
    12: { 
        message: '🎿 Day 12: "On thin ice"\n\n' +
                 '📖 Meaning: In a risky or dangerous situation.\n\n' +
                 '💬 Example: "You\'re on thin ice with the boss after being late three times this week."\n\n' +
                 '❄️ Winter connection: Thin ice on a lake can break - dangerous!',
        image: null 
    },
    13: { 
        message: '🦌 Day 13: "A white Christmas"\n\n' +
                 '📖 Meaning: Christmas Day when there is snow on the ground.\n\n' +
                 '💬 Example: "I\'m dreaming of a white Christmas, just like the ones I used to know."\n\n' +
                 '🎄 Christmas connection: From the famous Bing Crosby song!',
        image: null 
    },
    14: { 
        message: '🧦 Day 14: "Under the weather"\n\n' +
                 '📖 Meaning: Feeling ill or sick.\n\n' +
                 '💬 Example: "I can\'t come to the party tonight, I\'m feeling a bit under the weather."\n\n' +
                 '❄️ Winter connection: Cold weather often brings colds and flu!',
        image: null 
    },
    15: { 
        message: '🎨 Day 15: "Deck the halls"\n\n' +
                 '📖 Meaning: To decorate for Christmas.\n\n' +
                 '💬 Example: "It\'s time to deck the halls with lights and tinsel!"\n\n' +
                 '🎄 Christmas connection: From the famous carol "Deck the Halls"!',
        image: null 
    },
    16: { 
        message: '📬 Day 16: "Snug as a bug in a rug"\n\n' +
                 '📖 Meaning: Very comfortable and cozy.\n\n' +
                 '💬 Example: "I\'m sitting by the fire with hot chocolate - snug as a bug in a rug!"\n\n' +
                 '❄️ Winter connection: Perfect for describing a cozy winter evening!',
        image: null 
    },
    17: { 
        message: '🌲 Day 17: "Tis the season"\n\n' +
                 '📖 Meaning: It\'s the appropriate time of year (usually for Christmas activities).\n\n' +
                 '💬 Example: "Let\'s go ice skating - \'tis the season!"\n\n' +
                 '🎄 Christmas connection: From "Deck the Halls" - "\'Tis the season to be jolly"!',
        image: null 
    },
    18: { 
        message: '🎬 Day 18: "Freeze someone out"\n\n' +
                 '📖 Meaning: To deliberately exclude someone from a group or activity.\n\n' +
                 '💬 Example: "The team tried to freeze out the new member by not including them in discussions."\n\n' +
                 '❄️ Winter connection: Like shutting someone out in the freezing cold!',
        image: null 
    },
    19: { 
        message: '🍫 Day 19: "Warm the cockles of your heart"\n\n' +
                 '📖 Meaning: To make you feel happy and content.\n\n' +
                 '💬 Example: "Seeing the children open their presents really warmed the cockles of my heart."\n\n' +
                 '❄️ Winter connection: Perfect for describing that cozy, warm Christmas feeling!',
        image: null 
    },
    20: { 
        message: '🎪 Day 20: "Home for the holidays"\n\n' +
                 '📖 Meaning: Returning to your family home to celebrate Christmas.\n\n' +
                 '💬 Example: "I\'m flying home for the holidays to spend Christmas with my parents."\n\n' +
                 '🎄 Christmas connection: A popular Christmas song and tradition!',
        image: null 
    },
    21: { 
        message: '🌙 Day 21: "In cold blood"\n\n' +
                 '📖 Meaning: Done deliberately and without emotion (usually about violence).\n\n' +
                 '💬 Example: "The detective said the crime was committed in cold blood."\n\n' +
                 '❄️ Winter connection: "Cold" suggests lack of warmth or emotion.',
        image: null 
    },
    22: { 
        message: '🎺 Day 22: "Baby, it\'s cold outside"\n\n' +
                 '📖 Meaning: A playful way to say it\'s very cold (and you should stay inside).\n\n' +
                 '💬 Example: "Want to go for a walk?" "Baby, it\'s cold outside! Let\'s stay in!"\n\n' +
                 '❄️ Winter connection: From a famous Christmas song!',
        image: null 
    },
    23: { 
        message: '✨ Day 23: "Peace on Earth"\n\n' +
                 '📖 Meaning: A wish for harmony and goodwill among all people.\n\n' +
                 '💬 Example: "The choir sang songs of peace on Earth and goodwill to all."\n\n' +
                 '🎄 Christmas connection: A central message of Christmas!',
        image: null 
    },
    24: { 
        message: '🎉 Day 24: "Merry Christmas to all, and to all a good night!"\n\n' +
                 '📖 Meaning: A cheerful way to wish everyone well on Christmas Eve.\n\n' +
                 '💬 Example: Used to end Christmas celebrations and send people home happily.\n\n' +
                 '🎄 Christmas connection: The famous ending from "\'Twas the Night Before Christmas"!\n\n' +
                 '🎊 Congratulations on completing the advent calendar! Happy holidays! 🎊',
        image: null 
    },
};

// Store user data (in production, use a database)
const userData = {};

function loadUserData(userId) {
    if (!userData[userId]) {
        userData[userId] = { 
            openedDays: [],
            answers: {}  // Store answers by day number
        };
    }
    return userData[userId];
}

function saveAnswer(userId, day, answer, userName) {
    const data = loadUserData(userId);
    data.answers[day] = {
        answer: answer,
        timestamp: new Date().toISOString(),
        userName: userName
    };
}

function getAllAnswers(day) {
    const allAnswers = [];
    for (const [userId, data] of Object.entries(userData)) {
        if (data.answers && data.answers[day]) {
            allAnswers.push({
                userId: userId,
                userName: data.answers[day].userName,
                answer: data.answers[day].answer,
                timestamp: data.answers[day].timestamp
            });
        }
    }
    return allAnswers;
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
const userStates = {};

function setUserState(userId, state, data = {}) {
    userStates[userId] = { state, ...data };
}

function getUserState(userId) {
    return userStates[userId] || { state: 'idle' };
}

function clearUserState(userId) {
    delete userStates[userId];
}
// Start command
bot.command('start', (ctx) => {
  const userId = ctx.from.id;
   const firstName = ctx.from.first_name;


    // Save to Google Sheets
    saveUserToSheet(userId, firstName).catch(err => console.error(err));
  
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
// Teacher command to view all answers
bot.command('answers', (ctx) => {
    const userId = ctx.from.id;

    // Check if user is a teacher
    if (!isTeacher(userId)) {
        return ctx.reply('❌ Sorry, only teachers can view answers.');
    }

    // Ask which day to view
    const keyboard = [];
    let row = [];
    
    for (let day = 1; day <= 24; day++) {
        row.push(Markup.button.callback(`Day ${day}`, `view_answers_${day}`));
        
        if (row.length === 6) {
            keyboard.push(row);
            row = [];
        }
    }
    
    if (row.length > 0) {
        keyboard.push(row);
    }

    return ctx.reply(
        '👨‍🏫 Teacher Panel: Select a day to view student answers',
        Markup.inlineKeyboard(keyboard)
    );
});
// Handle button clicks
bot.action(/.*/, async (ctx) => {
    const userId = ctx.from.id;
    const callbackData = ctx.callbackQuery.data;

    if (callbackData.startsWith('open_')) {
    const day = parseInt(callbackData.split('_')[1]);
    saveOpenedDay(userId, day);

    const content = ADVENT_CONTENT[day] || { message: `Day ${day}!`, image: null, question: null };

    let caption = `${content.message}\n\nYou've opened day ${day}! 🎉`;
    
    if (content.question) {
        caption += `\n\n❓ ${content.question}\n\n💬 Type your answer below:`;
        // Set user state to expect an answer for this day
        setUserState(userId, 'waiting_answer', { day: day });
    } else {
        caption += '\n\nUse /calendar to see the full calendar.';
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('« Back to Calendar', 'back_to_calendar')]
    ]);

    if (content.image) {
        await ctx.deleteMessage().catch(() => {});
        return ctx.replyWithPhoto(content.image, {
            caption: caption,
            ...keyboard
        });
    } else {
        return ctx.editMessageText(caption, keyboard);
    }
}


    if (callbackData.startsWith('opened_')) {
    const day = parseInt(callbackData.split('_')[1]);
    const content = ADVENT_CONTENT[day] || { message: `Day ${day}!`, image: null, question: null };

    let caption = `${content.message}\n\nYou already opened day ${day}! ✓`;

    if (content.question) {
        caption += `\n\n❓ ${content.question}\n\n💬 Type your answer below:`;
        // Set user state to expect an answer for this day
        setUserState(userId, 'waiting_answer', { day: day });
    } else {
        caption += '\n\nUse /calendar to see the full calendar.';
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('« Back to Calendar', 'back_to_calendar')]
    ]);

    if (content.image) {
        await ctx.deleteMessage().catch(() => {});
        return ctx.replyWithPhoto(content.image, {
            caption: caption,
            ...keyboard
        });
    } else {
        return ctx.editMessageText(caption, keyboard);
    }
}


    if (callbackData.startsWith('locked_')) {
        const day = parseInt(callbackData.split('_')[1]);
        return ctx.answerCbQuery(`Day ${day} is still locked! Come back on December ${day}! 🔒`, {
            show_alert: true
        });
    }

    if (callbackData === 'back_to_calendar') {
        const message =
            '🎄 Your Advent Calendar 🎄\n\n' +
            '🎁 = Available to open\n' +
            '✓ = Already opened\n' +
            '🔒 = Coming soon';

        await ctx.deleteMessage().catch(() => {});
return ctx.reply(message, createCalendarKeyboard(userId));

    }
    if (callbackData.startsWith('view_answers_')) {
        const day = parseInt(callbackData.split('_')[2]);
        const userId = ctx.from.id;

        // Double-check teacher status
        if (!isTeacher(userId)) {
            return ctx.answerCbQuery('❌ Unauthorized', { show_alert: true });
        }

        const answers = getAllAnswers(day);

        if (answers.length === 0) {
            return ctx.answerCbQuery(`No answers yet for Day ${day}`, { show_alert: true });
        }

        let message = `📊 Student Answers for Day ${day}\n`;
        message += `Question: ${ADVENT_CONTENT[day]?.question || 'N/A'}\n\n`;
        message += `Total responses: ${answers.length}\n\n`;
        message += '─────────────────\n\n';

        answers.forEach((item, index) => {
            message += `${index + 1}. ${item.userName}\n`;
            message += `💬 "${item.answer}"\n`;
            message += `🕒 ${new Date(item.timestamp).toLocaleString()}\n\n`;
        });

        await ctx.deleteMessage().catch(() => {});
        return ctx.reply(message, Markup.inlineKeyboard([
            [Markup.button.callback('« Back to Days', 'back_to_teacher_panel')]
        ]));
    }

    if (callbackData === 'back_to_teacher_panel') {
        const keyboard = [];
        let row = [];
        
        for (let day = 1; day <= 24; day++) {
            row.push(Markup.button.callback(`Day ${day}`, `view_answers_${day}`));
            
            if (row.length === 6) {
                keyboard.push(row);
                row = [];
            }
        }
        
        if (row.length > 0) {
            keyboard.push(row);
        }

        await ctx.deleteMessage().catch(() => {});
        return ctx.reply(
            '👨‍🏫 Teacher Panel: Select a day to view student answers',
            Markup.inlineKeyboard(keyboard)
        );
    }
});

// Handle text messages (student answers)
bot.on('text', (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
    const userState = getUserState(userId);

    // Check if user is answering a question
    if (userState.state === 'waiting_answer') {
        const day = userState.day;
        const answer = ctx.message.text;

        // Save the answer
        saveAnswer(userId, day, answer, userName);

// Save to Google Sheets
saveAnswerToSheet(day, userName, answer)
    .catch(err => console.error('Error saving to Google Sheets:', err));

      // ✅ Save user ID to Users tab (for notifications)
    saveUserToSheet(userId, ctx.from.first_name)
        .catch(err => console.error('Error saving user ID:', err));
        
        clearUserState(userId);

        // Confirm to student
        ctx.reply(
            `✅ Thank you! Your answer has been saved.\n\n` +
            `Your response: "${answer}"\n\n` +
            `Use /calendar to continue exploring the advent calendar! 🎄`
        );
    }
});
// Error handling
bot.catch((err, ctx) => {
    console.error('Error occurred:', err);
});


// Create a simple web server for Render
   const app = express();
   const PORT = process.env.PORT || 3000;

   app.get('/', (req, res) => {
       res.send('Advent Calendar Bot is running! 🎄');
   });
const DOMAIN = 'https://advent-bot-v1th.onrender.com'; // your Render URL, e.g., https://my-bot.onrender.com

bot.telegram.setWebhook(`${DOMAIN}/bot${BOT_TOKEN}`);
app.use(bot.webhookCallback(`/bot${BOT_TOKEN}`));

   app.listen(PORT, () => {
       console.log(`Web server running on port ${PORT}`);
   });

   // Start the bot
  // bot.launch().then(() => {
  //     console.log('Bot is running...');
 //  });//
const cron = require('node-cron');

// Daily reminder at 10:00 server time
cron.schedule('0 17 * * *', async () => {
    console.log("Sending daily reminders...");

    const spreadsheetId = '1Sa4eOSmt4sxYq2ksmLqOGH3n4yod0lJmGJqW8ZXQgiE';
    const sheetName = 'Users';

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:A`
        });

        const rows = response.data.values || [];

        // Skip header row
        for (let i = 0; i < rows.length; i++) {
            const userId = rows[i][0];
            bot.telegram.sendMessage(
                userId,
                "🎁 Don't forget to open today's Advent gift box!"
            );
        }

    } catch (err) {
        console.error('Error fetching users for reminders:', err);
    }
},
             { timezone: 'Europe/Belgrade' });
// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));

process.once('SIGTERM', () => bot.stop('SIGTERM'));




























