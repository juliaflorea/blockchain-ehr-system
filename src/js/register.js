// ================= Main User Registration =================
async function addUser() {
  try {
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
    const fhirImportFile = document.getElementById("fhirImportFile")
      ? document.getElementById("fhirImportFile").files[0]
      : null;

    const accounts = await ethereum.request({ method: "eth_accounts" });

    if (!accounts || accounts.length === 0) {
      alert("Please connect MetaMask first.");
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
      if (fhirImportFile) {
        const password = getPatientPasswordValue();
        if (!validatePatientPassword(password)) {
          return;
        }

        const bundleJson = await readJsonFile(fhirImportFile);
        const fhirImportResult = await importFHIRMedicalRecord(bundleJson, publicKey, password);
        const importedPatientData = buildPatientRegistrationData(fhirImportResult.normalizedRecord);

        await registerPatient(ipfs, Buffer, publicKey, {
          ...importedPatientData,
          fhirImportResult,
          password,
        });
        return;
      }

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
  } catch (err) {
    console.error("Registration flow failed:", err);
    if (err && err.message && err.message !== "Weak or missing password") {
      alert(err.message);
    }
  }
}

// ================= Patient Registration (SECURE + VALIDATED) =================
async function registerPatient(ipfs, Buffer, publicKey, data) {
  try {
    console.log("🚀 Starting secure patient registration...");

    const ethAddress = publicKey.toLowerCase();

    // ---------- PASSWORD VALIDATION ----------
    const password = data.password || getPatientPasswordValue();
    if (!validatePatientPassword(password)) {
      throw new Error("Weak or missing password");
    }

    let ipfsHash;
    let wrappedRMK;
    let recoveryKey;
    let wrappedRMKRecovery;

    if (data.fhirImportResult) {
      ipfsHash = data.fhirImportResult.ipfsHash;
      wrappedRMK = data.fhirImportResult.wrappedRMK;
      recoveryKey = data.fhirImportResult.recoveryKey;
      wrappedRMKRecovery = data.fhirImportResult.wrappedRMKRecovery;
    } else {
      // ---------- Build FHIR Patient ----------
      const fhirPatient = {
        resourceType: "Patient",
        name: [{
          family: data.lastName,
          given: [data.firstName]
        }],
        gender: data.gender,
        birthDate: data.birthDate,
        telecom: [
          { system: "phone", value: data.phoneNumber },
          { system: "email", value: data.email }
        ],
        address: [{
          use: "home",
          line: [data.address]
        }]
      };

      const plaintext = JSON.stringify(fhirPatient);

      // ---------- Generate RMK ----------
      const rmk = await window.generateAESKey();

      // ---------- Encrypt patient record ----------
      const encryptedPayload = await window.encryptAES(
        plaintext,
        rmk
      );

      const ipfsBuffer = Buffer.from(
        JSON.stringify(encryptedPayload)
      );

      ipfsHash = (
        await ipfs.files.add(ipfsBuffer)
      )[0].hash;

      // ---------- Derive password UAK ----------
      const uak = await window.deriveUAK(password, ethAddress);

      // ---------- Wrap RMK with password ----------
      wrappedRMK =
        await window.wrapRMK(rmk, uak);

      // ---------- Generate Recovery Key ----------
      recoveryKey =
        window.generateRecoveryKey();

      // ---------- Derive Recovery UAK ----------
      const recoveryUAK =
        await window.deriveRecoveryUAK(
          recoveryKey,
          ethAddress
        );

      // ---------- Wrap RMK with recovery key ----------
      wrappedRMKRecovery =
        await window.wrapRMK(rmk, recoveryUAK);
    }

    // ---------- Register patient ----------
    await userRegistry.methods
      .addPatient(
        data.firstName,
        data.lastName,
        parseInt(data.age),
        ipfsHash
      )
      .send({
        from: ethAddress,
        gas: 1500000
      });

    // ---------- Store wrapped RMK (normal login) ----------
    await medicalDataRegistry.methods
      .setEncryptedAESKey(
        ethAddress,
        ethAddress,
        wrappedRMK
      )
      .send({
        from: ethAddress,
        gas: 500000
      });

    // ---------- Store recovery wrapped RMK ----------
    await medicalDataRegistry.methods
      .setRecoveryEncryptedAESKey(
        ethAddress,
        wrappedRMKRecovery
      )
      .send({
        from: ethAddress,
        gas: 500000
      });

    // ---------- Store for current session ----------
    sessionStorage.setItem("wrappedRMK", wrappedRMK);

    console.log("✅ Patient registered successfully");

    // ---------- SHOW RECOVERY KEY ----------
    document.getElementById("recoveryKeyValue").innerText =
      recoveryKey;

    $("#recoveryKeyModal").modal("show");

  } catch (err) {
    console.error("❌ Patient registration failed:", err);
    alert("Registration failed. Please check your inputs.");
  }
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
    // ---------- Determine registration type ----------
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

    // ---------- Prepare FHIR proxy record ----------
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

    // ---------- Store proxy FHIR record on IPFS ----------
    const result = await ipfs.files.add(buffer);
    const ipfsHash = result[0].hash;

    // ---------- Register proxy in UserRegistry ----------
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

    // ---------- Get patient address ----------
    let patientAddr;
    if (isToken) {
      patientAddr = await userRegistry.methods.getTokenToPatient(hashOrToken).call();
    } else {
      patientAddr = data.patientEthereumAddress.toLowerCase();
    }

    // ---------- Fetch temp wrapped RMK from IPFS safely ----------
    let tempWrappedRMK;
    try {
      const tempHash = await userRegistry.methods.getTempWrappedRMK(hashOrToken).call();
      if (!tempHash) throw new Error("No temp RMK hash returned from contract");
      const tempData = await fetch("http://localhost:8080/ipfs/" + tempHash);
      if (!tempData.ok) throw new Error(`IPFS fetch failed: ${tempData.status}`);
      tempWrappedRMK = await tempData.json();
    } catch (ipfsError) {
      console.error("Failed to fetch temp wrapped RMK from IPFS:", ipfsError);
      throw new Error("Cannot continue without temp wrapped RMK");
    }

    // ---------- Derive temp key from token ----------
    const tempKey = await window.deriveTempKeyFromToken(hashOrToken);

    // ---------- Unwrap RMK with temp key ----------
    const rmk = await window.unwrapRMK(tempWrappedRMK, tempKey);

    // ---------- Derive proxy UAK ----------
    const proxyUAK = await window.deriveUAKForDoctor(publicKey);

    // ---------- Wrap RMK for proxy ----------
    const wrappedForProxy = await window.wrapRMK(rmk, proxyUAK);

    // ---------- Patient stores key for proxy (use unlocked account) ----------
    await medicalDataRegistry.methods
  .setEncryptedAESKey(
    patientAddr,
    publicKey.toLowerCase(),
    wrappedForProxy
  )
  .send({
    from: publicKey,   // proxy sends transaction
    gas: 500000
  });

    

    // ---------- Save RMK locally ----------
    sessionStorage.setItem("rmk", wrappedForProxy);

    await userRegistry.methods
  .consumeTempRMK(hashOrToken)
  .send({ from: publicKey });


    // ---------- Redirect ----------
    location.replace("./proxy.html");

  } catch (error) {
    console.error("Proxy registration failed:", error);
    $("#poaValidationError").show();
    $("#poaValidationErrorMessage").text(error.message || error);
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
  $("#patientPasswordGroup").css("display", designation === "0" ? "block" : "none");
  $("#patientFhirImportGroup").css("display", designation === "0" ? "flex" : "none");

  togglePatientImportMode();

  if (designation === "2") toggleProxyOptionFields();
}

function getPatientPasswordValue() {
  const passwordInput = document.getElementById("patientPassword");
  return passwordInput ? passwordInput.value.trim() : "";
}

function validatePatientPassword(password) {
  const passwordError = document.getElementById("passwordError");
  const isValid = Boolean(password) && isStrongPassword(password);
  if (passwordError) {
    passwordError.style.display = isValid ? "none" : "block";
  }
  return isValid;
}

function togglePatientImportMode() {
  const designation = $("#designation").val();
  const isPatient = designation === "0";
  const hasImportFile = Boolean(document.getElementById("fhirImportFile")?.files?.length);
  const isImportMode = isPatient && hasImportFile;
  const manualFieldIds = ["firstName", "lastName", "dob", "age", "gender", "email", "phone", "address"];
  const importHint = document.getElementById("fhirImportModeHint");

  manualFieldIds.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) return;

    if (!field.dataset.wasRequired) {
      field.dataset.wasRequired = field.required ? "true" : "false";
    }

    field.disabled = isImportMode;
    field.required = isImportMode ? false : field.dataset.wasRequired === "true";

    if (isImportMode && field.tagName === "INPUT" && fieldId !== "age") {
      field.value = "";
    }

    if (isImportMode && field.tagName === "SELECT") {
      field.value = "";
    }
  });

  if (importHint) {
    importHint.style.display = isImportMode ? "block" : "none";
  }
}

