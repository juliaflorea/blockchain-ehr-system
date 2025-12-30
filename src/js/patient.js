var url_string = window.location.href;
var url = new URL(url_string);
var key;

var ipfs = null;
var Buffer = null;

if (window.IpfsApi) {
  ipfs = window.IpfsApi("localhost", "5001");
  Buffer = window.IpfsApi.Buffer;
} else {
  console.warn("IpfsApi not loaded yet");
}


toggleRecordsButton = 0;
var recordHash = "";

async function loadPatientData() {
  // Ensure contracts are ready
  if (!userRegistry || !accessControl) {
    console.error("Contracts not initialized yet!");
    return;
  }

  $("#records").hide();
  $(".alert-info").hide();
  $(".alert-danger").hide();

  try {
    const accounts = await web3.eth.getAccounts();
    key = accounts[0].toLowerCase();

    /* =======================
       Fetch patient info
    ======================== */
    const patient = await userRegistry.methods
      .getPatient(key)
      .call({ gas: 1000000 });

    console.log("Patient struct returned:", patient);

    $("#name").html(patient.firstName + " " + patient.lastName);
    $("#age").html(patient.age);

    $("#recordsHash").html(
      `<a href="http://localhost:8080/ipfs/${patient.record}" target="_blank">${patient.record}</a>`
    );

    recordHash = patient.record;

    /* =======================
       Handle proxy info
    ======================== */
    await checkAndHandleProxy(key);

     // Print out the available  doctors to share emr
     console.log("Getting Doctor List");
     userRegistry.methods
       .getDoctorList()
       .call({ gas: 1000000 }, function (error, result) {
         if (!error) {
           var DoctorList = result;
           var list = document.getElementById("permitDoctorList");
           list.innerHTML = ""; // Clear existing options
 
           DoctorList.forEach(function (doctorAddress) {
             userRegistry.methods
               .getDoctor(doctorAddress)
               .call({ gas: 1000000 }, function (error, result) {
                 if (!error) {
                   var fullName = result[0] + " " + result[1];
                   var option = document.createElement("option");
                   option.text = fullName;
                   option.value = doctorAddress;
                   list.add(option);
                 } else {
                   console.error(error);
                 }
               });
           });
         } else {
           console.error(error);
         }
       });
 
       populateDoctorDropdown("doctorSelect");
       populateDoctorDropdown("doctorInfoSelect");

       
 
     // Fetch and display doctors who have access
     console.log("Getting Accessed Doctor List");
     accessControl.methods
       .getAccessedDoctorListForPatient(key)
       .call({ gas: 1000000 }, function (error, result) {
         if (!error) {
           var doctorAddressList = result;
           var table = document.getElementById("accessDoc");
 
           // Clear existing rows except for the header before adding new ones
           while (table.rows.length > 1) {
             table.deleteRow(1);
           }
 
           // Add each doctor to the table
           doctorAddressList.forEach(function (doctorAddress) {
             userRegistry.methods
               .getDoctor(doctorAddress)
               .call({ gas: 1000000 }, function (error, result) {
                 if (!error) {
                   var fullName = result[0] + " " + result[1];
                   var publicKey = doctorAddress;
 
                   var row = table.insertRow(-1);
                   var cell1 = row.insertCell(0);
                   var cell2 = row.insertCell(1);
                   var cell3 = row.insertCell(2);
                   cell1.innerHTML = fullName;
                   cell2.innerHTML = publicKey;
                   cell3.innerHTML =
                     '<button onclick="revokeAccess(this)" class="btn btn-danger">Revoke access</button>';
                 } else {
                   console.error(error);
                 }
               });
           });
         } else {
           console.error(error);
         }
       });
   
 
   
  } catch (err) {
    console.error("Error loading patient data:", err);
  }
}


// Listen for contractsReady before loading patient data
window.addEventListener("contractsReady", async () => {
  await loadPatientData();
  loadSentAppointmentRequests();
  displayProxiesWithAccess();
  displayFormerProxies();
  fetchSymptoms();

});


