var ipfs = window.IpfsApi("localhost", "5001");

const Buffer = window.IpfsApi().Buffer;

var ailmentsDict = {};
ailmentsDict[0] = "Common Flu";
ailmentsDict[1] = "Viral Infection";
ailmentsDict[2] = "Cancer";
ailmentsDict[3] = "Tumor";
ailmentsDict[4] = "Covid-19";
ailmentsDict[5] = "Heart-Disorder";
ailmentsDict[6] = "Other";
var url_string = window.location.href;
var url = new URL(url_string);
var key;
var docName = "";

toggleRecordsButton = 0;

console.log("doctor.js loaded");

async function loadDoctorData() {
  if (!userRegistry || !accessControl) {
    console.error("Contracts not initialized yet!");
    return;
  }

  $(".alert-danger").hide();

  try {
    const accounts = await ethereum.request({ method: "eth_accounts" });
    key = accounts[0].toLowerCase();

    // Display the info of the current doctor
    const doctor = await userRegistry.methods.getDoctor(key).call({ gas: 1000000 });
    const firstName = doctor[0];
    const lastName = doctor[1];
    const age = doctor[2];
    docName = firstName + " " + lastName;
    $("#name").html(docName);
    $("#age").html(age);

    // Get the patient access list for the doctor
    const patientAddressList = await accessControl.methods
      .getAccessedPatientListForDoctor(key)
      .call({ gas: 1000000 });
    console.log("Patient list:", patientAddressList);

    const table = document.getElementById("viewPatient");
    while (table.rows.length > 1) table.deleteRow(1); // Clear previous entries

    for (const patientAddress of patientAddressList) {
      const patient = await userRegistry.methods.getPatient(patientAddress).call({ gas: 1000000 });
      const patientFirstName = patient[0];
      const patientLastName = patient[1];
      const publicKey = patientAddress;

      const row = table.insertRow(-1);
      const cell1 = row.insertCell(0);
      const cell2 = row.insertCell(1);
      const cell3 = row.insertCell(2);

      cell1.className = "patientName";
      cell2.className = "publicKeyPatient";
      cell1.innerHTML = patientFirstName + " " + patientLastName;
      cell2.innerHTML = publicKey;
      cell3.innerHTML =
        '<input class="btn btn-success" onclick="showRecords(this)" id="viewRecordsButton" type="button" value="View records"></input>';
    }
  } catch (err) {
    console.error("Error loading doctor data:", err);
  }
}

