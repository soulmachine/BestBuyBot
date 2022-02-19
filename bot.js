"use strict";
const pptr = require("puppeteer-core");
const HTMLParser = require("node-html-parser");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const { check_inbox, refresh_access_token } = require("gmail-tester");

const { OAuth2Client } = require("google-auth-library");

require("dotenv").config();

// Make sure you've logged in www.bestbuy.com already in the Chrome of your computer.

const URL_TEST =
  "https://www.bestbuy.com/site/apple-lightning-to-3-5mm-headphone-adapter-white/5622278.p?skuId=5622278";
const URL_RTX_3090 =
  "https://www.bestbuy.com/site/nvidia-geforce-rtx-3090-24gb-gddr6x-pci-express-4-0-graphics-card-titanium-and-black/6429434.p?skuId=6429434";

const URL_CART = "https://www.bestbuy.com/cart";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const SECRET_FILE = "client_secret.json";
const TOKEN_FILE = "gmail_token.json";

var chromeOptions = {
  headless: false,
  // executablePath: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  browserWSEndpoint: process.env.WS_ENDPOINT,
  defaultViewport: null,
};

async function authorizeGmail() {
  if (fs.existsSync(TOKEN_FILE)) {
    console.log(TOKEN_FILE + " already exists");
    return;
  }
  // see https://medium.com/tech-learn-share/lets-receive-gmail-from-node-js-using-google-official-library-6a6280254325
  const text = fs.readFileSync(path.join(__dirname, SECRET_FILE));
  const credentials = JSON.parse(text);

  const clientSecret = credentials.installed.client_secret;
  const clientId = credentials.installed.client_id;
  const redirectUrl = credentials.installed.redirect_uris[0];
  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUrl);

  //get new token
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("Authorize this app by visiting this url: ", authUrl);

  rl.question("Enter the code from that page here: ", (code) => {
    rl.close();

    oauth2Client.getToken(code, async (err, token) => {
      if (err) {
        console.log("Error while trying to retrieve access token", err);
        return;
      }

      oauth2Client.credentials = token;

      fs.writeFileSync(TOKEN_FILE, JSON.stringify(token));
      console.log("Token stored to " + TOKEN_FILE);
    });
  });
}

async function refreshToken() {
  const text = fs.readFileSync(path.resolve(__dirname, TOKEN_FILE));
  /** @type {number} */
  const expiry_date = JSON.parse(text).expiry_date;
  const now = new Date().getTime();
  if (now >= expiry_date) {
    console.log("Refresh access token");
    await refresh_access_token(
      path.resolve(__dirname, SECRET_FILE),
      path.resolve(__dirname, TOKEN_FILE)
    );
  }
}

async function readVerificationCode() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error(TOKEN_FILE + " does NOT exists");
  }

  await refreshToken();

  const emails = await check_inbox(
    path.resolve(__dirname, SECRET_FILE),
    path.resolve(__dirname, TOKEN_FILE),
    {
      subject: "verification code",
      from: "BestBuyInfo@emailinfo.bestbuy.com",
      wait_time_sec: 3, // Poll interval (in seconds).
      max_wait_time_sec: 30, // Maximum poll time (in seconds), after which we'll giveup.
      include_body: true,
    }
  );
  if (emails) {
    console.log("Email was found!");
    emails.forEach((email) => {
      console.log(email.date);
    });
    const root = HTMLParser.parse(emails[0].body.html);
    const code = root.querySelector(
      "span[style*='font-size:18px; color: #1d252c; font-weight:bold;']"
    ).textContent;
    return code;
  } else {
    throw new Error("Email was not found!");
  }
}

async function checkStatus(itemUrl, interval) {
  openPage(itemUrl)
    .catch((error) => {
      console.log(error);
    })
    .then((success) => {
      if (success) {
        console.log("Succeeded");
      } else {
        console.log("Sleeping...");
        setTimeout(() => checkStatus(itemUrl, interval), interval);
      }
    });
}

async function openPage(itemUrl) {
  console.log(new Date(), itemUrl);
  const browser = await pptr.connect(chromeOptions);
  const page = await browser.newPage();

  await page.goto(itemUrl);
  const button = await page.waitForSelector("button.add-to-cart-button");
  const buttonText = await button.evaluate((el) => el.textContent);
  console.log(buttonText);
  if (buttonText !== "Add to Cart") {
    await page.close();
    return false;
  }
  await button.click();

  await page.goto(URL_CART);
  const checkout = await page.waitForSelector(
    "div.checkout-buttons__checkout > button"
  );
  await checkout.click();
  await page.waitForNavigation();
  console.log(page.url());

  if (page.url().includes("verificationCode")) {
    const code = await readVerificationCode();
    await page.waitForSelector("input");
    await page.type("input", code);
    await page.keyboard.press("Enter");
    await page.waitForNavigation();
    console.log(page.url());
  }

  try {
    await page.waitForSelector("#cvv", { timeout: 1000 });
    await page.type("#cvv", process.env.CVV);
  } catch (e) {
    if (e instanceof pptr.errors.TimeoutError) {
      // do nothing
      console.log("No need to enter CVV");
    } else {
      throw e;
    }
  }

  if (page.url() === "https://www.bestbuy.com/checkout/r/fulfillment") {
    const continueButton = await page.waitForSelector(
      "section.fulfillment > div > div> div > div.button--continue > button"
    );
    await continueButton.click();
    await page.waitForNavigation();
  }

  console.log(page.url());
  // assert(page.url() === "https://www.bestbuy.com/checkout/r/payment");
  const placeOrderButton = await page.waitForSelector(
    "div.contact-card__order-button > div > div.payment__order-summary > button"
  );
  await placeOrderButton.click();
  await page.waitForNavigation();
  console.log(page.url());
  if (page.url() === "https://www.bestbuy.com/checkout/r/thank-you") {
    await page.close();
  }
  return true;
}

(async () => {
  await authorizeGmail();

  const interval = 30000; // 30 seconds
  // URL_TEST, URL_RTX_3090
  await checkStatus(URL_RTX_3090, interval);
})().catch((e) => {
  console.log(e);
});
