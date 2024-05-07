var url_string = window.location.href;
var url = new URL(url_string);
var key;

var ipfs = window.IpfsApi("localhost", "5001");

const Buffer = window.IpfsApi().Buffer;

toggleRecordsButton = 0;
var recordHash = "";

$(window).on("load", function () {
  connect();
  $("#records").hide();
  $(".alert-info").hide();
  $(".alert-danger").hide();

  web3.eth.getAccounts().then((accounts) => {
    key = accounts[0];
    key = key.toLowerCase();

    // var a = "";
    // var b = 0;
    var firstName = "";
    var lastName = "";
    var age = 0;
    var ailments = [];
    var proxyDesignationDetails = {};

    console.log("Getting Patient Data");
    contractInstance.methods
      .get_patient(key)
      .call({ gas: 1000000 }, function (error, result) {
        console.log("Patient Data Result:" + result);
        if (!error) {
          console.log(result);

          firstName = result[0];
          lastName = result[1];
          age = result[2];
          ailments = result[3];
          recordHash = result[5];

          $("#name").html(firstName + " " + lastName);
          $("#age").html(age);
          $("#recordsHash").html(
            '<a href="http://localhost:8080/ipfs/' +
              recordHash +
              '" target="_blank">' +
              recordHash +
              "</a>"
          );
          return checkAndHandleProxy(key);
        }
      });

    // print out the doctors to share emr

    var DoctorList = 0;
    console.log("Getting Doctor List");
    contractInstance.methods
      .get_doctor_list()
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          DoctorList = result;

          for (var i = 0; i < DoctorList.length; i++) {
            (function (index) {
              contractInstance.methods
                .get_doctor(DoctorList[index])
                .call({ gas: 1000000 }, function (error, result) {
                  var list = document.getElementById("permitDoctorList");

                  if (!error) {
                    var fullName = result[0] + " " + result[1];
                    var option = document.createElement("option");
                    option.text = fullName;
                    list.add(option);
                  } else {
                    console.error(error);
                  }
                });
            })(i);
          }
        } else console.error(error);
      });

    populateDoctorDropdown("doctorSelect");
    populateDoctorDropdown("doctorInfoSelect");

    // print out the doctors who have access
    var doctorAddressList = 0;
    contractInstance.methods
      .get_accessed_doctorlist_for_patient(key)
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          doctorAddressList = result;
          // console.log(result);

          doctorAddressList.forEach(function (doctorAddress, index) {
            contractInstance.methods
              .get_doctor(doctorAddress)
              .call({ gas: 1000000 }, function (error, result) {
                var table = document.getElementById("accessDoc");
                if (!error) {
                  var doctorName = result[0]; // Assuming the doctor name is at index 0
                  var publicKey = doctorAddress;

                  var row = table.insertRow(index + 1);
                  var cell1 = row.insertCell(0);
                  var cell2 = row.insertCell(1);
                  var cell3 = row.insertCell(2);
                  cell2.className = "publicKeyDoctor";
                  cell1.innerHTML = doctorName;
                  cell2.innerHTML = publicKey;
                  cell3.innerHTML =
                    '<button onclick="revokeAccess(this)" class="btn btn-danger">Revoke access</button>';
                } else console.error(error);
              });
          });
        } else console.error(error);
      });
  });

  loadSentAppointmentRequests();

  displayProxiesWithAccess();
  displayFormerProxies();
  fetchSymptoms();
});

function showRecords(element) {
  if (toggleRecordsButton % 2 === 0) {
    $.get("http://localhost:8080/ipfs/" + recordHash)
      .done(function (data) {
        $("#records").html(data);
        $("#records").show();

        var downloadButton = $("<button/>", {
          text: "Download Medical Record",
          class: "btn btn-primary",
          click: function () {
            downloadMedicalRecord(data);
          },
        });
        $("#downloadLinkContainer").html(downloadButton);
      })
      .fail(function (jqXHR, textStatus, errorThrown) {
        console.error("Error fetching IPFS data:", errorThrown);
        $(".alert-danger").show(); // Display an error message to the user
      });

    toggleRecordsButton += 1;

    element.innerHTML = "Hide Medical Records";

    element.className = "btn btn-info btn-lg";
  } else {
    $("#records").hide();
    $("#downloadLinkContainer").empty();
    toggleRecordsButton -= 1;
    element.innerHTML = "View Medical Records";
    element.className = "btn btn-info btn-lg";
  }
}

function giveAccess() {
  var list = document.getElementById("permitDoctorList");
  index = list.selectedIndex;

  var DoctorList = 0;

  contractInstance.methods
    .get_doctor_list()
    .call({ gas: 1000000 }, function (error, result) {
      if (!error) {
        // console.log(index);

        DoctorList = result;
        doctorToBeAdded = DoctorList[index - 1];
        contractInstance.methods.permit_access(doctorToBeAdded).send(
          {
            from: key,
            gas: 1000000,
            value: web3.utils.toWei("2", "ether"),
          },
          function (error) {
            if (!error) {
              var table = document.getElementById("accessDoc");
              noRows = table.rows.length;
              var row = table.insertRow(noRows);
              var cell1 = row.insertCell(0);
              var cell2 = row.insertCell(1);
              var cell3 = row.insertCell(2);

              cell2.className = "publicKeyDoctor";
              cell1.innerHTML = $("#permitDoctorList").val();
              cell2.innerHTML = doctorToBeAdded;
              cell3.innerHTML =
                '<button onclick="revokeAccess(this)" class="btn btn-danger">Revoke access</button>';
            } else {
              $(".alert-info").show();
              console.log(error);
            }
          }
        );
      } else console.log(error);
    });
}