// Listen for contractsReady event
window.addEventListener("contractsReady", async () => {
  console.log("contractsReady event received in doctor.js");
  console.log("userRegistry:", window.userRegistry);

  await loadDoctorData();
  loadAppointmentRequests();
  loadAppointmentHistory();
});
// Function to display the patients' medical records
function showRecords(element) {
  var table = document.getElementById("viewPatient");
  var index = element.parentNode.parentNode.rowIndex;
  var patientAddress = table.rows[index].cells[1].innerHTML;

  if (toggleRecordsButton % 2 == 0) {
    var patientRecord = "";

    // get the hash of the record from blockchain

    medicalDataRegistry.methods
      .getHash(patientAddress)
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          // get the record from the IPFS location

          $.get("http://localhost:8080/ipfs/" + result, function (data) {
            patientRecord = data;

            // Create download button

            var downloadButton = $("<button/>", {
              text: "Download Medical Record",
              class: "btn btn-primary",
              click: function () {
                downloadMedicalRecord(data);
              },
            });

            // Insert download button above the patient records

            var downloadButtonContainer = $("<div/>", {
              id: "downloadButtonContainer",
              class: "download-button-container",
            }).append(downloadButton);

            // Create the content for the patient records

            var content = `
              <div class="tab-content">
                <div id="view${patientAddress}">
                  <div class="row">
                    <div class="col-sm-12">
                      <pre style="margin: 20px 0;" id="records${patientAddress}">${patientRecord}</pre>
                    </div>
                  </div>
                  <hr>
                  <div class="section diagnosis-section">
                    <h5 class="diagnosis-title">Diagnosis Submission</h5>
                    <div class="form-group">
                      <label for="ailmentsList${patientAddress}" class="form-label">Diagnosis:</label>
                      <select class="form-control" id="ailmentsList${patientAddress}" required>
                        <option selected disabled>-- Please Select --</option>
                        <option value="0">Common Flu</option>
                        <option value="1">Viral Infection</option>
                        <option value="2">Cancer</option>
                        <option value="3">Tumor</option>
                        <option value="4">Covid-19</option>
                        <option value="5">Heart Disorder</option>
                        <option value="6">Other</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="clinicalStatus${patientAddress}" class="form-label">Clinical Status:</label>
                      <select class="form-control" id="clinicalStatus${patientAddress}" required>
                        <option selected disabled>-- Please Select --</option>
                        <option value="active">Active</option>
                        <option value="remission">Remission</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="severity${patientAddress}" class="form-label">Severity:</label>
                      <select class="form-control" id="severity${patientAddress}" required>
                        <option selected disabled>-- Please Select --</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="affectedArea${patientAddress}" class="form-label">Affected Area:</label>
                      <input type="text" class="form-control" id="affectedArea${patientAddress}" placeholder="Enter affected body area" required>
                    </div>
                    <div class="form-group">
                      <label for="details" class="form-label">Details:</label>
                      <textarea class="form-control" rows="5" id="details" placeholder="Enter details to be added" name="Details" required autofocus></textarea>
                    </div>
                    <div class="form-group">
                      <button class="btn btn-primary" onclick="submitDiagnosis(this, ${index})">Submit</button>
                    </div>
                  </div>
                  <hr>
                  <div class="section treatment-plan-section">
                    <h5>Treatment Plan</h5>
                    <div class="form-group">
                      <label>Medication Name:</label>
                      <input type="text" class="form-control" id="medicationName${patientAddress}">
                    </div>
                    <div class="form-group">
                      <label>Dose:</label>
                      <input type="text" class="form-control" id="dose${patientAddress}">
                    </div>
                    <div class="form-group">
                      <label>Route of Administration:</label>
                      <select id="route${patientAddress}" class="form-control">
                        <option value="">Select</option>
                        <option value="oral">Oral</option>
                        <option value="intravenous">Intravenous</option>
                        <option value="inhalation">Inhalation</option>
                        <option value="subcutaneous">Subcutaneous</option>
                        <option value="intramuscular">Intramuscular</option>
                        <option value="topical">Topical</option>
                        <option value="rectal">Rectal</option>
                        <option value="sublingual">Sublingual</option>
                        <option value="nasal">Nasal</option>
                        <option value="ophthalmic">Ophthalmic</option>
                        <option value="otic">Otic</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label>Frequency:</label>
                      <input type="text" class="form-control" id="frequency${patientAddress}">
                    </div>
                    <div class="form-group">
                      <label>Additional Instructions:</label>
                      <textarea class="form-control" id="instructions${patientAddress}"></textarea>
                    </div>
                    <button class="btn btn-primary" onclick="submitTreatmentPlan(this, ${index})">Submit</button>
                  </div>
                </div>
              </div>
            `;

            // Only show patient records if Share Records tab is active
            var newRow = table.insertRow(index + 1);
            newRow.classList.add("recordRow");
            
            var newCell = newRow.insertCell(0);
            newCell.colSpan = 3;
            
            newCell.append(downloadButtonContainer[0]);
            newCell.innerHTML += content;
            

          });
        } else {
          console.log(error);
        }
      });

    toggleRecordsButton += 1;
    element.value = "Hide Records";
    element.className = "btn btn-danger";
  } else {
    var row = table.rows[index + 1];
    $(row).remove();
    $("#downloadLinkContainer").empty();
    toggleRecordsButton -= 1;
    element.value = "View Records";
    element.className = "btn btn-success";
  }
}

