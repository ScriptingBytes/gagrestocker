const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const blessed = require('blessed');

require('dotenv').config();

const configPath = path.join(__dirname, 'config.json');
let config = { IPWhitelist: false, WhitelistedIPs: [], Dashboard: true, Port: 3000 };

if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} else {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Created config.json with default settings.`);
}

const app = express();
const PORT = config.Port || 3000;

let screen, settingsBox, perfBox, activityBox, consoleBox;

if (config.Dashboard) {
  screen = blessed.screen({
    smartCSR: true,
    title: 'GAG Dashboard'
  });

  settingsBox = blessed.box({
    top: 0,
    left: '0%',
    width: '50%',
    height: '20%',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    label: ' Settings '
  });

  perfBox = blessed.box({
    top: 0,
    left: '50%',
    width: '50%',
    height: '20%',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'magenta' } },
    label: ' Performance '
  });

  activityBox = blessed.box({
    top: '20%',
    left: '0%',
    width: '100%',
    height: '60%',
    tags: true,
    border: { type: 'line' },
    scrollable: true,
    alwaysScroll: true,
    style: { border: { fg: 'green' } },
    label: ' Activity '
  });

  consoleBox = blessed.box({
    bottom: 0,
    left: 'center',
    width: '100%',
    height: '20%',
    tags: true,
    border: { type: 'line' },
    scrollable: true,
    alwaysScroll: true,
    style: { border: { fg: 'yellow' } },
    label: ' Console '
  });

  screen.append(settingsBox);
  screen.append(perfBox);
  screen.append(activityBox);
  screen.append(consoleBox);
  screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
  screen.render();
}

const activityLog = [];

const originalConsoleLog = console.log;
console.log = function (...args) {
  const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
  if (config.Dashboard) {
    consoleBox.insertBottom(message);
    consoleBox.setScrollPerc(100);
    screen.render();
  } else {
    originalConsoleLog.apply(console, args);
  }
};

const originalConsoleError = console.error;

console.error = function (...args) {
  const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
  originalConsoleError.apply(console, args);
  if (config.Dashboard) {
    consoleBox.insertBottom(`[ERROR] ${message}`);
    consoleBox.setScrollPerc(100);
    screen.render();
  } else {
    originalConsoleError.apply(console, args);
  }
};

function formatIP(ip) {
  if (typeof ip !== 'string') return ip;
  if (ip.startsWith('192.168.')) return ip;
  return ip;
}

function updateSettings() {
  if (config.Dashboard) {
    settingsBox.setContent(
      `IP Whitelisting: ${config.IPWhitelist}\n` +
      `Whitelisted IPs: ${config.WhitelistedIPs.join(', ') || 'None'}\n` +
      `Port: ${config.Port}`
    );
  }
}

function updateActivity() {
  if (config.Dashboard) {
    activityBox.setContent(activityLog.join('\n'));
    activityBox.setScrollPerc(100);
  }
}

function updatePerf() {
  const mem = process.memoryUsage();
  const usedMemMB = (mem.rss / 1024 / 1024).toFixed(2);
  const loadAvg = os.loadavg();
  const uptimeInSeconds = process.uptime();
  
  const days = Math.floor(uptimeInSeconds / (24 * 3600));
  const hours = Math.floor((uptimeInSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeInSeconds % 60);

  const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;

  if (config.Dashboard) {
    perfBox.setContent(
      `{bold}RAM Usage:{/bold} ${usedMemMB} MB\n` +
      `{bold}CPU Load (1m, 5m, 15m):{/bold} ${loadAvg.map(v => v.toFixed(2)).join(', ')}\n` +
      `{bold}Uptime:{/bold} ${uptime}`
    );
    screen.render();
  }

  return {
    usedMemMB,
    loadAvg,
    uptime
  };
}

function updateUI() {
  updateSettings();
  updateActivity();
  if (config.Dashboard) {
    screen.render();
  }
}

function logConsole(message) {
  const timestamp = new Date().toLocaleString();
  const formatted = `[${timestamp}] ${message}`;

  if (config.Dashboard) {
    const current = consoleBox.getContent();
    consoleBox.setContent(current + '\n' + formatted);
    consoleBox.setScrollPerc(100);
    screen.render();
  } else {
    console.log(formatted);
  }
}

logConsole('[Configuration] Started Host');
if (config.IPWhitelist) {
  logConsole(`[Configuration] IP Whitelisting ENABLED. Allowed IPs: ${config.WhitelistedIPs.join(', ') || 'None'}`);
} else {
  logConsole(`[Configuration] IP Whitelisting DISABLED.`);
}

const colors = {
  reset: "\x1b[0m",
  timestamp: "\x1b[38;5;15m", // Blue
  method: "\x1b[32m",    // Green
  path: "\x1b[33m",      // Yellow
  ip: "\x1b[36m",        // Cyan
  error: "\x1b[31m"      // Red
};

function formatLogEntry(timestamp, method, path, ip) {
  return `${colors.timestamp}[${timestamp}]${colors.reset} ${colors.method}${method}${colors.reset} ${colors.path}${path}${colors.reset} - ${colors.ip}${ip}${colors.reset}`;
}

app.use((req, res, next) => {
  const rawIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
  const ip = rawIp.includes('::ffff:') ? rawIp.split('::ffff:')[1] : rawIp;
  const timestamp = new Date().toISOString();

  const logEntry = formatLogEntry(timestamp, req.method, req.originalUrl, formatIP(ip));
  activityLog.push(logEntry);

  if (config.IPWhitelist && !config.WhitelistedIPs.includes(ip)) {
    logConsole(`[403] Blocked IP: ${formatIP(ip)}`);
    updateUI();
    return res.status(403).json({ error: 'Forbidden' });
  }

  logConsole(logEntry);
  updateUI();
  next();
});


app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

const funcsDir = path.join(__dirname, 'Funcs');
if (!fs.existsSync(funcsDir)) fs.mkdirSync(funcsDir);

let loadCount = 0;

fs.readdir(funcsDir, (err, files) => {
  if (err) {
    logConsole(`[Loader] Failed to read Funcs directory: ${err.message}`);
    return;
  }

  files.forEach(file => {
    if (file.endsWith('.js')) {
      const funcPath = path.join(funcsDir, file);
      try {
        const funcModule = require(funcPath);
        if (typeof funcModule.register === 'function') {
          funcModule.register(app);
          logConsole(`[Loader] Registered module: ${file}`);
          loadCount++;
        } else {
          logConsole(`[Loader] No register() export in ${file}`);
        }
      } catch (error) {
        logConsole(`[Loader] Error in ${file}: ${error.message}`);
      }
    }
  });

  app.listen(PORT, () => {
    logConsole(`[Server] Live at http://localhost:${PORT}`);
    logConsole(`[Server] Available endpoints: GET /`);
    updateUI();
  });
});

setInterval(() => {
  updatePerf();
}, 1000);