function revokeAccess(element) {
  rowNo = element.parentNode.parentNode.rowIndex;
  Row = element.parentNode.parentNode;
  var Cells = Row.getElementsByTagName("td");
  var docKey = Row.cells[1].firstChild.nodeValue;

  // Get the current user's account address
  web3.eth.getAccounts().then((accounts) => {
    const fromAddress = accounts[0];

    // Call the contract's revoke_access method
    contractInstance.methods
      .revoke_access(docKey)
      .send({
        from: fromAddress,
        gas: 1000000,
      })
      .on("transactionHash", function (hash) {
        // Transaction sent, you can show loading or wait for confirmation
        console.log("Transaction Hash:", hash);
      })
      .on("confirmation", function (confirmationNumber, receipt) {
        // Transaction confirmed
        console.log("Confirmation:", confirmationNumber, receipt);
        document.getElementById("accessDoc").deleteRow(rowNo);
      })
      .on("error", function (error) {
        // Error occurred
        $(".alert-danger").show();
        console.error("Error:", error);
      });
  });
}

function populateDoctorDropdown(dropdownId) {
  console.log("populateDoctorDropdown called for:", dropdownId);

  // Ensure contractInstance is defined
  if (!contractInstance) {
    console.error("contractInstance is not defined.");
    return;
  }

  contractInstance.methods
    .get_doctor_list()
    .call({ gas: 1000000 }, function (error, DoctorList) {
      if (error) {
        console.error("Error fetching doctor list:", error);
        return;
      }

      var list = document.getElementById(dropdownId);
      if (!list) {
        console.error("Dropdown element not found: " + dropdownId);
        return;
      }

      list.innerHTML = ""; // Clear existing options
      console.log("Doctor list received:", DoctorList);

      DoctorList.forEach(function (doctorAddress, index) {
        console.log("Fetching details for doctor at index:", index);
        contractInstance.methods
          .get_doctor(doctorAddress)
          .call({ gas: 1000000 }, function (error, doctorDetails) {
            if (error) {
              console.error("Error fetching doctor details:", error);
              return;
            }

            var fullName = doctorDetails[0] + " " + doctorDetails[1];
            var option = document.createElement("option");
            option.text = fullName;
            option.value = doctorAddress; // Optionally, you can set the doctor's address as the option value
            list.appendChild(option);
          });
      });
    });
}

function viewDoctorInfo() {
  var doctorSelect = document.getElementById("doctorInfoSelect");
  var selectedDoctorAddress = doctorSelect.value;

  if (
    !selectedDoctorAddress ||
    selectedDoctorAddress === "-- Please Select --"
  ) {
    alert("Please select a doctor to view their information.");
    return;
  }

  // Fetch doctor's info from the smart contract
  contractInstance.methods
    .get_doctor(selectedDoctorAddress)
    .call({ from: key })
    .then(function (doctorDetails) {
      var ipfsHash = doctorDetails[3]; // Adjust based on your data structure

      if (!ipfsHash) {
        document.getElementById("doctorInfoDisplay").innerHTML =
          "Doctor information not available.";
        return;
      }

      // Fetch doctor's information from IPFS
      $.get("http://localhost:8080/ipfs/" + ipfsHash, function (data) {
        // Extracting relevant information from the raw data
        var lines = data.split("\n");
        var gender = lines.find((line) => line.includes("Gender:"));
        var contact = lines.find((line) => line.includes("Contact:"));
        var specialty = lines.find((line) => line.includes("Specialty:"));
        var yearsOfExperienceLine = lines.find((line) =>
          line.startsWith("Years of Experience:")
        );
        var yearsOfExperience = yearsOfExperienceLine.split(":")[1].trim();

        // Constructing the display content with new lines after each field
        var content = `
                  <div class="doctor-info">
                      <p>First Name: ${doctorDetails[0]}</p>
                      <p>Last Name: ${doctorDetails[1]}</p>
                      <p>Years of Experience: ${yearsOfExperience}</p>
                      <p>${gender}</p>
                      <p>${contact}</p>
                      <p>${specialty}</p>
                  </div>
              `;

        document.getElementById("doctorInfoDisplay").innerHTML = content;
      }).fail(function () {
        console.error("Failed to fetch data from IPFS.");
        document.getElementById("doctorInfoDisplay").innerHTML =
          "Error loading doctor information.";
      });
    })
    .catch(function (error) {
      console.error("Error fetching doctor details:", error);
      document.getElementById("doctorInfoDisplay").innerHTML =
        "Error loading doctor information.";
    });
}