// Function to get the current date and time
function getDateTime() {
  function AddZero(num) {
    return num >= 0 && num < 10 ? "0" + num : num + "";
  }
  var now = new Date();
  var strDateTime = [
    [
      AddZero(now.getDate()),
      AddZero(now.getMonth() + 1),
      now.getFullYear(),
    ].join("/"),
    [AddZero(now.getHours()), AddZero(now.getMinutes())].join(":"),
    now.getHours() >= 12 ? "PM" : "AM",
  ].join(" ");
  return strDateTime;
}

// Function to send the diagnosis to a patient and add it to the medical record
function submitDiagnosis(element, index) {
  var table = document.getElementById("viewPatient");
  var patientAddress = table.rows[index].cells[1].innerHTML;

  // Get form details
  var diagnosisIndex = $("#ailmentsList" + patientAddress).val();
  var clinicalStatus = $("#clinicalStatus" + patientAddress).val();
  var severity = $("#severity" + patientAddress).val();
  var affectedArea = $("#affectedArea" + patientAddress).val();
  var otherDetails = $("#details").val();

  if (!diagnosisIndex || !clinicalStatus || !severity || !affectedArea) {
    alert("Please fill in all fields.");
    return;
  }

  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];

    // Get the doctor's appointments
    appointmentManager.methods
      .getDoctorAppointments(doctorAddress)
      .call({ from: doctorAddress })
      .then(function (appointmentIds) {
        let foundAppointment = null;

        const checks = appointmentIds.map((id) =>
          appointmentManager.methods.appointments(id).call().then((appointment) => {
            if (
              appointment.patientAddress.toLowerCase() === patientAddress.toLowerCase() &&
              appointment.isAccepted &&
              !appointment.diagnosisSubmitted
            ) {
              foundAppointment = { ...appointment, id: id };
            }
          })
        );

        Promise.all(checks).then(() => {
          if (!foundAppointment) {
            alert("No accepted appointment found for this patient.");
            return;
          }

          // Create FHIR resource
          var datetime = getDateTime();
          var diagnosis = parseInt(diagnosisIndex);
          var diagnosed = ailmentsDict[diagnosis];
          var comments = otherDetails;

          var fhirConditionResource = {
            resourceType: "Condition",
            clinicalStatus: {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
                  code: clinicalStatus,
                },
              ],
            },
            severity: {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/condition-severity",
                  code: severity,
                },
              ],
            },
            code: { text: diagnosis },
            bodySite: [{ text: affectedArea }],
            onsetDateTime: datetime,
            note: [{ text: comments }],
          };

          // Append new record to old records
          var oldRecords = $("#records" + patientAddress).html();
          var newRecords = `Diagnosed By : ${docName}
Diagnosis Time : ${datetime}
Diagnosis : ${diagnosed}
Clinical Status: ${clinicalStatus}
Severity: ${severity}
Affected Area: ${affectedArea}
Comments : ${comments}
`;

          var updatedRecords = oldRecords + newRecords;
          updatedRecords.fhirConditionResource = fhirConditionResource;

          // Convert to buffer and upload to IPFS
          var buffer = Buffer.from(updatedRecords);
          ipfs.files.add(buffer, (error, result) => {
            if (error) {
              console.error("Error adding file to IPFS:", error);
              return;
            }

            var ipfsHash = result[0].hash;

            // Call new contract function
            diagnosisAndTreatment.methods
              .submitDiagnosis(foundAppointment.id, ipfsHash)
              .send({ from: doctorAddress, gas: 1000000 })
              .on("transactionHash", function (hash) {
                console.log("Transaction Hash:", hash);
              })
              .on("confirmation", function (confirmationNumber, receipt) {
                console.log("Confirmation:", confirmationNumber, receipt);
              })
              .on("receipt", async function () {
                alert("Diagnosis successfully submitted.");
              
                // Reload everything safely
                loadDoctorData();
              
                $("#appointmentRequests tr:gt(0)").remove();
                $("#appointmentHistory tr:gt(0)").remove();
              
                loadAppointmentRequests();
                loadAppointmentHistory();
              });
              
          });
        });
      })
      .catch((err) => console.error("Error fetching appointments:", err));
  });
}


