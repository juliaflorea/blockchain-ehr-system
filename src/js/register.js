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
                  .add_agent(firstName, lastName, age, designation, ipfsHash)
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

            // Convert the FHIR resource to a Buffer for IPFS
            //var buffer = Buffer.from(JSON.stringify(fhirDoctorResource));
            ipfs.files.add(buffer, (error, result) => {
              if (error) {
                console.error("IPFS upload error:", error);
                return;
              }

              // Store the IPFS hash in the blockchain
              let ipfsHash = result[0].hash;
              contractInstance.methods
                .add_agent(firstName, lastName, age, designation, ipfsHash)
                .send({ from: publicKey, gas: 1000000 })
                .then((res) => {
                  location.replace("./doctor.html");
                })
                .catch((err) => {
                  console.error("Blockchain transaction error:", err);
                });
            });
          }
        }
      }
    );
  });

  return false;
}

function toggleFields() {
  var designation = document.getElementById("designation").value;
  document.getElementById("commonFields").style.display =
    designation !== "" ? "block" : "none";
  document.getElementById("doctorFields").style.display =
    designation === "1" ? "block" : "none";
  document.getElementById("submitBtn").style.display =
    designation !== "" ? "block" : "none";
}

document.getElementById("dob").addEventListener("change", function () {
  var dob = this.value;
  var age = calculateAge(new Date(dob));
  document.getElementById("age").value = age;
});

function calculateAge(dob) {
  var diff_ms = Date.now() - dob.getTime();
  var age_dt = new Date(diff_ms);
  return Math.abs(age_dt.getUTCFullYear() - 1970);
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
