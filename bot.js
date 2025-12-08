const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { google } = require('googleapis');
const cron = require('node-cron');

// Google Sheets setup
const credentials = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = '1Sa4eOSmt4sxYq2ksmLqOGH3n4yod0lJmGJqW8ZXQgiE';

// Bot configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN);

// In-memory cache for message IDs (fast access)
const messageCache = {};

// Add this at the top of your file, after the bot setup
let lastReminderTime = 0;
const REMINDER_COOLDOWN = 60000; // 1 minute cooldown

// Google Sheets functions (run in background, non-blocking)
async function saveUserToSheet(userId, firstName) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Users!A:A'
        });

        const existingIds = (response.data.values || []).flat();

        if (!existingIds.includes(userId.toString())) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Users',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[userId, firstName, new Date().toLocaleString()]]
                }
            });
        }
    } catch (err) {
        console.error('Error saving user:', err.message);
    }
}

async function saveAnswerToSheet(day, userName, answer) {
    try {
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1',
            valueInputOption: 'RAW',
            requestBody: {
                values: [[new Date().toLocaleString(), day, userName, answer]]
            }
        });
    } catch (err) {
        console.error('Error saving answer:', err.message);
    }
}

// Save message IDs to Google Sheets (background operation)
// Replace the saveMessageIdsToSheet function with this optimized version
async function saveMessageIdsBatch(updates) {
    if (updates.length === 0) return;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'MessageIds!A:C'
        });

        const existingRows = response.data.values || [];
        const existingIds = existingRows.map(row => row[0]);
        const newRows = [];
        const updateRequests = [];

        // Prepare batch updates
        for (const update of updates) {
            const { userId, calendarMessageId, imageMessageId } = update;
            const rowIndex = existingIds.indexOf(userId.toString());

            if (rowIndex >= 0) {
                // Update existing row
                updateRequests.push({
                    range: `MessageIds!A${rowIndex + 1}:C${rowIndex + 1}`,
                    values: [[userId, calendarMessageId || '', imageMessageId || '']]
                });
            } else {
                // New row
                newRows.push([userId, calendarMessageId || '', imageMessageId || '']);
            }
        }

        // Batch update existing rows
        if (updateRequests.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: {
                    valueInputOption: 'RAW',
                    data: updateRequests
                }
            });
        }

        // Batch append new rows
        if (newRows.length > 0) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'MessageIds',
                valueInputOption: 'RAW',
                requestBody: {
                    values: newRows
                }
            });
        }

        console.log(`✅ Batch saved ${updates.length} message IDs (${updateRequests.length} updates, ${newRows.length} new)`);
    } catch (err) {
        console.error('Error batch saving message IDs:', err.message);
    }
}
// Load message IDs from Google Sheets on startup
async function loadMessageIdsFromSheet() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'MessageIds!A:C'
        });

        const rows = response.data.values || [];
        
        for (let row of rows) {
            if (row[0]) {
                messageCache[row[0]] = {
                    calendar: row[1] ? parseInt(row[1]) : null,
                    image: row[2] ? parseInt(row[2]) : null
                };
            }
        }
        
        console.log(`✅ Loaded ${Object.keys(messageCache).length} message IDs from cache`);
    } catch (err) {
        console.error('Error loading message IDs:', err.message);
    }
}

// Fast message ID management (uses cache)
function saveMessageIds(userId, calendarMessageId, imageMessageId) {
    messageCache[userId] = {
        calendar: calendarMessageId,
        image: imageMessageId
    };
    
    // Save to Google Sheets in background (don't wait)
    saveMessageIdsToSheet(userId, calendarMessageId, imageMessageId).catch(err => {
        console.error('Background save failed:', err.message);
    });
}

function getMessageIds(userId) {
    return messageCache[userId] || { calendar: null, image: null };
}

