var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");

const AdobeSign = require("./services/adobe-sign");
const ExportService = require("./services/export-to-pdf");
const Contracts = require("./services/contracts");
const GoogleDrive = require("./services/google-drive");

const app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(bodyParser.json());

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(cors());

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.get("/contracts", async (req, res) => {
  const participantId = parseInt(req.query.participantId);

  console.log(
    "Query",
    req.query,
    participantId,
    Contracts.getContracts(participantId)
  );

  const contract = Contracts.getContracts(participantId)[0];

  if (!contract) {
    res.json(null);

    return;
  }

  const { agreementId } = contract;

  console.log("Agreement", agreementId, contract);

  const agreement = await AdobeSign.getAgreement(agreementId);

  res.json({ ...contract, agreement });
});

app.post("/update-contract", async (req, res) => {
  try {
    const { status, participantId } = req.body;

    Contracts.updateContract(participantId, status);

    res.status(200).json();
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// Route to handle file upload
app.post("/upload-contract", async (req, res) => {
  try {
    const { documentUrl, participantName, participantId } = req.body;

    const docId = await GoogleDrive.createGoogleDoc(
      documentUrl,
      participantName,
      participantId
    );

    const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

    //  Contracts.addOrReplaceContract(docUrl, docId, participantId);

    res
      .status(200)
      .json({ message: "Google Doc created successfully", docUrl });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

app.post("/upload-contract-for-signature", async (req, res) => {
  try {
    const { participantId } = req.body;

    const { docId } = Contracts.getContracts(participantId)[0];

    const pdfPath = await GoogleDrive.exportDocToPdf(docId);

    const { id: agreementId, ...rest } = await AdobeSign.sendForSignature(
      pdfPath
    );

    fs.unlinkSync(pdfPath);

    const status = "pending_signatures";

    const updates = { agreementId, status };

    Contracts.updateContract(participantId, updates);

    res.status(200).json({ status, ...rest });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// Test route
app.post("/send-for-signature", async (req, res) => {
  const result = await AdobeSign.registerWebhook();

  res.json(result);
});

app.post("/remove-anchor-tag", async (req, res) => {
  const result = await GoogleDrive.removeAnchorTag(
    "1eQrfNYD9ffc4XH3eHJcKYne6TZlqkmCa"
  );

  res.json(result);
});

app.get("/adobe-webhook", async (req, res) => {
  console.log(JSON.stringify(req.headers));

  const clientId = req.headers["x-adobesign-clientid"];

  res.set("X-AdobeSign-ClientId", clientId).status(200).send();
});

app.post("/adobe-webhook", async (req, res) => {
  console.log("Got a webhook hit", req.body);

  const clientId = req.headers["x-adobesign-clientid"];

  res.set("X-AdobeSign-ClientId", clientId).status(200).send();
});

app.post("/export-to-pdf", async (req, res) => {
  ExportService.exportToPdf(req.body);

  res.end();
});

app.options("*", cors());

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

module.exports = app;
