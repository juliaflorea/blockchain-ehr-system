// ================= Main User Registration =================
async function addUser() {
  const ipfs = window.IpfsApi("localhost", "5001");
  const Buffer = window.IpfsApi().Buffer;

  const firstName = $("#firstName").val();
  const lastName = $("#lastName").val();
  const age = $("#age").val();
  const designation = parseInt($("#designation").val()); // 0-patient, 1-doctor, 2-proxy
  const address = $("#address").val();
  const phoneNumber = $("#phone").val();
  const email = $("#email").val();
  const gender = $("#gender").val();
  const birthDate = $("#dob").val();

  const yearsOfExperience = $("#yearsOfExperience").val();
  const specialty = $("#specialty").val();
  const licenseNumber = $("#licenseNumber").val();
  const medicalCertificate = document.getElementById("medicalCertificate")
    ? document.getElementById("medicalCertificate").files[0]
    : null;

  const proxyOption = $("#proxyOption").val();
  const token = $("#token").val();
  const patientEthereumAddress = $("#patientEthereumAddress").val();
  const poaDocument = document.getElementById("poaDoc")
    ? document.getElementById("poaDoc").files[0]
    : null;

  const accounts = await web3.eth.getAccounts();
  if (accounts.length === 0) {
    alert("No MetaMask account found. Please connect your wallet.");
    return;
  }

  const publicKey = accounts[0].toLowerCase();
  console.log("Public Key:", publicKey);

  // Check if already registered
  const existingPatient = await userRegistry.methods.getPatient(publicKey).call();
  const existingDoctor = await userRegistry.methods.getDoctor(publicKey).call();

  if (existingPatient.firstName !== "") {
    $(".alert-info").show();
    $(".alert-warning").hide();
    return;
  } else if (existingDoctor.firstName !== "") {
    $(".alert-info").show();
    $(".alert-warning").hide();
    return;
  }

  $(".alert-info").hide();
  $(".alert-warning").hide();

  // Handle registration based on designation
  if (designation === 0) {
    await registerPatient(ipfs, Buffer, publicKey, {
      firstName, lastName, age, address, phoneNumber, email, gender, birthDate
    });
  } else if (designation === 1) {
    await registerDoctor(ipfs, Buffer, publicKey, {
      firstName, lastName, age, address, phoneNumber, email, gender, birthDate,
      yearsOfExperience, specialty, licenseNumber, medicalCertificate
    });
  } else if (designation === 2) {
    await registerProxy(ipfs, Buffer, publicKey, {
      firstName, lastName, age, address, phoneNumber, email, gender, birthDate,
      proxyOption, token, patientEthereumAddress, poaDocument
    });
  }
}

// ================= Patient Registration =================
async function registerPatient(ipfs, Buffer, publicKey, data) {
  const fhirPatient = {
    resourceType: "Patient",
    name: [{ family: data.lastName, given: [data.firstName] }],
    gender: data.gender,
    birthDate: data.birthDate,
    telecom: [
      { system: "phone", value: data.phoneNumber, use: "mobile" },
      { system: "email", value: data.email },
    ],
    address: [{ use: "home", line: [data.address] }],
  };

  const formatted = formatPatientData(fhirPatient, publicKey);
  const buffer = Buffer.from(formatted);

  ipfs.files.add(buffer, async (error, result) => {
    if (error) return console.error("IPFS error:", error);

    const ipfsHash = result[0].hash;
    try {
      await userRegistry.methods
      await userRegistry.methods
      .addPatient(
        data.firstName,
        data.lastName,
        parseInt(data.age),
        ipfsHash
      )
      .send({ from: publicKey, gas: 1000000 });
    
      location.replace("./patient.html");
    } catch (err) {
      console.error("Transaction error:", err);
    }
  });
}

