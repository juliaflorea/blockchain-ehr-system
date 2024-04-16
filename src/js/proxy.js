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
                                  accessedDoctorList.forEach(function (
                                    accessedDoctorAddress
                                  ) {
                                    contractInstance.methods
                                      .get_doctor(accessedDoctorAddress)
                                      .call(
                                        { gas: 1000000 },
                                        function (
                                          error,
                                          accessedDoctorDetails
                                        ) {
                                          if (!error) {
                                            var accessRow = document
                                              .getElementById("accessDoc")
                                              .insertRow(-1);
                                            accessRow.insertCell(0).innerHTML =
                                              accessedDoctorDetails[0] +
                                              " " +
                                              accessedDoctorDetails[1];
                                            accessRow.insertCell(1).innerHTML =
                                              accessedDoctorAddress;
                                            accessRow.insertCell(2).innerHTML =
                                              "<button onclick=\"revokeAccess('" +
                                              accessedDoctorAddress +
                                              "')\">Revoke Access</button>";
                                          } else {
                                            console.error(
                                              "Error getting accessed doctor details:",
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
                  console.error(error);
                }
              });
          } else {
            // Clear patient list if proxy is not authorized
            $("#viewPatient").find("tr:gt(0)").remove();
          }
        } else {
          console.error(error);
        }
      });
  });

  // Additional functions like loadAppointmentRequests() could go here
});

function showRecords(element) {
  var table = document.getElementById("viewPatient");
  var index = element.parentNode.parentNode.rowIndex;
  var patientAddress = table.rows[index].cells[1].innerHTML;

  // Toggle logic adjustment
  if (element.value === "Hide Records") {
    // If hiding, just remove the next row if it's a record row
    if (
      table.rows[index + 1] &&
      table.rows[index + 1].classList.contains("recordsRow")
    ) {
      table.deleteRow(index + 1);
    }
    element.value = "View Records";
    element.className = "btn btn-success";
    return; // Exit the function to prevent further actions
  } else {
    // Clear any previously added record rows to avoid duplication
    while (
      table.rows[index + 1] &&
      table.rows[index + 1].classList.contains("recordsRow")
    ) {
      table.deleteRow(index + 1);
    }

    // Proceed to fetch and display records
    contractInstance.methods
      .get_hash(patientAddress)
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          $.get("http://localhost:8080/ipfs/" + result, function (data) {
            var downloadButton = $("<button/>", {
              text: "Download Medical Record",
              class: "btn btn-primary",
              click: function () {
                downloadMedicalRecord(data);
              },
            });
            $("#downloadLinkContainer").html(downloadButton);
            var content = `<div class="tab-content">
                              <div id="view${patientAddress}">
                                  <div class="row">
                                      <div class="col-sm-12">
                                          <pre style="margin: 20px 0;" id="records${patientAddress}">${data}</pre>
                                      </div>
                                  </div>
                              </div>
                            </div>`;

            // Inserting the new content row
            var row1 = table.insertRow(index + 1);
            row1.classList.add("recordsRow"); // Add a class for easy identification
            var cell1 = row1.insertCell(0);
            cell1.colSpan = 3;
            cell1.innerHTML = content;
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
  index = list.selectedIndex;

  var DoctorList = 0;

  contractInstance.methods
    .get_doctor_list()
    .call({ gas: 1000000 }, function (error, result) {
      if (!error) {
        // console.log(index);

        DoctorList = result;
        doctorToBeAdded = DoctorList[index - 1];
        contractInstance.methods.get_proxy(key)
          .call({ gas: 1000000 }, function (error, proxyDetails) {
            if (!error) {
              var patientAddress = proxyDetails.patientAddress;
        contractInstance.methods.permit_access_by_proxy(doctorToBeAdded,patientAddress).send(
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
                console.log("Error while granting access:", error);
                $(".alert-info").show(); // Optionally handle error by showing alert
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

function revokeAccess(element) {
  var rowNo = element.parentNode.parentNode.rowIndex; // Added var for local scope
  var row = element.parentNode.parentNode; // Changed to lowercase 'row' for consistency
  var cells = row.getElementsByTagName("td"); // Changed to lowercase 'cells' for consistency
  var docKey = row.cells[1].firstChild.nodeValue;

  // Get the current user's account address
  web3.eth.getAccounts().then((accounts) => {
    const fromAddress = accounts[0];

    // Assuming `proxyAddress` is defined somewhere in your code.
    // Call the contract's get_proxy method to fetch proxy details
    contractInstance.methods.get_proxy(key)
      .call({ from: fromAddress, gas: 1000000 }) // Include the 'from' address if required and fix the method call
      .then(proxyDetails => { // Use promise instead of callback for consistency with other promise code
        var patientAddress = proxyDetails.patientAddress;
        contractInstance.methods.revoke_access_by_proxy(docKey, patientAddress)
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
      })
      .catch(error => { // Error handling for the proxy details fetch
        console.error("Error fetching proxy details:", error);
      });
  });
}





$(document).ready(function () {
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
});