async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

function getApiBaseUrl() {
  return window.__API_BASE_URL__ || "http://localhost:3000";
}

async function readApiJson(response, fallbackMessage) {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch (err) {
    const looksLikeHtml = rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html");
    if (looksLikeHtml) {
      throw new Error(`${fallbackMessage} The API returned an HTML page instead of JSON. Make sure the Node server is running on ${getApiBaseUrl()} and has been restarted after the FHIR endpoint changes.`);
    }
    throw new Error(`${fallbackMessage} The API returned an invalid JSON response.`);
  }
}

async function importFHIRMedicalRecord(bundleJson, patientAddress, password) {
  const response = await fetch(`${getApiBaseUrl()}/api/fhir/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bundleJson,
      patientAddress,
      password,
      persistOnChain: false,
    }),
  });

  const payload = await readApiJson(response, "FHIR import failed.");
  if (!response.ok) {
    throw new Error(payload.error || "FHIR import failed.");
  }

  return payload;
}

function calculateAgeFromBirthDate(birthDate) {
  if (!birthDate) return "";
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : "";
}

function buildPatientRegistrationData(record) {
  const personalInfo = record.personalInfo || {};
  return {
    firstName: personalInfo.firstName || record.name?.[0]?.given?.[0] || "",
    lastName: personalInfo.lastName || record.name?.[0]?.family || "",
    age: calculateAgeFromBirthDate(personalInfo.birthDate || record.birthDate),
    address: personalInfo.address || record.address?.[0]?.line?.join(", ") || "",
    phoneNumber: personalInfo.phoneNumber || "",
    email: personalInfo.email || "",
    gender: personalInfo.gender || record.gender || "",
    birthDate: personalInfo.birthDate || record.birthDate || "",
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const fhirImportFileInput = document.getElementById("fhirImportFile");
  if (fhirImportFileInput) {
    fhirImportFileInput.addEventListener("change", (event) => {
      const fileName = event.target.files && event.target.files[0]
        ? event.target.files[0].name
        : "Import existing medical record (FHIR)";
      const label = document.querySelector('label[for="fhirImportFile"].custom-file-label');
      if (label) label.textContent = fileName;
      togglePatientImportMode();
    });
  }

  const patientPasswordInput = document.getElementById("patientPassword");
  if (patientPasswordInput) {
    patientPasswordInput.addEventListener("input", () => {
      if (patientPasswordInput.value.trim()) {
        validatePatientPassword(patientPasswordInput.value.trim());
      } else {
        const passwordError = document.getElementById("passwordError");
        if (passwordError) passwordError.style.display = "none";
      }
    });
  }

  togglePatientImportMode();
});

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
  let yearsOfExperience = "";
  let specialty = "";
  if (doctorData.qualification && doctorData.qualification.length > 0) {
    specialty = doctorData.qualification[0].code?.text || "";
    const extension = doctorData.qualification[0].extension?.find(
      e => e.url === "http://example.org/fhir/StructureDefinition/yearsOfExperience"
    );
    if (extension) yearsOfExperience = extension.valueInteger;
  }

  let dataString = `Doctor Information\n`;
  dataString += `First Name: ${doctorData.name[0].given.join(" ")}\n`;
  dataString += `Last Name: ${doctorData.name[0].family}\n`;
  dataString += `Gender: ${doctorData.gender}\n`;
  dataString += `Birth Date: ${doctorData.birthDate}\n`;
  dataString += `Contact: ${doctorData.telecom.map(t => `${t.system}: ${t.value}`).join(", ")}\n`;
  dataString += `Address: ${doctorData.address.map(a => a.line.join(", ")).join(", ")}\n`;
  dataString += `Years of Experience: ${yearsOfExperience}\n`;
  dataString += `Specialty: ${specialty}\n`;
  dataString += `License Number: ${doctorData.qualification[0].identifier[0].value || ""}\n`;
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


function copyRecoveryKey() {
    const key = document.getElementById("recoveryKeyValue").innerText;
    navigator.clipboard.writeText(key);
    alert("Recovery key copied to clipboard");
}
