function addAgent() {
  var ipfs = window.IpfsApi("localhost", "5001");
  const Buffer = window.IpfsApi().Buffer;

  var firstName = $("#firstName").val();
  var lastName = $("#lastName").val();
  age = $("#age").val();
  designation = $("#designation").val();
  designation = parseInt(designation);
  address = $("#address").val();
  phoneNumber = $("#phone").val();
  email = $("#email").val();
  // Additional fields for doctor
  gender = $("#gender").val();
  birthDate = $("#dob").val();
  yearsOfExperience = $("#yearsOfExperience").val();
  specialty = $("#specialty").val();
  licenseNumber = $("#licenseNumber").val();
  // Additional fields for proxy
  var proxyOption = $("#proxyOption").val();
  var token = $("#token").val();
  var patientEthereumAddress = $("#patientEthereumAddress").val();
  var poaDocument = document.getElementById("poaDoc")
    ? document.getElementById("poaDoc").files[0]
    : null;

  var publicKey;

  web3.eth.getAccounts().then((accounts) => {
    if (accounts.length === 0) {
      // No accounts found
      console.error("No accounts found");
      return;
    }

    publicKey = accounts[0].toLowerCase();
    console.log("PK:" + publicKey);

    // Check if the public key already exists as a patient or a doctor
    let patientPromise = contractInstance.methods
      .get_patient(publicKey)
      .call({ gas: 1000000 });
    let doctorPromise = contractInstance.methods
      .get_doctor(publicKey)
      .call({ gas: 1000000 });

    Promise.all([patientPromise, doctorPromise]).then(
      ([patientResult, doctorResult]) => {
        if (patientResult[0] !== "") {
          $(".alert-info").show(); // Display message that the user is already registered as a patient
          $(".alert-warning").hide();
        } else if (doctorResult[0] !== "") {
          $(".alert-info").show(); // Display message that the user is already registered as a doctor
          $(".alert-warning").hide();
        } else {
          // User is not registered, proceed with registration
          $(".alert-info").hide();
          $(".alert-warning").hide();

          if (designation == 0) {
            let fhirPatientResource = {
              resourceType: "Patient",
              name: [{ family: lastName, given: [firstName] }],
              gender: gender,
              birthDate: birthDate,
              telecom: [
                { system: "phone", value: phoneNumber, use: "mobile" },
                { system: "email", value: email },
              ],
              address: [
                {
                  use: "home",
                  line: [address],
                },
              ],
            };
            var formattedData = formatPatientData(
              fhirPatientResource,
              publicKey
            );

            var buffer = Buffer.from(formattedData);

            ipfs.files.add(buffer, (error, result) => {
              if (error) {
                console.error("IPFS upload error:", error);
              } else {
                let ipfsHash = result[0].hash;
                contractInstance.methods
                  .add_agent(
                    firstName,
                    lastName,
                    age,
                    designation,
                    ipfsHash,
                    "",
                    false,
                    "0x0000000000000000000000000000000000000000"
                  )
                  .send({ from: publicKey, gas: 1000000 })
                  .then((res) => {
                    location.replace("./patient.html");
                  })
                  .catch((err) => {
                    console.error("Blockchain transaction error:", err);
                  });
              }
            });
          } else if (designation == 1) {
            let fhirDoctorResource = {
              resourceType: "Practitioner",
              name: [
                {
                  family: "Doctor's Family Name",
                  given: ["Doctor's Given Name"],
                },
              ],
              telecom: [
                { system: "phone", value: phoneNumber, use: "work" },
                { system: "email", value: email },
              ],
              address: [
                {
                  use: "work",
                  line: [address],
                },
              ],
              gender: gender,
              birthDate: birthDate,
              qualification: [
                {
                  identifier: [
                    {
                      system: "http://example.org/licenses",
                      value: licenseNumber,
                    },
                  ],
                  code: { text: specialty },
                  period: {
                    start: "Practitioner's Start Date",
                    end: "Practitioner's End Date",
                  },
                },
              ],
            };

            var formattedDoctorData = formatDoctorData(
              fhirDoctorResource,
              publicKey
            );
            var buffer = Buffer.from(formattedDoctorData);
            ipfs.files.add(buffer, (error, result) => {
              if (error) {
                console.error("IPFS upload error:", error);
                return;
              }

              // Store the IPFS hash in the blockchain
              let ipfsHash = result[0].hash;
              contractInstance.methods
                .add_agent(
                  firstName,
                  lastName,
                  age,
                  designation,
                  ipfsHash,
                  "",
                  false,
                  "0x0000000000000000000000000000000000000000"
                )
                .send({ from: publicKey, gas: 1000000 })
                .then((res) => {
                  location.replace("./doctor.html");
                })
                .catch((err) => {
                  console.error("Blockchain transaction error:", err);
                });
            });
          } else if (designation == 2) {
            handleProxyRegistration(
              proxyOption,
              token,
              poaDocument,
              ipfs,
              Buffer
            )
              .then(({ isToken, hashOrToken }) => {
                // Adjust Ethereum address parameter based on the proxy option
                let ethAddressParam = isToken
                  ? "0x0000000000000000000000000000000000000000"
                  : patientEthereumAddress;
                if (!isToken && !web3.utils.isAddress(patientEthereumAddress)) {
                  console.error("Invalid patient Ethereum address.");
                  return; // Exit if the Ethereum address is invalid for POA
                }

                // Prepare FHIR proxy resource
                var fhirProxyResource = {
                  resourceType: "RelatedPerson",
                  name: [{ family: lastName, given: [firstName] }],
                  telecom: [
                    {
                      system: "phone",
                      value: phoneNumber,
                    },
                    {
                      system: "email",
                      value: email,
                    },
                  ],
                  address: [
                    {
                      use: "home",
                      line: [address],
                    },
                  ],
                  gender: gender,
                  birthDate: birthDate,
                };

                // Add extensions based on proxy option
                let extensions = [];
                if (proxyOption === "token") {
                  extensions.push({
                    url: "http://example.org/fhir/StructureDefinition/proxy-access-token",
                    valueCode: "token",
                    valueString: token,
                  });
                } else if (proxyOption === "poa") {
                  extensions.push(
                    {
                      url: "http://example.org/fhir/StructureDefinition/patientEthereumAddress",
                      valueString: patientEthereumAddress,
                    },
                    {
                      url: "http://example.org/fhir/StructureDefinition/proxy-access-value",
                      valueString: hashOrToken,
                    }
                  );
                }
                fhirProxyResource.extension = extensions;

                // Format data for IPFS
                var formattedProxyData = JSON.stringify(fhirProxyResource);
                var buffer = Buffer.from(formattedProxyData);

                ipfs.files.add(buffer, async (error, result) => {
                  if (error) {
                    console.error("IPFS upload error:", error);
                    return;
                  }
                  let ipfsHash = result[0].hash;
                  await contractInstance.methods
                    .add_agent(
                      firstName,
                      lastName,
                      age,
                      designation,
                      ipfsHash,
                      hashOrToken,
                      isToken,
                      ethAddressParam
                    )
                    .send({ from: publicKey, gas: 1000000 })
                    .then((res) => {
                      window.location.replace("./proxy.html");
                    })
                    .catch((err) => {
                      console.error("Blockchain transaction error:", err);
                      if (err.data) {
                        console.error("Error data:", err.data);
                      }
                    });
                });
              })
              .catch((error) => {
                console.error("Error during proxy registration:", error);
                document.getElementById("poaValidationError").style.display =
                  "block"; // Show the alert
                document.getElementById(
                  "poaValidationErrorMessage"
                ).textContent = error;
              });
          }
        }
      }
    );
  });

  return false;
}