// Function to send treatmnt plan to a patint
function submitTreatmentPlan(element, index) {
  var table = document.getElementById("viewPatient");
  var patientAddress = table.rows[index].cells[1].innerHTML;

  // Get form details
  var medicationName = $("#medicationName" + patientAddress).val();
  var dose = $("#dose" + patientAddress).val();
  var route = $("#route" + patientAddress).val();
  var frequency = $("#frequency" + patientAddress).val();
  var instructions = $("#instructions" + patientAddress).val();
  var datetime = getDateTime();

  if (!medicationName || !dose || !route || !frequency || !instructions) {
    alert("Please fill in all fields.");
    return;
  }

  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];

    appointmentManager.methods
      .getDoctorAppointments(doctorAddress)
      .call({ from: doctorAddress })
      .then(function (appointmentIds) {
        let foundAppointmentId = null;

        const checks = appointmentIds.map((id) =>
          appointmentManager.methods.appointments(id).call().then((appointment) => {
            if (
              appointment.patientAddress.toLowerCase() === patientAddress.toLowerCase() &&
              appointment.isAccepted &&
              appointment.diagnosisSubmitted &&
              !appointment.treatmentPlanSubmitted
            ) {
              foundAppointmentId = id;
            }
          })
        );

        Promise.all(checks).then(() => {
          if (!foundAppointmentId) {
            alert("No suitable appointment found or diagnosis not yet submitted.");
            return;
          }

          // Create FHIR resource
          var oldRecords = $("#records" + patientAddress).html();
          var newRecords = `Treated By : ${docName}
Treatment Time : ${datetime}
Medication Name: ${medicationName}
Dose: ${dose}
Route: ${route}
Frequency: ${frequency}
Instructions: ${instructions}
`;

          var fhirMedicationRequest = {
            resourceType: "MedicationRequest",
            extension: [
              { url: "http://example.org/fhir/StructureDefinition/newRecords", valueString: newRecords },
            ],
            status: "active",
            intent: "order",
            medicationCodeableConcept: { text: medicationName },
            authoredOn: datetime,
            dosageInstruction: [
              {
                text: instructions,
                timing: { repeat: { frequency: parseInt(frequency) } },
                doseAndRate: [{ doseQuantity: { value: dose } }],
                route: { text: route },
              },
            ],
          };

          var updatedRecords = oldRecords + newRecords;
          updatedRecords.fhirMedicationRequest = fhirMedicationRequest;

          // Convert to buffer and upload to IPFS
          var buffer = Buffer.from(updatedRecords);
          ipfs.files.add(buffer, (error, result) => {
            if (error) {
              console.error("Error uploading treatment plan to IPFS:", error);
              return;
            }

            var ipfsHash = result[0].hash;

            // Call new contract function
            diagnosisAndTreatment.methods
              .submitTreatmentPlan(foundAppointmentId, ipfsHash)
              .send({ from: doctorAddress, gas: 1000000 })
              .on("transactionHash", function (hash) {
                console.log("Transaction Hash:", hash);
              })
              .on("confirmation", function (confirmationNumber, receipt) {
                console.log("Confirmation:", confirmationNumber, receipt);
              })
              .on("receipt", function (receipt) {
                alert("Treatment plan successfully submitted.");
              })
              .on("error", function (err) {
                console.error(err);
              });
          });
        });
      })
      .catch((err) => console.error("Error fetching appointments:", err));
  });
}

