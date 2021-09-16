import puppeteer from "puppeteer";
(async () => {
	const browser = await puppeteer.launch({});
	const page = await browser.newPage();
	await page.goto("https://shindanmaker.com/1024483", { waitUntil: "domcontentloaded" })
	await page.type("#shindanInput", Math.floor(Math.random() * 0xffffff).toString())
	await page.click("#shindanButtonSubmit", {});
	await page.waitForNavigation({ timeout: 60000, waitUntil: "domcontentloaded" });
	let result = await page.$("#shindanResult");
	console.log()
})()