function toggleFields() {
  var designation = $("#designation").val();
  $("#commonFields").css("display", designation !== "" ? "block" : "none");
  $("#doctorFields").css("display", designation === "1" ? "block" : "none");
  $("#proxyFields").css("display", designation === "2" ? "block" : "none");

  // Call toggleProxyOptionFields to adjust the display based on the proxy option chosen
  if (designation === "2") {
    toggleProxyOptionFields();
  }
}

function toggleProxyOptionFields() {
  var proxyOption = $("#proxyOption").val();
  $("#tokenInputField").css(
    "display",
    proxyOption === "token" ? "block" : "none"
  );
  $("#poaFields").css("display", proxyOption === "poa" ? "block" : "none");
}

function formatPatientData(patientData, publicKey) {
  let dataString = `Medical Record\n`;
  dataString += `First Name: ${patientData.name[0].given.join(" ")}\n`;
  dataString += `Last Name: ${patientData.name[0].family}\n`;
  dataString += `Gender: ${patientData.gender}\n`;
  dataString += `Birth Date: ${patientData.birthDate}\n`;
  dataString += `Contact: ${patientData.telecom
    .map((t) => `${t.system}: ${t.value}`)
    .join(", ")}\n`;
  dataString += `Address: ${patientData.address
    .map((a) => a.line.join(", "))
    .join(", ")}\n`;
  dataString += `Public Key: ${publicKey}\n`;

  return dataString;
}

