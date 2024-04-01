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

    var a = 0;
    var b = 0;
    contractInstance.methods
      .get_proxy(key)
      .call({ gas: 1000000 }, function (error, result) {
        if (!error) {
          if (!result.isAuthorized) {
            console.log(
              "Proxy is not authorized. Access to patient information should be removed."
            );
            // Update the UI to indicate the proxy has no access.
            document.getElementById("viewPatient").innerHTML =
              "No accessible EMRs.";
            return; // Exit as the proxy has no access
          }
          var firstName = result[0];
          var lastName = result[1];
          var age = result[2];
          proxyName = firstName + " " + lastName;
          $("#name").html(proxyName);
          $("#age").html(age);
        } else console.error(error);
      });
    var patientAddressList = 0;

    contractInstance.methods
      .get_accessed_patientlist_for_proxy(key)
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
            content = `<div class="tab-content">
                  <div id="view${patientAddress}">
                          <div class="row">
                              <div class="col-sm-12">
                                  <pre style="margin: 20px 0;" id="records${patientAddress}">${patientRecord}</pre>
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
