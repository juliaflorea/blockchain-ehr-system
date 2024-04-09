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

$(window).on("load", function () {
  connect();
  $(".alert-danger").hide();

  ethereum.request({ method: "eth_accounts" }).then(function (accounts) {
    key = accounts[0].toLowerCase();

    var a = 0;
    var b = 0;
    contractInstance.methods
      .get_doctor(key)
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          var firstName = result[0];
          var lastName = result[1];
          var age = result[2];
          docName = firstName + " " + lastName;
          $("#name").html(docName);
          $("#age").html(age);
        } else console.error(error);
      });
    var patientAddressList = 0;

    contractInstance.methods
      .get_accessed_patientlist_for_doctor(key)
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          patientAddressList = result;
          console.log(result);

          patientAddressList.forEach(function (patientAddress, index) {
            contractInstance.methods
              .get_patient(patientAddress)
              .call({ gas: 1000000 }, function (error, result) {
                var table = document.getElementById("viewPatient");
                if (!error) {
                  var patientFirstName = result[0];
                  var patientLastName = result[1];
                  var publicKey = patientAddress;

                  var row = table.insertRow(index + 1);
                  var cell1 = row.insertCell(0);
                  var cell2 = row.insertCell(1);
                  var cell3 = row.insertCell(2);
                  cell1.className = "patientName";
                  cell2.className = "publicKeyPatient";
                  cell1.innerHTML = patientFirstName + " " + patientLastName;
                  cell2.innerHTML = publicKey;
                  cell3.innerHTML =
                    '<input class="btn btn-success" onclick="showRecords(this)" id="viewRecordsButton" type="button" value="View records"></input>';
                } else console.error(error);
              });
          });
        } else console.error(error);
      });
  });
  loadAppointmentRequests();
});

function showRecords(element) {
  var table = document.getElementById("viewPatient");
  var index = element.parentNode.parentNode.rowIndex;
  var patientAddress = table.rows[index].cells[1].innerHTML;

  if (toggleRecordsButton % 2 == 0) {
    var patientRecord = "";

    contractInstance.methods
      .get_hash(patientAddress)
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          $.get("http://localhost:8080/ipfs/" + result, function (data) {
            patientRecord = data;
            var downloadButton = $("<button/>", {
              text: "Download Medical Record",
              class: "btn btn-primary",
              click: function () {
                downloadMedicalRecord(data);
              },
            });
            $("#downloadLinkContainer").html(downloadButton);
            content =
              `<div class="tab-content">
                <div id="view${patientAddress}">
                        <div class="row">
                            <div class="col-sm-12">
                                <pre style="margin: 20px 0;" id="records${patientAddress}">${patientRecord}</pre>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-sm-12">
                                <div class="row">
                                    <div class="form-group col-sm-10">
                                        <div class="row">
                                            <div class="col-sm-2"><label for="ailmentsList" class="control-label">Diagnosis:</label></div>
                                            <div class="col-sm-10">
                                                <select class="form-control" id="ailmentsList${patientAddress}" style="width:inherit;" required>
                                                    <option selected disabled>-- Please Select --</option>
                                                    <option value = "0">Common Flu</option>
                                                    <option value = "1">Viral Infection</option>
                                                    <option value = "2">Cancer</option>
                                                    <option value = "3">Tumor</option>
                                                    <option value = "4">Covid-19</option>
                                                    <option value = "5">Heart-Disorder</option>
                                                    <option value = "6">Other</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="row">
                                <div class="form-group col-sm-10">
                                    <div class="row">
                                        <div class="col-sm-2"><label for="clinicalStatus${patientAddress}">Clinical Status:</label></div>
                                        <div class="col-sm-10">
                                            <select class="form-control" id="clinicalStatus${patientAddress}" style="width:inherit;" required>
                                                <option selected disabled>-- Please Select --</option>
                                                <option value="active">Active</option>
                                                <option value="remission">Remission</option>
                                                <option value="resolved">Resolved</option>
                                            </select>
                                        </div>

                                        <div class="col-sm-2"><label for="severity${patientAddress}">Severity:</label></div>
                                        <div class="col-sm-10">
                                            <select class="form-control" id="severity${patientAddress}" style="width:inherit;" required>
                                                <option selected disabled>-- Please Select --</option>
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                            </select>
                                        </div>

                                        <div class="col-sm-2"><label for="affectedArea${patientAddress}">Affected Area:</label></div>
                                        <div class="col-sm-10">
                                        <input type="text" class="form-control" id="affectedArea${patientAddress}" placeholder="Enter affected body area"  style="width:inherit;" required>
                                        </div>

                                    </div>
                                </div>
                            </div>
                            

                                <div class="row">
                                    <div class="form-group col-sm-10">
                                        <div class="row">
                                            <div class="col-sm-2">
                                                <label class="control-label" for="details">Details:</label>
                                            </div>
                                            <div class="col-sm-10">
                                                <textarea class="form-control" rows="5" id="details" placeholder="Enter details to be added" name = "Details" style="width: inherit" required autofocus></textarea>
                                                <!-- <input type="text" class="form-control" id="details" placeholder="Enter details to be added" name = "Details" style="width: inherit" required autofocus> -->
                                            </div>
                                        </div>    
                                    </div>
                                    <div class="form-group col-sm-2">
                                        <button class="btn btn-primary" onclick = "submitDiagnosis(this,` +
              index +
              `)">Submit</button>
                                    </div>
                                </div>
                            </div>
                        </div>    
                    </div>
                </div>`;

            var row1 = table.insertRow(index + 1);
            var cell1 = row1.insertCell(0);
            cell1.colSpan = 3;
            cell1.innerHTML = content;
          });
        } else {
          console.log(error);
        }
      });

    toggleRecordsButton += 1;
    element.value = "Hide Records";
    element.className = "btn btn-danger";
  } else {
    row = table.rows[index + 1];
    $(row).hide();
    $("#downloadLinkContainer").empty();
    toggleRecordsButton -= 1;
    element.value = "View Records";
    element.className = "btn btn-success";
  }
}

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