// ================= Doctor Registration =================
async function registerDoctor(ipfs, Buffer, publicKey, data) {
  const isRegistered = await userRegistry.methods.isLicenseRegistered(data.licenseNumber).call();
  if (isRegistered) {
    alert("This license number is already registered.");
    return;
  }

  if (!data.medicalCertificate) {
    alert("Please upload your medical certificate.");
    return;
  }

  $("#loadingMessage").text("Verifying medical certificate...");
  $("#loadingMessage").show();

  try {
    await validateDoctorCertificate(data.medicalCertificate, data.licenseNumber);

    const fhirDoctor = {
      resourceType: "Practitioner",
      name: [{ family: data.lastName, given: [data.firstName] }],
      telecom: [
        { system: "phone", value: data.phoneNumber },
        { system: "email", value: data.email },
      ],
      address: [{ use: "work", line: [data.address] }],
      gender: data.gender,
      birthDate: data.birthDate,
      qualification: [
        {
          identifier: [{ system: "http://example.org/licenses", value: data.licenseNumber }],
          code: { text: data.specialty },
          extension: [{
            url: "http://example.org/fhir/StructureDefinition/yearsOfExperience",
            valueInteger: parseInt(data.yearsOfExperience),
          }]
        }
      ],
    };

    const formatted = formatDoctorData(fhirDoctor, publicKey);
    const buffer = Buffer.from(formatted);

    ipfs.files.add(buffer, async (error, result) => {
      if (error) return console.error("IPFS upload error:", error);
      const ipfsHash = result[0].hash;

      await userRegistry.methods
      await userRegistry.methods
      .addDoctor(
        data.firstName,
        data.lastName,
        parseInt(data.age),
        ipfsHash,
        data.licenseNumber
      )
      .send({ from: publicKey, gas: 1000000 });
    
      location.replace("./doctor.html");
    });
  } catch (err) {
    console.error("Doctor validation failed:", err);
    alert("Certificate validation failed: " + err);
  }
}

// ================= Proxy Registration =================
async function registerProxy(ipfs, Buffer, publicKey, data) {
  if (data.age < 18) {
    alert("Proxies must be 18 years or older to register.");
    return;
  }

  try {
    const { isToken, hashOrToken } = await handleProxyRegistration(
      data.proxyOption, data.token, data.poaDocument, ipfs, Buffer
    );

    const ethAddressParam = isToken
      ? "0x0000000000000000000000000000000000000000"
      : data.patientEthereumAddress;

    if (!isToken && !web3.utils.isAddress(data.patientEthereumAddress)) {
      alert("Invalid Ethereum address for patient.");
      return;
    }

    const fhirProxy = {
      resourceType: "RelatedPerson",
      name: [{ family: data.lastName, given: [data.firstName] }],
      telecom: [
        { system: "phone", value: data.phoneNumber },
        { system: "email", value: data.email },
      ],
      address: [{ use: "home", line: [data.address] }],
      gender: data.gender,
      birthDate: data.birthDate,
    };

    const formatted = JSON.stringify(fhirProxy);
    const buffer = Buffer.from(formatted);

    ipfs.files.add(buffer, async (error, result) => {
      if (error) return console.error("IPFS error:", error);

      const ipfsHash = result[0].hash;

      await userRegistry.methods
  .addProxy(
    data.firstName,
    data.lastName,
    parseInt(data.age),
    ipfsHash,
    isToken,
    hashOrToken,
    ethAddressParam
  )
  .send({ from: publicKey, gas: 1000000 });


      location.replace("./proxy.html");
    });
  } catch (error) {
    console.error("Proxy registration failed:", error);
    $("#poaValidationError").show();
    $("#poaValidationErrorMessage").text(error);
  }
}

// ================= Utility / Helper Functions =================
async function checkLicenseUniqueness(licenseNumber) {
  return await userRegistry.methods.isLicenseRegistered(licenseNumber).call();
}

function toggleFields() {
  var designation = $("#designation").val();
  $("#commonFields").css("display", designation !== "" ? "block" : "none");
  $("#doctorFields").css("display", designation === "1" ? "block" : "none");
  $("#proxyFields").css("display", designation === "2" ? "block" : "none");

  if (designation === "2") toggleProxyOptionFields();
}

