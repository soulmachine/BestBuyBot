# BestBuyBot

## How to run

1. Start the Chrome browser with arguments `--remote-debugging-port=9222 --no-first-run --no-default-browser-check`
2. Open <www.bestbuy.com> and login with your username and password, so that you don't need to login in your code
3. Open `http://127.0.0.1:9222/json/version` in the browser and copy the value of `webSocketDebuggerUrl`
4. Set the value to `WS_ENDPOINT` environment variable
5. Type the command `node ./bot.js`