function submitDiagnosis(element, index) {
  var table = document.getElementById("viewPatient");
  var patientAddress = table.rows[index].cells[1].innerHTML;

  var diagnosisIndex = $("#ailmentsList" + patientAddress).val();
  var clinicalStatus = $("#clinicalStatus" + patientAddress).val();
  var severity = $("#severity" + patientAddress).val();
  var affectedArea = $("#affectedArea" + patientAddress).val();
  var otherDetails = $("#details").val();

  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0]; // Assuming the doctor is logged in

    contractInstance.methods
      .getDoctorAppointments(doctorAddress)
      .call({ from: doctorAddress })
      .then(function (appointmentIds) {
        let acceptedAppointmentFound = false;

        // This creates a series of promises that resolve to true/false based on appointment acceptance.
        const checks = appointmentIds.map((id) =>
          contractInstance.methods
            .appointments(id)
            .call()
            .then(
              (appointment) =>
                appointment.patientAddress.toLowerCase() ===
                  patientAddress.toLowerCase() && appointment.isAccepted
            )
        );

        // Wait for all checks to complete.
        Promise.all(checks).then((results) => {
          acceptedAppointmentFound = results.includes(true);

          if (!acceptedAppointmentFound) {
            alert("No accepted appointment found for this patient.");
            return; // Stop the function execution if no accepted appointment found
          }

          if (
            !diagnosisIndex ||
            !clinicalStatus ||
            !severity ||
            !affectedArea
          ) {
            alert("Please fill in all fields.");
            return;
          }

          
          console.log("Submitting diagnosis for patient:", patientAddress);
          var diagnosis = $("#ailmentsList" + patientAddress).val();
          diagnosis = parseInt(diagnosis);
          var diagnosed = ailmentsDict[diagnosis];
          var comments = document.getElementById("details").value;
          var datetime = getDateTime();

           var fhirConditionResource = {
            resourceType: "Condition",
            clinicalStatus: {
              coding: [
                {
                  system:
                    "http://terminology.hl7.org/CodeSystem/condition-clinical",
                  code: clinicalStatus,
                },
              ],
            },
            severity: {
              coding: [
                {
                  system:
                    "http://terminology.hl7.org/CodeSystem/condition-severity",
                  code: severity,
                },
              ],
            },
            code: {
              text: diagnosis,
            },
            bodySite: [
              {
                text: affectedArea,
              },
            ],
            onsetDateTime: datetime,
            note: [
              {
                text: otherDetails,
              },
            ],
          };

          var oldRecords = $("#records" + patientAddress).html();

          var newRecords = `Diagnosed By : ${docName}
Diagnosis Time : ${datetime}
Diagnosis : ${diagnosed}
Clinical Status: ${clinicalStatus}
Severity: ${severity}
Affected Area: ${affectedArea}
Comments : ${comments}
`;

          console.log("New records to be added:", newRecords);
          var updatedRecords = oldRecords + newRecords;

         
          updatedRecords.fhirConditionResource = fhirConditionResource;

          if (!isNaN(diagnosis)) {
            var buffer = Buffer.from(updatedRecords);

            ipfs.files.add(buffer, (error, result) => {
              if (error) {
                console.error("Error adding file to IPFS:", error);
              } else {
                ipfshash = result[0].hash;
                console.log("IPFS hash received:", result[0].hash);

                ethereum
                  .request({ method: "eth_accounts" })
                  .then(function (accounts) {
                    var fromAddress = accounts[0].toLowerCase();

                    contractInstance.methods
                      .insurance_claim(patientAddress, diagnosis, ipfshash)
                      .send({ gas: 1000000, from: fromAddress })
                      .on("transactionHash", function (hash) {
                        // Handle the transaction hash if needed
                        console.log("Transaction Hash:", hash);
                      })
                      .on(
                        "confirmation",
                        function (confirmationNumber, receipt) {
                          // Handle confirmations if needed
                          console.log(
                            "Confirmation:",
                            confirmationNumber,
                            receipt
                          );
                        }
                      )
                      .on("receipt", function (receipt) {
                        // Handle the receipt if needed
                        console.log("Receipt:", receipt);
                        alert("Your diagnosis has been submitted.");

                        table.deleteRow(index + 1);
                        table.deleteRow(index);
                      })
                      .on("error", function (error) {
                        $(".alert-danger").show();
                        console.error(error);
                      });
                  });
              }
            });
          } else {
            alert("Select a diagnosis");
          }
        });
      })
      .catch(function (error) {
        console.error("Error loading appointment requests:", error);
      });
  });
}

