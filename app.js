var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");

const http = require("http");

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

  const contract = Contracts.getContracts(participantId)[0];

  if (!contract) {
    res.json(null);

    return;
  }

  const { agreementId } = contract;

  const agreement = await AdobeSign.getAgreement(agreementId);

  res.json({ ...contract, agreement });
});

// Route to handle file upload
app.post("/upload-contract", async (req, res) => {
  try {
    const { documentUrl, participantName, participantId, campaignId } =
      req.body;

    const docId = await GoogleDrive.createGoogleDoc(
      documentUrl,
      participantName,
      participantId
    );

    const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

    Contracts.addOrReplaceContract({
      docUrl,
      docId,
      participantId,
      campaignId,
    });

    res
      .status(200)
      .json({ message: "Google Doc created successfully", docUrl });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// Mark a contract ready for review by Fohr
app.post("/update-contract", async (req, res) => {
  try {
    const { participantId, status } = req.body;

    if (status === "PENDING_FOHR_TO_INITIATE_SIGNATURES") {
      // This status means that the influencer has marked a contract as ready to review by Fohr.
      // Send notification to Campaign manager and contracts@fohr.co
      // Fohr is the one that initiates signatures. The influencer can only mark the contract as final from their side
    }

    Contracts.updateContract(participantId, { status });

    res.status(200).send();
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

    const status = "OUT_FOR_SIGNATURE";

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

var port = process.env.PORT || 4000;
app.set("port", port);

/**
 * Create HTTP server.
 */

function onError(error) {
  if (error.syscall !== "listen") {
    throw error;
  }

  var bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
  console.log("Listening on " + bind);
}

const server = http.createServer(app);

server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

module.exports = app;
