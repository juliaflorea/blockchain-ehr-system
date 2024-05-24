var ipfs = window.IpfsApi("localhost", "5001");
const Buffer = window.IpfsApi().Buffer;
var url_string = window.location.href;
var url = new URL(url_string);
var key;
var proxyName = "";

toggleRecordsButton = 0;

$(window).on("load", function () {
  connect();
  $(".alert-danger").hide();

  web3.eth.getAccounts().then((accounts) => {
    key = accounts[0].toLowerCase();

    contractInstance.methods
      .get_proxy(key)
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          var firstName = result[0];
          var lastName = result[1];
          var age = result[2];
          var isProxyAuthorized = result.isAuthorized; // Assuming result[7] correctly indicates authorization status
          proxyName = firstName + " " + lastName;

          $("#name").html(proxyName);
          $("#age").html(age);
          console.log(result);
          console.log(
            `Proxy Authorization Status: ${
              isProxyAuthorized ? "Authorized" : "Unauthorized"
            }`
          );

          if (isProxyAuthorized) {
            // Proceed to load patient data since the proxy is authorized
            contractInstance.methods
              .get_accessed_patientlist_for_proxy(key)
              .call({ gas: 1000000 }, function (error, result) {
                if (!error) {
                  var patientAddressList = result;
                  console.log("Access List for Proxy:", patientAddressList);

                  patientAddressList.forEach(function (patientAddress, index) {
                    contractInstance.methods
                      .get_patient(patientAddress)
                      .call({ gas: 1000000 }, function (error, result) {
                        if (!error) {
                          var patientFirstName = result[0];
                          var patientLastName = result[1];
                          var publicKey = patientAddress;

                          var row = document
                            .getElementById("viewPatient")
                            .insertRow(index + 1);
                          var cell1 = row.insertCell(0);
                          var cell2 = row.insertCell(1);
                          var cell3 = row.insertCell(2);
                          cell1.className = "patientName";
                          cell2.className = "publicKeyPatient";
                          cell1.innerHTML =
                            patientFirstName + " " + patientLastName;
                          cell2.innerHTML = publicKey;
                          cell3.innerHTML =
                            '<input class="btn btn-success" onclick="showRecords(this)" id="viewRecordsButton" type="button" value="View records"></input>';

                          // Fetch and display doctors to share EMR
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
                                      .call(
                                        { gas: 1000000 },
                                        function (error, result) {
                                          var list =
                                            document.getElementById(
                                              "permitDoctorList"
                                            );

                                          if (!error) {
                                            var fullName =
                                              result[0] + " " + result[1];
                                            var option =
                                              document.createElement("option");
                                            option.text = fullName;
                                            list.add(option);
                                          } else {
                                            console.error(error);
                                          }
                                        }
                                      );
                                  })(i);
                                }
                              } else console.error(error);
                            });
                          populateDoctorDropdown("doctorSelect");
                          populateDoctorDropdown("doctorInfoSelect");
                          // Fetch and display doctors who have access
                          contractInstance.methods
                            .get_accessed_doctorlist_for_patient(patientAddress)
                            .call(
                              { gas: 1000000 },
                              function (error, accessedDoctorList) {
                                if (!error) {
                                  var table =
                                    document.getElementById("accessDoc");
                                  // Clear existing rows except the header before adding new ones
                                  while (table.rows.length > 1) {
                                    table.deleteRow(1);
                                  }

                                  accessedDoctorList.forEach(function (
                                    doctorAddress,
                                    docIndex
                                  ) {
                                    contractInstance.methods
                                      .get_doctor(doctorAddress)
                                      .call(
                                        { gas: 1000000 },
                                        function (error, doctorResult) {
                                          if (!error) {
                                            // Ensure that both the first name and last name are retrieved correctly
                                            var doctorName =
                                              doctorResult[0] +
                                              " " +
                                              doctorResult[1]; // Concatenate first and last name
                                            var publicKey = doctorAddress;

                                            var row = table.insertRow(-1); // Append new row at the end of the table
                                            var cell1 = row.insertCell(0);
                                            var cell2 = row.insertCell(1);
                                            var cell3 = row.insertCell(2);
                                            cell1.innerHTML = doctorName;
                                            cell2.innerHTML = publicKey;
                                            cell2.className = "publicKeyDoctor";
                                            cell3.innerHTML =
                                              '<button onclick="revokeAccessByProxy(this)" class="btn btn-danger">Revoke access</button>';
                                          } else {
                                            console.error(
                                              "Error fetching doctor details:",
                                              error
                                            );
                                          }
                                        }
                                      );
                                  });
                                } else {
                                  console.error(
                                    "Error fetching accessed doctors list:",
                                    error
                                  );
                                }
                              }
                            );
                        } else {
                          console.error("Error fetching patient data:", error);
                        }
                      });
                  });
                } else {
                  console.error(
                    "Error fetching patients list for proxy:",
                    error
                  );
                }
              });
          } else {
            // Clear patient list if proxy is not authorized
            $("#viewPatient").find("tr:gt(0)").remove();
            $(".panel").not("#personalInfoPanel").hide(); // Hide all panels except the personal information panel
            $(".list-group-item")
              .not('[data-target="personalInfoPanel"]')
              .hide();

              $(".alert-danger").show().html('<strong>Notice!</strong> The patient has revoked your access to their records.');
          }
        } else {
          console.error("Error fetching proxy data:", error);
        }
      });
  });

  loadSentAppointmentRequests();
});

