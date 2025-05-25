const fs = require("fs");
const path = require("path");

const getContractsFromDisk = () => {
  try {
    // Read the JSON file
    const jsonString = fs.readFileSync(
      path.join(__dirname, "contracts.json"),
      "utf8"
    );
    // Parse JSON string to object
    const data = JSON.parse(jsonString).contracts;

    return data;
  } catch (err) {
    console.error("Error reading or parsing the JSON file:", err);
  }
};

const getContracts = (participantId) => {
  const CONTRACTS = getContractsFromDisk();

  return CONTRACTS.filter(
    (contract) => contract.participantId === participantId
  );
};

const addOrReplaceContract = (docUrl, docId, participantId) => {
  let CONTRACTS = getContractsFromDisk();

  CONTRACTS = CONTRACTS.filter(
    (contract) => contract.participantId !== participantId
  );

  CONTRACTS.push({ docUrl, docId, participantId, status: "pending_changes" });

  const jsonString = JSON.stringify({ contracts: CONTRACTS }, null, 2);

  fs.writeFileSync(path.join(__dirname, "contracts.json"), jsonString);
};

const updateContract = (participantId, updates) => {
  const CONTRACTS = getContractsFromDisk();

  const updatedContracts = CONTRACTS.map((contract) => {
    if (contract.participantId === participantId) {
      return {
        ...contract,
        ...updates,
      };
    }

    return contract;
  });

  const jsonString = JSON.stringify({ contracts: updatedContracts }, null, 2);

  fs.writeFileSync(path.join(__dirname, "contracts.json"), jsonString);
};

exports.getContracts = getContracts;
exports.addOrReplaceContract = addOrReplaceContract;
exports.updateContract = updateContract;
