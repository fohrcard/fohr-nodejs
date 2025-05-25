const puppeteer = require("puppeteer");

const exportToPdf = async (req, res) => {
  const { url, token } = req.body;

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    timeout: 90 * 60 * 1000,
  });

  const page = await browser.newPage();

  await page.setRequestInterception(true);

  page.on("request", (request) => {
    const requestUrl = request.url();

    console.log("Request", requestUrl);

    request.continue();
  });

  await page.setCookie({
    name: "token",
    value: token,
    domain: "localhost",
  });

  const startPageLoadTime = Date.now();

  await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });

  console.log(
    "Export: page loaded by: ",
    Date.now() - startPageLoadTime,
    "ms."
  );

  await page.pdf({
    path: "export.pdf",
    format: "a4",
    timeout: 0,
    headerTemplate: "<div></div>",
    printBackground: true,
    omitBackground: true,
    margin: {
      bottom: 50,
    },
  });

  await browser.close();

  res.end();
};

exports.exportToPdf = exportToPdf;