async function deleteOldMessages(ctx, userId) {
    const messageIds = getMessageIds(userId);
    
    if (messageIds.calendar) {
        await ctx.telegram.deleteMessage(userId, messageIds.calendar).catch(() => {});
    }
    if (messageIds.image) {
        await ctx.telegram.deleteMessage(userId, messageIds.image).catch(() => {});
    }
}

// Teacher IDs
const TEACHER_IDS = [1763838753];

function isTeacher(userId) {
    return TEACHER_IDS.includes(userId);
}

// Advent calendar content for each day (December 1-31)
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
        message: '⭐ Day 4: "The more the merrier"\n\n',
                  image: 'https://ibb.co/rKmdzLcs',
      question: 'Do you agree with this phrase? Why?'
    },
    5: { 
        message: '🕯️ Day 5: "To give someone the cold shoulder"\n\n',
                 image: 'https://ibb.co/LXphpQt5',
      question: 'Why would you give someone a cold shoulder?'
    },
    6: { 
        message: '🎁 Day 6: "Wrap up"\n\n',
        image: 'https://ibb.co/WNBqrc6n',
      question: 'What projects do you need to wrap up before the holidays?'
    },
    7: { 
        message: '🎵 Day 7: "Spread Christmas cheer"\n\n',
        image: 'https://ibb.co/PZZgrMTv',
      question: 'How do you spread Christmas cheer?'
    },
    8: { 
        message: '🎿 Day 8: "On thin ice"\n\n',
        image: 'https://ibb.co/8nhfrXGm',
      question: 'When did you last feel like you were walking on thin ice? What happened?'
    },
    9: { 
        message: '🍪 Day 9: "Bundle up"\n\n',
        image: 'https://ibb.co/vChffbqh',
      question: 'What\'s your favorite way to bundle up and stay warm in winter?'
    },
    10: { 
        message: '🔔 Day 10: "Ring in the new year"\n\n' +
                 '📖 Meaning: To celebrate the beginning of a new year.\n\n' +
                 '💬 Example: "We\'re going to ring in the new year with fireworks!"\n\n' +
                 '🔔 Winter connection: Church bells traditionally ring at midnight on New Year\'s Eve.',
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
        message: '☃️ Day 8: "A snowball\'s chance in hell"\n\n' +
                 '📖 Meaning: No chance at all, impossible.\n\n' +
                 '💬 Example: "He has a snowball\'s chance in hell of finishing all that work by tomorrow."\n\n' +
                 '❄️ Winter connection: A snowball would melt instantly in hell!',
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
    25: { 
        message: '🎉 Day 24: "Merry Christmas to all, and to all a good night!"\n\n' +
                 '📖 Meaning: A cheerful way to wish everyone well on Christmas Eve.\n\n' +
                 '💬 Example: Used to end Christmas celebrations and send people home happily.\n\n' +
                 '🎄 Christmas connection: The famous ending from "\'Twas the Night Before Christmas"!\n\n' +
                 '🎊 Congratulations on completing the advent calendar! Happy holidays! 🎊',
        image: null 
    },
    26: { 
        message: '🎉 Day 24: "Merry Christmas to all, and to all a good night!"\n\n' +
                 '📖 Meaning: A cheerful way to wish everyone well on Christmas Eve.\n\n' +
                 '💬 Example: Used to end Christmas celebrations and send people home happily.\n\n' +
                 '🎄 Christmas connection: The famous ending from "\'Twas the Night Before Christmas"!\n\n' +
                 '🎊 Congratulations on completing the advent calendar! Happy holidays! 🎊',
        image: null 
    },
    27: { 
        message: '🎉 Day 24: "Merry Christmas to all, and to all a good night!"\n\n' +
                 '📖 Meaning: A cheerful way to wish everyone well on Christmas Eve.\n\n' +
                 '💬 Example: Used to end Christmas celebrations and send people home happily.\n\n' +
                 '🎄 Christmas connection: The famous ending from "\'Twas the Night Before Christmas"!\n\n' +
                 '🎊 Congratulations on completing the advent calendar! Happy holidays! 🎊',
        image: null 
    },
    28: { 
        message: '🎉 Day 24: "Merry Christmas to all, and to all a good night!"\n\n' +
                 '📖 Meaning: A cheerful way to wish everyone well on Christmas Eve.\n\n' +
                 '💬 Example: Used to end Christmas celebrations and send people home happily.\n\n' +
                 '🎄 Christmas connection: The famous ending from "\'Twas the Night Before Christmas"!\n\n' +
                 '🎊 Congratulations on completing the advent calendar! Happy holidays! 🎊',
        image: null 
    },
    29: { 
        message: '🎉 Day 24: "Merry Christmas to all, and to all a good night!"\n\n' +
                 '📖 Meaning: A cheerful way to wish everyone well on Christmas Eve.\n\n' +
                 '💬 Example: Used to end Christmas celebrations and send people home happily.\n\n' +
                 '🎄 Christmas connection: The famous ending from "\'Twas the Night Before Christmas"!\n\n' +
                 '🎊 Congratulations on completing the advent calendar! Happy holidays! 🎊',
        image: null 
    },
    30: { 
        message: '🎉 Day 24: "Merry Christmas to all, and to all a good night!"\n\n' +
                 '📖 Meaning: A cheerful way to wish everyone well on Christmas Eve.\n\n' +
                 '💬 Example: Used to end Christmas celebrations and send people home happily.\n\n' +
                 '🎄 Christmas connection: The famous ending from "\'Twas the Night Before Christmas"!\n\n' +
                 '🎊 Congratulations on completing the advent calendar! Happy holidays! 🎊',
        image: null 
    },
    31: { 
        message: '🎉 Day 24: "Merry Christmas to all, and to all a good night!"\n\n' +
                 '📖 Meaning: A cheerful way to wish everyone well on Christmas Eve.\n\n' +
                 '💬 Example: Used to end Christmas celebrations and send people home happily.\n\n' +
                 '🎄 Christmas connection: The famous ending from "\'Twas the Night Before Christmas"!\n\n' +
                 '🎊 Congratulations on completing the advent calendar! Happy holidays! 🎊',
        image: null 
    },
};

