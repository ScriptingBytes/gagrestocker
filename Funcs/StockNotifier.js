const https = require("https");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const cacheFile = path.join(__dirname, "lastStockMessages.json");
let lastMessages = { main: "", event: "", egg: "" };

if (fs.existsSync(cacheFile)) {
  try {
    const data = fs.readFileSync(cacheFile, "utf-8");
    lastMessages = JSON.parse(data);
  } catch (err) {
    console.warn("[Notifier] Failed to read last message cache:", err.message);
  }
}

function saveLastMessages() {
  fs.writeFileSync(cacheFile, JSON.stringify(lastMessages, null, 2));
}

function logConsole(message) {
  const timestamp = new Date().toLocaleString();
  const formatted = `[${timestamp}] ${message}`;
  console.log(formatted);
}

function getEmbedContentHash(rolePings, embed) {
  const embedCopy = { ...embed };
  delete embedCopy.timestamp;
  return JSON.stringify({ rolePings, embed: embedCopy });
}

const options = {
  method: "GET",
  hostname: "growagarden.gg",
  path: "/stocks?_rsc=14g5d",
  headers: {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "next-router-state-tree":
      "%5B%22%22%2C%7B%22children%22%3A%5B%22stocks%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2C%22%2Fstocks%22%2C%22refresh%22%5D%7D%5D%7D%2Cnull%2C%22refetch%22%5D",
    priority: "u=1, i",
    referer: "https://growagarden.gg/stocks",
    rsc: "1",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 OPR/119.0.0.0",
    "Content-Length": "0",
  },
};

// This is case sensitive so be sure to input the names correctly!!!
const itemRoleMap = {
  /*
  EXAMPLE ENTRIES
  "Master Sprinkler": "1234",
  "Mythical Egg": "1234",
  "Bug Egg": "1234",
  "Beanstalk": "1234",
  "Ember Lily": "1234",
  */
};

function extractJSONFromText(text, key) {
  const keyPos = text.indexOf(`"${key}"`);
  if (keyPos === -1) return null;

  const colonPos = text.indexOf(":", keyPos);
  if (colonPos === -1) return null;

  const startPos = text.indexOf("{", colonPos);
  if (startPos === -1) return null;

  let bracketCount = 0;
  let endPos = startPos;

  for (let i = startPos; i < text.length; i++) {
    if (text[i] === "{") bracketCount++;
    else if (text[i] === "}") bracketCount--;

    if (bracketCount === 0) {
      endPos = i;
      break;
    }
  }

  if (bracketCount !== 0) return null;

  return text.slice(startPos, endPos + 1);
}

function fetchStockData() {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const jsonString = extractJSONFromText(data, "stockDataSSR");
        if (!jsonString) return reject(new Error("stockDataSSR not found"));

        try {
          const parsed = JSON.parse(jsonString);
          resolve(parsed);
        } catch (e) {
          reject(new Error("Failed to parse stockDataSSR: " + e.message));
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.end();
  });
}

async function fetchAllStocks() {
  const data = await fetchStockData();

  /*
  // Saves a raw response to a file for testing purposes
  const debugFile = path.join(__dirname, "debug_stockData.json");
  try {
    fs.writeFileSync(debugFile, JSON.stringify(data, null, 2));
    console.log(`[Notifier] Wrote raw stockData to ${debugFile}`);
  } catch (err) {
    console.error("[Notifier] Failed to write debug stockData file:", err.message);
  }
  */

  return {
    gears: data.gearStock || [],
    seeds: data.seedsStock || [],
    eggs: data.eggStock || [],
    honeyStock: data.honeyStock || [],
    cosmetics: data.cosmeticsStock || [],
  };
}

function formatStock(records) {
  if (!records || records.length === 0) return "No stock available.";
  return records.map((item) => `${item.name}: ${item.value}`).join("\n") || "No stock available.";
}

function getItemRoleMentions(stockData) {
  const mentions = new Set();
  const allItems = [
    ...stockData.gears,
    ...stockData.seeds,
  ];

  for (const item of allItems) {
    const name = item.name;
    const amount = item.value;

    if (amount > 0 && itemRoleMap[name]) {
      mentions.add(`<@&${itemRoleMap[name]}>`);
    }
  }

  return [...mentions];
}