function scheduleAppointment() {
  const doctorId = $("#doctorSelect").val();
  let appointmentDate = $("#appointmentDate").val().replace(/-/g, "");
  const appointmentHour = parseInt($("#appointmentHour").val(), 10);
  const [hour, minute] = $("#appointmentHour").val().split(":").map(Number);
  const paddedHour = hour.toString().padStart(2, "0");
  const paddedMinute = minute.toString().padStart(2, "0");
  appointmentDate = appointmentDate.replace(/-/g, "");
  const dateAsNumber = parseInt(appointmentDate, 10);
  // const hourAsNumber = parseInt(appointmentHour, 10);
  const hourAsNumber = hour;
  const minuteAsNumber = minute;

  // Check if all fields are filled
  if (!doctorId || !appointmentDate || !appointmentHour) {
    alert("Please fill in all the fields.");
    return;
  }

  // Assuming web3 and contractInstance are available globally
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0]; // Using the first account as the patient address
    contractInstance.methods
      .get_accessed_patientlist_for_doctor(doctorId)
      .call({ from: patientAddress })
      .then((patientList) => {
        const doctorHasAccess = patientList.includes(patientAddress);
        if (!doctorHasAccess) {
          alert(
            "This doctor does not have access to the patient's records. Please grant access before scheduling an appointment."
          );
          return;
        }

        contractInstance.methods
          .get_patient(patientAddress)
          .call({ gas: 1000000 }, function (error, patientResult) {
            if (!error) {
              const patientFirstName = patientResult[0];
              const patientLastName = patientResult[1];

              // Fetch doctor's details
              contractInstance.methods
                .get_doctor(doctorId)
                .call({ gas: 1000000 }, function (error, doctorResult) {
                  if (!error) {
                    const doctorFirstName = doctorResult[0];
                    const doctorLastName = doctorResult[1];
                    const initialStatus = "Pending";

                    // Create FHIR Appointment Resource with patient and doctor names
                    const fhirAppointmentResource = {
                      resourceType: "Appointment",
                      status: initialStatus,
                      start: `${appointmentDate}T${paddedHour}:${paddedMinute}:00Z`,
                      participant: [
                        {
                          actor: {
                            reference: `Patient/${patientAddress}`,
                            display: `${patientFirstName} ${patientLastName}`,
                          },
                          status: "needs-action",
                        },
                        {
                          actor: {
                            reference: `Practitioner/${doctorId}`,
                            display: `${doctorFirstName} ${doctorLastName}`,
                          },
                          status: "needs-action",
                        },
                      ],
                    };

                    const ipfs = window.IpfsApi("localhost", "5001"); // Connect to IPFS
                    const buffer = ipfs.Buffer.from(
                      JSON.stringify(fhirAppointmentResource)
                    );

                    ipfs.files.add(buffer, (error, result) => {
                      if (error) {
                        console.error("Error uploading to IPFS:", error);
                        alert("Failed to store appointment details on IPFS.");
                        return;
                      }

                      const ipfsHash = result[0].hash;
                      // Send the IPFS hash along with the doctor's Ethereum address to the smart contract
                      contractInstance.methods
                        .requestAppointment(
                          doctorId,
                          ipfsHash,
                          dateAsNumber,
                          hourAsNumber
                        )
                        .send({ from: patientAddress, gas: 1000000 })
                        .then((res) => {
                          console.log(
                            "Appointment request sent. Transaction:",
                            res
                          );
                          alert("Appointment request sent successfully!");
                        })
                        .catch((err) => {
                          console.error(
                            "Error sending to blockchain:",
                            err.message || err
                          );
                          alert("Failed to schedule appointment.");
                        });
                    });
                  } else {
                    console.error("Error fetching doctor details:", error);
                    alert("Failed to retrieve doctor details.");
                  }
                });
            } else {
              console.error("Error fetching patient details:", error);
              alert("Failed to retrieve patient details.");
            }
          });
      })
      .catch((err) => {
        console.error("Error checking doctor access:", err.message || err);
      });
  });
}

// function loadSentAppointmentRequests() {
//   web3.eth.getAccounts().then(function (accounts) {
//     const patientAddress = accounts[0]; // Assuming the patient is logged in

//     // Fetching appointment IDs associated with the patient
//     contractInstance.methods
//       .getPatientAppointments(patientAddress)
//       .call({ from: patientAddress })
//       .then(function (appointmentIds) {
//         appointmentIds.forEach(function (id) {
//           // Fetching each appointment from the blockchain
//           contractInstance.methods
//             .appointments(id)
//             .call()
//             .then(function (appointment) {
//               // Fetching additional details from IPFS
//               fetchFromIPFS(appointment.ipfsHash, function (appointmentData) {
//                 if (appointment.isAccepted) {
//                   displaySentAppointmentRequest(
//                     id,
//                     appointmentData,
//                     "accepted"
//                   );
//                 } else if (appointment.isRejected) {
//                   displaySentAppointmentRequest(
//                     id,
//                     appointmentData,
//                     "rejected"
//                   );
//                 } else {
//                   displaySentAppointmentRequest(id, appointmentData, "pending");
//                 }
//               });
//             });
//         });
//       })
//       .catch(function (error) {
//         console.error("Error loading sent appointment requests:", error);
//       });
//   });
// }


// function displaySentAppointmentRequest(id, appointment, status) {
//   var row = $("<tr>");

//   var doctorInfo = appointment.participant.find((p) =>
//     p.actor.reference.startsWith("Practitioner")
//   );
//   var doctorName = doctorInfo ? doctorInfo.actor.display : "Unknown";

//   var match = appointment.start.match(
//     /^(\d{4})(\d{2})(\d{2})T(\d{1,2}):(\d{2}):(\d{2})Z$/
//   );

//   // Check if the date format matches the expected pattern
//   if (match) {
//     // Create a new date object from the parts
//     var date = new Date(
//       Date.UTC(
//         parseInt(match[1], 10),
//         parseInt(match[2], 10) - 1, // Months are 0-indexed
//         parseInt(match[3], 10),
//         parseInt(match[4], 10),
//         parseInt(match[5], 10),
//         parseInt(match[6], 10)
//       )
//     );

//     // Convert the date and time to the local time zone
//     var appointmentDate = date.toISOString().substring(0, 10);
//     var appointmentTime = date.toISOString().substring(11, 16);
//   } else {
//     console.error("Invalid date format:", appointment.start);
//     var appointmentDate = "Invalid Date";
//     var appointmentTime = "Invalid Time";
//   }
//   $("<td>", { class: "doctorName" }).text(doctorName).appendTo(row);
//   $("<td>", { class: "appointmentDate" }).text(appointmentDate).appendTo(row);
//   $("<td>", { class: "appointmentTime" }).text(appointmentTime).appendTo(row);
//   //$('<td>').text(status).appendTo(row);
//   var statusCell = $("<td>").text(status).appendTo(row);
//   if (status === "accepted") {
//     statusCell.addClass("accepted-status");
//   } else if (status === "rejected") {
//     statusCell.addClass("rejected-status");
//   } else if (status === "pending") {
//     statusCell.addClass("pending-status");
//   } else {
//     statusCell.addClass("unknown-status"); // Handle unknown status
//   }