// Function to load appointment requsts rceived from patients
function loadAppointmentRequests() {
  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];

    // Fetching appointment IDs associated with the doctor

    appointmentManager.methods
      .getDoctorAppointments(doctorAddress)
      .call({ from: doctorAddress })
      .then(function (appointmentIds) {
        appointmentIds.forEach(function (id) {
          // Fetching each appointment from the blockchain

          appointmentManager.methods
            .appointments(id)
            .call()
            .then(function (appointment) {
              if (!appointment.isAccepted) {
                // Fetching additional details from IPFS
                fetchFromIPFS(appointment.ipfsHash, function (appointmentData) {
                  displayAppointmentRequest(id, appointmentData);
                });
              }
            });
        });
      })
      .catch(function (error) {
        console.error("Error loading appointment requests:", error);
      });
  });
}

// Function to display the requests
function displayAppointmentRequest(id, appointment) {
  var row = $("<tr>");

  // Extracting information from the appointment object

  var patientInfo = appointment.participant.find((p) =>
    p.actor.reference.startsWith("Patient")
  );
  var doctorInfo = appointment.participant.find((p) =>
    p.actor.reference.startsWith("Practitioner")
  );
  var patientName = patientInfo ? patientInfo.actor.display : "Unknown";
  var match = appointment.start.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{1,2}):(\d{2}):(\d{2})Z$/
  );

  // Check if the date format matches the expected pattern

  if (match) {
    // Create a new date object from the parts

    var date = new Date(
      Date.UTC(
        parseInt(match[1], 10),
        parseInt(match[2], 10) - 1, // Months are 0-indexed
        parseInt(match[3], 10),
        parseInt(match[4], 10),
        parseInt(match[5], 10),
        parseInt(match[6], 10)
      )
    );

    // Convert the date and time to the local time zone

    var appointmentDate = date.toISOString().substring(0, 10);
    var appointmentTime = date.toISOString().substring(11, 16);
    console.log(appointmentTime);
  } else {
    console.error("Invalid date format:", appointment.start);
    var appointmentDate = "Invalid Date";
    var appointmentTime = "Invalid Time";
  }
  var appointmentStatus = appointment.status;

  // Displaying information in the table

  $("<td>").text(patientName).appendTo(row);
  $("<td>").text(appointmentDate).appendTo(row);
  $("<td>").text(appointmentTime).appendTo(row);
  $("<td>").text(appointmentStatus).appendTo(row);

  var actionsCell = $("<td>").appendTo(row);
  $("<button>")
    .text("Accept")
    .addClass("btn btn-success")
    .click(function () {
      acceptAppointment(id);
    })
    .appendTo(actionsCell);
  $("<button>")
    .text("Reject")
    .addClass("btn btn-danger")
    .click(function () {
      rejectAppointment(id);
    })
    .appendTo(actionsCell);

  $("#appointmentRequests").append(row);
}

// Function to load the history of appointments accepted so far
function loadAppointmentHistory() {
  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];

    // Fetching appointment IDs associated with the doctor

    appointmentManager.methods
      .getDoctorAppointments(doctorAddress)
      .call({ from: doctorAddress })
      .then(function (appointmentIds) {
        appointmentIds.forEach(function (id) {
          // Fetching each appointment from the blockchain

          appointmentManager.methods
            .appointments(id)
            .call()
            .then(function (appointment) {
              // Fetch additional details from IPFS
              fetchFromIPFS(appointment.ipfsHash, function (appointmentData) {
                const status = appointment.isAccepted
                  ? "Accepted"
                  : appointment.isRejected
                  ? "Rejected"
                  : "Pending";
                displayAppointmentHistory(id, appointmentData, status);
              });
            });
        });
      })
      .catch(function (error) {
        console.error("Error loading doctor appointment requests:", error);
      });
  });
}

