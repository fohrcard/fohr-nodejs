const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

const INTEGRATION_KEY =
  "3AAABLblqZhB59DWJk_N6LTHf95jkUCi6C3rmdMPctej4sc3HpL1yavSrsOk06nvQxA_nhW1W5068vnNWSJ0Am3FLxqI5hzWb";

// Configuration
const config = {
  baseUrl: "https://api.na1.adobesign.com", // Replace with your API access point
  accessToken: `Bearer ${INTEGRATION_KEY}`, // Replace with your OAuth access token
};

const options = {
  headers: {
    Authorization: config.accessToken,
    "Content-Type": "application/json",
  },
};

const fileName = "document.pdf";

async function getBaseUri() {
  const response = await axios.get(
    "https://api.adobesign.com/api/rest/v6/baseUris",
    {
      headers: {
        Authorization: config.accessToken,
      },
    }
  );

  return response.data;
}

// Step 1: Upload the PDF to Adobe Sign
async function uploadDocument(pdfPath) {
  try {
    const form = new FormData();

    form.append("File", fs.createReadStream(pdfPath), {
      filename: fileName,
      contentType: "application/pdf",
    });

    const response = await axios.post(
      `${config.baseUrl}/api/rest/v6/transientDocuments`,
      form,
      {
        headers: {
          Authorization: config.accessToken,
          ...form.getHeaders(),
        },
      }
    );

    const transientDocumentId = response.data.transientDocumentId;
    console.log("Transient Document ID:", transientDocumentId);
    return transientDocumentId;
  } catch (error) {
    console.error(
      "Error uploading document:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// Step 2: Create and send the agreement for signature
async function sendForSignature(pdfPath) {
  const baseUri = await getBaseUri();

  config.baseUrl = baseUri.apiAccessPoint;

  const transientDocumentId = await uploadDocument(pdfPath);

  try {
    const agreementPayload = {
      fileInfos: [{ transientDocumentId }],
      name: "Agreement to be signed",
      participantSetsInfo: [
        {
          // We have to set the participant's email here. We have that info from the participant ID belonging to the contract
          memberInfos: [{ email: "mihovil@fohr.co" }], // Recipient's email
          order: 1,
          role: "SIGNER",
          name: "signer_one",
        },
        {
          // This should be a Fohr email used to sign the contract. Potentially contracts@fohr.co
          memberInfos: [{ email: "airmiha@gmail.com" }], // Sender's email
          order: 2,
          role: "SIGNER",
          name: "signer_two",
        },
      ],
      signatureType: "ESIGN",
      state: "IN_PROCESS",
    };

    const response = await axios.post(
      `${config.baseUrl}api/rest/v6/agreements`,
      agreementPayload,
      {
        headers: {
          Authorization: config.accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Agreement sent successfully!", response.data);

    // TODO: Figure out why the webhook isn't triggered
    // await registerWebhook(response.data.id);

    const agreement = await getAgreement(response.data.id);

    return { ...response.data, agreement };
  } catch (error) {
    console.error(
      "Error sending agreement:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// Step 3: Register Webhook
async function registerWebhook(agreementId) {
  await deleteAllWebhooks();

  const payload = {
    name: "Agreement Webhook",
    scope: "RESOURCE",
    state: "ACTIVE",
    resourceType: "AGREEMENT",
    resourceId: "CBJCHBCAABAAlGD-QSuiW3Ir-5CyvqmpsWFUrLxyDz_r" || agreementId,
    webhookUrlInfo: {
      url: "https://e1e2-95-168-121-28.ngrok-free.app/adobe-webhook",
    },
    webhookSubscriptionEvents: [
      "AGREEMENT_CREATED",
      "AGREEMENT_ACTION_COMPLETED",
      "AGREEMENT_EMAIL_VIEWED",
      "AGREEMENT_WORKFLOW_COMPLETED",
    ],
    webhookConditionalParams: {
      webhookInfoInResponse: { agreement: true, participant: true },
    },
  };

  try {
    await axios.post(`${config.baseUrl}/api/rest/v6/webhooks`, payload, {
      headers: {
        Authorization: config.accessToken,
        "Content-Type": "application/json",
      },
    });
    console.log("Webhook registered");
  } catch (e) {
    if (
      e.response.code === 400 &&
      e.response.data.code === "DUPLICATE_WEBHOOK_CONFIGURATION"
    ) {
      return null;
    }

    console.error(e);
  }
}

const getAgreement = async (agreementId) => {
  const baseUri = await getBaseUri();

  config.baseUrl = baseUri.apiAccessPoint;

  const BASE_URL = `${config.baseUrl}api/rest/v6/agreements/${agreementId}`;

  try {
    const response = await axios.get(BASE_URL, options);

    const agreement = response.data;

    const { status } = agreement;

    console.log("Agreement", agreement);

    if (status === "OUT_FOR_SIGNATURE") {
      const signingUrlsResponse = await axios.get(
        `${BASE_URL}/signingUrls`,
        options
      );

      return { ...response.data, signingUrls: signingUrlsResponse.data };
    } else if (status === "SIGNED" || status === "COMPLETED") {
      const signedDocumentResponse = await axios.get(
        `${BASE_URL}/combinedDocument/url`,
        options
      );

      const signedDocumentUrl = signedDocumentResponse.data.url;

      return { ...response.data, signedDocumentUrl };
    }

    return { ...response.data, agreement };
  } catch (e) {
    console.error("Error fetching agreement");
    return null;
  }
};

// Step 1: Retrieve All Webhooks
async function getAllWebhooks() {
  try {
    const response = await axios.get(`${config.baseUrl}/api/rest/v6/webhooks`, {
      headers: {
        Authorization: config.accessToken,
        "Content-Type": "application/json",
      },
      params: {
        showInActive: true, // Include inactive webhooks
      },
    });

    console.log("Webhooks response", response.data);
    return response.data.userWebhookList || [];
  } catch (error) {
    console.error(
      "Error retrieving webhooks:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// Step 2: Delete a Single Webhook by ID
async function deleteWebhook(webhookId) {
  try {
    await axios.delete(`${config.baseUrl}/api/rest/v6/webhooks/${webhookId}`, {
      headers: {
        Authorization: config.accessToken,
        "Content-Type": "application/json",
      },
    });
    console.log(`Deleted webhook ID: ${webhookId}`);
  } catch (error) {
    console.error(
      `Error deleting webhook ID ${webhookId}:`,
      error.response?.data || error.message
    );
  }
}

// Step 3: Delete All Webhooks
async function deleteAllWebhooks() {
  try {
    const webhooks = await getAllWebhooks();
    console.log(`Found ${webhooks.length} webhooks`);

    if (webhooks.length === 0) {
      console.log("No webhooks to delete");
      return;
    }

    for (const webhook of webhooks) {
      await deleteWebhook(webhook.id);
    }
    console.log("All webhooks deleted");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

exports.sendForSignature = sendForSignature;
exports.registerWebhook = registerWebhook;
exports.getAgreement = getAgreement;