//   $("#sentAppointmentRequests tbody").append(row);
// }

function loadSentAppointmentRequests() {
  web3.eth.getAccounts().then(function (accounts) {
      const patientAddress = accounts[0];

      // Fetch the list of appointment IDs for the patient
      contractInstance.methods.getPatientAppointments(patientAddress).call({ from: patientAddress })
      .then(function (appointmentIds) {
          if (appointmentIds.length === 0) {
              console.log("No appointments found.");
              return; // Exit if no appointments
          }
          appointmentIds.forEach(function (id, index) {
              contractInstance.methods.appointments(id).call()
              .then(function (appointment) {
                  // Fetch the doctor's details
                  contractInstance.methods.get_doctor(appointment.doctorAddress).call()
                  .then(function(doctorDetails) {
                      var doctorName = doctorDetails[0] + ' ' + doctorDetails[1];
                      // Fetch the appointment data from IPFS using the stored hash
                      fetchFromIPFS(appointment.ipfsHash, function (appointmentData) {
                          // Extract and format date and time from appointmentData.start
                          var match = appointmentData.start.match(/^(\d{4})(\d{2})(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/);
                          var appointmentDate = "Invalid Date";
                          var appointmentTime = "Invalid Time";
                          if (match) {
                              appointmentDate = `${match[1]}-${match[2]}-${match[3]}`;
                              appointmentTime = `${match[4]}:${match[5]}`;
                          }
                          displaySentAppointmentRequest(id, appointmentData, appointmentData.status, doctorName, appointmentDate, appointmentTime);
                      });
                  })
                  .catch(function(error) {
                      console.error("Error fetching doctor details:", error);
                      fetchFromIPFS(appointment.ipfsHash, function (appointmentData) {
                          displaySentAppointmentRequest(id, appointmentData, appointmentData.status, "Unknown Doctor", "Invalid Date", "Invalid Time");
                      });
                  });
              });
          });
      }).catch(function (error) {
          console.error("Error loading appointment IDs:", error);
      });
  });
}

function displaySentAppointmentRequest(id, appointment, status, doctorName, appointmentDate, appointmentTime) {
  var row = $("<tr>");
  $("<td>", { class: 'doctorName' }).text(doctorName).appendTo(row);
  $("<td>", { class: 'appointmentDate' }).text(appointmentDate).appendTo(row);
  $("<td>", { class: 'appointmentTime' }).text(appointmentTime).appendTo(row);
  var statusCell = $("<td>").text(status).appendTo(row);
  if (status === "accepted") {
      statusCell.addClass("accepted-status");
  } else if (status === "rejected") {
      statusCell.addClass("rejected-status");
  } else if (status === "pending") {
      statusCell.addClass("pending-status");
  } else {
      statusCell.addClass("unknown-status");
  }

  $("#sentAppointmentRequests tbody").append(row);
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

document.addEventListener("DOMContentLoaded", function () {
  var today = new Date().toISOString().split("T")[0]; // Format today's date as YYYY-MM-DD
  $("#appointmentDate").attr("min", today);
  $("#appointmentDate").change(function () {
    var selectedDate = new Date(this.value);
    var dayOfWeek = selectedDate.getDay();

    // Check if the selected day is Saturday (6) or Sunday (0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      alert(
        "Appointments cannot be scheduled on weekends. Please select a weekday."
      );
      this.value = ""; // Reset the date input
      $("#availableHoursContainer").hide();
      return; // Exit the function if a weekend is selected
    }
    $("#appointmentHour").attr("min", "08:00");
    $("#appointmentHour").attr("max", "19:00");

    // Proceed to populate hours dropdown
    populateHoursDropdown();
  });
});

function populateHoursDropdown() {
  const selectedDate = $("#appointmentDate").val(); // Assuming "YYYY-MM-DD" format
  const formattedDate = selectedDate.replace(/-/g, ""); // Convert date to "YYYYMMDD" format
  const doctorId = $("#doctorSelect").val(); // Get selected doctor's Ethereum address

  // Clear existing options in the dropdown
  const hoursDropdown = $("#appointmentHour");
  hoursDropdown.empty();

  // Define operational hours (8 AM to 7 PM)
  const startHour = 8;
  const endHour = 19;

  // Store all promises for the availability checks
  let availabilityPromises = [];

  for (let hour = startHour; hour <= endHour; hour++) {
    // Push each availability check promise to the array
    let promise = contractInstance.methods
      .isTimeSlotAvailable(doctorId, formattedDate, hour)
      .call()
      .then((isAvailable) => ({ hour, isAvailable }));

    availabilityPromises.push(promise);
  }

  // Wait for all availability checks to complete
  Promise.all(availabilityPromises)
    .then((results) => {
      let optionsAdded = 0;
      results.forEach(({ hour, isAvailable }) => {
        if (isAvailable) {
          // For each available hour, add options for every minute
          for (let minute = 0; minute < 60; minute++) {
            let displayTime = `${hour < 10 ? `0${hour}` : hour}:${
              minute < 10 ? `0${minute}` : minute
            }`;
            hoursDropdown.append(new Option(displayTime, `${hour}:${minute}`));
            optionsAdded++;
          }
        }
      });

      // After all checks, determine if "No available hours" should be displayed
      if (optionsAdded === 0) {
        hoursDropdown.append(new Option("No available hours", ""));
        $("#submitAppointmentButton").prop("disabled", true); // Disable the submit button if no hours are available
      } else {
        $("#submitAppointmentButton").prop("disabled", false); // Enable the submit button if there are available hours
      }

      $("#availableHoursContainer").show(); // Show the dropdown after populating it
    })
    .catch((error) => {
      console.error("Error fetching availability:", error);
    });
}