function formatDoctorData(doctorData, publicKey) {
  let dataString = `Doctor Information\n`;
  dataString += `First Name: ${doctorData.name[0].given.join(" ")}\n`;
  dataString += `Last Name: ${doctorData.name[0].family}\n`;
  dataString += `Gender: ${doctorData.gender}\n`;
  dataString += `Birth Date: ${doctorData.birthDate}\n`;
  dataString += `Contact: ${doctorData.telecom
    .map((t) => `${t.system}: ${t.value}`)
    .join(", ")}\n`;
  dataString += `Address: ${doctorData.address
    .map((a) => a.line.join(", "))
    .join(", ")}\n`;
  dataString += `Years of Experience: ${yearsOfExperience}\n`;
  dataString += `Specialty: ${specialty}\n`;
  dataString += `License Number: ${licenseNumber}\n`;
  dataString += `Public Key: ${publicKey}\n`;

  return dataString;
}
function formatProxyData(
  proxyData,
  publicKey,
  proxyOption,
  hashOrToken,
  patientEthereumAddress
) {
  // Initialize the data string with the proxy information header
  let dataString = `Proxy Information\n`;

  // Add the basic information from the proxyData FHIR resource
  dataString += `First Name: ${proxyData.name[0].given.join(" ")}\n`;
  dataString += `Last Name: ${proxyData.name[0].family}\n`;
  dataString += `Gender: ${proxyData.gender}\n`;
  dataString += `Birth Date: ${proxyData.birthDate}\n`;
  dataString += `Contact: ${proxyData.telecom
    .map((t) => `${t.system}: ${t.value}`)
    .join(", ")}\n`;
  dataString += `Address: ${proxyData.address
    .map((a) => a.line.join(", "))
    .join(", ")}\n`;

  // Use patient Ethereum address for identifying the patient instead of the patient's name
  dataString += `Patient Ethereum Address: ${patientEthereumAddress}\n`;

  // Append the public key and proxy option
  dataString += `Public Key: ${publicKey}\n`;
  dataString += `Proxy Option: ${proxyOption.toUpperCase()}\n`;

  // Conditionally add the token or POA document hash
  if (proxyOption === "token") {
    dataString += `Token: ${hashOrToken}\n`;
  } else if (proxyOption === "poa") {
    dataString += `POA Document Hash: ${hashOrToken}\n`;
  }

  return dataString;
}

function handleProxyRegistration(
  proxyOption,
  token,
  fileElementId,
  ipfs,
  Buffer
) {
  const formDetails = {
    firstName: $("#firstName").val(),
    lastName: $("#lastName").val(),
    address: $("#address").val(),
    phoneNumber: $("#phone").val(),
    email: $("#email").val(),
  };

  return new Promise((resolve, reject) => {
    if (proxyOption === "token") {
      resolve({ isToken: true, hashOrToken: token });
    } else if (proxyOption === "poa") {
      const poaDocElement = document.getElementById("poaDoc");
      if (!poaDocElement || poaDocElement.files.length === 0) {
        reject("POA document is required for this option.");
        return;
      }
      const poaDocument = poaDocElement.files[0];
      const reader = new FileReader();
      reader.onloadend = function () {
        const buffer = Buffer.from(reader.result);
        // Here you would validate the POA details
        validatePOADetails(buffer, formDetails)
          .then((isValidPOA) => {
            if (!isValidPOA) {
              reject(
                "POA document details do not match registration form input."
              );
              return;
            }
            // Proceed with IPFS upload if validation is successful
            ipfs.files.add(buffer, (error, result) => {
              if (error) {
                reject("IPFS upload error: " + error.message);
                return;
              }
              const ipfsHash = result[0].hash;
              resolve({ isToken: false, hashOrToken: ipfsHash });
            });
          })
          .catch((error) => {
            reject("Error validating POA document: " + error);
          });
      };
      reader.onerror = function (error) {
        reject("Error reading POA document: " + error.message);
      };
      reader.readAsArrayBuffer(poaDocument);
    } else {
      reject("Invalid proxy option provided.");
    }
  });
}

async function validatePOADetails(buffer, formDetails) {
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    fullText += textContent.items
      .map((item) => item.str.replace(/\s+/g, " "))
      .join(" ")
      .toLowerCase(); // Ensure the full text is in lowercase for consistent matching
  }

  // Normalize form details for comparison
  const normalizedFormDetails = {
    firstName: formDetails.firstName.toLowerCase().replace(/\s+/g, " "),
    lastName: formDetails.lastName.toLowerCase().replace(/\s+/g, " "),
    email: formDetails.email.toLowerCase().trim(),
    // Ensure address normalization matches the document's potential formatting
    address: formDetails.address.toLowerCase().replace(/\s+/g, " "),
    // Assuming phone number handling is removed as per your request
  };

  // Legal terms to check within the document
  const legalTerms = [
    "medical power of attorney",
    "health care decisions",
    "agent",
    "principal",
    "authority",
    "life support",
    "incompetent",
  ];

  const missingTerms = legalTerms.filter(
    (term) => !fullText.includes(term.replace(/\s+/g, " "))
  );
  const allLegalTermsPresent = missingTerms.length === 0;

  // Debugging: Output which terms were not found if any
  if (!allLegalTermsPresent) {
    console.log("Missing Legal Terms:", missingTerms);
  }

  // Simplified address matching to be resilient against minor discrepancies
  const matchesAddress = fullText.includes(
    normalizedFormDetails.address.replace(/\s+/g, " ")
  );

  // Match other details (First Name, Last Name, Email)
  const matchesFirstName = fullText.includes(normalizedFormDetails.firstName);
  const matchesLastName = fullText.includes(normalizedFormDetails.lastName);
  const matchesEmail = fullText.includes(normalizedFormDetails.email);

  const allDetailsMatch =
    matchesFirstName &&
    matchesLastName &&
    matchesEmail &&
    matchesAddress &&
    allLegalTermsPresent;

  console.log("All Legal Terms Present:", allLegalTermsPresent);
  console.log("Does Address Match:", matchesAddress);
  console.log("Do All Details Match:", allDetailsMatch);

  return allDetailsMatch;
}