function toggleProxyOptionFields() {
  var proxyOption = $("#proxyOption").val();
  $("#tokenInputField").css("display", proxyOption === "token" ? "block" : "none");
  $("#poaFields").css("display", proxyOption === "poa" ? "block" : "none");
}

function formatPatientData(patientData, publicKey) {
  let dataString = "";
  dataString += `First Name: ${patientData.name[0].given.join(" ")}\n`;
  dataString += `Last Name: ${patientData.name[0].family}\n`;
  dataString += `Gender: ${patientData.gender}\n`;
  dataString += `Birth Date: ${patientData.birthDate}\n`;
  dataString += `Contact: ${patientData.telecom.map(t => `${t.system}: ${t.value}`).join(", ")}\n`;
  dataString += `Address: ${patientData.address.map(a => a.line.join(", ")).join(", ")}\n`;
  dataString += `Public Key: ${publicKey}\n`;
  return dataString;
}

function formatDoctorData(doctorData, publicKey) {
  let dataString = `Doctor Information\n`;
  dataString += `First Name: ${doctorData.name[0].given.join(" ")}\n`;
  dataString += `Last Name: ${doctorData.name[0].family}\n`;
  dataString += `Gender: ${doctorData.gender}\n`;
  dataString += `Birth Date: ${doctorData.birthDate}\n`;
  dataString += `Contact: ${doctorData.telecom.map(t => `${t.system}: ${t.value}`).join(", ")}\n`;
  dataString += `Address: ${doctorData.address.map(a => a.line.join(", ")).join(", ")}\n`;
  dataString += `Years of Experience: ${doctorData.yearsOfExperience || ""}\n`;
  dataString += `Specialty: ${doctorData.specialty || ""}\n`;
  dataString += `License Number: ${doctorData.licenseNumber || ""}\n`;
  dataString += `Public Key: ${publicKey}\n`;
  return dataString;
}

function formatProxyData(proxyData, publicKey, proxyOption, hashOrToken, patientEthereumAddress) {
  let dataString = `Proxy Information\n`;
  dataString += `First Name: ${proxyData.name[0].given.join(" ")}\n`;
  dataString += `Last Name: ${proxyData.name[0].family}\n`;
  dataString += `Gender: ${proxyData.gender}\n`;
  dataString += `Birth Date: ${proxyData.birthDate}\n`;
  dataString += `Contact: ${proxyData.telecom.map(t => `${t.system}: ${t.value}`).join(", ")}\n`;
  dataString += `Address: ${proxyData.address.map(a => a.line.join(", ")).join(", ")}\n`;
  dataString += `Patient Ethereum Address: ${patientEthereumAddress}\n`;
  dataString += `Public Key: ${publicKey}\n`;
  dataString += `Proxy Option: ${proxyOption.toUpperCase()}\n`;
  if (proxyOption === "token") dataString += `Token: ${hashOrToken}\n`;
  if (proxyOption === "poa") dataString += `POA Document Hash: ${hashOrToken}\n`;
  return dataString;
}