function designateProxy() {
  const proxyFirstName = $("#proxyFirstName").val();
  const proxyLastName = $("#proxyLastName").val();
  const proxyDOB = $("#proxyDOB").val();
  const proxyAge = $("proxyAge").val();
  const proxyAddress = $("#proxyAddress").val();
  const proxyPhone = $("#proxyPhone").val();
  const proxyEmail = $("#proxyEmail").val();
  const consentGiven = $("#consentDropdown").val() === "yes";

  const detailsConcat = `${proxyFirstName}${proxyLastName}${proxyDOB}${proxyAddress}${proxyPhone}${proxyEmail}`;
  const detailsHash = web3.utils.sha3(detailsConcat);

  if (!consentGiven) {
    alert("Consent not given. Proxy cannot be designated without consent.");
    return;
  }

  // Generate a unique token for the proxy
  const token = generateTokenForProxy(proxyEmail);

  // Call your smart contract to designate the proxy
  web3.eth.getAccounts().then(function (accounts) {
    const patientAddress = accounts[0];
    // Assuming your contract instance is already initialized and has a method for designating a proxy
    contractInstance.methods
      .designateProxy(token, detailsHash)
      .send({ from: patientAddress })
      .then(function (receipt) {
        // Proxy designated successfully
        alert("Proxy designated successfully. Token generated.");
        // Send the token to the proxy's email
        sendTokenToProxyEmail(proxyEmail, token, proxyFirstName, proxyLastName);
      })
      .catch(function (error) {
        // Failed to designate proxy
        console.error("Failed to designate proxy:", error);
        alert("Failed to designate proxy. Please try again.");
      });
  });
}

function generateTokenForProxy() {
  // Create a random string of 16 characters (letters and numbers)
  let token = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < 16; i++) {
    token += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  // Optionally, append a timestamp for added uniqueness
  token += "-" + new Date().getTime().toString(36);

  return token;
}

function sendTokenToProxyEmail(proxyEmail, token) {
  // Fetch current patient's details from the smart contract
  web3.eth.getAccounts().then(function (accounts) {
    const patientAddress = accounts[0]; // Using the first account as the patient address

    // Assuming get_hash() retrieves the IPFS hash for the patient's data
    contractInstance.methods
      .get_hash(patientAddress)
      .call()
      .then(function (patientIpfsHash) {
        console.log(`IPFS Hash for Patient: ${patientIpfsHash}`);

        fetchFromIPFS(patientIpfsHash, function (patientDataText) {
          // Split the data by lines to extract patient details
          const lines = patientDataText.split("\n");
          const firstNameLine = lines.find((line) =>
            line.startsWith("First Name:")
          );
          const lastNameLine = lines.find((line) =>
            line.startsWith("Last Name:")
          );
          const firstName = firstNameLine
            ? firstNameLine.split(":")[1].trim()
            : "";
          const lastName = lastNameLine
            ? lastNameLine.split(":")[1].trim()
            : "";
          const patientName = `${firstName} ${lastName}`;

          // Prepare the template parameters
          var templateParams = {
            proxy_email: proxyEmail,
            proxy_name:
              $("#proxyFirstName").val() + " " + $("#proxyLastName").val(),
            patient_name: patientName,
            token: token,
            from_name: "Electronical Medical Records Service",
          };

          console.log(`Sending Email with Params:`, templateParams);

          // Send the email using EmailJS
          emailjs
            .send("service_th4f1zo", "template_bwpjgsk", templateParams)
            .then(
              function (response) {
                console.log("Successfully sent email to proxy:", response.text);
              },
              function (error) {
                console.error("Failed to send email to proxy:", error);
                console.error("Error details:", error.response);
              }
            );
        });
      })
      .catch(function (error) {
        console.error("Error fetching patient details:", error);
      });
  });
}

function displayProxiesWithAccess() {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0];

    contractInstance.methods
      .get_patient(patientAddress)
      .call()
      .then((patientInfo) => {
        const age = parseInt(patientInfo[2], 10);

        contractInstance.methods
          .get_accessed_proxylist_for_patient(patientAddress)
          .call()
          .then((proxyAddressList) => {
            var table = document.getElementById("accessProxy");
            var rowCount = table.rows.length;
            for (var i = rowCount - 1; i > 0; i--) {
              table.deleteRow(i);
            }

            proxyAddressList.forEach((proxyAddress, index) => {
              if (
                proxyAddress !== "0x0000000000000000000000000000000000000000"
              ) {
                contractInstance.methods
                  .get_proxy(proxyAddress)
                  .call()
                  .then((proxyDetails) => {
                    var row = table.insertRow(-1);
                    var cell1 = row.insertCell(0);
                    var cell2 = row.insertCell(1);
                    var cell3 = row.insertCell(2);
                    cell1.innerHTML =
                      proxyDetails.firstName + " " + proxyDetails.lastName;
                    cell2.innerHTML = proxyAddress;
                    var btn = document.createElement("button");
                    btn.className = "btn btn-danger revoke-proxy-access";
                    btn.innerHTML = "Revoke access";
                    btn.onclick = function () {
                      revokeProxyAccess(proxyAddress);
                    };
                    if (age < 16) {
                      // Disable the button if the patient is under 16
                      btn.disabled = true;
                      btn.title = "You cannot revoke access until you are 16.";
                    }
                    cell3.appendChild(btn);
                  })
                  .catch((error) => {
                    console.error("Error fetching proxy details:", error);
                  });
              }
            });
          })
          .catch((error) => {
            console.error("Error fetching proxy list:", error);
          });
      })
      .catch((error) => {
        console.error("Error retrieving patient info:", error);
      });
  });
}