// User data storage
const userData = {};
const userStates = {};

function loadUserData(userId) {
    if (!userData[userId]) {
        userData[userId] = { openedDays: [], answers: {} };
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
    const currentDay = now.getMonth() === 11 ? now.getDate() : 25;
    const userOpened = loadUserData(userId).openedDays;
    
    const keyboard = [];
    let row = [];
    
    for (let day = 1; day <= 31; day++) {
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

function setUserState(userId, state, data = {}) {
    userStates[userId] = { state, ...data };
}

function getUserState(userId) {
    return userStates[userId] || { state: 'idle' };
}

function clearUserState(userId) {
    delete userStates[userId];
}

// Bot commands
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const firstName = ctx.from.first_name;

    // Save to Google Sheets in background
    saveUserToSheet(userId, firstName).catch(() => {});
  
    const welcomeMessage = 
        `🎄 Welcome to the Advent Calendar, ${firstName}! 🎄\n\n` +
        'Open a new door each day from December 1st to 31th!\n' +
        'Each day reveals a special surprise! 🎁\n\n' +
        'Click on a gift box to open today\'s door!';

    await deleteOldMessages(ctx, userId);
    const sentMessage = await ctx.reply(welcomeMessage, createCalendarKeyboard(userId));
    saveMessageIds(userId, sentMessage.message_id, null);
});

bot.command('calendar', async (ctx) => {
    const message = 
        '🎄 Your Advent Calendar 🎄\n\n' +
        '🎁 = Available to open\n' +
        '✓ = Already opened\n' +
        '🔒 = Coming soon';
    
    const userId = ctx.from.id;

    await deleteOldMessages(ctx, userId);
    const sentMessage = await ctx.reply(message, createCalendarKeyboard(userId));
    saveMessageIds(userId, sentMessage.message_id, null);
});

bot.command('progress', (ctx) => {
    const userId = ctx.from.id;
    const openedDays = loadUserData(userId).openedDays;
    
    const now = new Date();
    const currentDay = now.getMonth() === 11 ? now.getDate() : 0;
    
    let progressText = 
        '📊 Your Progress:\n\n' +
        `Opened: ${openedDays.length}/31 days\n` +
        `Available: ${Math.min(currentDay, 31)} days\n\n`;
    
    if (openedDays.length > 0) {
        progressText += 'Days you\'ve opened: ' + openedDays.sort((a, b) => a - b).join(', ');
    } else {
        progressText += 'You haven\'t opened any days yet! Use /calendar to start! 🎁';
    }
    
    return ctx.reply(progressText);
});

bot.command('answers', (ctx) => {
    const userId = ctx.from.id;

    if (!isTeacher(userId)) {
        return ctx.reply('❌ Sorry, only teachers can view answers.');
    }

    const keyboard = [];
    let row = [];
    
    for (let day = 1; day <= 31; day++) {
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

// Button actions
bot.action(/.*/, async (ctx) => {
    const userId = ctx.from.id;
    const callbackData = ctx.callbackQuery.data;

    // ANSWER IMMEDIATELY to prevent timeout errors
    await ctx.answerCbQuery().catch(() => {});

    try {
        if (callbackData.startsWith('open_') || callbackData.startsWith('opened_')) {
            const day = parseInt(callbackData.split('_')[1]);
            saveOpenedDay(userId, day);

            const content = ADVENT_CONTENT[day] || { message: `Day ${day}!`, image: null, question: null };

            let caption = `${content.message}\n\n`;
            caption += callbackData.startsWith('open_') 
                ? `You've opened day ${day}! 🎉` 
                : `You already opened day ${day}! ✓`;

            if (content.question) {
                caption += `\n\n❓ ${content.question}\n\n💬 Type your answer below:`;
                setUserState(userId, 'waiting_answer', { day });
            } else {
                caption += '\n\nUse /calendar to see the full calendar.';
            }

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('« Back to Calendar', 'back_to_calendar')]
            ]);

            await deleteOldMessages(ctx, userId);

            if (content.image) {
                const sentMessage = await ctx.replyWithPhoto(content.image, { caption, ...keyboard });
                saveMessageIds(userId, null, sentMessage.message_id);
            } else {
                const sentMessage = await ctx.reply(caption, keyboard);
                saveMessageIds(userId, sentMessage.message_id, null);
            }

            return;
        }

        if (callbackData.startsWith('locked_')) {
            const day = parseInt(callbackData.split('_')[1]);
            // For locked days, show alert (already answered at top)
            return ctx.answerCbQuery(
                `Day ${day} is still locked! Come back on December ${day}! 🔒`, 
                { show_alert: true }
            );
        }

        if (callbackData === 'back_to_calendar' || callbackData === 'OPEN_CALENDAR') {
            const message =
                '🎄 Your Advent Calendar 🎄\n\n' +
                '🎁 = Available to open\n' +
                '✓ = Already opened\n' +
                '🔒 = Coming soon';

            await deleteOldMessages(ctx, userId);
            const sentMessage = await ctx.reply(message, createCalendarKeyboard(userId));
            saveMessageIds(userId, sentMessage.message_id, null);
            
            return;
        }

        if (callbackData.startsWith('view_answers_')) {
            const day = parseInt(callbackData.split('_')[2]);

            if (!isTeacher(userId)) {
                return ctx.answerCbQuery('❌ Unauthorized', { show_alert: true });
            }

            const answers = getAllAnswers(day);

            if (answers.length === 0) {
                return ctx.answerCbQuery(`No answers yet for Day ${day}`, { show_alert: true });
            }

            let message = `📊 Student Answers for Day ${day}\n`;
            message += `Question: ${ADVENT_CONTENT[day]?.question || 'N/A'}\n\n`;
            message += `Total responses: ${answers.length}\n\n─────────────────\n\n`;

            answers.forEach((item, index) => {
                message += `${index + 1}. ${item.userName}\n💬 "${item.answer}"\n🕒 ${new Date(item.timestamp).toLocaleString()}\n\n`;
            });

            await ctx.deleteMessage().catch(() => {});
            return ctx.reply(message, Markup.inlineKeyboard([
                [Markup.button.callback('« Back to Days', 'back_to_teacher_panel')]
            ]));
        }

        if (callbackData === 'back_to_teacher_panel') {
            const keyboard = [];
            let row = [];
            
            for (let day = 1; day <= 31; day++) {
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
    } catch (err) {
        console.error('Action error:', err.message);
        // Don't send error message to user, just log it
        // The callback was already answered, so no timeout
    }
});

// Handle text messages
bot.on('text', (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
    const userState = getUserState(userId);

    if (userState.state === 'waiting_answer') {
        const day = userState.day;
        const answer = ctx.message.text;

        saveAnswer(userId, day, answer, userName);
        
        // Save to Google Sheets in background
        saveAnswerToSheet(day, userName, answer).catch(() => {});
        saveUserToSheet(userId, ctx.from.first_name).catch(() => {});
        
        clearUserState(userId);

        ctx.reply(
            `✅ Thank you! Your answer has been saved.\n\n` +
            `Your response: "${answer}"\n\n` +
            `Use /calendar to continue exploring the advent calendar! 🎄`
        );
    }
});

// Error handling
bot.catch((err, ctx) => {
    console.error('Error occurred:', err.message);
    
    // Only send error message if it's NOT a callback query timeout
    if (ctx && !err.message.includes('query is too old')) {
        ctx.reply('Sorry, something went wrong. Try /calendar again!').catch(() => {});
    }
});

// Express server
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Advent Calendar Bot is running! 🎄');
});

const DOMAIN = 'https://advent-bot-v1th.onrender.com';

bot.telegram.setWebhook(`${DOMAIN}/bot${BOT_TOKEN}`).then(() => {
    console.log('✅ Webhook set');
}).catch(err => {
    console.error('❌ Webhook error:', err.message);
});

app.use(bot.webhookCallback(`/bot${BOT_TOKEN}`));
// Endpoint for external cron service to trigger reminders

app.get('/send-reminders', async (req, res) => {
   const now = Date.now();
    
    // Prevent multiple triggers within 1 minute
    if (now - lastReminderTime < REMINDER_COOLDOWN) {
        const waitTime = Math.ceil((REMINDER_COOLDOWN - (now - lastReminderTime)) / 1000);
        const msg = `⚠️ Reminder already sent recently. Wait ${waitTime} seconds.`;
        console.log(msg);
        return res.send(msg);
    }
    
    lastReminderTime = now;
     
  console.log("=== 📬 REMINDER ENDPOINT TRIGGERED ===");
    console.log("Time:", new Date().toLocaleString());
    
    let sentCount = 0;
    let failedCount = 0;
    const failedUsers = [];
    const messageIdUpdates = []; // Collect updates for batch save
    
    try {
        console.log("Fetching users from Google Sheets...");
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Users!A:A'
        });

        const rows = response.data.values || [];
        console.log(`Found ${rows.length - 1} users (${rows.length} rows including header)`);
        
        if (rows.length <= 1) {
            const msg = "No users found in sheet";
            console.log(msg);
            return res.send(msg);
        }

        // Process each user
        for (let i = 1; i < rows.length; i++) {
            const userId = rows[i][0];
            
            if (!userId || !userId.toString().match(/^\d+$/)) {
                console.log(`⚠️ Skipping invalid user ID at row ${i + 1}: "${userId}"`);
                continue;
            }
            
            try {
                console.log(`Processing user ${i}/${rows.length - 1}: ${userId}`);
                
                // Delete old messages (non-blocking)
                await deleteOldMessages({ telegram: bot.telegram }, userId).catch(err => {
                    console.log(`  ⚠️ Could not delete old messages: ${err.message}`);
                });
                
                // Send reminder
                const sentMessage = await bot.telegram.sendMessage(
                    userId,
                    "🎁 A new Advent box is open!\nTap below to see your calendar:",
                    {
                        reply_markup: {
                            inline_keyboard: [[{ text: "🎄 Open Calendar", callback_data: "OPEN_CALENDAR" }]]
                        }
                    }
                );
                
                console.log(`  ✅ Sent to ${userId}`);
                
                // Collect for batch save (in-memory)
                messageCache[userId] = {
                    calendar: sentMessage.message_id,
                    image: null
                };
                messageIdUpdates.push({
                    userId: userId,
                    calendarMessageId: sentMessage.message_id,
                    imageMessageId: null
                });
                
                sentCount++;
                
            } catch (userErr) {
                console.error(`  ❌ Failed to send to ${userId}: ${userErr.message}`);
                failedUsers.push({ 
                    userId, 
                    error: userErr.message,
                    row: i + 1
                });
                failedCount++;
            }
            
            // Small delay to avoid Telegram rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Batch save all message IDs at once (1-2 API calls instead of 18+)
        if (messageIdUpdates.length > 0) {
            console.log(`Batch saving ${messageIdUpdates.length} message IDs...`);
            await saveMessageIdsBatch(messageIdUpdates);
        }
        
    } catch (err) {
        console.error('❌ FATAL ERROR:', err.message);
        
        const partialMsg = `Partial: ${sentCount} sent, ${failedCount} failed. Error: ${err.message}`;
        return res.status(500).send(partialMsg);
    }
    
    const message = `✅ Complete: ${sentCount} sent | ${failedCount} failed`;
    console.log("=== REMINDER SUMMARY ===");
    console.log(message);
    
    if (failedUsers.length > 0) {
        console.log("Failed users:");
        failedUsers.forEach(f => {
            console.log(`  Row ${f.row}, User ${f.userId}: ${f.error}`);
        });
    }
    console.log("========================");
    
    res.send(message + (failedUsers.length > 0 ? '\n\nFailed:\n' + JSON.stringify(failedUsers, null, 2) : ''));
});