async function sendDiscordEmbed(stock) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return console.warn("[Notifier] No Discord Webhook URL provided.");

  const rolePings = getItemRoleMentions(stock);

  // You can change how the embed looks. Do not change the fields values!!
  const embed = {
    title: "🌿 Grow-A-Garden Stock Update",
    color: 0x00ff00,
    fields: [
      { name: "🔧 Gears", value: formatStock(stock.gears), inline: true },
      { name: "🌱 Seeds", value: formatStock(stock.seeds), inline: true },
      { name: "🎭 Cosmetics", value: formatStock(stock.cosmetics), inline: true },
    ],
  };

  const currentContent = getEmbedContentHash(rolePings, embed);

  if (currentContent === lastMessages.main) {
    logConsole("[Notifier] Skipped main stock update (no changes).");
    return;
  }

  embed.timestamp = new Date();

  try {
    await axios.post(webhook, { content: rolePings.join(" ") || null, embeds: [embed] });
    lastMessages.main = currentContent;
    saveLastMessages();
    logConsole("[Notifier] Sent main stock update.");
  } catch (err) {
    console.error("[Notifier] Failed to send main stock webhook:", err.message);
  }
}

async function sendEventShopEmbed(stock) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return console.warn("[Notifier] No Discord Webhook URL provided.");

  const records = stock.honeyStock;
  const rolePings = records.filter((item) => item.value > 0 && itemRoleMap[item.name]).map((item) => `<@&${itemRoleMap[item.name]}>`);

  // You can change how the embed looks. Do not change the fields values!!
  const embed = {
    title: "🐝 Grow-A-Garden Event Shop Update",
    color: 0xffc107,
    fields: [
      {
        name: "Event Shop Items",
        value: formatStock(records),
        inline: false,
      },
    ],
  };

  const currentContent = getEmbedContentHash(rolePings, embed);

  if (currentContent === lastMessages.event) {
    logConsole("[Notifier] Skipped event shop update (no changes).");
    return;
  }

  embed.timestamp = new Date();

  try {
    await axios.post(webhook, { content: rolePings.join(" ") || null, embeds: [embed] });
    lastMessages.event = currentContent;
    saveLastMessages();
    logConsole("[Notifier] Sent event shop update.");
  } catch (err) {
    console.error("[Notifier] Failed to send event shop webhook:", err.message);
  }
}

async function sendEggShopEmbed(stock) {
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    if (!webhook) return console.warn("[Notifier] No Discord Webhook URL provided.");

    const records = stock.eggs
    const rolePings = records.filter((item) => item.value > 0 && itemRoleMap[item.name]).map((item) => `<@&${itemRoleMap[item.name]}>`);

    // You can change how the embed looks. Do not change the fields values!!
    const embed = {
        title: "🥚 Grow-A-Garden Egg Shop Update",
        color: 0x3d85c6,
        fields: [
            {
                name: "Eggs",
                value: formatStock(records),
                inline: false,
            },
        ],
    };

    const currentContent = getEmbedContentHash(rolePings, embed);

    if (currentContent === lastMessages.egg) {
        logConsole("[Notifier] Skipped egg shop update (no changes).");
        return;
    }
  
    embed.timestamp = new Date();
  
    try {
        await axios.post(webhook, { content: rolePings.join(" ") || null, embeds: [embed] });
        lastMessages.egg = currentContent;
        saveLastMessages();
        logConsole("[Notifier] Sent egg shop update.");
    } catch (err) {
        console.error("[Notifier] Failed to send egg shop webhook:", err.message);
    }
}

async function startStockNotifier() {
  logConsole("[Notifier] Started Grow-A-Garden stock notifier.");

  async function checkAndSend() {
    const now = new Date();
    const minutes = now.getMinutes();

    try {
      const stocks = await fetchAllStocks();

      // Sends the main shop update every 5 minutes
      if (minutes % 5 === 0) {
        await sendDiscordEmbed(stocks);
      }

      // Sends the event shop update every 30 minutes
      if (minutes === 0 || minutes === 30) {
        await sendEventShopEmbed(stocks);
      }

      // Sends the egg stock update every 25 minutes
      if (minutes % 25 === 0) {
        await sendEggShopEmbed(stocks)
      }

    } catch (err) {
      console.error("[Notifier] Error fetching/sending stock:", err.message);
    }

    setTimeout(checkAndSend, 60000);
  }

  checkAndSend();
}

module.exports = {
  register: () => startStockNotifier(),
};