// Function to display the history of appointments
function displayAppointmentHistory(id, appointment, status) {
  var row = $("<tr>");

  var patientInfo = appointment.participant.find((p) =>
    p.actor.reference.startsWith("Patient")
  );
  var patientName = patientInfo ? patientInfo.actor.display : "Unknown";

  var match = appointment.start.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{1,2}):(\d{2}):(\d{2})Z$/
  );

  if (match) {
    var date = new Date(
      Date.UTC(
        parseInt(match[1], 10),
        parseInt(match[2], 10) - 1,
        parseInt(match[3], 10),
        parseInt(match[4], 10),
        parseInt(match[5], 10),
        parseInt(match[6], 10)
      )
    );

    var appointmentDate = date.toISOString().substring(0, 10);
    var appointmentTime = date.toISOString().substring(11, 16);
  } else {
    var appointmentDate = "Invalid Date";
    var appointmentTime = "Invalid Time";
  }

  $("<td>").text(patientName).appendTo(row);
  $("<td>").text(appointmentDate).appendTo(row);
  $("<td>").text(appointmentTime).appendTo(row);
  var statusCell = $("<td>").text(status).appendTo(row);
  if (status === "Accepted") {
    statusCell.addClass("accepted-status");
  } else if (status === "Rejected") {
    statusCell.addClass("rejected-status");
  } else if (status === "Pending") {
    statusCell.addClass("pending-status");
  } else {
    statusCell.addClass("unknown-status");
  }

  $("#appointmentHistory tbody").append(row);
}

// Function to accept an appointment
function acceptAppointment(appointmentId) {
  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];
    // Get the appointment's id
    appointmentManager.methods
      .appointments(appointmentId)
      .call()
      .then(function (appointmentToAccept) {
        // Fetch all appointments for the doctor and check for conflicts

        appointmentManager.methods
          .getDoctorAppointments(doctorAddress)
          .call()
          .then(function (appointmentIds) {
            let conflict = false;
            let promises = appointmentIds.map((id) => {
              return appointmentManager.methods
                .appointments(id)
                .call()
                .then((otherAppointment) => {
                  // Check if any appointment is at the same time and is already accepted
                  if (
                    otherAppointment.date === appointmentToAccept.date &&
                    otherAppointment.hour === appointmentToAccept.hour &&
                    otherAppointment.isAccepted &&
                    otherAppointment.doctorAddress === doctorAddress &&
                    id !== appointmentId
                  ) {
                    conflict = true;
                  }
                });
            });

            Promise.all(promises).then(() => {
              if (conflict) {
                alert("An appointment is already booked for this time slot.");
              } else {
                // If no conflict, proceed to accept the appointment

                appointmentManager.methods
                  .acceptAppointment(appointmentId)
                  .send({ from: doctorAddress })
                  .then(function (result) {
                    console.log("Appointment accepted. Transaction:", result);
                    notifyPatient(appointmentId, "Accepted");
                    alert("Appointment Accepted");
                  })
                  .catch(function (error) {
                    console.error("Error accepting appointment:", error);
                    alert("Failed to accept appointment: " + error.message);
                  });
              }
            });
          });
      })
      .catch(function (error) {
        console.error("Error fetching appointment details:", error);
        alert("Failed to fetch appointment details.");
      });
  });
}

// Function to reject an appointment
function rejectAppointment(appointmentId) {
  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];
    appointmentManager.methods
      .appointments(appointmentId)
      .call()
      .then(function (appointment) {
        // Notify the patient before the appointment is deleted

        notifyPatient(appointmentId, "Rejected", appointment.patientAddress);
        return appointmentManager.methods
          .rejectAppointment(appointmentId)
          .send({ from: doctorAddress });
      })
      .then(function (result) {
        console.log("Appointment rejected. Transaction:", result);

        alert("Appointment Rejected");
      })
      .catch(function (error) {
        console.error("Error rejecting appointment:", error);
        alert("Failed to reject appointment.");
      });
  });
}

