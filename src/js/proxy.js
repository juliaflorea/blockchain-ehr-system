var ipfs = window.IpfsApi("localhost", "5001");
const Buffer = window.IpfsApi().Buffer;
var url_string = window.location.href;
var url = new URL(url_string);
var key;
var proxyName = "";

toggleRecordsButton = 0;

async function loadProxyData() {
  console.log("loadProxyData() started");

  $(".alert-danger").hide();

  web3.eth.getAccounts().then((accounts) => {
    key = accounts[0].toLowerCase();

    // Get proxy details
    userRegistry.methods
      .getProxy(key)
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          var firstName = result[0];
          var lastName = result[1];
          var age = result[2];
          var isProxyAuthorized = result.isAuthorized;
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
            // Proceed to load patient data if the proxy is authorized
            accessControl.methods
              .getAccessedPatientListForProxy(key)
              .call({ gas: 1000000 }, function (error, result) {
                if (!error) {
                  var patientAddressList = result;
                  console.log("Access List for Proxy:", patientAddressList);

                  patientAddressList.forEach(function (patientAddress, index) {
                    userRegistry.methods
                      .getPatient(patientAddress)
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
                          userRegistry.methods
                            .getDoctorList()
                            .call({ gas: 1000000 }, function (error, result) {
                              if (!error) {
                                DoctorList = result;

                                for (var i = 0; i < DoctorList.length; i++) {
                                  (function (index) {
                                    userRegistry.methods
                                      .getDoctor(DoctorList[index])
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
                                            option.value = DoctorList[index];
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
                          accessControl.methods
                            .getAccessedDoctorListForPatient(patientAddress)
                            .call(
                              { gas: 1000000 },
                              function (error, accessedDoctorList) {
                                if (!error) {
                                  var table =
                                    document.getElementById("accessDoc");

                                  while (table.rows.length > 1) {
                                    table.deleteRow(1);
                                  }

                                  accessedDoctorList.forEach(function (
                                    doctorAddress,
                                    docIndex
                                  ) {
                                    userRegistry.methods
                                      .getDoctor(doctorAddress)
                                      .call(
                                        { gas: 1000000 },
                                        function (error, doctorResult) {
                                          if (!error) {
                                            var doctorName =
                                              doctorResult[0] +
                                              " " +
                                              doctorResult[1];
                                            var publicKey = doctorAddress;

                                            var row = table.insertRow(-1);
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

            $(".alert-danger")
              .show()
              .html(
                "<strong>Notice!</strong> The patient has revoked your access to their records."
              );
          }
        } else {
          console.error("Error fetching proxy data:", error);
        }
      });
  });

  loadSentAppointmentRequests();
}


// Function to display record of patient

window.addEventListener("contractsReady", async () => {
  console.log("contractsReady → proxy");
  await loadProxyData();

  // default panel (prevents white screen)
  $(".panel").hide();
  $("#personalInfoPanel").show();
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

    (async () => {

      const accounts = await web3.eth.getAccounts();
      const proxyAddress = accounts[0];
    
      console.log("💡 Debug: About to fetch encrypted key");
      console.log("Patient address:", patientAddress);
      console.log("Proxy address (msg.sender):", proxyAddress);

      // 1️⃣ Get wrapped RMK
      const wrappedRMK =
        await medicalDataRegistry.methods
          .getEncryptedAESKey(patientAddress)
          .call({ from: proxyAddress });
    
      // 2️⃣ Derive proxy UAK
      const proxyUAK =
        await window.deriveUAKForDoctor(proxyAddress);
    
      // 3️⃣ Unwrap RMK
      const rmk =
        await window.unwrapRMK(wrappedRMK, proxyUAK);
    
      // 4️⃣ Get encrypted record hash
      const recordHash =
        await medicalDataRegistry.methods
          .getHash(patientAddress)
          .call();
    
      // 5️⃣ Fetch encrypted data
      const encryptedPayload =
        await $.get("http://localhost:8080/ipfs/" + recordHash);
    
      // 6️⃣ Decrypt
      const decryptedData =
  await window.decryptAES(
    encryptedPayload,
    rmk
  );

    
      // If decryptAES returns string → parse it
const jsonData =
typeof decryptedData === "string"
  ? JSON.parse(decryptedData)
  : decryptedData;
  const formattedHtml = renderResource(jsonData);

  const content = `
    <div class="tab-content">
      <div class="row">
        <div class="col-sm-12">
          <div style="margin:20px 0;">
            ${formattedHtml}
          </div>
        </div>
      </div>
    </div>
  `;
  

    
      var row1 = table.insertRow(index + 1);
      row1.classList.add("recordsRow");
      var cell1 = row1.insertCell(0);
      cell1.colSpan = 3;
      cell1.innerHTML =
        `<div class="d-flex justify-content-center w-100">${content}</div>`;
    
    })();
    

    element.value = "Hide Records";
    element.className = "btn btn-danger";
  }
}

// Function to populate doctor dropdown
function populateDoctorDropdown(dropdownId) {
  console.log("populateDoctorDropdown called for:", dropdownId);

  web3.eth.getAccounts().then((accounts) => {
    key = accounts[0].toLowerCase();
    // Ensure contractInstance is defined
    if (!userRegistry) {
      console.error("userRegistry is not defined.");
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
              option.value = doctorAddress; // Optionally, you can set the doctor's address as the option value
              list.appendChild(option);
            });
        });
      });
  });
}

// Function to display doctor information
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
    userRegistry.methods
      .getDoctor(selectedDoctorAddress)
      .call({ from: key })
      .then(function (doctorDetails) {
        var ipfsHash = doctorDetails[4]; // Adjust based on your data structure

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

// Function for proxy to grant access to doctors for a patient's record
async function giveAccessByProxy() {
  try {
    const accounts = await web3.eth.getAccounts();
    const proxyAddress = accounts[0]; // proxy account

    const list = document.getElementById("permitDoctorList");
    const index = list.selectedIndex;

    if (index === -1) {
      alert("Please select a doctor.");
      return;
    }
    const doctorToBeAdded = list.options[index].value;

    // Get proxy details using proxy's own address
    const proxyDetails = await userRegistry.methods.getProxy(proxyAddress).call({ gas: 1000000 });
    const patientAddress = proxyDetails.patientAddress;

    // Check if doctor already has access
    const accessedDoctors = await accessControl.methods
      .getAccessedDoctorListForPatient(patientAddress)
      .call({ gas: 1000000 });

    if (accessedDoctors.includes(doctorToBeAdded)) {
      alert("The doctor already has access to the patient's records.");
      return;
    }

    // Grant access on-chain (from proxy)
    await accessControl.methods
      .grantDoctorAccessByProxy(doctorToBeAdded, patientAddress)
      .send({ from: proxyAddress, gas: 1000000, value: web3.utils.toWei("2", "ether") });

    // 🔐 Crypto steps (all using proxyAddress)
    const proxyUAK = await window.deriveUAKForDoctor(proxyAddress);

    const wrappedRMKForProxy = await medicalDataRegistry.methods
      .getEncryptedAESKey(patientAddress)
      .call({ from: proxyAddress });

    const rmk = await window.unwrapRMK(wrappedRMKForProxy, proxyUAK);

    const doctorUAK = await window.deriveUAKForDoctor(doctorToBeAdded);
    const wrappedRMKForDoctor = await window.wrapRMK(rmk, doctorUAK);
    

    // IMPORTANT: must send from proxyAddress
    await medicalDataRegistry.methods
      .setEncryptedAESKey(patientAddress, doctorToBeAdded, wrappedRMKForDoctor)
      .send({ from: proxyAddress, gas: 1000000 });

    console.log("✅ RMK wrapped and stored for doctor");
    alert("Access granted successfully!");
  } catch (err) {
    console.error("❌ Error in giveAccessByProxy:", err);
    alert("Failed to grant access or encrypt RMK. See console for details.");
  }
}




// Function for proxy to revoke access to doctors for a patient's record
function revokeAccessByProxy(element) {
  var rowNo = element.parentNode.parentNode.rowIndex;
  var row = element.parentNode.parentNode;
  var cells = row.getElementsByTagName("td");
  var docKey = cells[1].textContent;

  // Get the current user's account address
  web3.eth
    .getAccounts()
    .then((accounts) => {
      const fromAddress = accounts[0];

      userRegistry.methods
        .getDoctorList()
        .call({ gas: 1000000 }, function (error, result) {
          if (!error) {
            var doctorList = result;

            var doctorToBeAdded = doctorList[doctorList.length - 1];
            userRegistry.methods
              .getProxy(key)
              .call({ gas: 1000000 }, function (error, proxyDetails) {
                if (!error) {
                  var patientAddress = proxyDetails.patientAddress;

                  // Call the contract's revoke_access method
                  accessControl.methods
                    .revokeDoctorAccessByProxy(docKey, patientAddress)
                    .send({ from: fromAddress, gas: 1000000 })
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

// Function to send appointment request on behalf of patient
// Function to send appointment request on behalf of patient
// Function to send appointment request on behalf of patient
async function scheduleAppointmentByProxy() {
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

  try {
    const accounts = await web3.eth.getAccounts();
    const fromAddress = accounts[0];

    // Get the proxy's patient
    const proxyDetails = await userRegistry.methods.getProxy(fromAddress).call();
    const patientAddress = proxyDetails.patientAddress;

    const patientResult = await userRegistry.methods.getPatient(patientAddress).call();
    const [patientFirstName, patientLastName] = patientResult;

    const doctorResult = await userRegistry.methods.getDoctor(doctorId).call();
    const [doctorFirstName, doctorLastName] = doctorResult;

    // Check doctor access for patient
    const doctorList = await accessControl.methods
      .getAccessedDoctorListForPatient(patientAddress)
      .call();
    if (!doctorList.includes(doctorId)) {
      alert("This doctor does not have access to the patient's records. Please grant access first.");
      return;
    }

    // FHIR Appointment resource
    const fhirAppointmentResource = {
      resourceType: "Appointment",
      status: "pending",
      start: `${appointmentDate}T${paddedHour}:${paddedMinute}:00Z`,
      participant: [
        {
          actor: { reference: `Patient/${patientAddress}`, display: `${patientFirstName} ${patientLastName}` },
          status: "needs-action",
        },
        {
          actor: { reference: `Practitioner/${doctorId}`, display: `${doctorFirstName} ${doctorLastName}` },
          status: "needs-action",
        },
      ],
    };

    // 🔐 Proxy keys
    const proxyUAK = await window.deriveUAKForDoctor(fromAddress);

    // Fetch patient RMK from registry and unwrap it with proxy UAK
    const wrappedRMK = await medicalDataRegistry.methods
      .getEncryptedAESKey(patientAddress)
      .call({ from: fromAddress });
    const patientRMK = await window.unwrapRMK(wrappedRMK, proxyUAK);

    // 1️⃣ Generate per-appointment AES key
    const appointmentAESKey = await window.generateAESKey();

    // 2️⃣ Encrypt appointment
    const encryptedAppointment = await window.encryptAES(
      JSON.stringify(fhirAppointmentResource),
      appointmentAESKey
    );

    // 3️⃣ Wrap AES key for doctor
    const doctorUAK = await window.deriveUAKForDoctor(doctorId);
    const wrappedKeyForDoctor = await window.wrapRMK(appointmentAESKey, doctorUAK);

    // 4️⃣ Wrap AES key for patient (so patient can decrypt later)
    const wrappedKeyForPatient = await window.wrapRMK(appointmentAESKey, patientRMK);

    // 5️⃣ Wrap AES key for proxy itself
    const wrappedKeyForProxy = await window.wrapRMK(appointmentAESKey, proxyUAK);

    // 6️⃣ Store complete payload in IPFS
    const ipfsPayload = {
      iv: encryptedAppointment.iv,
      data: encryptedAppointment.data,
      aesKeyWrappedForDoctor: wrappedKeyForDoctor,
      aesKeyWrappedForPatient: wrappedKeyForPatient,
      aesKeyWrappedForProxy: wrappedKeyForProxy
    };

    const buffer = ipfs.Buffer.from(JSON.stringify(ipfsPayload));
    const ipfsResult = await ipfs.files.add(buffer);
    const ipfsHash = ipfsResult[0].hash;

    // 7️⃣ Store appointment reference on-chain
    await appointmentManager.methods
      .requestAppointmentByProxy(doctorId, patientAddress, ipfsHash, dateAsNumber, parseInt(paddedHour))
      .send({ from: fromAddress, gas: 1000000 });

    alert("Appointment request sent successfully!");
    console.log("✅ Appointment encrypted, uploaded, and scheduled:", ipfsHash);

    // Reload appointments immediately
    loadSentAppointmentRequests();
  } catch (err) {
    console.error("❌ Error scheduling appointment:", err);
    alert("Failed to schedule appointment. See console for details.");
  }
}





// Function to load all sent appointments for proxy (for all accessible patients)
async function loadSentAppointmentRequests() {
  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const proxyAddress = accounts[0].toLowerCase();

    // Derive proxy session key (UAK)
    const proxySessionKey = await window.deriveUAKForDoctor(proxyAddress);

    // Get list of patients proxy has access to
    const patientAddresses = await accessControl.methods
      .getAccessedPatientListForProxy(proxyAddress)
      .call();

    for (const patientAddress of patientAddresses) {
      // Get all appointment IDs for this patient
      const appointmentIds = await appointmentManager.methods
        .getPatientAppointments(patientAddress)
        .call({ from: proxyAddress });

      for (const id of appointmentIds) {
        const appointmentOnChain = await appointmentManager.methods
          .appointments(id)
          .call({ from: proxyAddress });

        if (!appointmentOnChain.ipfsHash || appointmentOnChain.ipfsHash === "0x") continue;

        // Fetch encrypted appointment from IPFS
        let encryptedPayload;
        try {
          const files = await ipfs.files.get(appointmentOnChain.ipfsHash);
          const file = files.find(f => f.content);
          if (!file) continue;
          encryptedPayload = JSON.parse(new TextDecoder().decode(file.content));
        } catch (e) {
          console.warn("⚠️ Failed to fetch IPFS data, skipping", e);
          continue;
        }

        // Ensure AES key exists for proxy
        if (!encryptedPayload.aesKeyWrappedForProxy) continue;

        // Unwrap AES key
        let appointmentAESKey;
        try {
          appointmentAESKey = await window.unwrapRMK(
            encryptedPayload.aesKeyWrappedForProxy,
            proxySessionKey
          );
        } catch (e) {
          console.warn("⚠️ Failed to unwrap appointment AES key, skipping", e);
          continue;
        }

        // Decrypt appointment
        let appointmentData;
        try {
          const decrypted = await window.decryptAES(
            { iv: encryptedPayload.iv, data: encryptedPayload.data },
            appointmentAESKey
          );
          appointmentData = JSON.parse(decrypted);
        } catch (e) {
          console.warn("⚠️ Failed to decrypt appointment, skipping", e);
          continue;
        }

        // Resolve status
        let status = "Pending";
        if (appointmentOnChain.isAccepted) status = "Accepted";
        else if (appointmentOnChain.isRejected) status = "Rejected";

        // Resolve doctor name
        let doctorName = "Unknown Doctor";
        try {
          const doctor = await userRegistry.methods
            .getDoctor(appointmentOnChain.doctorAddress)
            .call();
          doctorName = `${doctor[0]} ${doctor[1]}`;
        } catch {}

        // Display appointment
        displaySentAppointmentRequest(id, appointmentData, status, doctorName);
      }
    }
  } catch (err) {
    console.error("loadSentAppointmentRequests failed:", err);
    alert(err.message || "Failed to load sent appointment requests.");
  }
}

// Display function stays the same as patient one
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
  if (status === "Accepted") statusCell.addClass("accepted-status");
  else if (status === "Rejected") statusCell.addClass("rejected-status");
  else if (status === "Pending") statusCell.addClass("pending-status");
  else statusCell.addClass("unknown-status");

  $("#sentAppointmentRequests tbody").append(row);
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



// Function to populate available hours for a selected appointment date
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