// Function to display medical records
function showRecords(element) {
  if (toggleRecordsButton % 2 === 0) {
    // Get the record with the specified hash from IPFS

    $.get("http://localhost:8080/ipfs/" + recordHash)
      .done(function (data) {
        // Display the fetched data
        $("#records").html(data);
        $("#records").show();

        var content = $("#records").html();
        if (
          !data.startsWith(
            '<h5 style="text-align:center; font-weight:bold;">Medical Record</h5>'
          )
        ) {
          data =
            '<h5 style="text-align:center; font-weight:bold;">Medical Record</h5>\n' +
            data;
        }
        $("#records").html(data);

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

// Function to grant access to doctor
function giveAccess() {
  var list = document.getElementById("permitDoctorList");
  var index = list.selectedIndex;

  if (index === -1) {
    alert("Please select a doctor.");
    return;
  }

  var doctorToBeAdded = list.options[index].value;

  // Before attempting to add, check if the doctor already has access
  accessControl.methods
    .getAccessedDoctorListForPatient(key)
    .call({ gas: 1000000 }, function (err, accessedDoctors) {
      if (!err) {
        if (accessedDoctors.includes(doctorToBeAdded)) {
          alert("The doctor already has access to your records.");
        } else {
          // Doctor not in the list, proceed to give access
          accessControl.methods.grantDoctorAccess(doctorToBeAdded).send(
            {
              from: key,
              gas: 1000000,
              value: web3.utils.toWei("2", "ether"),
            },
            function (error) {
              if (!error) {
                var table = document.getElementById("accessDoc");
                var noRows = table.rows.length;
                var row = table.insertRow(noRows);
                var cell1 = row.insertCell(0);
                var cell2 = row.insertCell(1);
                var cell3 = row.insertCell(2);

                cell2.className = "publicKeyDoctor";
                cell1.innerHTML = list.options[index].text;
                cell2.innerHTML = doctorToBeAdded;
                cell3.innerHTML =
                  '<button onclick="revokeAccess(this)" class="btn btn-danger">Revoke access</button>';
                alert("Access granted successfully.");
              } else {
                console.error("Failed to grant access:", error);
                alert("Failed to grant access. Please try again.");
              }
            }
          );
        }
      } else {
        console.error("Failed to retrieve accessed doctors list:", err);
        alert("Failed to check existing access. Please try again.");
      }
    });
}

// Function to revoke access to doctor

function revokeAccess(element) {
  rowNo = element.parentNode.parentNode.rowIndex;
  Row = element.parentNode.parentNode;
  var Cells = Row.getElementsByTagName("td");
  var docKey = Row.cells[1].firstChild.nodeValue;

  // Get the current user's account address
  web3.eth.getAccounts().then((accounts) => {
    const fromAddress = accounts[0];

    // Call the contract's revoke_access method
    accessControl.methods
      .revokeDoctorAccess(docKey)
      .send({
        from: fromAddress,
        gas: 1000000,
      })
      .on("transactionHash", function (hash) {
        console.log("Transaction Hash:", hash);
      })
      .on("confirmation", function (confirmationNumber, receipt) {
        console.log("Confirmation:", confirmationNumber, receipt);
        document.getElementById("accessDoc").deleteRow(rowNo);
      })
      .on("error", function (error) {
        $(".alert-danger").show();
        console.error("Error:", error);
      });
  });
}

// Function to populate  dropdown for selecting doctors
function populateDoctorDropdown(dropdownId) {
  console.log("populateDoctorDropdown called for:", dropdownId);

  // Ensure contractInstance is defined
  if (!userRegistry) {
    console.error("contractInstance is not defined.");
    return;
  }

  userRegistry.methods
    .getDoctorList()
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
        userRegistry.methods
          .getDoctor(doctorAddress)
          .call({ gas: 1000000 }, function (error, doctorDetails) {
            if (error) {
              console.error("Error fetching doctor details:", error);
              return;
            }

            var fullName = doctorDetails[0] + " " + doctorDetails[1];
            var option = document.createElement("option");
            option.text = fullName;
            option.value = doctorAddress;
            list.appendChild(option);
          });
      });
    });
}

