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

  console.log("Submitting diagnosis for patient:", patientAddress);
  var diagnosis = $("#ailmentsList" + patientAddress).val();
  diagnosis = parseInt(diagnosis);
  var diagnosed = ailmentsDict[diagnosis];
  var comments = document.getElementById("details").value;

  var oldRecords = $("#records" + patientAddress).html();

  var newRecords = `Diagnosed By : ${docName}
Diagnosis Time : ${getDateTime()}
Diagnosis : ${diagnosed}
Comments : ${comments}
`;
  console.log("New records to be added:", newRecords);
  var updatedRecords = oldRecords + newRecords;

  if (!isNaN(diagnosis)) {
    var buffer = Buffer.from(updatedRecords);

    ipfs.files.add(buffer, (error, result) => {
      if (error) {
        console.error("Error adding file to IPFS:", error);
      } else {
        ipfshash = result[0].hash;
        console.log("IPFS hash received:", result[0].hash);

        ethereum.request({ method: "eth_accounts" }).then(function (accounts) {
          var fromAddress = accounts[0].toLowerCase();

          contractInstance.methods
            .insurance_claim(patientAddress, diagnosis, ipfshash)
            .send({ gas: 1000000, from: fromAddress })
            .on("transactionHash", function (hash) {
              // Handle the transaction hash if needed
              console.log("Transaction Hash:", hash);
            })
            .on("confirmation", function (confirmationNumber, receipt) {
              // Handle confirmations if needed
              console.log("Confirmation:", confirmationNumber, receipt);
            })
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
}

function loadAppointmentRequests() {
  web3.eth.getAccounts().then(function(accounts) {
      const doctorAddress = accounts[0]; // Assuming the doctor is logged in

      // Fetching appointment IDs associated with the doctor
      contractInstance.methods.getDoctorAppointments(doctorAddress)
          .call({ from: doctorAddress })
          .then(function(appointmentIds) {
              appointmentIds.forEach(function(id) {
                  // Fetching each appointment from the blockchain
                  contractInstance.methods.appointments(id).call()
                      .then(function(appointment) {
                          if (!appointment.isAccepted) {
                              // Fetching additional details from IPFS
                              fetchFromIPFS(appointment.ipfsHash, function(appointmentData) {
                                  displayAppointmentRequest(id, appointmentData);
                              });
                          }
                      });
              });
          })
          .catch(function(error) {
              console.error("Error loading appointment requests:", error);
          });
  });
}

function displayAppointmentRequest(id,appointment) {
  var row = $('<tr>');

    // Extracting information from the appointment object
    var patientInfo = appointment.participant.find(p => p.actor.reference.startsWith('Patient'));
    var doctorInfo = appointment.participant.find(p => p.actor.reference.startsWith('Practitioner'));
    var patientName = patientInfo ? patientInfo.actor.display : "Unknown";
    var appointmentDate = new Date(appointment.start).toLocaleDateString();
    var appointmentTime = new Date(appointment.start).toLocaleTimeString();
    var appointmentStatus = appointment.status;
   

    // Displaying information in the table
    
    $('<td>').text(patientName).appendTo(row);
    $('<td>').text(appointmentDate).appendTo(row);
    $('<td>').text( appointmentTime).appendTo(row);
    $('<td>').text(appointmentStatus).appendTo(row);

    var actionsCell = $('<td>').appendTo(row);
    $('<button>').text('Accept').addClass('btn btn-success').click(function() { acceptAppointment(id); }).appendTo(actionsCell);
    $('<button>').text('Reject').addClass('btn btn-danger').click(function() { rejectAppointment(id); }).appendTo(actionsCell);

    $('#appointmentRequests').append(row); 
}

function fetchFromIPFS(ipfsHash, callback) {
  $.get('http://localhost:8080/ipfs/' + ipfsHash)
        .done(function(data) {
            console.log("Data from IPFS:", data);
            // Directly use the data object if it's already in the correct format
            callback(data);
        })
        .fail(function() {
            console.error('Failed to fetch data from IPFS.');
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
      .rejectAppointment(appointmentId)
      .send({ from: doctorAddress })
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


