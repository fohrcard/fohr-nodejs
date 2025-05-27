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
    // First get the document content to determine the correct range
    const document = await docs.documents.get({
      documentId: documentId,
    });

    // Get the last index of the document content
    const lastIndex =
      document.data.body.content[document.data.body.content.length - 1]
        .endIndex;

    // Find all bold text ranges
    const boldRanges = [];
    const processElement = (element) => {
      if (element.paragraph && element.paragraph.elements) {
        element.paragraph.elements.forEach((el) => {
          if (el.textRun && el.textRun.textStyle && el.textRun.textStyle.bold) {
            boldRanges.push({
              startIndex: el.startIndex,
              endIndex: el.endIndex,
            });
          }
        });
      }
    };

    document.data.body.content.forEach(processElement);

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
            endIndex: lastIndex,
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

    // Add text style updates for non-bold text
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: 1,
          endIndex: lastIndex,
        },
        textStyle: {
          fontSize: {
            magnitude: 10,
            unit: "PT",
          },
          weightedFontFamily: {
            fontFamily: "Arial",
            weight: 400,
          },
        },
        fields: "fontSize,weightedFontFamily",
      },
    });

    // Add text style updates for bold text ranges
    boldRanges.forEach((range) => {
      requests.push({
        updateTextStyle: {
          range: {
            startIndex: range.startIndex,
            endIndex: range.endIndex,
          },
          textStyle: {
            fontSize: {
              magnitude: 10,
              unit: "PT",
            },
            weightedFontFamily: {
              fontFamily: "Arial",
              weight: 700,
            },
            bold: true,
          },
          fields: "fontSize,weightedFontFamily,bold",
        },
      });
    });

    await docs.documents.batchUpdate({
      documentId: documentId,
      requestBody: { requests },
    });
  } catch (error) {
    console.error("Error setting document margins:", error);
  }
};

const setDocumentPermissions = async (fileId) => {
  try {
    // First, remove all existing permissions except owner
    const existingPermissions = await drive.permissions.list({
      fileId: fileId,
      fields: "permissions(id,emailAddress,role)",
    });

    for (const permission of existingPermissions.data.permissions) {
      // Skip owner and anyoneWithLink permissions
      if (permission.id !== "anyoneWithLink" && permission.role !== "owner") {
        await drive.permissions.delete({
          fileId: fileId,
          permissionId: permission.id,
        });
      }
    }

    // Add domain-wide permission for @fohr.co with editor role
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "writer",
        type: "domain",
        domain: "fohr.co",
      },
    });

    // Set the document to be accessible to anyone with the link as commenter
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "commenter",
        type: "anyone",
      },
    });
  } catch (error) {
    console.error("Error setting document permissions:", error);
    throw error;
  }
};

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

    const docId = googleDocResponse.id;

    // Set document margins after creation
    await setDocumentMargins(docId);

    // Set document permissions
    await setDocumentPermissions(docId);

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

    return response.data;
  } catch (error) {
    console.error("Error converting to Google Doc:", error.message);
  }
}

const exportDocToPdf = async (docId) => {
  await removeAnchorTag(docId);

  const res = await drive.files.export(
    {
      fileId: docId,
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

    // 2. Find the text element containing "<a>Accept changes</a>"
    const content = document.data;
    let startIndex = null;
    let endIndex = null;

    const textToSearch = "Accept changes and mark as ready for review by Fohr";

    // Search through the document's body content
    content.body.content.slice(0, 5).forEach((element) => {
      if (element.paragraph && element.paragraph.elements) {
        element.paragraph.elements.forEach((el) => {
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
exports.setDocumentPermissions = setDocumentPermissions;