function showRecords(element) {
  var table = document.getElementById("viewPatient");
  var index = element.parentNode.parentNode.rowIndex;
  var patientAddress = table.rows[index].cells[1].innerHTML;

  if (element.value === "Hide Records") {
    if (
      table.rows[index + 1] &&
      table.rows[index + 1].classList.contains("recordsRow")
    ) {
      table.deleteRow(index + 1);
    }
    element.value = "View Records";
    element.className = "btn btn-success";
    return;
  } else {
    while (
      table.rows[index + 1] &&
      table.rows[index + 1].classList.contains("recordsRow")
    ) {
      table.deleteRow(index + 1);
    }

    contractInstance.methods
      .get_hash(patientAddress)
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          $.get("http://localhost:8080/ipfs/" + result, function (data) {
            if (!data.startsWith('<h5 style="text-align:center; font-weight:bold;">Medical Record</h5>')) {
              data = '<h5 style="text-align:center; font-weight:bold;">Medical Record</h5>\n' + data;
            }
            var downloadButton = $("<button/>", {
              text: "Download Medical Record",
              class: "btn btn-primary",
              click: function () {
                downloadMedicalRecord(data);
              },
            });
            $("#downloadLinkContainer").html(downloadButton);
            
            // Split the data into different sections
            var sections = data.split('\n\n'); // Split sections by double newlines

            var content = sections.map(section => {
              return `<div class="medical-record">
                        <pre>${section}</pre>
                      </div>`;
            }).join('');

            content = `<div class="medical-record-container">${content}</div>`;

            var row1 = table.insertRow(index + 1);
            row1.classList.add("recordsRow");
            var cell1 = row1.insertCell(0);
            cell1.colSpan = 3;
            cell1.innerHTML = `<div class="d-flex justify-content-center w-100">${content}</div>`;
          });
        } else {
          console.error("Error retrieving IPFS hash:", error);
        }
      });

    element.value = "Hide Records";
    element.className = "btn btn-danger";
  }
}


function populateDoctorDropdown(dropdownId) {
  console.log("populateDoctorDropdown called for:", dropdownId);

  web3.eth.getAccounts().then((accounts) => {
    key = accounts[0].toLowerCase();
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
  });
}

function viewDoctorInfo() {
  var doctorSelect = document.getElementById("doctorInfoSelect");
  var selectedDoctorAddress = doctorSelect.value;
  web3.eth.getAccounts().then((accounts) => {
    key = accounts[0].toLowerCase();
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
  });
}