$(document).ready(function () {
  // Event delegation for revoke access buttons within the accessProxy table
  $("#accessProxy").on("click", ".revoke-proxy-access", function () {
    var proxyAddress = $(this).data("proxy-address");
    if (!proxyAddress) {
      console.error("Proxy address is undefined.");
      return;
    }
    // Pass the button itself and the proxy address
    revokeProxyAccess(proxyAddress);
  });
});

function revokeProxyAccess() {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0]; // The account invoking the transaction

    console.log("Patient Address:", patientAddress);

    // Check if the patient has a designated proxy before attempting to revoke
    contractInstance.methods
      .get_accessed_proxylist_for_patient(patientAddress)
      .call()
      .then((proxyList) => {
        if (
          proxyList.length === 0 ||
          proxyList[0] === "0x0000000000000000000000000000000000000000"
        ) {
          console.error("The patient does not have a designated proxy.");
          return;
        }

        console.log("Revoking access for proxy of patient:", patientAddress);

        // Calling the revokeProxyAccess function without the need for a proxyAddress
        contractInstance.methods
          .revokeProxyAccess()
          .send({ from: patientAddress, gas: 1000000 })
          .then((receipt) => {
            console.log("Proxy access revoked successfully:", receipt);
            // Handle successful revocation (e.g., update UI)
          })
          .catch((error) => {
            console.error("Error revoking proxy access:", error);
            // Handle errors (e.g., show error message to the user)
          });
      })
      .catch((error) => {
        console.error("Error fetching proxy details:", error);
      });
  });
}

function displayFormerProxies() {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0]; // Assuming the patient is logged in

    contractInstance.methods
      .get_proxy_list()
      .call({ from: patientAddress })
      .then((proxyAddresses) => {
        proxyAddresses.forEach((proxyAddress) => {
          contractInstance.methods
            .get_proxy(proxyAddress)
            .call()
            .then((proxy) => {
              if (
                !proxy.isAuthorized &&
                proxy.patientAddress.toLowerCase() ===
                  patientAddress.toLowerCase()
              ) {
                // This is a former proxy; display it accordingly
                const table = document.getElementById("formerProxyTable"); // Ensure you have a table with this ID in your HTML
                const row = table.insertRow(-1);
                const nameCell = row.insertCell(0);
                const publicKeyCell = row.insertCell(1);
                const actionCell = row.insertCell(2);

                nameCell.innerHTML = `${proxy.firstName} ${proxy.lastName}`;
                publicKeyCell.innerHTML = proxyAddress;
                actionCell.innerHTML = `<button onclick="regrantProxyAccess('${proxyAddress}')" class="btn btn-primary">Regrant Access</button>`;
              }
            });
        });
      });
  });
}

function regrantProxyAccess(proxyAddress) {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0];
    console.log(
      `Attempting to regrant access for proxy: ${proxyAddress} by patient: ${patientAddress}`
    );

    // Ensure to adjust gas limit and value as per your contract requirements and test findings
    contractInstance.methods
      .regrantProxyAccess(proxyAddress)
      .send({
        from: patientAddress,
        gas: 1000000, // This is an estimated gas limit, ensure to adjust based on actual contract needs
        value: web3.utils.toWei("2", "ether"), // Ensure this matches the contract's expectations
      })
      .then((receipt) => {
        console.log("Transaction receipt:", receipt);
        alert("Access has been successfully regranted to the proxy.");
        // Optionally, refresh the list of current and former proxies
        displayProxiesWithAccess();
        displayFormerProxies();
      })
      .catch((error) => {
        console.error("Failed to regrant access to proxy:", error);
        alert("Failed to regrant access. Please try again.");
      });
  });
}

function addPatientAllergy() {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0];
    const allergySubstance = document.getElementById("allergySubstance").value;
    const allergyReaction = document.getElementById("reaction").value;
    const allergyCriticality = document.getElementById("criticality").value;

    // Validation
    if (!allergySubstance || !allergyReaction || !allergyCriticality) {
      alert("Please fill in all fields.");
      return;
    }

    const fhirAllergyResource = {
      resourceType: "AllergyIntolerance",
      substance: {
        text: allergySubstance,
      },
      reaction: [
        {
          description: allergyReaction,
        },
      ],
      criticality: allergyCriticality,
      recordedDate: new Date().toISOString(),
    };

    const formattedAllergy = `Allergy Substance: ${allergySubstance}
    Reaction: ${allergyReaction}
    Criticality: ${allergyCriticality}
    Recorded on: ${new Date().toLocaleString()}\n`;

    // Fetch the current IPFS hash for the patient's record
    contractInstance.methods
      .get_hash(patientAddress)
      .call()
      .then(function (ipfsHash) {
        // Download the existing medical record from IPFS
        fetch(`http://localhost:8080/ipfs/${ipfsHash}`)
          .then((response) => response.text())
          .then(function (patientRecord) {
            const updatedPatientRecord = patientRecord + formattedAllergy;

            // Log the updated patient record
            console.log("Updated patient record:", updatedPatientRecord);
            // Convert the updated record into a format suitable for IPFS
            const buffer = Buffer.from(updatedPatientRecord);

            // Upload the updated record to IPFS
            ipfs.files.add(buffer, (error, result) => {
              if (error) {
                console.error("Error adding file to IPFS:", error);
                return;
              }

              const updatedIpfsHash = result[0].hash;

              // Update the patient's record hash in the smart contract
              contractInstance.methods
                .set_hash(patientAddress, updatedIpfsHash)
                .send({ from: patientAddress })
                .then(function (receipt) {
                  console.log("Record updated successfully:", receipt);
                  alert("Allergy information successfully added.");
                  // Optionally, you might want to trigger a re-fetch of the records here or redirect the user
                })
                .catch(function (error) {
                  console.error(
                    "Failed to update the patient's record hash:",
                    error
                  );
                });
            });
          })
          .catch(function (error) {
            console.error(
              "Failed to fetch the patient's current record from IPFS:",
              error
            );
          });
      })
      .catch(function (error) {
        console.error(
          "Failed to fetch the patient's current record hash:",
          error
        );
      });
  });
}