app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    
    // Load message IDs from Google Sheets on startup
    loadMessageIdsFromSheet().then(() => {
        console.log('🤖 Bot ready!');
    });
});

// Daily reminders
// cron.schedule('0 10 * * *', async () => {
  //  console.log("📬 Sending daily reminders...");

    //try {
      //  const response = await sheets.spreadsheets.values.get({
        //    spreadsheetId: SPREADSHEET_ID,
          //  range: 'Users!A:A'
        // });

       // const rows = response.data.values || [];

       // for (let i = 1; i < rows.length; i++) {
        //    const userId = rows[i][0];
            
          //  if (userId) {
            //    await deleteOldMessages({ telegram: bot.telegram }, userId);
                
              //  const sentMessage = await bot.telegram.sendMessage(
                //    userId,
                  //  "🎁 A new Advent box is open!\nTap below to see your calendar:",
                   // {
                     //   reply_markup: {
                       //     inline_keyboard: [[{ text: "🎄 Open Calendar", callback_data: "OPEN_CALENDAR" }]]
                       // }
                   // }
             //   ).catch(err => null);
                
               // if (sentMessage) {
                 //   saveMessageIds(userId, sentMessage.message_id, null);
               // }
           // }
       // }
        
       // console.log("✅ Reminders sent");
   // } catch (err) {
     //   console.error('Reminder error:', err.message);
  //  }
//}, {
  //  timezone: 'Europe/Belgrade'
//});

// process.once('SIGINT', () => bot.stop('SIGINT'));
// process.once('SIGTERM', () => bot.stop('SIGTERM'));
// Graceful stop for webhooks (no bot.stop() needed)
process.once('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

















