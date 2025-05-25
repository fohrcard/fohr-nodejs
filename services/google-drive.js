const axios = require("axios");
const fs = require("fs");
const path = require("path");

const { google } = require("googleapis");

// Load the service account key file
const serviceAccountKey = JSON.parse(
  fs.readFileSync("./service-account-key.json")
);

// Authenticate with the service account
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountKey,
  scopes: ["https://www.googleapis.com/auth/drive"],
});

// Create a Google Drive client
const drive = google.drive({ version: "v3", auth });
const docs = google.docs({ version: "v1", auth });

const FOLDER_ID = "1R9Y37hihzGgEw03cPl1FX7awO3dt6ewn";

// Helper function to set document margins
const setDocumentMargins = async (documentId) => {
  try {
    const requests = [
      {
        updateDocumentStyle: {
          documentStyle: {
            marginTop: { magnitude: 72, unit: "PT" },
            marginBottom: { magnitude: 72, unit: "PT" },
            marginLeft: { magnitude: 72, unit: "PT" },
            marginRight: { magnitude: 72, unit: "PT" },
          },
          fields: "marginTop,marginBottom,marginLeft,marginRight",
        },
      },
      {
        updateParagraphStyle: {
          range: {
            startIndex: 1,
            endIndex: 1,
          },
          paragraphStyle: {
            lineSpacing: 100,
            spaceAbove: { magnitude: 0, unit: "PT" },
            spaceBelow: { magnitude: 0, unit: "PT" },
          },
          fields: "lineSpacing,spaceAbove,spaceBelow",
        },
      },
    ];

    await docs.documents.batchUpdate({
      documentId: documentId,
      requestBody: { requests },
    });
  } catch (error) {
    console.error("Error setting document margins:", error);
  }
};

// Helper function to create a Google Doc from DOCX
const createGoogleDoc = async (docxUrl, participantName) => {
  try {
    const response = await axios({
      url: docxUrl,
      method: "GET",
      responseType: "stream",
    });

    // Create a temporary file path for the DOCX file
    const tempFilePath = path.join(__dirname, "temp.docx");
    const writer = fs.createWriteStream(tempFilePath);

    // Save the file locally from the stream
    response.data.pipe(writer);

    // Wait for the file to finish downloading
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const name = `Contract - ${participantName}`;
    // Step 1: Create an empty Google Doc
    const docResponse = await drive.files.create({
      requestBody: {
        name,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: "text/html",
        body: fs.createReadStream(tempFilePath),
      },
    });

    const googleDocResponse = await convertToGoogleDoc(
      docResponse.data.id,
      name
    );

    console.log("Google Doc Response", googleDocResponse);

    const docId = googleDocResponse.id;

    // Set document margins after creation
    await setDocumentMargins(docId);

    return docId;
  } catch (error) {
    console.error("Error creating Google Doc:", error);
    throw error;
  }
};

async function convertToGoogleDoc(docxFileId, name) {
  try {
    const response = await drive.files.copy({
      fileId: docxFileId,
      resource: {
        name,
        mimeType: "application/vnd.google-apps.document",
      },
      fields: "id",
    });

    console.log("Converted Google Doc File ID:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error converting to Google Doc:", error.message);
    // throw error;
  }
}

const exportDocToPdf = async (docId) => {
  const googleDocId = await convertToGoogleDoc(docId);

  await removeAnchorTag(googleDocId);

  const res = await drive.files.export(
    {
      fileId: googleDocId,
      mimeType: "application/pdf",
    },
    { responseType: "stream" }
  );

  const pdfOutputPath = path.join(__dirname, "output.pdf");

  const dest = fs.createWriteStream(pdfOutputPath);
  res.data.pipe(dest);

  return new Promise((resolve, reject) => {
    dest.on("finish", () => {
      console.log("PDF exported and saved to:", pdfOutputPath);
      resolve(pdfOutputPath);
    });
    dest.on("error", (error) => {
      console.error("Error saving PDF:", error.message);
      reject(error);
    });
  });
};

async function removeAnchorTag(documentId) {
  const docs = google.docs({ version: "v1", auth });

  try {
    // 1. First, get the document content
    const document = await docs.documents.get({
      documentId,
    });

    console.log("Removing anchor tag for document");

    // 2. Find the text element containing "<a>Accept changes</a>"
    const content = document.data;
    let startIndex = null;
    let endIndex = null;

    const textToSearch = "Accept changes and mark as ready for review by Fohr";

    // Search through the document's body content
    content.body.content.slice(0, 5).forEach((element) => {
      if (element.paragraph && element.paragraph.elements) {
        element.paragraph.elements.forEach((el) => {
          console.log(
            "Element",
            el.textRun,
            el.textRun.content.includes(textToSearch)
          );
          if (el.textRun && el.textRun.content.includes(textToSearch)) {
            startIndex = el.startIndex;
            endIndex = startIndex + textToSearch.length;
          }
        });
      }
    });

    if (startIndex !== null) {
      // 3. Delete the text if found
      const requests = [
        {
          deleteContentRange: {
            range: {
              startIndex: startIndex,
              endIndex: endIndex,
            },
          },
        },
      ];

      console.log("Requests", requests);

      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: requests,
        },
      });

      console.log("Successfully removed the anchor tag");
    } else {
      console.log("Anchor tag not found in the document");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

exports.createGoogleDoc = createGoogleDoc;
exports.exportDocToPdf = exportDocToPdf;
exports.removeAnchorTag = removeAnchorTag;