// Function to fetch symptoms from the Flask API
function fetchSymptoms() {
  fetch(
    "https://0bd9bf90-247c-40e9-adff-c9f302d7a747-00-3g8iecfpf4ugs.picard.replit.dev/symptoms"
  )
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      console.log(data);
      displaySymptoms(data.symptoms);
    })
    .catch((error) => {
      console.error("Error fetching symptoms:", error);
    });
}
function displaySymptoms(symptoms) {
  const container = document.getElementById("symptomsContainer");
  container.innerHTML = ""; // Clear previous contents

  symptoms.forEach((symptom) => {
    // Use the cleanSymptomName function to format the symptom name
    const cleanName = cleanSymptomName(symptom);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "symptoms[]";
    checkbox.value = symptom;
    checkbox.id = symptom;

    const label = document.createElement("label");
    label.htmlFor = symptom;
    label.textContent = cleanName; // Use the cleaned and formatted name

    const div = document.createElement("div");
    div.appendChild(checkbox);
    div.appendChild(label);

    container.appendChild(div);
  });
}


// Function to send selected symptoms to the Flask API for diagnosis prediction
document
  .getElementById("diagnosisForm")
  .addEventListener("submit", function (event) {
    event.preventDefault(); // Prevent the form from submitting traditionally

    // Collect checked symptoms
    const symptomsData = {};
    document
      .querySelectorAll('[name="symptoms[]"]:checked')
      .forEach((checkbox) => {
        symptomsData[checkbox.value] = 1; // Assuming your model expects '1' for present symptoms
      });

    // Send the symptoms data to your predict endpoint
    predictDiagnosis(symptomsData);
  });

function predictDiagnosis(symptoms) {
  fetch(
    "https://0bd9bf90-247c-40e9-adff-c9f302d7a747-00-3g8iecfpf4ugs.picard.replit.dev/predict",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(symptoms),
    }
  )
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      console.log("Prediction:", data);
      displayPredictionResult(data.prediction);

       storePredictionInIPFS(data.prediction);
    })
    .catch((error) => {
      console.error("Error predicting the diagnosis:", error);
      displayPredictionResult(`Error: ${error.message}`); // Display error in prediction result section
    });
}

function displayPredictionResult(result) {
  const resultContainer = document.getElementById("predictionResult");
  resultContainer.innerHTML = result;
  resultContainer.style.display = "block"; // Make sure to display the result section if it was hidden
}

// Example usage (ensure these are called appropriately within your app's logic)
document.addEventListener("DOMContentLoaded", function () {
  // Fetch symptoms when the document is ready (this could be tied to a specific event or page load)
  fetchSymptoms();
});

// You might call predictDiagnosis() based on specific user actions, such as form submission
function cleanSymptomName(symptom) {
  // Removes any trailing numbers and dots, replaces underscores with spaces, and capitalizes each word
  return symptom.replace(/(\.\d+)?$/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}



function storePredictionInIPFS(prediction) {
  const ipfs = window.IpfsApi('localhost', '5001');
  const timestamp = new Date().toLocaleString();  // Get the current timestamp
  const predictionData = { prediction, timestamp };  // Include both prediction and timestamp
  const buffer = ipfs.Buffer.from(JSON.stringify(predictionData));
  console.log("Storing prediction with timestamp:", predictionData);

  ipfs.files.add(buffer, (error, result) => {
      if (error) {
          console.error("Error uploading to IPFS:", error);
          return;
      }
      const ipfsHash = result[0].hash;
      console.log("Stored in IPFS with hash:", ipfsHash);

      // Update localStorage with the hash
      const hashes = JSON.parse(localStorage.getItem('diagnosisHashes')) || [];
      hashes.push(ipfsHash);
      localStorage.setItem('diagnosisHashes', JSON.stringify(hashes));
      console.log("Updated localStorage with new hash:", hashes);

      // Immediately display the prediction with timestamp
      appendPredictionToHistory(predictionData);
  });
}







function appendPredictionToHistory(predictionData) {
  const historyContainer = document.getElementById("predictionHistory");
  const entry = document.createElement("div");
  entry.className = "prediction-entry";
  entry.innerHTML = `<p>Prediction: ${predictionData.prediction}</p><p>Time: ${predictionData.timestamp}</p>`;

  historyContainer.appendChild(entry);
}







function displayAllDiagnoses() {
  const ipfs = window.IpfsApi("localhost", "5001");
  const hashes = JSON.parse(localStorage.getItem("diagnosisHashes")) || [];
  console.log("Loaded hashes from localStorage:", hashes);

  hashes.forEach(hash => {
      console.log("Fetching data for hash:", hash);
      ipfs.files.cat(hash, (error, file) => {
          if (error) {
              console.error("Error retrieving from IPFS:", error);
              return;
          }
          const predictionData = JSON.parse(file.toString());
          console.log("Retrieved prediction data:", predictionData);
          appendPredictionToHistory(predictionData);
      });
  });
}

document.addEventListener("DOMContentLoaded", function () {
  displayAllDiagnoses();
});




document.addEventListener("DOMContentLoaded", function () {
  var panels = document.querySelectorAll(".panel");
  // Initially hide all panels except the personalInfoPanel
  panels.forEach(function (panel) {
    if (panel.id !== "personalInfoPanel") {
      panel.style.display = "none";
    } else {
      panel.style.display = "block"; // Ensure personalInfoPanel is visible
    }
  });

  // Setup event listeners for sidebar links
  var sidebarLinks = document.querySelectorAll(".list-group-item");
  sidebarLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      var targetPanelId = this.getAttribute("data-target");
      panels.forEach(function (panel) {
        if (panel.id === targetPanelId) {
          panel.style.display = "block"; // Show the clicked panel
        } else {
          panel.style.display = "none"; // Hide others
        }
      });
    });
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const resetButton = document.getElementById("resetButton");
  if (resetButton) {
    resetButton.addEventListener("click", function () {
      // Reset all checkboxes
      const checkboxes = document.querySelectorAll(
        '#symptomsContainer input[type="checkbox"]'
      );
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });

      // Clear diagnosis display and reset any styles
      const diagnosisResult = document.getElementById("predictionResult");
      if (diagnosisResult) {
        diagnosisResult.innerHTML = ""; // Clears the content
        diagnosisResult.style.display = "none"; // Hide the element
        diagnosisResult.style.color = "black"; // Set text color to black
      }
    });
  }
});