function giveAccessByProxy() {
  var list = document.getElementById("permitDoctorList");
  var index = list.selectedIndex;

  contractInstance.methods
    .get_doctor_list()
    .call({ gas: 1000000 }, function (error, result) {
      if (!error) {
        var DoctorList = result;
        var doctorToBeAdded = DoctorList[index - 1]; // Adjusting index for array offset

        contractInstance.methods
          .get_proxy(key)
          .call({ gas: 1000000 }, function (error, proxyDetails) {
            if (!error) {
              var patientAddress = proxyDetails.patientAddress;

              // Check if the selected doctor already has access
              contractInstance.methods
                .get_accessed_doctorlist_for_patient(patientAddress)
                .call({ gas: 1000000 }, function (error, accessedDoctorList) {
                  if (!error) {
                    if (accessedDoctorList.includes(doctorToBeAdded)) {
                      // Doctor already has access, show the alert
                      alert(
                        "This doctor already has access to the patient's records."
                      );
                      console.error(
                        "Attempt to grant access to a doctor who already has it."
                      );
                    } else {
                      // Doctor does not have access, proceed to grant access
                      contractInstance.methods
                        .permit_access_by_proxy(doctorToBeAdded, patientAddress)
                        .send(
                          {
                            from: key,
                            gas: 1000000,
                            value: web3.utils.toWei("2", "ether"),
                          },
                          function (error) {
                            if (!error) {
                              console.log(
                                "Access granted to doctor: ",
                                doctorToBeAdded
                              );
                            } else {
                              console.error(
                                "Error while granting access:",
                                error
                              );
                            }
                          }
                        );
                    }
                  } else {
                    console.error(
                      "Error fetching accessed doctors list:",
                      error
                    );
                  }
                });
            } else {
              console.error("Error fetching proxy details:", error);
            }
          });
      } else {
        console.error("Error fetching doctor list:", error);
      }
    });
}

function revokeAccessByProxy(element) {
  var rowNo = element.parentNode.parentNode.rowIndex; // Improved variable declaration
  var row = element.parentNode.parentNode; // Use var for variable declaration
  var cells = row.getElementsByTagName("td"); // Better naming convention
  var docKey = cells[1].textContent; // Use textContent to ensure we're getting the correct data

  // Get the current user's account address
  web3.eth
    .getAccounts()
    .then((accounts) => {
      const fromAddress = accounts[0];

      contractInstance.methods
        .get_doctor_list()
        .call({ gas: 1000000 }, function (error, result) {
          if (!error) {
            var doctorList = result; // Defined the variable for clarity
            // Assuming index is previously defined or should be defined based on specific logic
            var doctorToBeAdded = doctorList[doctorList.length - 1]; // Assumption: if index is not defined, we might use the last doctor in the list

            contractInstance.methods
              .get_proxy(key) // 'key' needs to be defined or passed to this function
              .call({ gas: 1000000 }, function (error, proxyDetails) {
                if (!error) {
                  var patientAddress = proxyDetails.patientAddress; // Use this if necessary

                  // Call the contract's revoke_access method
                  contractInstance.methods
                    .revoke_access_by_proxy(docKey, patientAddress)
                    .send({ from: fromAddress, gas: 1000000 })
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
                } else {
                  console.error("Error getting proxy details:", error);
                }
              });
          } else {
            console.error("Error getting doctor list:", error);
          }
        });
    })
    .catch(function (error) {
      console.error("Error fetching accounts:", error);
    });
}

function scheduleAppointmentByProxy() {
  const doctorId = $("#doctorSelect").val();
  const appointmentDate = $("#appointmentDate").val().replace(/-/g, "");
  const [hour, minute] = $("#appointmentHour").val().split(":").map(Number);
  const paddedHour = hour.toString().padStart(2, "0");
  const paddedMinute = minute.toString().padStart(2, "0");
  const dateAsNumber = parseInt(appointmentDate, 10);

  if (!doctorId || !appointmentDate || hour === undefined) {
    alert("Please fill in all fields.");
    return;
  }

  web3.eth.getAccounts().then((accounts) => {
    const fromAddress = accounts[0]; // Proxy's address

    // Fetch proxy details to get the patient address
    contractInstance.methods
      .get_proxy(fromAddress)
      .call()
      .then((proxyDetails) => {
        const patientAddress = proxyDetails.patientAddress;

        // Fetch patient details
        contractInstance.methods
          .get_patient(patientAddress)
          .call()
          .then((patientResult) => {
            const patientFirstName = patientResult[0];
            const patientLastName = patientResult[1];

            // Check if the selected doctor has access
            contractInstance.methods
              .get_accessed_doctorlist_for_patient(patientAddress)
              .call()
              .then((doctorList) => {
                const doctorHasAccess = doctorList.includes(doctorId);

                if (!doctorHasAccess) {
                  alert(
                    "This doctor does not have access to the patient's records. Please grant access before scheduling an appointment."
                  );
                  return;
                }

                // If doctor has access, proceed with IPFS and transaction
                const fhirAppointmentResource = {
                  resourceType: "Appointment",
                  status: "pending",
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
                      actor: { reference: `Practitioner/${doctorId}` },
                      status: "needs-action",
                    },
                  ],
                };

                const ipfs = window.IpfsApi("localhost", "5001");
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

                  // Send the IPFS hash and other appointment details to the smart contract
                  contractInstance.methods
                    .requestAppointmentByProxy(
                      doctorId,
                      patientAddress,
                      ipfsHash,
                      dateAsNumber,
                      parseInt(paddedHour)
                    )
                    .send({ from: fromAddress, gas: 1000000 })
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
              })
              .catch((err) => {
                console.error(
                  "Error checking doctor's access:",
                  err.message || err
                );
              });
          })
          .catch((err) => {
            console.error(
              "Error retrieving patient details:",
              err.message || err
            );
          });
      })
      .catch((err) => {
        console.error("Error retrieving proxy details:", err.message || err);
      });
  });
}

