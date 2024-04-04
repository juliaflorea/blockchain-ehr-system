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

  ethereum.request({ method: "eth_accounts" }).then(function (accounts) {
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
                        } else {
                          console.error(error);
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
          console.error(error);
        }
      });

    element.value = "Hide Records";
    element.className = "btn btn-danger";
  }
}