// Function to send a notification email to patient when an appointment has been accepted or rejected
function notifyPatient(appointmentId, status) {
  console.log(
    `Notification Triggered: Appointment ID: ${appointmentId}, Status: ${status}`
  );

  // Get appointments

  appointmentManager.methods
    .appointments(appointmentId)
    .call()
    .then(function (appointment) {
      const patientAddress = appointment.patientAddress;
      if (!patientAddress) {
        console.error("Patient address is undefined.");
        return;
      }

      console.log(`Patient Address: ${patientAddress}`);

      // Get the hash of the record

      medicalDataRegistry.methods
        .getHash(patientAddress)
        .call()
        .then(function (ipfsHash) {
          console.log(`IPFS Hash: ${ipfsHash}`);
          if (!ipfsHash) {
            console.error("IPFS hash for patient data is undefined.");
            return;
          }

          // Fetch appointment dtails from IPFS
          fetchFromIPFS(appointment.ipfsHash, function (appointmentDetails) {
            // Assuming appointmentDetails is an object with a start property containing the start time of the appointment
            if (!appointmentDetails || !appointmentDetails.start) {
              console.error(
                "Appointment details are undefined or do not contain start time."
              );
              return;
            }

            var match = appointmentDetails.start.match(
              /^(\d{4})(\d{2})(\d{2})T(\d{1,2}):(\d{2}):(\d{2})Z$/
            );
            if (match) {
              // Format the date as a valid ISO string
              // Pad the hour with a leading zero if it's a single digit to ensure correct parsing

              const hourPadded =
                match[4].length === 1 ? `0${match[4]}` : match[4];
              const isoFormattedString = `${match[1]}-${match[2]}-${match[3]}T${hourPadded}:${match[5]}:${match[6]}Z`;
              const appointmentDateTime = new Date(isoFormattedString);

              // Specify options to ensure the format and use UTC to avoid timezone issues

              var appointmentDate = appointmentDateTime.toLocaleDateString(
                "en-US",
                { timeZone: "UTC" }
              );
              var appointmentTime = appointmentDateTime.toLocaleTimeString(
                "en-US",
                { timeZone: "UTC", hour12: false }
              );

              console.log(
                `Appointment Date: ${appointmentDate}, Appointment Time: ${appointmentTime}`
              );
            } else {
              console.error("Invalid date format:", appointmentDetails.start);
            }
            fetchFromIPFS(ipfsHash, function (patientDataText) {
              // Split the data by lines
              const lines = patientDataText.split("\n");
              // Find the line with the email
              const contactLine = lines.find((line) =>
                line.startsWith("Contact:")
              );
              if (!contactLine) {
                console.error("Contact line not found in the patient data.");
                return;
              }
              // Extract the email address from the contact line
              const emailPart = contactLine
                .split(",")
                .find((part) => part.trim().startsWith("email:"));
              if (!emailPart) {
                console.error("Email address not found in the contact line.");
                return;
              }
              const patientEmail = emailPart.split("email:")[1].trim();
              console.log(`Email to be notified: ${patientEmail}`);

              const firstNameLine = lines.find((line) =>
                line.startsWith("First Name:")
              );
              const lastNameLine = lines.find((line) =>
                line.startsWith("Last Name:")
              );
              const firstName = firstNameLine.split(":")[1].trim();
              const lastName = lastNameLine.split(":")[1].trim();
              const patientName = `${firstName} ${lastName}`;

              var templateParams = {
                doctor_name: docName,
                patient_name: patientName,
                patient_email: patientEmail,
                from_name: "Electronical Medical Records Service",
                appointment_date: appointmentDate,
                appointment_time: appointmentTime,
                status: status,
              };

              console.log(`Sending Email with Params:`, templateParams);

              emailjs
                .send("service_qeqnhl5", "template_wxamyw8", templateParams)
                .then(
                  function (response) {
                    console.log(
                      "Email Sent Successfully!",
                      response.status,
                      response.text
                    );
                  },
                  function (error) {
                    console.error("Failed to Send Email:", error);
                  }
                );
            });
          }).catch(function (error) {
            console.error("Error fetching patient's IPFS hash:", error);
          });
        })
        .catch(function (error) {
          console.error("Error fetching appointment details:", error);
        });
    });
}