// ================= Proxy Helper =================
function handleProxyRegistration(proxyOption, token, poaDocument, ipfs, Buffer) {
  const proxyFirstName = $("#firstName").val();
  const proxyLastName = $("#lastName").val();
  const proxyDOB = $("#dob").val();
  const proxyAddress = $("#address").val();
  const proxyPhone = $("#phone").val();
  const proxyEmail = $("#email").val();

  const formDetails = {
    firstName: proxyFirstName,
    lastName: proxyLastName,
    dob: proxyDOB,
    address: proxyAddress,
    phone: proxyPhone,
    email: proxyEmail,
  };

  return new Promise((resolve, reject) => {
    if (proxyOption === "token") {
      userRegistry.methods.getTokenToPatient(token).call()
        .then(patientAddress => {
          if (!patientAddress || patientAddress === "0x0000000000000000000000000000000000000000") {
            alert("Invalid token or no patient associated with this token.");
            return;
          }
          userRegistry.methods.getProxyDetailsHash(patientAddress).call()
            .then(storedDetailsHash => {
              const enteredDetailsConcat = `${proxyFirstName}${proxyLastName}${proxyDOB}${proxyAddress}${proxyPhone}${proxyEmail}`;
              const enteredDetailsHash = web3.utils.sha3(enteredDetailsConcat);

              if (enteredDetailsHash !== storedDetailsHash) {
                alert("The details you entered do not match the designated proxy's details.");
                return;
              }
              resolve({ isToken: true, hashOrToken: token });
            }).catch(err => console.error(err));
        }).catch(err => console.error(err));
    } else if (proxyOption === "poa") {
      if (!poaDocument) return reject("POA document is required for this option.");
      const reader = new FileReader();
      reader.onloadend = function() {
        const buffer = Buffer.from(reader.result);
        validatePOADetails(buffer, formDetails)
          .then(isValid => {
            if (!isValid) return reject("POA document details do not match registration form input.");
            ipfs.files.add(buffer, (error, result) => {
              if (error) return reject("IPFS upload error: " + error.message);
              resolve({ isToken: false, hashOrToken: result[0].hash });
            });
          })
          .catch(err => reject("Error validating POA document: " + err));
      };
      reader.onerror = (err) => reject("Error reading POA document: " + err.message);
      reader.readAsArrayBuffer(poaDocument);
    } else reject("Invalid proxy option provided.");
  });
}

// ================= POA Validation =================
async function validatePOADetails(buffer, formDetails) {
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(i => i.str.replace(/\s+/g," ")).join(" ").toLowerCase();
  }

  const normalized = {
    firstName: formDetails.firstName.toLowerCase().replace(/\s+/g," "),
    lastName: formDetails.lastName.toLowerCase().replace(/\s+/g," "),
    email: formDetails.email.toLowerCase().trim(),
    address: formDetails.address.toLowerCase().replace(/\s+/g," ")
  };

  const legalTerms = ["medical power of attorney","health care decisions","agent","principal","authority","life support","incompetent"];
  const missingTerms = legalTerms.filter(t => !fullText.includes(t));
  const allLegalTermsPresent = missingTerms.length === 0;

  const matchesAddress = fullText.includes(normalized.address);
  const matchesFirstName = fullText.includes(normalized.firstName);
  const matchesLastName = fullText.includes(normalized.lastName);
  const matchesEmail = fullText.includes(normalized.email);

  const allDetailsMatch = matchesFirstName && matchesLastName && matchesEmail && matchesAddress && allLegalTermsPresent;

  console.log("All Legal Terms Present:", allLegalTermsPresent);
  console.log("Does Address Match:", matchesAddress);
  console.log("Do All Details Match:", allDetailsMatch);

  return allDetailsMatch;
}

// ================= Doctor Certificate Validation =================
function validateDoctorCertificate(file, licenseNumber) {
  return new Promise((resolve, reject) => {
    Tesseract.recognize(file, "eng", { logger: m => console.log(m) })
      .then(({ data: { text } }) => {
        const normalizedInputLicense = licenseNumber.replace(/[^a-zA-Z0-9]/g,"").toLowerCase();
        const licenseRegex = new RegExp(normalizedInputLicense, "i");
        if (!licenseRegex.test(text.replace(/[^a-zA-Z0-9]/g,"").toLowerCase())) {
          alert("License number does not match document.");
          reject("License number does not match document.");
          return;
        }

        const dateRegex = /Expiration Date: (\d{2}\/\d{2}\/\d{4})/;
        const dateMatch = text.match(dateRegex);
        if (dateMatch && dateMatch[1]) {
          const expirationDate = new Date(dateMatch[1]);
          if (expirationDate.getTime() < new Date().getTime()) {
            alert(`Certificate expired on ${expirationDate.toLocaleDateString()}.`);
            reject(`Certificate expired on ${expirationDate.toLocaleDateString()}.`);
          } else resolve("Certificate valid and not expired.");
        } else {
          alert("Expiration date could not be extracted.");
          reject("Expiration date could not be extracted.");
        }
      })
      .catch(err => reject("OCR Error: " + err));
  });
}
