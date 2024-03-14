var url_string = window.location.href;
var url = new URL(url_string);
var key;

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
    var insurerName = "";

    $("#buyInsurance").hide();
    $("#insuranceInfo").hide();

    // print patient details and insurer details (if exists). If insurer does not exist show the buy insurance panel
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
          insurerAddress = result[4];
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

          if (insurerAddress != 0) {
            $("#buyInsurance").hide();
          } else {
            var InsurerList = 0;

            contractInstance.methods
              .get_insurer_list()
              .call({ gas: 1000000 }, function (error, result) {
                if (!error) {
                  InsurerList = result;
                  var list = document.getElementById("insurers");
                  for (var i = 0; i < InsurerList.length; i++) {
                    contractInstance.get_insurer.call(
                      InsurerList[i],
                      { gas: 1000000 },
                      function (error, result) {
                        if (!error) {
                          d = result[0];

                          var option = document.createElement("option");
                          option.text = d;

                          list.add(option);
                        } else {
                          console.log(error);
                        }
                      }
                    );
                  }
                }
              });
            $("#buyInsurance").show();

            $("#insuranceInfo").hide();
          }
        } else console.error(error);
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
  console.log("Getting Doctor List");
  contractInstance.methods
    .get_doctor_list()
    .call({ gas: 1000000 }, function (error, DoctorList) {
      if (!error) {
        var list = document.getElementById(dropdownId);
        if (!list) {
          console.error("Dropdown element not found: " + dropdownId);
          return;
        }

        list.innerHTML = ""; // Clear existing options

        DoctorList.forEach(function (doctorAddress) {
          contractInstance.methods
            .get_doctor(doctorAddress)
            .call({ gas: 1000000 }, function (error, doctorDetails) {
              if (!error) {
                var fullName = doctorDetails[0] + " " + doctorDetails[1];
                var option = document.createElement("option");
                option.text = fullName;
                option.value = doctorAddress; // Optionally, you can set the doctor's address as the option value
                list.appendChild(option);

              } else {
                console.error("Error fetching doctor details:", error);
              }
            });
        });
      } else {
        console.error("Error fetching doctor list:", error);
      }

    });

}


function viewDoctorInfo() {
  var doctorSelect = document.getElementById("doctorSelect");
  var selectedDoctorAddress = doctorSelect.value;

  if (!selectedDoctorAddress || selectedDoctorAddress === "-- Please Select --") {
      alert("Please select a doctor to view their information.");
      return;
  }

  // Assume you have a method to get doctor's info by address, including the IPFS hash
  contractInstance.methods.get_doctor(selectedDoctorAddress).call({ from: key })
  .then(function(doctorDetails) {
      var ipfsHash = doctorDetails[3]; // Adjust based on your data structure

      if (!ipfsHash) {
          document.getElementById("doctorInfoDisplay").innerHTML = "Doctor information not available.";
          return;
      }

      // Fetch doctor's information from IPFS
      $.get("http://localhost:8080/ipfs/" + ipfsHash, function(data) {
          var content = `
              <div class="doctor-info">
                  <pre style="margin: 20px 0;">${data}</pre>
              </div>
          `;

          document.getElementById("doctorInfoDisplay").innerHTML = content;
      }).fail(function() {
          console.error("Failed to fetch data from IPFS.");
          document.getElementById("doctorInfoDisplay").innerHTML = "Error loading doctor information.";
      });
  }).catch(function(error) {
      console.error("Error fetching doctor details:", error);
      document.getElementById("doctorInfoDisplay").innerHTML = "Error loading doctor information.";
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

function loadSentAppointmentRequests() {
  web3.eth.getAccounts().then(function (accounts) {
    const patientAddress = accounts[0]; // Assuming the patient is logged in

    // Fetching appointment IDs associated with the patient
    contractInstance.methods
      .getPatientAppointments(patientAddress)
      .call({ from: patientAddress })
      .then(function (appointmentIds) {
        appointmentIds.forEach(function (id) {
          // Fetching each appointment from the blockchain
          contractInstance.methods
            .appointments(id)
            .call()
            .then(function (appointment) {
              // Fetching additional details from IPFS
              fetchFromIPFS(appointment.ipfsHash, function (appointmentData) {
                if (appointment.isAccepted) {
                  displaySentAppointmentRequest(
                    id,
                    appointmentData,
                    "accepted"
                  );
                } else if (appointment.isRejected) {
                  displaySentAppointmentRequest(
                    id,
                    appointmentData,
                    "rejected"
                  );
                } else {
                  displaySentAppointmentRequest(id, appointmentData, "pending");
                }
              });
            });
        });
      })
      .catch(function (error) {
        console.error("Error loading sent appointment requests:", error);
      });
  });
}

function displaySentAppointmentRequest(id, appointment, status) {
  var row = $("<tr>");

  var doctorInfo = appointment.participant.find((p) =>
    p.actor.reference.startsWith("Practitioner")
  );
  var doctorName = doctorInfo ? doctorInfo.actor.display : "Unknown";

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
  } else {
    console.error("Invalid date format:", appointment.start);
    var appointmentDate = "Invalid Date";
    var appointmentTime = "Invalid Time";
  }
  $("<td>").text(doctorName).appendTo(row);
  $("<td>").text(appointmentDate).appendTo(row);
  $("<td>").text(appointmentTime).appendTo(row);
  //$('<td>').text(status).appendTo(row);
  var statusCell = $("<td>").text(status).appendTo(row);
  if (status === "accepted") {
    statusCell.addClass("accepted-status");
  } else if (status === "rejected") {
    statusCell.addClass("rejected-status");
  } else if (status === "pending") {
    statusCell.addClass("pending-status");
  } else {
    statusCell.addClass("unknown-status"); // Handle unknown status
  }

  $("#sentAppointmentRequests").append(row);
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