// Function to display doctor's information
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
  document.getElementById("doctorInfoDisplay").style.display = "none";
  // Fetch doctor's info from the smart contract
  userRegistry.methods
    .getDoctor(selectedDoctorAddress)
    .call({ from: key })
    .then(function (doctorDetails) {
      var ipfsHash = doctorDetails[4];

      if (!ipfsHash || ipfsHash === "0x" || ipfsHash === "0x0") {

        document.getElementById("doctorInfoDisplay").innerHTML =
          "Doctor information not available.";
        return;
      }

      // Fetch doctor's information from IPFS
      $.get("http://localhost:8080/ipfs/" + ipfsHash, function (data) {
        // Extracting relevant information from the raw data
        var lines = data.split(/\r?\n/).map(l => l.trim());

        var gender = lines.find(l => l.toLowerCase().startsWith("gender:"));
        var contact = lines.find(l => l.toLowerCase().startsWith("contact:"));
        var specialty = lines.find(
        l => l.toLowerCase().startsWith("specialty:")
     || l.toLowerCase().startsWith("speciality:")
);
        var yearsOfExperienceLine = lines.find((line) =>
          line.startsWith("Years of Experience:")
        );
        var yearsOfExperience = yearsOfExperienceLine.split(":")[1].trim();

        console.log("IPFS lines:", lines);
        console.log("Found specialty line:", specialty);


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
        document.getElementById("doctorInfoDisplay").style.display = "block";
        
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

// Function to request appointment with doctor
function scheduleAppointment() {
  const doctorId = $("#doctorSelect").val();
  let appointmentDate = $("#appointmentDate").val().replace(/-/g, "");
  const appointmentHour = parseInt($("#appointmentHour").val(), 10);
  const [hour, minute] = $("#appointmentHour").val().split(":").map(Number);
  const paddedHour = hour.toString().padStart(2, "0");
  const paddedMinute = minute.toString().padStart(2, "0");
  appointmentDate = appointmentDate.replace(/-/g, "");
  const dateAsNumber = parseInt(appointmentDate, 10);
  const hourAsNumber = hour;
  const minuteAsNumber = minute;

  if (!doctorId || !appointmentDate || !appointmentHour) {
    alert("Please fill in all the fields.");
    return;
  }

  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0]; // Using the first account as the patient address
    // Check if the selected doctor has access to the patient
    accessControl.methods
      .getAccessedPatientListForDoctor(doctorId)
      .call({ from: patientAddress })
      .then((patientList) => {
        const doctorHasAccess = patientList.includes(patientAddress);
        if (!doctorHasAccess) {
          alert(
            "This doctor does not have access to the patient's records. Please grant access before scheduling an appointment."
          );
          return;
        }

        // Get patient and doctor details
        userRegistry.methods
          .getPatient(patientAddress)
          .call({ gas: 1000000 }, function (error, patientResult) {
            if (!error) {
              const patientFirstName = patientResult[0];
              const patientLastName = patientResult[1];

              userRegistry.methods
                .getDoctor(doctorId)
                .call({ gas: 1000000 }, function (error, doctorResult) {
                  if (!error) {
                    const doctorFirstName = doctorResult[0];
                    const doctorLastName = doctorResult[1];
                    const initialStatus = "Pending";

                    // Create FHIR Appointment Resource

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

                    // Convrt the resource to JSON and then take the JSON string and convert it to a binary buffer that IPFS can store
                    const buffer = ipfs.Buffer.from(
                      JSON.stringify(fhirAppointmentResource)
                    );
                    // Add buffer to IPFS
                    ipfs.files.add(buffer, (error, result) => {
                      if (error) {
                        console.error("Error uploading to IPFS:", error);
                        alert("Failed to store appointment details on IPFS.");
                        return;
                      }

                      const ipfsHash = result[0].hash;
                      // Send the IPFS hash along with the doctor's Ethereum address to the smart contract
                      appointmentManager.methods
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

// Function to load  appointment requests sent to doctors
function loadSentAppointmentRequests() {
  web3.eth.getAccounts().then(function (accounts) {
    const patientAddress = accounts[0];
    appointmentManager.methods
      .getPatientAppointments(patientAddress)
      .call({ from: patientAddress })
      .then(function (appointmentIds) {
        appointmentIds.forEach(function (id) {
          appointmentManager.methods
            .appointments(id)
            .call()
            .then(function (appointment) {
              if (!appointment.ipfsHash || appointment.ipfsHash === "0x") {
                console.error(
                  "Invalid or empty IPFS hash for appointment ID:",
                  id
                );
                return;
              }
              fetchFromIPFS(appointment.ipfsHash, function (appointmentData) {
                var status = "Pending"; // Default status
                if (appointment.isAccepted) {
                  status = "Accepted";
                } else if (appointment.isRejected) {
                  status = "Rejected";
                }

                // Fetch doctor details within this block
                userRegistry.methods
                  .getDoctor(appointment.doctorAddress)
                  .call()
                  .then(function (doctorDetails) {
                    var doctorName = doctorDetails[0] + " " + doctorDetails[1];
                    displaySentAppointmentRequest(
                      id,
                      appointmentData,
                      status,
                      doctorName
                    );
                  })
                  .catch(function (error) {
                    console.error("Error fetching doctor details:", error);
                    displaySentAppointmentRequest(
                      id,
                      appointmentData,
                      status,
                      "Unknown Doctor"
                    );
                  });
              });
            });
        });
      })
      .catch(function (error) {
        console.error("Error loading sent appointment requests:", error);
      });
  });
}

// Function to display the requests
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

document.addEventListener("DOMContentLoaded", function () {
  var today = new Date().toISOString().split("T")[0]; // Format today's date as YYYY-MM-DD
  $("#appointmentDate").attr("min", today);
  $("#appointmentDate").change(function () {
    var selectedDate = new Date(this.value);
    var dayOfWeek = selectedDate.getDay();

    // Check if the selected day is Saturday (6) or Sunday (0)
    // TRestrict patient to schedule appointment only on weekdays
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

  // Fetch symptoms when the document is ready
  fetchSymptoms();

  // initialize views
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

  // reset symptoms
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
        diagnosisResult.style.display = "none";
        diagnosisResult.style.color = "black";
      }
    });
  }

  //calendar initialization

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

// Function to populate dropdown for displaying only the available times for appointments based on the date selected
function populateHoursDropdown() {
  const selectedDate = $("#appointmentDate").val(); //  "YYYY-MM-DD" format
  const formattedDate = selectedDate.replace(/-/g, ""); // Convert date to "YYYYMMDD" format
  const doctorId = $("#doctorSelect").val(); // Get selected doctor's Ethereum address

  // Clear existing options in the dropdown
  const hoursDropdown = $("#appointmentHour");
  hoursDropdown.empty();

  // Define  hours (8 AM to 7 PM)
  const startHour = 8;
  const endHour = 19;

  // Store all promises for the availability checks
  let availabilityPromises = [];

  for (let hour = startHour; hour <= endHour; hour++) {
    // Push each availability check promise to the array
    let promise = appointmentManager.methods
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

// Function to designate proxy
function designateProxy() {
  const proxyFirstName = $("#proxyFirstName").val();
  const proxyLastName = $("#proxyLastName").val();
  const proxyDOB = $("#proxyDOB").val();
  const proxyAge = $("proxyAge").val();
  const proxyAddress = $("#proxyAddress").val();
  const proxyPhone = $("#proxyPhone").val();
  const proxyEmail = $("#proxyEmail").val();
  const consentGiven = $("#consentDropdown").val() === "yes";

  // Concatenate details entered in form to create a single object
  const detailsConcat = `${proxyFirstName}${proxyLastName}${proxyDOB}${proxyAddress}${proxyPhone}${proxyEmail}`;
  // Generate a unique hash from the details by using Secure Hash Algorithm 3 method
  // This is done for comparing this hash to the hash of the details enetered by proxy at registration, to see if they match
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

    userRegistry.methods
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

// Function to generate token to send to proxy's email
function generateTokenForProxy() {
  // Create a random string of 16 characters (letters and numbers)
  let token = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < 16; i++) {
    token += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  // Append a timestamp for added uniqueness
  token += "-" + new Date().getTime().toString(36);

  return token;
}

// Function to send tpken to proxy's email
function sendTokenToProxyEmail(proxyEmail, token) {
  // Fetch current patient's details from the smart contract
  web3.eth.getAccounts().then(function (accounts) {
    const patientAddress = accounts[0]; // Using the first account as the patient address

    //  Retrieve the IPFS hash for the patient's data
    medicalDataRegistry.methods
      .getHash(patientAddress)
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

          // Create the template parameters
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
            .send("service_qeqnhl5", "template_bwpjgsk", templateParams) 
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

// Function to display the proxies that have access
function displayProxiesWithAccess() {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0];

    userRegistry.methods
      .getPatient(patientAddress)
      .call()
      .then((patientInfo) => {
        const age = parseInt(patientInfo[2], 10);

        accessControl.methods
          .getAccessedProxyListForPatient(patientAddress)
          .call()
          .then((proxyAddressList) => {
            var table = document.getElementById("accessProxy");
            var rowCount = table.rows.length;
            for (var i = rowCount - 1; i > 0; i--) {
              table.deleteRow(i);
            }
            // Check if the proxy address is null, if it is null it means the proxy does not exist
            proxyAddressList.forEach((proxyAddress, index) => {
              if (
                proxyAddress !== "0x0000000000000000000000000000000000000000"
              ) {
                userRegistry.methods
                  .getProxy(proxyAddress)
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

// Function to revoke access to proxy
function revokeProxyAccess() {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0]; // The account invoking the transaction

    console.log("Patient Address:", patientAddress);

    // Check if the patient has a designated proxy before attempting to revoke
    accessControl.methods
      .getAccessedProxyListForPatient(patientAddress)
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
        accessControl.methods
          .revokeProxyAccess()
          .send({ from: patientAddress, gas: 1000000 })
          .then((receipt) => {
            console.log("Proxy access revoked successfully:", receipt);
          })
          .catch((error) => {
            console.error("Error revoking proxy access:", error);
          });
      })
      .catch((error) => {
        console.error("Error fetching proxy details:", error);
      });
  });
}

// Function to display former proxies
function displayFormerProxies() {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0]; // Assuming the patient is logged in

    userRegistry.methods
      .getProxyList()
      .call({ from: patientAddress })
      .then((proxyAddresses) => {
        proxyAddresses.forEach((proxyAddress) => {
          userRegistry.methods
            .getProxy(proxyAddress)
            .call()
            .then((proxy) => {
              if (
                !proxy.isAuthorized &&
                proxy.patientAddress.toLowerCase() ===
                  patientAddress.toLowerCase()
              ) {
                const table = document.getElementById("formerProxyTable");
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

// Function to grant again access to a proxy that has been revoked access
function regrantProxyAccess(proxyAddress) {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0];
    console.log(
      `Attempting to regrant access for proxy: ${proxyAddress} by patient: ${patientAddress}`
    );

    accessControl.methods
      .regrantProxyAccess(proxyAddress)
      .send({
        from: patientAddress,
        gas: 1000000,
        value: web3.utils.toWei("2", "ether"),
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

// Function to add allergy data to existing record
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

    const formattedAllergy =
      `Allergy Substance:</strong> ${allergySubstance}\n` +
      `Reaction: ${allergyReaction}\n` +
      `Criticality: ${allergyCriticality}\n` +
      `Recorded on: ${new Date().toLocaleString()}\n`;
    // Fetch the current IPFS hash for the patient's record
    medicalDataRegistry.methods
      .getHash(patientAddress)
      .call()
      .then(function (ipfsHash) {
        console.log("Fetched IPFS hash:", ipfsHash); // add this
    if (!ipfsHash) {
      alert("No medical record found for this patient!");
      return;
    }
        // Fetch the existing medical record from IPFS
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
              medicalDataRegistry.methods
                .setHash(patientAddress, updatedIpfsHash)
                .send({ from: patientAddress })
                .then(function (receipt) {
                  console.log("Record updated successfully:", receipt);
                  alert("Allergy information successfully added.");
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
  // Send a GET request to the Replit URL with th symptoms endpoint, to retrive the symptoms so that they can be displayed to the user
  fetch(
    "https://0bd9bf90-247c-40e9-adff-c9f302d7a747-00-3g8iecfpf4ugs.picard.replit.dev/symptoms"
  )
    // Check if the response is ok
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      // If ok, return the response as JSON
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

// Function to display the symptoms
function displaySymptoms(symptoms) {
  const container = document.getElementById("symptomsContainer");
  container.innerHTML = ""; // Clear previous contents

  if (!document.querySelector(".symptoms-header")) {
    var header = document.createElement("h6");
    header.className = "symptoms-header";
    header.textContent = "Select Your Symptoms:";
    container.insertBefore(header, container.firstChild);
  }

  symptoms.forEach((symptom) => {
    const cleanName = cleanSymptomName(symptom);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "symptoms[]";
    checkbox.value = symptom;
    checkbox.id = symptom;

    const label = document.createElement("label");
    label.htmlFor = symptom;
    label.textContent = cleanName;

    const div = document.createElement("div");
    div.appendChild(checkbox);
    div.appendChild(label);

    container.appendChild(div);
  });
}

// Function to display prediction
function displayPredictionResult(result) {
  const resultContainer = document.getElementById("predictionResult");
  resultContainer.innerHTML = result;
  resultContainer.style.display = "block";
  resultContainer.style.fontWeight = "bold";
  resultContainer.style.fontSize = "2em";
  resultContainer.style.marginTop = "30px";
  resultContainer.style.backgroundColor = "transparent";
  resultContainer.style.color = result.includes("Error") ? "#d9534f" : "#000";
}

// Function to send selected symptoms to the Flask API for diagnosis prediction
document
  .getElementById("diagnosisForm")
  .addEventListener("submit", function (event) {
    event.preventDefault(); // Prevent the form from submitting

    // Collect checked symptoms
    const symptomsData = {};
    document
      .querySelectorAll('[name="symptoms[]"]:checked')
      .forEach((checkbox) => {
        symptomsData[checkbox.value] = 1; // Th model expects value 1 for the existent symptoms
      });

    // Send the symptoms data to the predict endpoint
    predictDiagnosis(symptomsData);
  });

// Function to predict diagnosis
function predictDiagnosis(symptoms) {
  // Send  POST requst to predict endpoint
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

// Function to display  the symptoms names in a clean way
function cleanSymptomName(symptom) {
  return symptom
    .replace(/(\.\d+)?$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Function to store predictions to IPFS
function storePredictionInIPFS(prediction) {
  const ipfs = window.IpfsApi("localhost", "5001");
  const timestamp = new Date().toLocaleString();

  // Get the current patient address reliably
  web3.eth
    .getAccounts()
    .then((accounts) => {
      if (accounts.length === 0) {
        console.error("No Ethereum accounts available.");
        return;
      }
      const patientAddress = accounts[0];

      const predictionData = { prediction, timestamp, patientAddress };

      const buffer = ipfs.Buffer.from(JSON.stringify(predictionData));
      ipfs.files.add(buffer, (error, result) => {
        if (error) {
          console.error("Error uploading to IPFS:", error);
          return;
        }
        const ipfsHash = result[0].hash;
        console.log("IPFS hash:", ipfsHash);

        // Store prediction data in local storage with patient ID
        let predictions = JSON.parse(
          localStorage.getItem("patientPredictions") || "{}"
        );
        console.log("Current predictions in localStorage:", predictions);

        if (!predictions[patientAddress]) {
          predictions[patientAddress] = [];
        }
        predictions[patientAddress].push(predictionData); // Store the actual prediction data
        localStorage.setItem("patientPredictions", JSON.stringify(predictions));

        console.log("Updated predictions in localStorage:", predictions); // Debug log

        appendPredictionToHistory(predictionData);
      });
    })
    .catch((error) => {
      console.error("Error retrieving Ethereum accounts:", error);
    });
}

// Function to append prediction data to history
function appendPredictionToHistory(predictionData) {
  const historyContainer = document.getElementById("predictionHistory");
  const entry = document.createElement("div");
  entry.className = "prediction-entry";
  entry.innerHTML = `<p>Prediction: ${predictionData.prediction}</p><p>Time: ${predictionData.timestamp}</p>`;
  historyContainer.appendChild(entry);
}
// Function to display all diagnosis predicted

function displayAllDiagnoses() {
  // Ensure Web3 is loaded and accounts are accessible
  web3.eth
    .getAccounts()
    .then((accounts) => {
      if (accounts.length === 0) {
        console.error("No Ethereum accounts available.");
        return;
      }
      const patientAddress = accounts[0];

      // Retrieve predictions from localStorage
      const allPredictions = JSON.parse(
        localStorage.getItem("patientPredictions") || "{}"
      );
      const patientHashes = allPredictions[patientAddress] || [];

      if (patientHashes.length === 0) {
        console.log("No diagnosis predictions to display for this patient.");
        return;
      }

      // Retrieve each prediction from IPFS
      patientHashes.forEach((hash) => {
        ipfs.files.cat(hash, (error, file) => {
          if (error) {
            console.error("Error retrieving from IPFS:", error);
            return;
          }
          const predictionData = JSON.parse(file.toString());
          appendPredictionToHistory(predictionData);
        });
      });
    })
    .catch((error) => {
      console.error("Error retrieving Ethereum accounts:", error);
    });
}

// Function to load accepted appointments
function loadAcceptedAppointments(calendar) {
  web3.eth
    .getAccounts()
    .then(function (accounts) {
      const patientAddress = accounts[0];
      appointmentManager.methods
        .getPatientAppointments(patientAddress)
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

// function to add details of appointment to calendar
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

// Function to check the age of patient and handle the display of data and proxy designation
function checkAndHandleProxy(key) {
  userRegistry.methods
    .getPatient(key)
    .call()
    .then((patientInfo) => {
      const age = parseInt(patientInfo[2], 10);
      console.log(`Patient Age: ${age}, Checking proxy list...`);

      accessControl.methods
        .getAccessedProxyListForPatient(key)
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

// Function to display all panels to patient
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

// function to show only designation panel
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

// Test function for changing age
function changeAge() {
  web3.eth
    .getAccounts()
    .then(function (accounts) {
      if (accounts.length === 0) {
        throw new Error("No accounts available.");
      }

      const patientAddress = accounts[0]; // Get the first account
      const newAge = parseInt(document.getElementById("ageInput").value);

      contractInstance.methods
        .setTestAge(newAge, patientAddress)
        .send({ from: patientAddress })
        .then(function (result) {
          alert("Age updated successfully!");
          displayPatientAge(); // Refresh the UI to show the updated age
        })
        .catch(function (error) {
          console.error("Error updating age:", error);
          alert(`Failed to update age: ${error.message}`);
        });
    })
    .catch(function (error) {
      console.error("Error retrieving accounts:", error);
      alert(`Failed to retrieve accounts: ${error.message}`);
    });
}

// Test function to display age
function displayPatientAge() {
  const patientAddress = web3.eth.accounts[0];
  userRegistry.methods
    .getPatient(patientAddress)
    .call()
    .then(function (patientInfo) {
      document.getElementById("ageDisplay").innerText =
        "Patient Age: " + patientInfo.age;
    })
    .catch(function (error) {
      console.error("Error fetching patient age:", error);
    });
}

// Test function to update UI
function updateUIBasedOnAge(age) {
  const revokeButton = document.getElementById("revokeButton");
  if (age >= 16) {
    revokeButton.disabled = false;
  } else {
    revokeButton.disabled = true;
  }
}
