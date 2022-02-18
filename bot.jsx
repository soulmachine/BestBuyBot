const pptr = require("puppeteer-core");
const fs = require("fs");

require("dotenv").config();

// Make sure you've logged in www.bestbuy.com already in the Chrome of your computer.

const URL_TEST =
  "https://www.bestbuy.com/site/apple-lightning-to-3-5mm-headphone-adapter-white/5622278.p?skuId=5622278";
const URL_RTX_3090 =
  "https://www.bestbuy.com/site/nvidia-geforce-rtx-3090-24gb-gddr6x-pci-express-4-0-graphics-card-titanium-and-black/6429434.p?skuId=6429434";

const URL_CART = "https://www.bestbuy.com/cart";

var chromeOptions = {
  headless: false,
  // executablePath: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  browserWSEndpoint: process.env.WS_ENDPOINT,
  defaultViewport: null,
};

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

  await page.waitForSelector("#cvv");
  await page.type("#cvv", process.env.CVV);

  const placeOrderButton = await page.waitForSelector(
    "div.contact-card__order-button > div > div.payment__order-summary > button"
  );
  await placeOrderButton.click();
  await page.close();
  return true;
}

(async () => {
  const interval = 30000; // 30 seconds
  // URL_TEST, URL_RTX_3090
  await checkStatus(URL_TEST, interval);
})().catch((e) => {
  console.log(e);
});