$(document).ready(function () {
  var calendarEl = document.getElementById("calendar"); // Ensure this ID matches your HTML
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
      // Custom rendering of events, splitting time and patient name
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

  // Start observing the target node for configured mutations
  observer.observe(document.body, config);

  // Clean up observer on page unload
  $(window).on("unload", function () {
    observer.disconnect();
  });

  setTimeout(function () {
    loadAcceptedAppointments(calendar);
  }, 1000);
});

function loadAcceptedAppointments(calendar) {
  web3.eth
    .getAccounts()
    .then(function (accounts) {
      const patientAddress = accounts[0];
      contractInstance.methods
        .getPatientAppointments(patientAddress)
        .call()
        .then(function (appointmentIds) {
          console.log("Appointment IDs:", appointmentIds);
          appointmentIds.forEach(function (appointmentId) {
            contractInstance.methods
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

function addEventToCalendar(appointmentData, calendar) {
  if (!calendar) {
    console.error("Calendar not defined");
    return;
  }

  try {
    // Ensure the date is parsed correctly
    const date = moment(appointmentData.start, "YYYYMMDDTHH:mm:ssZ").utc();
    const formattedDate = date.format("YYYY-MM-DD");
    const formattedTime = date.format("HH:mm");

    // Find the patient's name in the participant array
    const doctorInfo = appointmentData.participant.find((p) =>
      p.actor.reference.startsWith("Practitioner")
    );
    const doctorName = doctorInfo ? doctorInfo.actor.display : "Unknown Doctor";

    // Check if patient's name was found
    if (doctorName === "Unknown Doctor") {
      console.error("Doctor name is missing in appointment data");
    }

    calendar.addEvent({
      title: `${formattedTime} ${doctorName}`,
      start: formattedDate + "T" + formattedTime,
      allDay: false,
      color: "rgba(255, 179, 128, 0.5)", // Peach background with transparency
      textColor: "#f26d21", // Orange text
      extendedProps: {
        description: doctorName, // Added to use in custom rendering
      },
    });
  } catch (e) {
    console.error("Error in adding event to calendar:", e);
  }
}

function checkAndHandleProxy(key) {
  contractInstance.methods
    .get_patient(key)
    .call()
    .then((patientInfo) => {
      const age = parseInt(patientInfo[2], 10);
      console.log(`Patient Age: ${age}, Checking proxy list...`);

      contractInstance.methods
        .get_accessed_proxylist_for_patient(key)
        .call()
        .then((proxyAddressList) => {
          let hasActiveProxy = proxyAddressList.some(
            (addr) => addr !== "0x0000000000000000000000000000000000000000"
          );

          if (hasActiveProxy) {
            console.log("Active proxy found.");
            displayRegularPatientDashboard(); // Show full dashboard for adults or those 16 and older
          } else {
            console.log("No active proxy, showing full access.");
            if (age < 16) {
              showProxyRegistration(); // Show registration for proxy if under 16 and no proxy
            } else {
              displayRegularPatientDashboard(); // Show full dashboard if over 16 and no proxy
            }
          }
        })
        .catch((error) => {
          console.error("Error fetching proxy list:", error);
        });
    })
    .catch((error) => {
      console.error("Error fetching patient information:", error);
    });
}

function displayRegularPatientDashboard() {
  // Hide all panels initially
  var panels = document.querySelectorAll(".panel");
  panels.forEach(function (panel) {
    panel.style.display = "none"; // Hide all panels
  });

  // Show only the personalInfoPanel
  document.getElementById("personalInfoPanel").style.display = "block";

  // Show all sidebar items
  $(".list-group-item").show();

  // Hide the alert box if any
  $("#alertBox").hide();
}

function showProxyRegistration() {
  $("#designateProxyPanel").show();
  $('.list-group-item[data-target="designateProxyPanel"]').show();
  $("#alertBox")
    .html("You must designate a proxy to manage your medical decisions.")
    .show();
  $(".panel").not("#designateProxyPanel").hide(); // Hide other content panels
  $(".list-group-item")
    .not('.list-group-item[data-target="designateProxyPanel"]')
    .hide(); // Hide other sidebar items
}