function loadAppointmentRequests() {
  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0]; // Assuming the doctor is logged in

    // Fetching appointment IDs associated with the doctor
    contractInstance.methods
      .getDoctorAppointments(doctorAddress)
      .call({ from: doctorAddress })
      .then(function (appointmentIds) {
        appointmentIds.forEach(function (id) {
          // Fetching each appointment from the blockchain
          contractInstance.methods
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
    var appointmentDate = date.toISOString().substring(0, 10); // gives you YYYY-MM-DD
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

function fetchFromIPFS(ipfsHash, callback) {
  $.get("http://localhost:8080/ipfs/" + ipfsHash)
    .done(function (data) {
      console.log("Data from IPFS:", data);
      // Directly use the data object if it's already in the correct format
      callback(data);
    })
    .fail(function () {
      console.error("Failed to fetch data from IPFS.");
    });
}

function acceptAppointment(appointmentId) {
  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];
    contractInstance.methods
      .acceptAppointment(appointmentId)
      .send({ from: doctorAddress })
      .then(function (result) {
        console.log("Appointment accepted. Transaction:", result);

        notifyPatient(appointmentId, "Accepted");
        // Update the UI to reflect the appointment status
        alert("Appointment Accepted");
        // Optionally, refresh the page or remove the appointment row
      })
      .catch(function (error) {
        console.error("Error accepting appointment:", error);
        alert("Failed to accept appointment.");
      });
  });
}

function rejectAppointment(appointmentId) {
  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];
    contractInstance.methods
      .appointments(appointmentId)
      .call()
      .then(function (appointment) {
        // Notify the patient before the appointment is deleted
        notifyPatient(appointmentId, "Rejected", appointment.patientAddress);
        return contractInstance.methods
          .rejectAppointment(appointmentId)
          .send({ from: doctorAddress });
      })
      .then(function (result) {
        console.log("Appointment rejected. Transaction:", result);
        // Update the UI to reflect the appointment status
        alert("Appointment Rejected");
        // Optionally, refresh the page or remove the appointment row
      })
      .catch(function (error) {
        console.error("Error rejecting appointment:", error);
        alert("Failed to reject appointment.");
      });
  });
}

function notifyPatient(appointmentId, status) {
  console.log(
    `Notification Triggered: Appointment ID: ${appointmentId}, Status: ${status}`
  );

  contractInstance.methods
    .appointments(appointmentId)
    .call()
    .then(function (appointment) {
      const patientAddress = appointment.patientAddress;
      if (!patientAddress) {
        console.error("Patient address is undefined.");
        return;
      }

      console.log(`Patient Address: ${patientAddress}`);

      // Assuming get_hash() retrieves the IPFS hash for the patient's data
      contractInstance.methods
        .get_hash(patientAddress)
        .call()
        .then(function (ipfsHash) {
          console.log(`IPFS Hash: ${ipfsHash}`);
          if (!ipfsHash) {
            console.error("IPFS hash for patient data is undefined.");
            return;
          }

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
              // Handle invalid date format if necessary
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
                patient_name: patientName, // Now includes patient's name
                patient_email: patientEmail,
                from_name: "Electronical Medical Records Service",
                appointment_date: appointmentDate,
                appointment_time: appointmentTime,
                status: status,
              };

              console.log(`Sending Email with Params:`, templateParams);

              emailjs
                .send("service_dptsvef", "template_wxamyw8", templateParams)
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