// Clendar initialisation
$(document).ready(function () {
  var calendarEl = document.getElementById("calendar");
  var calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    events: [],
    eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: true },
    eventContent: function (arg) {
      return {
        html: `<div class="event-time">${
          arg.event.title.split(" ")[0]
        }</div><div class="event-title">${
          arg.event.extendedProps.description
        }</div>`,
      };
    },
  });

  calendar.render();

  function updateCalendarVisibility() {
    if ($("#calendar").is(":visible")) {
      calendar.updateSize();
    }
  }

  // MutationObserver Configuration
  const config = { attributes: true, childList: true, subtree: true };
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "class"
      ) {
        updateCalendarVisibility();
      }
    });
  });

  observer.observe(document.body, config);

  $(window).on("unload", function () {
    observer.disconnect();
  });

  setTimeout(function () {
    loadAcceptedAppointments(calendar);
  }, 1000);
});

// Function to load acceptd appointmnets for calndar
function loadAcceptedAppointments(calendar) {
  web3.eth
    .getAccounts()
    .then(function (accounts) {
      const doctorAddress = accounts[0];
      // Gt doctor appointments and check thir status

      appointmentManager.methods
        .getDoctorAppointments(doctorAddress)
        .call()
        .then(function (appointmentIds) {
          console.log("Appointment IDs:", appointmentIds);
          appointmentIds.forEach(function (appointmentId) {
            appointmentManager.methods
              .appointments(appointmentId)
              .call()
              .then(function (appointment) {
                if (appointment.isAccepted) {
                  console.log("Accepted Appointment:", appointment);
                  fetchFromIPFS(
                    appointment.ipfsHash,
                    function (appointmentData) {
                      console.log(
                        "Appointment Data from IPFS:",
                        appointmentData
                      );
                      addEventToCalendar(appointmentData, calendar);
                    }
                  );
                }
              })
              .catch(function (error) {
                console.error("Error fetching appointment details:", error);
              });
          });
        })
        .catch(function (error) {
          console.error("Error loading appointments:", error);
        });
    })
    .catch(function (error) {
      console.error("Error retrieving accounts:", error);
    });
}

// Function to display the time of the appointment and name of patient in the calendar
function addEventToCalendar(appointmentData, calendar) {
  if (!calendar) {
    console.error("Calendar not defined");
    return;
  }

  try {
    const date = moment(appointmentData.start, "YYYYMMDDTHH:mm:ssZ").utc();
    const formattedDate = date.format("YYYY-MM-DD");
    const formattedTime = date.format("HH:mm");

    const patientInfo = appointmentData.participant.find((p) =>
      p.actor.reference.startsWith("Patient")
    );
    const patientName = patientInfo
      ? patientInfo.actor.display
      : "Unknown Patient";

    if (patientName === "Unknown Patient") {
      console.error("Patient name is missing in appointment data");
    }

    calendar.addEvent({
      title: `${formattedTime} ${patientName}`,
      start: formattedDate + "T" + formattedTime,
      allDay: false,
      color: "rgba(255, 179, 128, 0.5)",
      textColor: "#f26d21",
      extendedProps: {
        description: patientName,
      },
    });
  } catch (e) {
    console.error("Error in adding event to calendar:", e);
  }
  
}

$(window).on("load", function () {
  // Hide all panels
  $(".panel").hide();

  // Show Personal Info panel by default
  $("#personalInfoPanel").show();

  // Load default panel data
  loadDoctorData();
});
$(".list-group-item").on("click", function (e) {
  e.preventDefault();

  const targets = $(this).data("target").split(" ");

  // Hide all panels
  $(".panel").hide();

  // Show target panels
  targets.forEach(id => {
    $("#" + id).show();
  });

  // Load data depending on panel
  if (targets.includes("personalInfoPanel")) {
    loadDoctorData();
  }

  if (targets.includes("appointmentRequestsPanel")) {
    $("#appointmentRequests tr:gt(0)").remove();
    loadAppointmentRequests();
  }

  if (targets.includes("appointmentHistoryPanel")) {
    $("#appointmentHistory tr:gt(0)").remove();
    loadAppointmentHistory();
  }

  if (targets.includes("accessibleEMRPanel")) {
    loadAccessiblePatients(); // whatever your function is called
  }
});