document.addEventListener("DOMContentLoaded", function () {

  $(".list-group-item").click(function (e) {
    e.preventDefault(); // Prevent the default anchor behavior

    $(".list-group-item").removeClass("active");

    // Add active class to the clicked sidebar item
    $(this).addClass("active");
    var targets = $(this).attr("data-target").split(" "); // Split the targets by space
    $(".panel").hide(); // Hide all panels initially

    targets.forEach(function (target) {
      $("#" + target).show(); // Show each targeted panel
    });
  });

  $("#logout").click(function () {
    // Implement your logout logic here
    console.log("Logout button clicked");
    // Redirect to login page or logout user
    window.location.href = "/index.html"; // Modify as needed
  });

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



function loadSentAppointmentRequests() {
  web3.eth.getAccounts().then(function (accounts) {
    const proxyAddress = accounts[0]; // Using proxy's address
    contractInstance.methods
      .get_accessed_patientlist_for_proxy(proxyAddress)
      .call()
      .then(function (patientAddresses) {
        patientAddresses.forEach(function (patientAddress) {
          contractInstance.methods
            .getPatientAppointments(patientAddress)
            .call({ from: proxyAddress })
            .then(function (appointmentIds) {
              appointmentIds.forEach(function (id) {
                contractInstance.methods
                  .appointments(id)
                  .call()
                  .then(function (appointment) {
                    if (
                      !appointment.ipfsHash ||
                      appointment.ipfsHash === "0x"
                    ) {
                      console.error(
                        "Invalid or empty IPFS hash for appointment ID:",
                        id
                      );
                      return;
                    }
                    fetchFromIPFS(
                      appointment.ipfsHash,
                      function (appointmentData) {
                        var status = appointment.isAccepted
                          ? "Accepted"
                          : appointment.isRejected
                          ? "Rejected"
                          : "Pending";
                        contractInstance.methods
                          .get_doctor(appointment.doctorAddress)
                          .call()
                          .then(function (doctorDetails) {
                            var doctorName =
                              doctorDetails[0] + " " + doctorDetails[1];
                            displaySentAppointmentRequest(
                              id,
                              appointmentData,
                              status,
                              doctorName
                            );
                          })
                          .catch(function (error) {
                            console.error(
                              "Error fetching doctor details:",
                              error
                            );
                            displaySentAppointmentRequest(
                              id,
                              appointmentData,
                              status,
                              "Unknown Doctor"
                            );
                          });
                      }
                    );
                  });
              });
            })
            .catch(function (error) {
              console.error("Error loading sent appointment requests:", error);
            });
        });
      })
      .catch(function (error) {
        console.error("Error fetching patient list for proxy:", error);
      });
  });
}

function displaySentAppointmentRequest(id, appointment, status, doctorName) {
  console.log(`Full Appointment ${id} Data:`, appointment);

  var match = appointment.start.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{1,2}):(\d{2}):(\d{2})Z$/
  );
  var appointmentDate = "Invalid Date";
  var appointmentTime = "Invalid Time";
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
    appointmentDate = date.toISOString().substring(0, 10);
    appointmentTime = date.toISOString().substring(11, 16);
  }

  var row = $("<tr>");
  $("<td>", { class: "doctorName" }).text(doctorName).appendTo(row);
  $("<td>", { class: "appointmentDate" }).text(appointmentDate).appendTo(row);
  $("<td>", { class: "appointmentTime" }).text(appointmentTime).appendTo(row);
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
  $("#sentAppointmentRequests tbody").append(row);
}


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

